<script setup>
/**
 * Exam 頁面。版面與建立 RAG 頁相同寫法，但無 RAG 功能（建立、上傳 ZIP、Pack）。
 * 資料來源：GET /rag/applied 取得使用中 RAG（回傳格式與 file_metadata、quiz_metadata 一致）。
 * 測驗列表：GET /exam/exams；出題與評分使用 Exam API（/exam/generate-quiz、/exam/quiz-grade、/exam/quiz-grade-result）；刪除：POST /exam/delete/{exam_tab_id}。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
  API_RAG_APPLIED,
  API_EXAM_TESTS,
  API_CREATE_EXAM,
  API_EXAM_DELETE,
  API_TEST_GENERATE_QUIZ,
  API_TEST_QUIZ_GRADE,
  API_TEST_QUIZ_GRADE_RESULT,
} from '../constants/api.js';

defineProps({
  tabId: { type: String, required: true },
});

const authStore = useAuthStore();
const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過50字';

/** test_tab_id 規則：與 RAG 頁一致 → {person_id}_yymmddhhmmss；無 person_id 時 fallback 為 UUID */
function generateTabId(personId) {
  if (personId != null && String(personId).trim() !== '') {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${String(personId).trim()}_${yy}${mm}${dd}${hh}${min}${ss}`;
  }
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    (c === 'x' ? hex() : (parseInt(hex(), 16) & 0x3) | 0x8).toString(16)
  );
}

/** 從 test_tab_id 取得 test_name：與 RAG 頁一致，底線後的部份（時間），無底線則用整段 */
function deriveNameFromTabId(tabId) {
  if (!tabId || typeof tabId !== 'string') return '';
  const idx = String(tabId).indexOf('_');
  return idx >= 0 ? String(tabId).slice(idx + 1) : String(tabId);
}

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** GET /rag/applied 回傳的「使用中 RAG」資料（格式同 file_metadata、quiz_metadata） */
const appliedRag = ref(null);
const appliedLoading = ref(false);
const appliedError = ref('');

/** 使用中 RAG 帶來的 API key、system instruction（由 watch 填入，供出題／評分使用） */
const appliedState = reactive({
  openaiApiKey: '',
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
});

/** 測驗列表（GET /exam/exams 載入；按 + 呼叫 POST /exam/create-exam 新增） */
const testList = ref([]);
const testListLoading = ref(false);
const testListError = ref('');
const createTestLoading = ref(false);
const createTestError = ref('');
/** 當前選中的 tab = 該測驗的 test_tab_id / exam_tab_id */
const activeTabId = ref(null);

/** 每個 tab（test_tab_id）的狀態 */
const tabStateMap = reactive({});

function getTabState(id) {
  const resolvedId = id || (testList.value[0] ? getTestTabId(testList.value[0]) : '') || '';
  if (!resolvedId) {
    return {
      generateQuizTabId: '',
      cardList: [],
      slotFormState: {},
      showQuizGeneratorBlock: false,
      quizSlotsCount: 0,
    };
  }
  if (!tabStateMap[resolvedId]) {
    const units = generateQuizUnits.value;
    const first = units.length ? units[0].rag_tab_id : '';
    tabStateMap[resolvedId] = reactive({
      generateQuizTabId: first,
      cardList: [],
      slotFormState: {},
      showQuizGeneratorBlock: false,
      quizSlotsCount: 0,
    });
  }
  return tabStateMap[resolvedId];
}

/** 當前 tab 的狀態（template 與方法內使用） */
const currentState = computed(() => {
  const id = activeTabId.value;
  if (id) return getTabState(id);
  return getTabState(testList.value[0] ? getTestTabId(testList.value[0]) : '');
});

const filterDifficulty = ref('基礎');
const difficultyOptions = ['基礎', '進階'];

const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

/** 當前選中 tab 對應的 Exam（來自 GET /exam/exams 列表），格式同 GET /rag/rags 每筆含 quizzes、answers */
const currentExamItem = computed(() => {
  const id = activeTabId.value;
  if (!id) return null;
  return testList.value.find((exam) => getTestTabId(exam) === id) ?? null;
});

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

/** 使用中 RAG 的 rag_tab_id（GET /rag/applied 回傳），供產生題目與評分使用 */
const sourceTabId = computed(() => {
  const rag = appliedRag.value;
  if (!rag) return '';
  return String(rag.rag_tab_id ?? rag.id ?? '').trim();
});

/** 使用中 RAG 的 rag_id（GET /rag/applied 回傳；與建立 RAG 頁 currentRagIdAndTabId 對應） */
const appliedRagIdAndTabId = computed(() => {
  const rag = appliedRag.value;
  if (!rag) return { rag_id: '未載入', rag_tab_id: '未載入' };
  const rid = rag.rag_id ?? rag.id;
  const tid = rag.rag_tab_id ?? rag.id ?? '';
  return { rag_id: rid != null ? String(rid) : '—', rag_tab_id: tid ? String(tid) : '—' };
});

/** 產生題目／評分是否應停用（未選測驗 tab 或無 applied RAG）；API Key 由 GET /rag/applied 回傳提供 */
const generateDisabled = computed(() => {
  if (!activeTabId.value) return true;
  if (!sourceTabId.value) return true;
  return false;
});

/** 當 appliedRag 載入後，填入 API key、system instruction（供各 tab 出題／評分使用） */
watch(appliedRag, (rag) => {
  if (!rag || typeof rag !== 'object') return;
  const key = rag.llm_api_key ?? rag.apikey;
  if (key != null && String(key).trim() !== '') {
    appliedState.openaiApiKey = String(key).trim();
  }
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    appliedState.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
}, { immediate: true });

/** 有測驗列表時預設選第一個 tab */
watch(testList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = getTestTabId(list[0]) || list[0];
  }
}, { immediate: true });

/** 選擇單元預設第一筆（每個 tab 各自） */
watch(generateQuizUnits, (units) => {
  if (units.length === 0) return;
  const state = currentState.value;
  const firstTabId = units[0].rag_tab_id;
  const currentInList = units.some((u) => u.rag_tab_id === state.generateQuizTabId);
  if (!state.generateQuizTabId || !currentInList) {
    state.generateQuizTabId = firstTabId;
  }
}, { immediate: true });

/** 由 GET /exam/exams 回傳的 quiz（含 answers）組成一張題目卡片，格式同 CreateRAGPage buildCardFromRagQuiz */
function buildCardFromExamQuiz(quiz, ragName) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) || (latestAnswer.student_answer != null ? '已批改' : ''))
    : '';
  const levelNum = quiz.quiz_level;
  const generateLevel = (levelNum === 0 || levelNum === 1) ? QUIZ_LEVEL_LABELS[levelNum] : null;
  const quizId = quiz.exam_quiz_id ?? quiz.quiz_id ?? null;
  const answerId = latestAnswer?.exam_answer_id ?? latestAnswer?.answer_id ?? null;
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? '',
    hint: quiz.quiz_hint ?? '',
    referenceAnswer: quiz.reference_answer ?? '',
    sourceFilename: null,
    ragName: ragName ?? quiz.rag_name ?? null,
    answer: latestAnswer?.student_answer ?? '',
    hintVisible: false,
    confirmed: !!latestAnswer,
    gradingResult,
    gradingResponseJson: latestAnswer ?? null,
    generateQuizResponseJson: null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: null,
    quiz_id: quizId,
    answer_id: answerId,
  };
}

/** 當切換到某個 Exam tab 時，從該筆的 quizzes、answers 填入題目卡片（格式同 GET /rag/rags，與 CreateRAGPage 一致） */
watch(currentExamItem, (exam) => {
  if (!exam || typeof exam !== 'object') return;
  const tabId = getTestTabId(exam);
  if (!tabId) return;
  const state = getTabState(tabId);
  const quizzes = exam.quizzes ?? [];
  const examAnswers = exam.answers ?? [];
  if (quizzes.length > 0) {
    const answersByQuizId = examAnswers.reduce((acc, a) => {
      const id = a.exam_quiz_id ?? a.quiz_id;
      if (!acc[id]) acc[id] = [];
      acc[id].push(a);
      return acc;
    }, {});
    const quizzesWithAnswers = quizzes.map((q, i) => {
      const byId = q.answers ?? answersByQuizId[q.exam_quiz_id ?? q.quiz_id];
      const answers = (Array.isArray(byId) && byId.length > 0) ? byId : (examAnswers[i] != null ? [examAnswers[i]] : []);
      return { ...q, answers };
    });
    const firstRagName = (quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromExamQuiz(q, q.rag_name ?? firstRagName));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}, { immediate: true });

/** 載入測驗列表：GET /exam/exams；僅 deleted=false，每筆含表上所有欄位 + quizzes（每題帶 answers）、頂層 answers；格式同 GET /rag/rags。query: person_id 可選。 */
async function fetchExamTests() {
  testListLoading.value = true;
  testListError.value = '';
  try {
    const personId = authStore.user?.person_id;
    const params = new URLSearchParams();
    if (personId != null && String(personId).trim() !== '') {
      params.set('person_id', String(personId).trim());
    }
    const url = params.toString() ? `${API_BASE}${API_EXAM_TESTS}?${params}` : `${API_BASE}${API_EXAM_TESTS}`;
    const headers = {};
    if (personId != null && String(personId).trim() !== '') {
      headers['X-Person-Id'] = String(personId).trim();
    }
    const res = await fetch(url, { method: 'GET', headers });
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
    const raw = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
    const list = Array.isArray(raw) ? raw : [];
    // 保留完整欄位與 quizzes、answers（供 watch(currentExamItem) 預填題目卡片）
    testList.value = list.map((row) => ({
      ...row,
      exam_id: row.exam_id ?? row.test_id,
      exam_tab_id: row.exam_tab_id ?? row.test_tab_id,
      exam_name: row.exam_name ?? row.test_name,
      test_id: row.exam_id ?? row.test_id,
      test_tab_id: row.exam_tab_id ?? row.test_tab_id,
      test_name: row.exam_name ?? row.test_name,
    }));
  } catch (err) {
    testListError.value = err.message || '無法載入測驗列表';
    testList.value = [];
  } finally {
    testListLoading.value = false;
  }
}

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
    // GET /rag/applied 回傳 { rag_metadata: {...}, apikey }；前端預期 appliedRag 為單一 RAG 物件
    const meta = data?.rag_metadata;
    appliedRag.value = meta != null
      ? { ...meta, apikey: data.apikey ?? meta.apikey ?? meta.llm_api_key }
      : null;
  } catch (err) {
    appliedError.value = err.message || '無法載入使用中 RAG';
    appliedRag.value = null;
  } finally {
    appliedLoading.value = false;
  }
}

/** 測驗 tab 顯示名稱：支援 exam_name/exam_tab_id（新 API）與 test_name/test_tab_id */
function getTestTabLabel(test) {
  if (test == null) return '測驗';
  if (typeof test === 'string') return test;
  const tabId = test.exam_tab_id ?? test.test_tab_id ?? test.id ?? '';
  const name = (test.exam_name ?? test.test_name) != null && String(test.exam_name ?? test.test_name).trim() !== '' ? String(test.exam_name ?? test.test_name).trim() : '';
  const fromTabId = deriveNameFromTabId(tabId);
  const created = test.created_at ?? '';
  return name || fromTabId || tabId || created || '測驗';
}

/** 取得測驗的 tab id（exam_tab_id 或 test_tab_id） */
function getTestTabId(test) {
  if (test == null || typeof test !== 'object') return '';
  return String(test.exam_tab_id ?? test.test_tab_id ?? test.id ?? '');
}

/** 按 + 新增測驗：POST /exam/create-exam，body 用 exam_tab_id、exam_name；加入 testList 並切到新 tab。 */
async function addNewTab() {
  const personId = authStore.user?.person_id;
  if (personId == null || String(personId).trim() === '') {
    createTestError.value = '請先登入以建立測驗';
    return;
  }
  createTestError.value = '';
  createTestLoading.value = true;
  const examTabId = generateTabId(personId);
  const examName = deriveNameFromTabId(examTabId) || examTabId;
  try {
    const res = await fetch(`${API_BASE}${API_CREATE_EXAM}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_tab_id: examTabId,
        person_id: String(personId),
        exam_name: examName,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(msg);
    }
    const data = await res.json();
    const tabIdVal = data?.exam_tab_id != null ? String(data.exam_tab_id) : (data?.test_tab_id != null ? String(data.test_tab_id) : examTabId);
    const item = {
      exam_id: data.exam_id ?? data.test_id,
      exam_tab_id: tabIdVal,
      exam_name: data.exam_name ?? data.test_name ?? examName,
      test_id: data.exam_id ?? data.test_id,
      test_tab_id: tabIdVal,
      test_name: data.exam_name ?? data.test_name ?? examName,
      person_id: data.person_id,
      created_at: data.created_at,
    };
    testList.value = [...testList.value, item];
    activeTabId.value = tabIdVal;
  } catch (err) {
    createTestError.value = err.message || '建立測驗失敗';
  } finally {
    createTestLoading.value = false;
  }
}

/** 刪除測驗：POST /exam/delete/{exam_tab_id}，成功後從列表移除並切到其他 tab */
const deleteTestLoading = ref(false);
const deleteTestError = ref('');
async function deleteTest(testTabId) {
  if (!testTabId) return;
  if (!confirm('確定要刪除此測驗嗎？')) return;
  deleteTestError.value = '';
  deleteTestLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}${API_EXAM_DELETE}/${encodeURIComponent(testTabId)}`, {
      method: 'POST',
      headers: authStore.user?.person_id ? { 'X-Person-Id': String(authStore.user.person_id) } : {},
    });
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
    testList.value = testList.value.filter((t) => getTestTabId(t) !== testTabId);
    if (activeTabId.value === testTabId) {
      activeTabId.value = testList.value.length > 0 ? getTestTabId(testList.value[0]) : null;
    }
  } catch (err) {
    deleteTestError.value = err.message || '刪除測驗失敗';
  } finally {
    deleteTestLoading.value = false;
  }
}

function getSlotFormState(slotIndex) {
  const state = currentState.value;
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
  const state = currentState.value;
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  while (state.cardList.length < state.quizSlotsCount) {
    state.cardList.push(null);
  }
}

function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed, quizId) {
  const state = currentState.value;
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
    quiz_id: quizId ?? null,
  };
}

/** 出題：POST /exam/generate-quiz，傳 test_tab_id、rag_name、system_prompt_instruction 等 */
async function generateQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const selectedUnit = generateQuizUnits.value.find((u) => u.rag_tab_id === slotState.generateQuizTabId);
  const ragName = selectedUnit?.rag_name?.trim();
  if (!activeTabId.value) {
    slotState.error = '尚未建立測驗（請按 + 新增測驗）或請確認已載入使用中 RAG';
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
    const res = await fetch(`${API_BASE}${API_TEST_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: (appliedState.openaiApiKey ?? '').trim(),
        test_tab_id: activeTabId.value,
        rag_name: ragName,
        system_prompt_instruction: (appliedState.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
        course_name: courseName || '未命名課程',
        quiz_level: quizLevel >= 0 ? quizLevel : 0,
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
    const quizId = data.quiz_id != null ? Number(data.quiz_id) : null;
    setCardAtSlot(slotIndex, quizContent, hintText, null, referenceAnswerText, ragName, data, filterDifficulty.value, (appliedState.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION, quizId);
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

/** 評分：POST /exam/quiz-grade 傳 test_tab_id、rag_name 等，回傳 202 + job_id；輪詢 GET /exam/quiz-grade-result/{job_id} */
async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  if (!activeTabId.value) {
    item.confirmed = true;
    item.gradingResult = '評分需要測驗 tab：請選擇測驗或按 + 新增測驗。';
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
    const res = await fetch(`${API_BASE}${API_TEST_QUIZ_GRADE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: (appliedState.openaiApiKey ?? '').trim(),
        test_tab_id: activeTabId.value,
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
          pollRes = await fetch(`${API_BASE}${API_TEST_QUIZ_GRADE_RESULT}/${encodeURIComponent(jobId)}`);
          pollText = await pollRes.text();
          if (pollRes.status !== 502 && pollRes.status !== 504) break;
        } catch (_) { /* ignore */ }
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
  fetchExamTests();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100">
    <!-- 固定 tab 頁籤列（與建立 RAG 頁一致） -->
    <div class="flex-shrink-0 bg-white border-bottom">
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2">
        <template v-if="appliedLoading">
          <span class="small text-secondary">載入使用中 RAG...</span>
        </template>
        <template v-else-if="testListLoading">
          <span class="small text-secondary">載入測驗列表...</span>
        </template>
        <template v-else-if="testList.length === 0">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="createTestLoading"
            @click="addNewTab"
          >
            {{ createTestLoading ? '建立中...' : '+' }}
          </button>
        </template>
        <template v-else>
          <ul class="nav nav-tabs mb-0">
            <li v-for="test in testList" :key="'test-' + getTestTabId(test)" class="nav-item d-flex align-items-center">
              <button
                type="button"
                class="nav-link border-0 rounded-0"
                :class="{ active: activeTabId === getTestTabId(test) }"
                @click="activeTabId = getTestTabId(test)"
              >
                {{ getTestTabLabel(test) }}
              </button>
              <button
                type="button"
                class="btn btn-link btn-sm text-danger p-0 ms-1"
                :disabled="deleteTestLoading"
                :aria-label="'刪除 ' + getTestTabLabel(test)"
                @click.stop="deleteTest(getTestTabId(test))"
              >
                ×
              </button>
            </li>
            <li class="nav-item ms-2 align-self-center">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                :disabled="createTestLoading"
                @click="addNewTab"
              >
                {{ createTestLoading ? '建立中...' : '+' }}
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="appliedError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ appliedError }}
      </div>
      <div v-if="testListError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ testListError }}
      </div>
      <div v-if="createTestError" class="alert alert-danger py-2 small mx-4 mb-3">
        {{ createTestError }}
      </div>
      <div v-if="deleteTestError" class="alert alert-danger py-2 small mx-4 mb-3">
        {{ deleteTestError }}
      </div>
    </div>

    <!-- 內容區：可上下捲動（與建立 RAG 頁一致） -->
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <template v-if="appliedRag != null">
        <!-- 使用中 RAG 資訊：與建立 RAG 頁「基本資訊」對應，僅顯示 rag_id、rag_tab_id（無 ZIP 上傳、Pack） -->
        <div class="bg-body-tertiary rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">使用中 RAG（GET /rag/applied）</div>
          <div class="d-flex flex-wrap align-items-center gap-3 small mb-2">
            <span class="form-label small text-secondary fw-medium">rag_id：</span>
            <span class="small">{{ appliedRagIdAndTabId.rag_id }}</span>
            <span class="form-label small text-secondary fw-medium">rag_tab_id：</span>
            <span class="small">{{ appliedRagIdAndTabId.rag_tab_id }}</span>
          </div>
        </div>
        <!-- RAG 產生題目與題目與作答：與建立 RAG 頁同區塊；使用 /exam/generate-quiz、/exam/quiz-grade -->
        <div v-if="hasRagMetadata && activeTabId" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': generateDisabled }">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">RAG 產生題目與題目與作答</div>
          <p class="small text-secondary mb-3">點「新增題目」後會出現一題的區塊（選擇單元、難度、產生題目等）；每按一次「新增題目」才會多一個題目區塊。「新增題目」按鈕固定在最下面。</p>

          <!-- 題目區塊：每按一次「新增題目」才多一個「第 n 題」；按鈕固定在最下面 -->
          <div class="bg-light rounded mb-3">
            <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
              <!-- 第 slotIndex 題：若已有該題卡片則顯示卡片，否則顯示產生題目表單 -->
              <template v-if="currentState.cardList[slotIndex - 1]">
                <!-- 已有卡片：顯示完整題目區塊 -->
                <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
                  </div>
                  <div class="card-body text-start">
                    <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">選擇單元（rag_name）</label>
                        <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ currentState.cardList[slotIndex - 1].ragName || '—' }}</div>
                      </div>
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">難度</label>
                        <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ currentState.cardList[slotIndex - 1].generateLevel || '—' }}</div>
                      </div>
                    </div>
                    <div class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">題目</div>
                      <div class="bg-body-secondary border rounded p-2 lh-base">
                        {{ currentState.cardList[slotIndex - 1].quiz }}
                      </div>
                    </div>
                    <div class="mb-3">
                      <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="toggleHint(currentState.cardList[slotIndex - 1])">
                        {{ currentState.cardList[slotIndex - 1].hintVisible ? '隱藏提示' : '顯示提示' }}
                      </button>
                      <div v-show="currentState.cardList[slotIndex - 1].hintVisible" class="rounded bg-body-tertiary small mt-2 p-2 text-secondary">
                        {{ currentState.cardList[slotIndex - 1].hint }}
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
                      <div class="small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].gradingResult || '尚未批改' }}</div>
                    </div>
                    <div v-if="currentState.cardList[slotIndex - 1].generateQuizResponseJson != null" class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">產生題目 API 回傳 JSON：</div>
                      <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(currentState.cardList[slotIndex - 1].generateQuizResponseJson, null, 2) }}</pre>
                    </div>
                    <div v-if="currentState.cardList[slotIndex - 1].gradingResponseJson != null">
                      <div class="form-label small text-secondary fw-medium mb-1">批改結果 API 回傳 JSON：</div>
                      <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(currentState.cardList[slotIndex - 1].gradingResponseJson, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <!-- 尚未產生：顯示產生題目表單（第 slotIndex 題，每題獨立不連動） -->
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

          <!-- 新增題目按鈕：固定在最下面，每按一次多一個「第 n 題」區塊 -->
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

        <!-- 該 RAG 的資料（GET /rag/applied 回傳；與建立 RAG 頁「該 RAG 的資料」區塊一致） -->
        <div class="bg-body-tertiary rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">該 RAG 的資料（GET /rag/applied 回傳）</div>
          <pre class="bg-body-secondary border rounded p-3 font-monospace small mb-0 overflow-auto" style="max-height: 24rem;">{{ JSON.stringify(appliedRag, null, 2) }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>
