<script setup>
/**
 * 試題頁面。與建立 RAG 頁版面一致，但僅使用「使用中 RAG」資料，不包含建立 RAG、上傳 ZIP、Pack。
 * 資料來源：GET /rag/applied，回傳格式與 file_metadata、quiz_metadata 一致（同 GET /rag/rags 單筆）。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_GENERATE_QUIZ,
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
  API_GRADE_SUBMISSION,
  API_GRADE_RESULT,
  API_RAG_APPLIED,
} from '../constants/api.js';

defineProps({
  tabId: { type: String, required: true },
});

const authStore = useAuthStore();
const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過50字';

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

/** GET /rag/applied 回傳的「使用中 RAG」資料（格式同 file_metadata、quiz_metadata） */
const appliedRag = ref(null);
const appliedLoading = ref(false);
const appliedError = ref('');

/** 單一頁面狀態（無多 tab） */
const state = reactive({
  openaiApiKey: '',
  generateQuizTabId: '',
  cardList: [],
  slotFormState: {},
  showQuizGeneratorBlock: false,
  quizSlotsCount: 0,
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
  zipTabId: '',
});

const filterDifficulty = ref('基礎');
const difficultyOptions = ['基礎', '進階'];

/** 用於顯示 file_metadata（來自 GET /rag/applied 回傳） */
const fileMetadataToShow = computed(() => {
  const rag = appliedRag.value;
  if (rag == null || typeof rag !== 'object') return null;
  if (rag.file_metadata != null && typeof rag.file_metadata === 'object') return rag.file_metadata;
  return null;
});

/** 從 file_metadata 或 RAG 頂層取得 course_name */
const courseNameFromFileMetadata = computed(() => {
  const meta = fileMetadataToShow.value;
  const rag = appliedRag.value;
  const fromMeta = meta != null && typeof meta === 'object' && meta.course_name != null ? String(meta.course_name).trim() : '';
  const fromRag = rag?.course_name != null ? String(rag.course_name).trim() : '';
  return fromMeta || fromRag || '';
});

/** 是否有 rag_metadata（決定是否顯示產生題目區塊） */
const hasRagMetadata = computed(() => {
  const r = appliedRag.value;
  if (!r || typeof r !== 'object') return false;
  return r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
});

/** 從 applied RAG 的 rag_metadata.outputs 或 rag_list 推導 generateQuizUnits */
const generateQuizUnits = computed(() => {
  const rag = appliedRag.value;
  if (!rag || typeof rag !== 'object') return [];
  const sourceTabId = String(rag.rag_tab_id ?? '');
  const outputs = rag.rag_metadata?.outputs;
  if (Array.isArray(outputs) && outputs.length > 0) {
    return outputs.map((o) => ({
      rag_tab_id: sourceTabId || o.rag_tab_id || `${(o.rag_name ?? '').replace(/\+/g, '_')}_rag`,
      filename: o.filename ?? `${(o.rag_name ?? '').replace(/\+/g, '_')}.zip`,
      rag_name: (o.rag_name ?? '').replace(/\+/g, '_'),
    }));
  }
  const ragListStr = rag.rag_list ?? '';
  if (!ragListStr) return [];
  return String(ragListStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((group) => {
      const ragName = group.replace(/\+/g, '_');
      return {
        rag_tab_id: sourceTabId || `${ragName}_rag`,
        filename: `${ragName}_rag.zip`,
        rag_name: ragName,
      };
    });
});

/** rag_tab_id 供產生題目與評分使用 */
const sourceTabId = computed(() => {
  const rag = appliedRag.value;
  if (!rag) return '';
  return String(rag.rag_tab_id ?? rag.id ?? '').trim();
});

/** 顯示用 rag_id / rag_tab_id */
const ragIdAndTabId = computed(() => {
  const rag = appliedRag.value;
  if (!rag || typeof rag !== 'object') return { rag_id: '—', rag_tab_id: '—' };
  const rid = rag.rag_id ?? rag.id;
  const tid = rag.rag_tab_id ?? rag.id;
  return {
    rag_id: rid != null ? String(rid) : '—',
    rag_tab_id: tid != null ? String(tid) : '—',
  };
});

/** 產生題目／評分是否應停用（無 API key 或無 applied RAG） */
const generateDisabled = computed(() => {
  if (!sourceTabId.value) return true;
  return !state.openaiApiKey?.trim();
});

/** 由 GET /rag/applied 的 quiz（含 answers）組成一張題目卡片 */
function buildCardFromRagQuiz(quiz, ragName) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) || (latestAnswer.student_answer != null ? '已批改' : ''))
    : '';
  const levelNum = quiz.quiz_level;
  const generateLevel = (levelNum === 0 || levelNum === 1) ? QUIZ_LEVEL_LABELS[levelNum] : null;
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? '',
    hint: quiz.quiz_hint ?? '',
    referenceAnswer: quiz.reference_answer ?? '',
    sourceFilename: null,
    ragName: ragName || null,
    answer: latestAnswer?.student_answer ?? '',
    hintVisible: false,
    confirmed: !!latestAnswer,
    gradingResult,
    gradingResponseJson: latestAnswer ?? null,
    generateQuizResponseJson: null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: null,
    quiz_id: quiz.quiz_id ?? null,
    answer_id: latestAnswer?.answer_id ?? null,
  };
}

/** 當 appliedRag 載入後，從 quizzes + answers 填入題目卡片 */
watch(appliedRag, (rag) => {
  if (!rag || typeof rag !== 'object') return;
  state.zipTabId = String(rag.rag_tab_id ?? rag.id ?? '');
  if (rag.llm_api_key != null && String(rag.llm_api_key).trim() !== '') {
    state.openaiApiKey = String(rag.llm_api_key).trim();
  }
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    state.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
  const quizzes = rag.quizzes ?? [];
  const ragAnswers = rag.answers ?? [];
  if (quizzes.length > 0) {
    const answersByQuizId = ragAnswers.reduce((acc, a) => {
      const id = a.quiz_id;
      if (!acc[id]) acc[id] = [];
      acc[id].push(a);
      return acc;
    }, {});
    const quizzesWithAnswers = quizzes.map((q, i) => {
      const byId = q.answers ?? answersByQuizId[q.quiz_id];
      const answers = (Array.isArray(byId) && byId.length > 0) ? byId : (ragAnswers[i] != null ? [ragAnswers[i]] : []);
      return { ...q, answers };
    });
    const firstRagName = (generateQuizUnits.value[0]?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromRagQuiz(q, q.rag_name ?? firstRagName));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}, { immediate: true });

/** 選擇單元預設第一筆 */
watch(generateQuizUnits, (units) => {
  if (units.length === 0) return;
  const firstTabId = units[0].rag_tab_id;
  const currentInList = units.some((u) => u.rag_tab_id === state.generateQuizTabId);
  if (!state.generateQuizTabId || !currentInList) {
    state.generateQuizTabId = firstTabId;
  }
}, { immediate: true });

/** 載入使用中 RAG：GET /rag/applied，回傳格式與 file_metadata、quiz_metadata 一致 */
async function fetchApplied() {
  appliedLoading.value = true;
  appliedError.value = '';
  try {
    const personId = authStore.user?.person_id;
    const headers = {};
    if (personId != null && String(personId).trim() !== '') {
      headers['X-Person-Id'] = String(personId).trim();
    }
    const res = await fetch(`${API_BASE}${API_RAG_APPLIED}`, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const err = JSON.parse(text);
        msg = err.detail ?? err.error ?? msg;
      } catch (_) {
        if (text) msg = text;
      }
      throw new Error(msg);
    }
    const data = await res.json();
    appliedRag.value = data;
  } catch (err) {
    appliedError.value = err.message || '無法載入使用中 RAG';
    appliedRag.value = null;
  } finally {
    appliedLoading.value = false;
  }
}

function getSlotFormState(slotIndex) {
  if (!state.slotFormState[slotIndex]) {
    const units = generateQuizUnits.value;
    const first = units.length ? units[0].rag_tab_id : '';
    state.slotFormState[slotIndex] = reactive({
      generateQuizTabId: first,
      loading: false,
      error: '',
      responseJson: null,
    });
  }
  return state.slotFormState[slotIndex];
}

function openNextQuizSlot() {
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  while (state.cardList.length < state.quizSlotsCount) {
    state.cardList.push(null);
  }
}

function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed) {
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  state.cardList[slotIndex - 1] = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    hint: hint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    answer: '',
    hintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
  };
}

async function generateQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const selectedUnit = generateQuizUnits.value.find((u) => u.rag_tab_id === slotState.generateQuizTabId);
  const ragName = selectedUnit?.rag_name?.trim();
  if (!sourceTabId.value) {
    slotState.error = '尚未載入使用中 RAG（rag_tab_id）';
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
  const quizLevel = difficultyOptions.indexOf(filterDifficulty.value);
  try {
    const res = await fetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: (state.openaiApiKey ?? '').trim(),
        rag_tab_id: sourceTabId.value,
        rag_name: ragName,
        quiz_level: quizLevel >= 0 ? quizLevel : 0,
        course_name: courseName || '未命名課程',
        quiz_type: 0,
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
    const quizContent = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? data.quiz_content ?? '';
    const hintText = data.quiz_hint ?? data.hint ?? '';
    const referenceAnswerText = data.reference_answer ?? data.answer ?? '';
    setCardAtSlot(slotIndex, quizContent, hintText, null, referenceAnswerText, ragName, data, filterDifficulty.value, (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION);
  } catch (err) {
    slotState.error = err.message || '產生題目失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

function formatGradingResult(text) {
  if (!text || typeof text !== 'string') return text;
  const t = text.trim();
  if (!t.startsWith('{')) return text;
  try {
    const raw = JSON.parse(text);
    let data = raw;
    if (raw.answer_metadata && typeof raw.answer_metadata === 'object') {
      data = raw.answer_metadata;
    } else if (raw.answer_feedback_metadata) {
      const parsed =
        typeof raw.answer_feedback_metadata === 'string'
          ? (() => {
              try {
                return JSON.parse(raw.answer_feedback_metadata);
              } catch {
                return null;
              }
            })()
          : raw.answer_feedback_metadata;
      if (parsed) data = parsed;
    }
    const lines = [];
    if (data.score != null) lines.push(`總分：${data.score} / 10`);
    if (data.level) lines.push(`等級：${data.level}`);
    if (lines.length) lines.push('');
    const rubric = data.rubric;
    if (Array.isArray(rubric) && rubric.length > 0) {
      lines.push('【評分項目】');
      rubric.forEach((r) => {
        const criteria = r.criteria ?? '';
        const score = r.score != null ? ` (${r.score}分)` : '';
        const comment = r.comment ? `\n  ${r.comment}` : '';
        lines.push(`• ${criteria}${score}${comment}`);
      });
      lines.push('');
    }
    const section = (title, arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return;
      lines.push(`【${title}】`);
      arr.forEach((s) => lines.push(`• ${s}`));
      lines.push('');
    };
    section('優點', data.strengths);
    section('待改進', data.weaknesses);
    section('遺漏項目', data.missing_items);
    section('建議後續', data.action_items);
    return lines.join('\n').trim() || text;
  } catch (_) {
    return text;
  }
}

function rewriteAnswer(item) {
  item.answer = '';
  item.confirmed = false;
  item.gradingResult = '';
  item.gradingResponseJson = null;
}

async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  if (!sourceTabId.value) {
    item.confirmed = true;
    item.gradingResult = '評分需要 rag_tab_id：請確認已載入使用中 RAG。';
    return;
  }
  const ragName = item.ragName?.trim() ?? generateQuizUnits.value[0]?.rag_name?.trim();
  if (!ragName) {
    item.confirmed = true;
    item.gradingResult = '評分失敗：此題目未關聯 RAG 單元（rag_name）。';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  const courseName = courseNameFromFileMetadata.value ?? '';
  try {
    const res = await fetch(`${API_BASE}${API_GRADE_SUBMISSION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: (state.openaiApiKey ?? '').trim(),
        rag_tab_id: sourceTabId.value,
        rag_name: ragName,
        quiz_content: item.quiz ?? '',
        student_answer: item.answer.trim(),
        qtype: 'short_answer',
        course_name: courseName,
        quiz_id: item.quiz_id ?? 0,
      }),
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
      const statusHint = res.status === 400 ? '（例如 API Key 未設定）\n\n' : (res.status === 502 ? '（後端逾時或服務喚醒中，請稍後再試）\n\n' : (res.status === 500 ? '（後端 500 錯誤）\n\n' : ''));
      item.gradingResult = `評分失敗：${statusHint}${msg}`;
      return;
    }
    if (res.status !== 202) {
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
      item.gradingResponseJson = parsed;
      item.gradingResult = formatGradingResult(text) || '（無批改內容）';
      return;
    }
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
          pollRes = await fetch(`${API_BASE}${API_GRADE_RESULT}/${encodeURIComponent(jobId)}`);
          pollText = await pollRes.text();
          if (pollRes.status !== 502 && pollRes.status !== 504) break;
        } catch (_) {}
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
        item.gradingResult = formatGradingResult(JSON.stringify(pollData.result)) || '（無批改內容）';
        return;
      }
      if (pollData.status === 'error') {
        const errMsg = pollData.error || '';
        item.gradingResult = errMsg.includes('job not found')
          ? '評分任務不存在或已過期，請重新送出評分。'
          : `評分失敗：${pollData.error || '未知錯誤'}`;
        return;
      }
    }
    item.gradingResult = '評分逾時：請稍後再試或重新送出';
  } catch (err) {
    item.gradingResult = '評分失敗：後端逾時或服務喚醒中，請稍後再試。';
  }
}

onMounted(() => {
  fetchApplied();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100">
    <div class="flex-shrink-0 bg-white border-bottom">
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2">
        <span class="fw-semibold">試題</span>
        <template v-if="appliedLoading">
          <span class="small text-secondary">載入使用中 RAG...</span>
        </template>
      </div>
      <div v-if="appliedError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ appliedError }}
      </div>
    </div>

    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <template v-if="appliedRag != null">
        <!-- 基本資訊與 file_metadata（無上傳、無 Pack） -->
        <div class="bg-body-tertiary rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">基本資訊與 file_metadata</div>
          <div class="d-flex flex-wrap align-items-center gap-3 small mb-2">
            <span class="form-label small text-secondary fw-medium">rag_id：</span>
            <span class="small">{{ ragIdAndTabId.rag_id }}</span>
            <span class="form-label small text-secondary fw-medium">rag_tab_id：</span>
            <span class="small">{{ ragIdAndTabId.rag_tab_id }}</span>
          </div>
          <div class="form-label small text-secondary fw-medium mb-2 mt-4">OpenAI API Key</div>
          <p class="form-text small text-secondary mb-2">產生題目與評分時使用；若後端已儲存則可留空由後端提供。</p>
          <div style="max-width: 400px;" class="mb-3">
            <input
              v-model="state.openaiApiKey"
              type="text"
              class="form-control form-control-sm"
              placeholder="請輸入 OpenAI API Key"
              autocomplete="off"
            >
          </div>
          <div v-if="fileMetadataToShow != null" class="mt-3">
            <div class="form-label small text-secondary fw-medium mb-2">file_metadata</div>
            <pre class="bg-body-secondary border rounded p-2 mb-0 font-monospace small overflow-auto" style="max-height: 20rem;"><code>{{ JSON.stringify(fileMetadataToShow, null, 2) }}</code></pre>
          </div>
        </div>

        <!-- RAG 產生題目與題目與作答（與建立 RAG 頁同區塊，無 Pack 前置） -->
        <div v-if="hasRagMetadata" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': generateDisabled }">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">RAG 產生題目與題目與作答</div>
          <p class="small text-secondary mb-3">點「新增題目」後會出現一題的區塊（選擇單元、難度、產生題目等）；每按一次「新增題目」才會多一個題目區塊。</p>

          <div class="bg-light rounded mb-3">
            <template v-for="(slotIndex) in state.quizSlotsCount" :key="slotIndex">
              <template v-if="state.cardList[slotIndex - 1]">
                <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
                  </div>
                  <div class="card-body text-start">
                    <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">選擇單元（rag_name）</label>
                        <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ state.cardList[slotIndex - 1].ragName || '—' }}</div>
                      </div>
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">難度</label>
                        <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ state.cardList[slotIndex - 1].generateLevel || '—' }}</div>
                      </div>
                    </div>
                    <div class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">題目</div>
                      <div class="bg-body-secondary border rounded p-2 lh-base">
                        {{ state.cardList[slotIndex - 1].quiz }}
                      </div>
                    </div>
                    <div class="mb-3">
                      <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="toggleHint(state.cardList[slotIndex - 1])">
                        {{ state.cardList[slotIndex - 1].hintVisible ? '隱藏提示' : '顯示提示' }}
                      </button>
                      <div v-show="state.cardList[slotIndex - 1].hintVisible" class="rounded bg-body-tertiary small mt-2 p-2 text-secondary">
                        {{ state.cardList[slotIndex - 1].hint }}
                      </div>
                    </div>
                    <div v-if="state.cardList[slotIndex - 1].referenceAnswer" class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">參考答案</div>
                      <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ state.cardList[slotIndex - 1].referenceAnswer }}</div>
                    </div>
                    <div class="mb-3">
                      <label :for="`answer-${state.cardList[slotIndex - 1].id}`" class="form-label small text-secondary fw-medium mb-1">回答</label>
                      <template v-if="!state.cardList[slotIndex - 1].confirmed">
                        <textarea
                          :id="`answer-${state.cardList[slotIndex - 1].id}`"
                          v-model="state.cardList[slotIndex - 1].answer"
                          class="form-control"
                          rows="4"
                          placeholder="請輸入您的回答..."
                          maxlength="2000"
                        />
                        <div class="form-text small">{{ state.cardList[slotIndex - 1].answer.length }} / 2000</div>
                        <div class="d-flex gap-2 mt-2">
                          <button type="button" class="btn btn-sm btn-outline-secondary" @click="rewriteAnswer(state.cardList[slotIndex - 1])">重寫</button>
                          <button type="button" class="btn btn-sm btn-primary" @click="confirmAnswer(state.cardList[slotIndex - 1])">確定</button>
                        </div>
                      </template>
                      <template v-else>
                        <div class="rounded bg-body-tertiary small mb-2 p-2">{{ state.cardList[slotIndex - 1].answer }}</div>
                        <div class="d-flex gap-2 mb-3">
                          <button type="button" class="btn btn-sm btn-outline-secondary" @click="rewriteAnswer(state.cardList[slotIndex - 1])">重寫</button>
                        </div>
                      </template>
                    </div>
                    <div class="border rounded bg-light p-3 mb-3">
                      <div class="form-label small fw-semibold text-secondary mb-1">批改結果</div>
                      <div class="small" style="white-space: pre-wrap;">{{ state.cardList[slotIndex - 1].gradingResult || '尚未批改' }}</div>
                    </div>
                    <div v-if="state.cardList[slotIndex - 1].generateQuizResponseJson != null" class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">產生題目 API 回傳 JSON：</div>
                      <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(state.cardList[slotIndex - 1].generateQuizResponseJson, null, 2) }}</pre>
                    </div>
                    <div v-if="state.cardList[slotIndex - 1].gradingResponseJson != null">
                      <div class="form-label small text-secondary fw-medium mb-1">批改結果 API 回傳 JSON：</div>
                      <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(state.cardList[slotIndex - 1].gradingResponseJson, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
                  </div>
                  <div class="card-body text-start pt-3">
                    <div class="d-flex flex-wrap align-items-end gap-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">選擇單元（rag_name）</label>
                        <select v-model="getSlotFormState(slotIndex).generateQuizTabId" class="form-select form-select-sm">
                          <option value="">— 請選擇 —</option>
                          <option v-for="(opt, i) in generateQuizUnits" :key="i" :value="opt.rag_tab_id">{{ opt.rag_name }}</option>
                        </select>
                      </div>
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">難度</label>
                        <select v-model="filterDifficulty" class="form-select form-select-sm">
                          <option v-for="opt in difficultyOptions" :key="opt" :value="opt">{{ opt }}</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        :disabled="getSlotFormState(slotIndex).loading || generateDisabled"
                        @click="generateQuiz(slotIndex)"
                      >
                        {{ getSlotFormState(slotIndex).loading ? '產生中...' : '產生題目' }}
                      </button>
                    </div>
                    <div v-if="getSlotFormState(slotIndex).error" class="alert alert-danger mt-2 mb-0 py-2 small">
                      {{ getSlotFormState(slotIndex).error }}
                    </div>
                    <div v-if="getSlotFormState(slotIndex).responseJson !== null" class="mt-2">
                      <div class="form-label small text-secondary fw-medium mb-1">產生題目 API 回傳 JSON：</div>
                      <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(getSlotFormState(slotIndex).responseJson, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <div class="mb-0 pt-2">
              <button
                type="button"
                class="btn btn-sm btn-primary"
                @click="openNextQuizSlot"
              >
                新增題目
              </button>
            </div>
          </div>
        </div>

        <!-- 該 RAG 的資料（GET /rag/applied 回傳） -->
        <div class="bg-body-tertiary rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">該 RAG 的資料（GET /rag/applied 回傳）</div>
          <pre class="bg-body-secondary border rounded p-3 font-monospace small mb-0 overflow-auto" style="max-height: 24rem;">{{ JSON.stringify(appliedRag, null, 2) }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>
