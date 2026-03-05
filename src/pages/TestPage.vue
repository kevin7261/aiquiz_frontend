<script setup>
/**
 * 試題頁面。
 * 照建立 RAG 頁邏輯，使用 tab 形式。不做 RAG 建立（無上傳、Pack）。
 * 使用的 RAG 資料：Rag 表 applied=TRUE 的那一筆。
 * 產生試題時 quiz_type=1。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_GENERATE_QUIZ, API_GRADE_SUBMISSION, API_GRADE_RESULT, API_REQUEST_QUIZ_CONTENT, API_RESPONSE_QUIZ_CONTENT, API_RESPONSE_QUIZ_LEGACY } from '../constants/api.js';

defineProps({
  tabId: { type: String, required: true },
});

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

const authStore = useAuthStore();

/** RAG 列表（GET /rag/rags）、載入中、錯誤 */
const ragList = ref([]);
const ragListLoading = ref(false);
const ragListError = ref('');

/** applied=TRUE 的 RAG（每人最多一筆） */
const appliedRag = computed(() => {
  const list = ragList.value;
  if (!Array.isArray(list)) return null;
  return list.find((r) => r.applied === true || r.applied === 'true') ?? null;
});

/** 每次點「新增」產生一個新 tab，存這些 tab 的 id（quiz-set-xxx） */
const quizSetTabIds = ref([]);
/** 當前 tab id */
const activeTabId = ref(null);

/** 每個 tab 的狀態（key = quiz-set-xxx） */
const tabStateMap = reactive({});

function getTabState(id) {
  if (!id) return getTabState(quizSetTabIds.value[0] || 'quiz-set-1');
  if (!tabStateMap[id]) {
    tabStateMap[id] = reactive({
      cardList: [],
      quizSlotsCount: 0,
      showQuizGeneratorBlock: false,
      slotFormState: {},
    });
  }
  return tabStateMap[id];
}

const currentState = computed(() => {
  const id = activeTabId.value || quizSetTabIds.value[0] || 'quiz-set-1';
  return getTabState(id);
});

/** 當前 tab 每張 card 的批改解析結果 */
const parsedGradingsBySlot = computed(() => {
  const list = currentState.value?.cardList ?? [];
  return list.map((card) => parseGradingResult(card));
});

/** 從 applied RAG 的 rag_list 推導 generateQuizUnits */
const generateQuizUnits = computed(() => {
  const rag = appliedRag.value;
  if (!rag || typeof rag !== 'object') return [];
  const ragListStr = rag.rag_list ?? '';
  if (!ragListStr) return [];
  const sourceFileId = String(rag.file_id ?? '');
  return String(ragListStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((group) => {
      const ragName = group.replace(/\+/g, '_');
      return {
        file_id: sourceFileId || `${ragName}_rag`,
        filename: `${ragName}_rag.zip`,
        rag_name: ragName,
      };
    });
});

/** 從 applied RAG 的 file_metadata 取得 course_name */
const courseNameFromFileMetadata = computed(() => {
  const rag = appliedRag.value;
  if (!rag || typeof rag !== 'object') return '';
  const meta = rag.file_metadata ?? rag;
  const name = meta?.course_name;
  return name != null ? String(name).trim() : '';
});

/** applied RAG 的 file_id */
const appliedRagFileId = computed(() => {
  const r = appliedRag.value;
  return r ? String(r.file_id ?? r.id ?? '').trim() : '';
});

/** applied RAG 有 rag_metadata 時才能產生 quiz */
const hasRagMetadata = computed(() => {
  const r = appliedRag.value;
  if (!r || typeof r !== 'object') return false;
  return r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
});

/** 產生 quiz 與確定按鈕 disable 條件 */
const generateDisabled = computed(() => {
  return !hasRagMetadata.value || !appliedRagFileId.value || generateQuizUnits.value.length === 0;
});

const difficultyOptions = [
  { value: 0, label: '基礎' },
  { value: 1, label: '進階' },
];

const filterDifficulty = ref(0);

function quizLevelDisplay(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (n === 0) return '基礎';
  if (n === 1) return '進階';
  if (typeof val === 'string') {
    if (val === '入門' || val === '基礎') return '基礎';
    if (val === '進階') return '進階';
  }
  return String(val);
}

function getSlotFormState(slotIndex) {
  const state = currentState.value;
  if (!state.slotFormState[slotIndex]) {
    const units = generateQuizUnits.value;
    const first = units.length ? units[0].file_id : '';
    state.slotFormState[slotIndex] = reactive({
      generateQuizFileId: first,
      loading: false,
      error: '',
      responseJson: null,
    });
  }
  return state.slotFormState[slotIndex];
}

/** 選擇單元預設第一筆 */
watch(generateQuizUnits, (units) => {
  const state = currentState.value;
  if (units.length === 0) return;
  const firstFileId = units[0].file_id;
  Object.keys(state.slotFormState || {}).forEach((k) => {
    const slot = state.slotFormState[k];
    if (slot && (!slot.generateQuizFileId || !units.some((u) => u.file_id === slot.generateQuizFileId))) {
      slot.generateQuizFileId = firstFileId;
    }
  });
}, { immediate: true });

function openNextQuizSlot() {
  const state = currentState.value;
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  while (state.cardList.length < state.quizSlotsCount) {
    state.cardList.push(null);
  }
}

function setCardAtSlot(slotIndex, quizContent, quizHint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, quizLevel) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const card = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    quiz_hint: quizHint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    answer: '',
    quizHintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    quiz_id: generateQuizResponseJson?.quiz_id ?? null,
    quiz_level: quizLevel ?? null,
  };
  state.cardList[slotIndex - 1] = card;
}

/** 產生 quiz API，quiz_type=1 */
async function generateQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const sourceFileId = appliedRagFileId.value;
  const selectedUnit = generateQuizUnits.value.find((u) => u.file_id === slotState.generateQuizFileId);
  const ragName = selectedUnit?.rag_name?.trim();

  if (!sourceFileId) {
    slotState.error = '尚無使用中的 RAG，請先到「建立 RAG」頁面設定「使用此RAG」';
    return;
  }
  if (!ragName) {
    slotState.error = '請先選擇單元';
    return;
  }

  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;

  const courseName = courseNameFromFileMetadata.value;

  try {
    const res = await fetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: sourceFileId,
        rag_name: ragName,
        quiz_level: filterDifficulty.value,
        course_name: courseName || '未命名課程',
        quiz_type: 1,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const errBody = JSON.parse(text);
        msg = errBody.detail ? JSON.stringify(errBody.detail) : msg;
      } catch (_) {
        if (text) msg = text;
      }
      throw new Error(msg);
    }
    const data = text ? JSON.parse(text) : {};
    slotState.responseJson = data;
    const quizContent = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? '';
    const quizHintText = data.quiz_hint ?? data.hint ?? '';
    const targetFilename = data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? '';
    const referenceAnswerText = data.reference_answer ?? data.answer ?? '';
    setCardAtSlot(slotIndex, quizContent, quizHintText, targetFilename, referenceAnswerText, ragName, data, filterDifficulty.value);
  } catch (err) {
    slotState.error = err.message || '產生 quiz 失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.quizHintVisible = !item.quizHintVisible;
}

async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  const sourceFileId = appliedRagFileId.value;
  if (!sourceFileId) {
    item.confirmed = true;
    item.gradingResult = '評分需要 file_id：請先到「建立 RAG」頁面設定使用中的 RAG。';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  try {
    const ragName = item.ragName?.trim() ?? generateQuizUnits.value[0]?.rag_name?.trim();
    if (!ragName) {
      item.gradingResult = '評分失敗：此 quiz 未關聯 RAG 單元，請由「產生 quiz」產生後再評分。';
      return;
    }
    const courseName = courseNameFromFileMetadata.value || '';
    const quizId = item.quiz_id != null ? String(item.quiz_id) : '0';
    const params = new URLSearchParams({
      file_id: sourceFileId,
      rag_name: ragName,
      [API_REQUEST_QUIZ_CONTENT]: item.quiz ?? '',
      student_answer: item.answer.trim(),
      qtype: 'short_answer',
      course_name: courseName,
      quiz_id: quizId,
    });
    const res = await fetch(`${API_BASE}${API_GRADE_SUBMISSION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      if (text) {
        try {
          const errBody = JSON.parse(text);
          msg = errBody.error != null ? errBody.error : (errBody.detail != null ? (typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail)) : text);
        } catch (_) {
          msg = text;
        }
      }
      const statusHint = res.status === 502 ? '（後端逾時或服務喚醒中，請稍後再試）\n\n' : (res.status === 500 ? '（後端 500 錯誤）\n\n' : '');
      item.gradingResult = `評分失敗：${statusHint}${msg}`;
      return;
    }
    if (res.status === 202) {
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        item.gradingResult = '評分失敗：無法解析 job_id';
        return;
      }
      const jobId = data.job_id;
      if (!jobId) {
        item.gradingResult = '評分失敗：未取得 job_id';
        return;
      }
      const maxPolls = 60;
      const intervalMs = 2000;
      const maxRetries = 3;
      const retryDelayMs = 2000;
      const friendlyUnavailable = '評分失敗：後端暫時無法連線，請稍後再試或重新送出。';

      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, intervalMs));
        let pollRes = null;
        let pollText = '';
        for (let r = 0; r <= maxRetries; r++) {
          if (r > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
          try {
            pollRes = await fetch(`${API_BASE}${API_GRADE_RESULT}/${jobId}`);
            pollText = await pollRes.text();
            if (pollRes.status !== 502 && pollRes.status !== 504) break;
          } catch {
            /* ignore network errors, retry */
          }
        }
        if (!pollRes || pollRes.status === 502 || pollRes.status === 504) {
          item.gradingResult = friendlyUnavailable;
          return;
        }
        if (pollRes.status === 404) {
          item.gradingResult = '評分任務不存在或已過期，請重新送出評分。';
          return;
        }
        let pollData;
        try {
          pollData = JSON.parse(pollText);
        } catch (_) {
          item.gradingResult = friendlyUnavailable;
          return;
        }
        if (pollData.status === 'ready') {
          item.gradingResponseJson = pollData.result;
          item.gradingResult = typeof pollData.result === 'string' ? pollData.result : (pollData.result != null ? JSON.stringify(pollData.result) : '');
          return;
        }
        if (pollData.status === 'error') {
          const errMsg = pollData.error || '';
          const isJobNotFound = errMsg.includes('job not found');
          item.gradingResult = isJobNotFound ? '評分任務不存在或已過期，請重新送出評分。' : `評分失敗：${pollData.error || '未知錯誤'}`;
          return;
        }
      }
      item.gradingResult = '評分逾時：請稍後再試或重新送出';
      return;
    }
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    item.gradingResponseJson = parsed;
    item.gradingResult = text || '';
  } catch (err) {
    item.gradingResult = '評分失敗：後端逾時或服務喚醒中，請稍後再試。';
  }
}

function parseGradingResult(card) {
  if (!card) return { parsed: null, raw: '' };
  let obj = card.gradingResponseJson;
  if (obj != null && typeof obj === 'object') {
    return { parsed: obj, raw: JSON.stringify(obj, null, 2) };
  }
  const str = card.gradingResult;
  if (typeof str === 'string' && str.trim().startsWith('{')) {
    try {
      obj = JSON.parse(str);
      return { parsed: obj, raw: JSON.stringify(obj, null, 2) };
    } catch (_) {
      return { parsed: null, raw: str };
    }
  }
  return { parsed: null, raw: str || '' };
}

function rewriteAnswer(item) {
  item.answer = '';
  item.confirmed = false;
  item.gradingResult = '';
  item.gradingResponseJson = null;
}

function getQuizSetTabLabel(tabId, index) {
  const state = getTabState(tabId);
  const count = state?.cardList?.filter(Boolean).length ?? 0;
  return `試題集 ${index + 1}${count ? ` (${count})` : ''}`;
}

function addNewTab() {
  const id = 'quiz-set-' + Date.now();
  quizSetTabIds.value = [...quizSetTabIds.value, id];
  activeTabId.value = id;
  if (quizSetTabIds.value.length === 1) {
    activeTabId.value = id;
  }
}

function removeTab(tabId, e) {
  if (e) e.stopPropagation();
  quizSetTabIds.value = quizSetTabIds.value.filter((tid) => tid !== tabId);
  delete tabStateMap[tabId];
  if (activeTabId.value === tabId) {
    activeTabId.value = quizSetTabIds.value[0] ?? null;
  }
}

/** 載入 RAG 列表：GET /rag/rags */
async function fetchRagList() {
  ragListLoading.value = true;
  ragListError.value = '';
  try {
    const headers = {};
    const personId = authStore.user?.person_id;
    if (personId) headers['X-Person-Id'] = String(personId);
    const res = await fetch(`${API_BASE}/rag/rags`, { method: 'GET', headers });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    console.log('/rag/rags 回傳', data);
    ragList.value = Array.isArray(data) ? data : (data?.rags ?? data?.items ?? []);
  } catch (err) {
    ragListError.value = err.message || '無法載入 RAG 列表';
    ragList.value = [];
  } finally {
    ragListLoading.value = false;
  }
}

watch(appliedRag, (rag) => {
  if (rag && quizSetTabIds.value.length === 0) {
    addNewTab();
  }
}, { immediate: true });

onMounted(() => {
  fetchRagList();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100">
    <!-- 使用中 RAG 與 tab 標籤列 -->
    <div class="flex-shrink-0 bg-white border-bottom">
      <div v-if="appliedRag" class="px-4 pt-4 pb-1 small text-secondary">
        使用中 RAG：{{ appliedRag.name || appliedRag.filename || appliedRag.file_id }}
      </div>
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2" :class="{ 'pt-4': !appliedRag }">
        <template v-if="ragListLoading">
          <span class="small text-muted">載入中...</span>
        </template>
        <template v-else-if="!appliedRag">
          <span class="small text-warning">尚未設定使用中的 RAG，請先到「建立 RAG」頁面選擇並設定「使用此RAG」</span>
        </template>
        <template v-else>
          <ul class="nav nav-tabs mb-0">
            <li v-for="(tabId, idx) in quizSetTabIds" :key="tabId" class="nav-item d-flex align-items-center">
              <button
                type="button"
                class="nav-link border-0 rounded-0"
                :class="{ active: activeTabId === tabId }"
                @click="activeTabId = tabId"
              >
                {{ getQuizSetTabLabel(tabId, idx) }}
              </button>
              <button
                type="button"
                class="btn btn-link btn-sm p-0 ms-1 text-muted text-decoration-none"
                style="min-width: 1.5rem;"
                aria-label="刪除此試題集"
                @click="removeTab(tabId, $event)"
              >
                ×
              </button>
            </li>
            <li class="nav-item ms-2 align-self-center">
              <button type="button" class="btn btn-sm btn-outline-primary" @click="addNewTab">+</button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="ragListError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ ragListError }}
      </div>
    </div>

    <!-- 內容區 -->
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <template v-if="!appliedRag && !ragListLoading">
        <div class="alert alert-info">
          請先到「<router-link to="/main/create-rag">建立 RAG</router-link>」頁面，上傳 ZIP、執行 Pack 後，點選「使用此RAG」設定使用中的 RAG，再回到本頁產生試題。
        </div>
      </template>
      <template v-else-if="appliedRag">
        <div class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': generateDisabled }">
          <h2 class="fs-5 fw-semibold mb-3 pb-2 border-bottom">產生試題與作答</h2>
          <p class="small text-secondary mb-3">使用已設為「使用中」的 RAG 產生試題（quiz_type=1）。點「新增 quiz」展開區塊。</p>

          <div class="bg-light rounded mb-3">
            <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
              <template v-if="currentState.cardList[slotIndex - 1]">
                <!-- 已有卡片 -->
                <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 個 quiz</span>
                  </div>
                  <div class="card-body text-start">
                    <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">選擇單元（rag_name）</label>
                        <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ currentState.cardList[slotIndex - 1].ragName || '—' }}</div>
                      </div>
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">難度</label>
                        <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ quizLevelDisplay(currentState.cardList[slotIndex - 1].quiz_level) }}</div>
                      </div>
                    </div>
                    <div class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">題目</div>
                      <div class="bg-body-secondary border rounded p-2 lh-base">{{ currentState.cardList[slotIndex - 1].quiz }}</div>
                    </div>
                    <div class="mb-3">
                      <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="toggleHint(currentState.cardList[slotIndex - 1])">
                        {{ currentState.cardList[slotIndex - 1].quizHintVisible ? '隱藏提示' : '顯示提示' }}
                      </button>
                      <div v-show="currentState.cardList[slotIndex - 1].quizHintVisible" class="rounded bg-body-tertiary small mt-2 p-2 text-secondary">
                        {{ currentState.cardList[slotIndex - 1].quiz_hint }}
                      </div>
                    </div>
                    <div v-if="currentState.cardList[slotIndex - 1].referenceAnswer" class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">參考答案</div>
                      <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].referenceAnswer }}</div>
                    </div>
                    <div class="mb-3">
                      <label :for="`answer-${currentState.cardList[slotIndex - 1].id}`" class="form-label small text-secondary fw-medium mb-1">回答</label>
                      <template v-if="!currentState.cardList[slotIndex - 1].confirmed">
                        <textarea
                          :id="`answer-${currentState.cardList[slotIndex - 1].id}`"
                          v-model="currentState.cardList[slotIndex - 1].answer"
                          class="form-control"
                          rows="4"
                          placeholder="請輸入您的回答..."
                          maxlength="2000"
                        />
                        <div class="form-text small">{{ currentState.cardList[slotIndex - 1].answer.length }} / 2000</div>
                        <div class="d-flex gap-2 mt-2">
                          <button type="button" class="btn btn-sm btn-outline-secondary" @click="rewriteAnswer(currentState.cardList[slotIndex - 1])">重寫</button>
                          <button type="button" class="btn btn-sm btn-primary" @click="confirmAnswer(currentState.cardList[slotIndex - 1])">確定</button>
                        </div>
                      </template>
                      <template v-else>
                        <div class="rounded bg-body-tertiary small mb-2 p-2">{{ currentState.cardList[slotIndex - 1].answer }}</div>
                        <div class="d-flex gap-2 mb-3">
                          <button type="button" class="btn btn-sm btn-outline-secondary" @click="rewriteAnswer(currentState.cardList[slotIndex - 1])">重寫</button>
                        </div>
                      </template>
                    </div>
                    <div class="border rounded bg-light p-3 mb-3">
                      <div class="form-label small fw-semibold text-secondary mb-1">批改結果</div>
                      <template v-if="(parsedGradingsBySlot[slotIndex - 1] || {}).parsed">
                        <div class="small">
                          <div v-if="(parsedGradingsBySlot[slotIndex - 1].parsed.score != null)" class="mb-2">
                            <span class="small fw-semibold text-secondary">總分：</span>{{ parsedGradingsBySlot[slotIndex - 1].parsed.score }} / 10
                          </div>
                          <div v-if="parsedGradingsBySlot[slotIndex - 1].parsed.level" class="mb-2">
                            <span class="small fw-semibold text-secondary">等級：</span>{{ parsedGradingsBySlot[slotIndex - 1].parsed.level }}
                          </div>
                          <div v-if="Array.isArray(parsedGradingsBySlot[slotIndex - 1].parsed.rubric) && parsedGradingsBySlot[slotIndex - 1].parsed.rubric.length" class="mb-2">
                            <div class="small fw-semibold text-secondary mb-1">評分項目</div>
                            <div v-for="(r, ri) in parsedGradingsBySlot[slotIndex - 1].parsed.rubric" :key="ri" class="mb-2 ps-2 border-start border-2">
                              <div class="small text-secondary">{{ r.criterion || r.criteria || '項目' }}{{ r.score != null ? `（${r.score} 分）` : '' }}</div>
                              <div v-if="r.description" class="mt-1 small">{{ r.description }}</div>
                              <div v-else-if="r.comments" class="mt-1 small">{{ r.comments }}</div>
                              <div v-else-if="r.comment" class="mt-1 small">{{ r.comment }}</div>
                            </div>
                          </div>
                          <div v-if="Array.isArray(parsedGradingsBySlot[slotIndex - 1].parsed.strengths) && parsedGradingsBySlot[slotIndex - 1].parsed.strengths.length" class="mb-2">
                            <div class="small fw-semibold text-secondary mb-1">優點</div>
                            <ul class="mb-0 ps-3 small">
                              <li v-for="(s, si) in parsedGradingsBySlot[slotIndex - 1].parsed.strengths" :key="si">{{ s }}</li>
                            </ul>
                          </div>
                          <div v-if="Array.isArray(parsedGradingsBySlot[slotIndex - 1].parsed.weaknesses) && parsedGradingsBySlot[slotIndex - 1].parsed.weaknesses.length" class="mb-2">
                            <div class="small fw-semibold text-secondary mb-1">待改進</div>
                            <ul class="mb-0 ps-3 small">
                              <li v-for="(w, wi) in parsedGradingsBySlot[slotIndex - 1].parsed.weaknesses" :key="wi">{{ w }}</li>
                            </ul>
                          </div>
                        </div>
                      </template>
                      <div v-else class="small" style="white-space: pre-wrap;">{{ (parsedGradingsBySlot[slotIndex - 1] || {}).raw || '尚未批改' }}</div>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <!-- 尚未產生：顯示產生 quiz 表單 -->
                <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 個 quiz</span>
                  </div>
                  <div class="card-body text-start pt-3">
                    <div class="d-flex flex-wrap align-items-end gap-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">選擇單元（rag_name）</label>
                        <select v-model="getSlotFormState(slotIndex).generateQuizFileId" class="form-select form-select-sm">
                          <option value="">— 請選擇 —</option>
                          <option v-for="(opt, i) in generateQuizUnits" :key="i" :value="opt.file_id">{{ opt.rag_name }}</option>
                        </select>
                      </div>
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">難度</label>
                        <select v-model="filterDifficulty" class="form-select form-select-sm">
                          <option v-for="opt in difficultyOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        :disabled="getSlotFormState(slotIndex).loading || generateDisabled"
                        @click="generateQuiz(slotIndex)"
                      >
                        {{ getSlotFormState(slotIndex).loading ? '產生中...' : '產生 quiz' }}
                      </button>
                    </div>
                    <div v-if="getSlotFormState(slotIndex).error" class="alert alert-danger mt-2 mb-0 py-2 small">
                      {{ getSlotFormState(slotIndex).error }}
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <div class="mb-0 pt-2">
              <button type="button" class="btn btn-sm btn-primary" @click="openNextQuizSlot">新增 quiz</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
