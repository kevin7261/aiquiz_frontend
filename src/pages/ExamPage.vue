<script setup>
/**
 * ExamPage - 測驗頁面
 *
 * 與 CreateRAG 版面類似（分頁、題目卡片、出題/評分），但無 RAG 建立/上傳/Pack；題目來源為「試題用 RAG」與「測驗」。
 *
 * 資料來源：
 * - GET /rag/for-exam：取得試題用 RAG（for_exam=true、deleted=false，0 或 1 筆）
 * - GET /exam/exams：測驗列表；按 + 呼叫 POST /exam/create-exam 新增測驗
 * 出題：POST /exam/generate-quiz；評分：POST /exam/quiz-grade、GET /exam/quiz-grade-result/{job_id}；刪除：POST /exam/delete/{exam_tab_id}
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
  API_RAG_FOR_EXAM,
  API_EXAM_TESTS,
  API_CREATE_EXAM,
  API_EXAM_DELETE,
  API_TEST_GENERATE_QUIZ,
  API_TEST_QUIZ_GRADE,
  API_TEST_QUIZ_GRADE_RESULT,
} from '../constants/api.js';
import { parseRagMetadataObject } from '../utils/rag.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';

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

/** GET /rag/for-exam 回傳的試題用 RAG（for_exam=true，0 或 1 筆；格式同 file_metadata、quiz_metadata） */
const forExamRag = ref(null);
const forExamLoading = ref(false);
const forExamError = ref('');

/** 試題用 RAG 帶來的 system instruction（由 watch 填入）；llm_api_key 改為使用登入回傳的 authStore.user.llm_api_key */
const forExamState = reactive({
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
});

/** 測驗列表（GET /exam/exams 載入；按 + 呼叫 POST /exam/create-exam 新增） */
const examList = ref([]);
const examListLoading = ref(false);
const examListError = ref('');
const createExamLoading = ref(false);
const createExamError = ref('');
/** 當前選中的 tab = 該測驗的 test_tab_id / exam_tab_id */
const activeTabId = ref(null);

/** 每個 tab（test_tab_id）的狀態 */
const tabStateMap = reactive({});

function getTabState(id) {
  const resolvedId = id || (examList.value[0] ? getExamTabId(examList.value[0]) : '') || '';
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
  return getTabState(examList.value[0] ? getExamTabId(examList.value[0]) : '');
});

const filterDifficulty = ref('基礎');
const difficultyOptions = ['基礎', '進階'];

const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

/** 當前選中 tab 對應的 Exam（來自 GET /exam/exams 列表），格式同 GET /rag/rags 每筆含 quizzes、answers */
const currentExamItem = computed(() => {
  const id = activeTabId.value;
  if (!id) return null;
  return examList.value.find((exam) => getExamTabId(exam) === id) ?? null;
});

/** 從試題用 RAG 推導 generateQuizUnits；格式同 /rag/build-rag-zip：頂層 outputs、rag_tab_id，或 rag_metadata.outputs / rag_list */
const generateQuizUnits = computed(() => {
  const rag = forExamRag.value;
  if (!rag || typeof rag !== 'object') return [];
  const sourceTabId = String(rag.rag_tab_id ?? '');
  const mapOutput = (o) => ({
    rag_tab_id: o.rag_tab_id || `${(o.rag_name ?? '').replace(/\+/g, '_')}_rag` || sourceTabId,
    filename: o.filename ?? o.rag_filename ?? `${(o.rag_name ?? '').replace(/\+/g, '_')}.zip`,
    rag_name: (o.rag_name ?? '').replace(/\+/g, '_') || (o.filename || o.rag_filename || '').replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, ''),
  });
  // 與 build-rag-zip 相同：頂層 outputs
  const topOutputs = rag.outputs;
  if (Array.isArray(topOutputs) && topOutputs.length > 0) {
    return topOutputs.map(mapOutput);
  }
  const nestedOutputs = parseRagMetadataObject(rag)?.outputs;
  if (Array.isArray(nestedOutputs) && nestedOutputs.length > 0) {
    return nestedOutputs.map(mapOutput);
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
        rag_tab_id: `${ragName}_rag` || sourceTabId,
        filename: `${ragName}_rag.zip`,
        rag_name: ragName,
      };
    });
});

/** 試題用 RAG 的 rag_tab_id（GET /rag/for-exam 回傳），供產生題目與評分使用 */
const sourceTabId = computed(() => {
  const rag = forExamRag.value;
  if (!rag) return '';
  return String(rag.rag_tab_id ?? rag.id ?? '').trim();
});

/** 試題用 RAG 的 rag_id、rag_tab_id（GET /rag/for-exam 回傳） */
const forExamRagIdAndTabId = computed(() => {
  const rag = forExamRag.value;
  if (!rag) return { rag_id: '未載入', rag_tab_id: '未載入' };
  const rid = rag.rag_id ?? rag.id;
  const tid = rag.rag_tab_id ?? rag.id ?? '';
  return { rag_id: rid != null ? String(rid) : '—', rag_tab_id: tid ? String(tid) : '—' };
});

/** 當前測驗顯示用（exam_tab_id、exam_name，來自 GET /exam/exams） */
const currentExamDisplay = computed(() => {
  const exam = currentExamItem.value;
  const id = activeTabId.value;
  if (!id) return { exam_tab_id: '—', exam_name: '—' };
  if (!exam) return { exam_tab_id: id, exam_name: getExamTabLabel({ exam_tab_id: id, test_tab_id: id }) || id };
  return {
    exam_tab_id: getExamTabId(exam) || id,
    exam_name: getExamTabLabel(exam) || id,
  };
});

/** 原「基本資訊」區塊改為載入完成後於 console 輸出（切換測驗 tab、for-exam／列表載入就緒時） */
watch(
  [
    () => activeTabId.value,
    () => examList.value.length,
    () => examListLoading.value,
    () => forExamLoading.value,
    () => `${currentExamDisplay.value.exam_tab_id}|${currentExamDisplay.value.exam_name}`,
    () => `${forExamRagIdAndTabId.value.rag_id}|${forExamRagIdAndTabId.value.rag_tab_id}`,
    () => String(forExamRag.value?.system_prompt_instruction ?? ''),
  ],
  () => {
    if (examList.value.length === 0 || !activeTabId.value) return;
    if (examListLoading.value || forExamLoading.value) return;
    console.log('[測驗] 基本資訊', {
      當前測驗: { ...currentExamDisplay.value },
      試題用RAG: { ...forExamRagIdAndTabId.value },
      system_prompt_instruction:
        forExamRag.value && forExamRag.value.system_prompt_instruction != null
          ? forExamRag.value.system_prompt_instruction
          : '—',
    });
  }
);

/** 產生題目／評分是否應停用（未選測驗 tab 或無試題用 RAG）；llm_api_key 使用登入帳號 */
const generateDisabled = computed(() => {
  if (!activeTabId.value) return true;
  if (!sourceTabId.value) return true;
  return false;
});

/** 當試題用 RAG（forExamRag）載入後，填入 system instruction；llm_api_key 一律使用登入回傳的 authStore.user.llm_api_key */
watch(forExamRag, (rag) => {
  if (!rag || typeof rag !== 'object') return;
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    forExamState.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
}, { immediate: true });

/** 當登入者（person_id 或 user_id）可用時再載入 GET /exam/exams；與 RAG 頁一致，且覆蓋重新打開頁面時 Pinia 還原較晚的情況 */
watch(
  () => getCurrentPersonId(),
  (id) => {
    if (id) fetchExamTests();
  },
  { immediate: true }
);

/** 有測驗列表時預設選第一個 tab */
watch(examList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = getExamTabId(list[0]) || list[0];
  }
}, { immediate: true });

/** 選擇單元預設第一筆（每個 tab 各自）；同步各題 slot 的下拉值 */
watch(generateQuizUnits, (units) => {
  if (units.length === 0) return;
  const state = currentState.value;
  const firstTabId = units[0].rag_tab_id;
  const currentInList = units.some((u) => u.rag_tab_id === state.generateQuizTabId);
  if (!state.generateQuizTabId || !currentInList) {
    state.generateQuizTabId = firstTabId;
  }
  const count = state.quizSlotsCount || 0;
  for (let i = 1; i <= count; i++) {
    const slot = state.slotFormState?.[i];
    if (!slot) continue;
    const slotOk = units.some((u) => u.rag_tab_id === slot.generateQuizTabId);
    if (!slot.generateQuizTabId || !slotOk) {
      slot.generateQuizTabId = firstTabId;
    }
  }
}, { immediate: true });

/** 由 GET /exam/exams 回傳的 quiz（含 answers）組成一張題目卡片，格式同 CreateRAG buildCardFromRagQuiz */
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
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.rag_name || '').trim() || null,
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

/** 當切換到某個 Exam tab 或試題用 RAG 載入時，從該筆的 quizzes、answers 填入題目卡片（格式同 GET /rag/rags，與 CreateRAG 一致）；firstRagName 從 forExamRag.outputs / rag_metadata.outputs / rag_list 推導，與 CreateRAG 一致 */
watch(
  () => [currentExamItem.value, forExamRag.value],
  ([exam]) => {
    if (!exam || typeof exam !== 'object') return;
    const tabId = getExamTabId(exam);
    if (!tabId) return;
    const state = getTabState(tabId);
    const quizzes = exam.quizzes ?? [];
    const examAnswers = exam.answers ?? [];
    const units = generateQuizUnits.value;
    const firstRagName = (units[0]?.rag_name ?? forExamRag.value?.outputs?.[0]?.rag_name ?? forExamRag.value?.rag_metadata?.outputs?.[0]?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
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
      state.showQuizGeneratorBlock = true;
      state.quizSlotsCount = quizzesWithAnswers.length;
      state.cardList = quizzesWithAnswers.map((q) => buildCardFromExamQuiz(q, q.rag_name ?? firstRagName));
    } else {
      state.quizSlotsCount = 0;
      state.cardList = [];
    }
  },
  { immediate: true }
);

/** 取得當前使用者的 person_id（與 RAG 頁一致；後端若只回傳 user_id 則用 user_id 當 person_id） */
function getCurrentPersonId() {
  const u = authStore.user;
  if (!u) return null;
  const pid = u.person_id;
  if (pid != null && String(pid).trim() !== '') return String(pid).trim();
  const uid = u.user_id ?? u.id;
  if (uid != null && String(uid).trim() !== '') return String(uid).trim();
  return null;
}

/** 載入測驗列表：GET /exam/exams；僅 deleted=false，每筆含表上所有欄位 + quizzes（每題帶 answers）、頂層 answers；格式同 GET /rag/rags。query: person_id 可選。 */
async function fetchExamTests() {
  examListLoading.value = true;
  examListError.value = '';
  try {
    const personId = getCurrentPersonId();
    const params = new URLSearchParams();
    if (personId) {
      params.set('person_id', personId);
    }
    const url = params.toString() ? `${API_BASE}${API_EXAM_TESTS}?${params}` : `${API_BASE}${API_EXAM_TESTS}`;
    const headers = {};
    if (personId) {
      headers['X-Person-Id'] = personId;
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
    // 後端回傳 { exams: [...], count: N }，與 RAG 頁 normalizeRagListResponse 一致支援多種格式
    const raw = Array.isArray(data) ? data : (data?.exams ?? data?.items ?? data?.data ?? []);
    const list = Array.isArray(raw) ? raw : [];
    // 保留完整欄位與 quizzes、answers（供 watch(currentExamItem) 預填題目卡片）
    examList.value = list.map((row) => ({
      ...row,
      exam_id: row.exam_id ?? row.test_id,
      exam_tab_id: row.exam_tab_id ?? row.test_tab_id,
      exam_name: row.exam_name ?? row.test_name,
      test_id: row.exam_id ?? row.test_id,
      test_tab_id: row.exam_tab_id ?? row.test_tab_id,
      test_name: row.exam_name ?? row.test_name,
    }));
  } catch (err) {
    examListError.value = err.message || '無法載入測驗列表';
    examList.value = [];
  } finally {
    examListLoading.value = false;
  }
}

/** 載入試題用 RAG：GET /rag/for-exam，不需參數；回傳 for_exam=true 且 deleted=false 的 RAG，0 或 1 筆 */
async function fetchForExamRag() {
  forExamLoading.value = true;
  forExamError.value = '';
  try {
    const res = await fetch(`${API_BASE}${API_RAG_FOR_EXAM}`, { method: 'GET' });
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
    // GET /rag/for-exam 回傳格式與 /rag/build-rag-zip 相同：頂層含 outputs、rag_tab_id、file_metadata、llm_api_key 等
    forExamRag.value = data != null && typeof data === 'object'
      ? { ...data, apikey: data.apikey ?? data.llm_api_key }
      : null;
  } catch (err) {
    forExamError.value = err.message || '無法載入試題用 RAG';
    forExamRag.value = null;
  } finally {
    forExamLoading.value = false;
  }
}

/** 測驗 tab 顯示名稱：支援 exam_name/exam_tab_id（新 API）與 test_name/test_tab_id */
function getExamTabLabel(exam) {
  if (exam == null) return '測驗';
  if (typeof exam === 'string') return exam;
  const tabId = exam.exam_tab_id ?? exam.test_tab_id ?? exam.id ?? '';
  const name = (exam.exam_name ?? exam.test_name) != null && String(exam.exam_name ?? exam.test_name).trim() !== '' ? String(exam.exam_name ?? exam.test_name).trim() : '';
  const fromTabId = deriveNameFromTabId(tabId);
  const created = exam.created_at ?? '';
  return name || fromTabId || tabId || created || '測驗';
}

/** 取得測驗的 tab id（exam_tab_id 或 test_tab_id） */
function getExamTabId(exam) {
  if (exam == null || typeof exam !== 'object') return '';
  return String(exam.exam_tab_id ?? exam.test_tab_id ?? exam.id ?? '');
}

/** 按 + 新增測驗：POST /exam/create-exam，body 用 exam_tab_id、exam_name；加入 examList 並切到新 tab。 */
async function addNewTab() {
  const personId = getCurrentPersonId();
  if (!personId) {
    createExamError.value = '請先登入以建立測驗';
    return;
  }
  createExamError.value = '';
  createExamLoading.value = true;
  const examTabId = generateTabId(personId);
  const examName = deriveNameFromTabId(examTabId) || examTabId;
  try {
    const res = await fetch(`${API_BASE}${API_CREATE_EXAM}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_tab_id: examTabId,
        person_id: personId,
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
    examList.value = [...examList.value, item];
    activeTabId.value = tabIdVal;
  } catch (err) {
    createExamError.value = err.message || '建立測驗失敗';
  } finally {
    createExamLoading.value = false;
  }
}

/** 刪除測驗：POST /exam/delete/{exam_tab_id}，成功後從列表移除並切到其他 tab */
const deleteExamLoading = ref(false);
const gradingLoading = ref(false);

/** 任一 slot 的產生題目是否 loading */
const anySlotLoading = computed(() => {
  const state = currentState.value;
  const count = state.quizSlotsCount || 0;
  for (let i = 1; i <= count; i++) {
    const slot = state.slotFormState?.[i];
    if (slot?.loading) return true;
  }
  return false;
});

/** 任一非同步操作執行中時為 true，用於全螢幕遮罩 */
const isAnyLoading = computed(() =>
  forExamLoading.value ||
  examListLoading.value ||
  createExamLoading.value ||
  deleteExamLoading.value ||
  gradingLoading.value ||
  anySlotLoading.value
);
const deleteExamError = ref('');
async function deleteExam(examTabId) {
  if (!examTabId) return;
  if (!confirm('確定要刪除此測驗嗎？')) return;
  deleteExamError.value = '';
  deleteExamLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}${API_EXAM_DELETE}/${encodeURIComponent(examTabId)}`, {
      method: 'POST',
      headers: getCurrentPersonId() ? { 'X-Person-Id': getCurrentPersonId() } : {},
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
    examList.value = examList.value.filter((t) => getExamTabId(t) !== examTabId);
    if (activeTabId.value === examTabId) {
      activeTabId.value = examList.value.length > 0 ? getExamTabId(examList.value[0]) : null;
    }
  } catch (err) {
    deleteExamError.value = err.message || '刪除測驗失敗';
  } finally {
    deleteExamLoading.value = false;
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

/** 出題：POST /exam/generate-quiz；body: llm_api_key, exam_id, exam_tab_id, quiz_level（number）。回傳 quiz_content, quiz_hint, reference_answer, exam_quiz_id 等。 */
async function generateQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const selectedUnit = generateQuizUnits.value.find((u) => u.rag_tab_id === slotState.generateQuizTabId);
  const ragName = selectedUnit?.rag_name?.trim();
  const exam = currentExamItem.value;
  const examId = exam?.exam_id ?? exam?.test_id;
  if (!activeTabId.value) {
    slotState.error = '尚未建立測驗（請按 + 新增測驗）或請確認已載入試題用 RAG（GET /rag/for-exam）';
    return;
  }
  if (examId == null) {
    slotState.error = '無法取得當前測驗的 exam_id';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  const quizLevel = difficultyOptions.indexOf(filterDifficulty.value);
  try {
    const res = await fetch(`${API_BASE}${API_TEST_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_id: Number(examId) || 0,
        exam_tab_id: activeTabId.value != null && activeTabId.value !== '' ? String(activeTabId.value) : '',
        quiz_level: quizLevel >= 0 ? quizLevel : 0,
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
    const targetFilename = data.file_name ?? data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? null;
    const referenceAnswerText = data.reference_answer ?? data.answer ?? '';
    const displayRagName = (data.rag_name ?? ragName ?? '').trim() || ragName;
    const quizId = data.exam_quiz_id != null ? Number(data.exam_quiz_id) : (data.quiz_id != null ? Number(data.quiz_id) : null);
    setCardAtSlot(slotIndex, quizContent, hintText, targetFilename, referenceAnswerText, displayRagName, data, filterDifficulty.value, (forExamState.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION, quizId);
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

/** 評分：POST /exam/quiz-grade；body: llm_api_key, exam_id, exam_tab_id, exam_quiz_id, quiz_content, answer（皆 string）；回傳 202 + job_id；輪詢 GET /exam/quiz-grade-result/{job_id} */
async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  if (!activeTabId.value) {
    item.confirmed = true;
    item.gradingResult = '評分需要測驗 tab：請選擇測驗或按 + 新增測驗。';
    return;
  }
  const exam = currentExamItem.value;
  const examId = exam?.exam_id ?? exam?.test_id;
  if (examId == null) {
    item.confirmed = true;
    item.gradingResult = '評分失敗：無法取得當前測驗的 exam_id。';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  gradingLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}${API_TEST_QUIZ_GRADE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_id: String(examId),
        exam_tab_id: String(activeTabId.value),
        exam_quiz_id: item.quiz_id != null ? String(item.quiz_id) : '',
        quiz_content: item.quiz ?? '',
        answer: item.answer.trim(),
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
      const statusHint = res.status === 400 ? '（例如請於系統設定設定 LLM API Key）\n\n' : (res.status === 502 ? '（後端逾時或服務喚醒中，請稍後再試）\n\n' : (res.status === 500 ? '（後端 500 錯誤）\n\n' : ''));
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
  } finally {
    gradingLoading.value = false;
  }
}

/** 與建立 RAG 頁一致：畫面一打開就抓 GET /exam/exams；watch(person_id) 在還原後再抓一次以帶 person_id */
onMounted(() => {
  fetchForExamRag();
  fetchExamTests();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="isAnyLoading"
      loading-text="執行中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand mb-0">測驗</span>
      </div>
    </div>
    <!-- 固定 tab 頁籤列（與建立 RAG 頁一致，僅內容區可上下滑） -->
    <div class="flex-shrink-0 bg-white">
      <div class="d-flex align-items-center justify-content-center px-4 w-100">
        <template v-if="examListLoading || forExamLoading">
          <span class="small text-secondary">—</span>
        </template>
        <template v-else-if="examList.length === 0">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="createExamLoading"
            @click="addNewTab"
          >
            {{ createExamLoading ? '建立中...' : '+ 新增' }}
          </button>
        </template>
        <template v-else>
          <ul class="nav nav-tabs">
            <li v-for="exam in examList" :key="'exam-' + getExamTabId(exam)" class="nav-item">
              <div
                role="tab"
                class="nav-link d-flex align-items-center gap-1"
                :class="{ active: activeTabId === getExamTabId(exam) }"
                :aria-current="activeTabId === getExamTabId(exam) ? 'page' : undefined"
              >
                <span
                  class="flex-grow-1 text-start"
                  style="cursor: pointer;"
                  @click="activeTabId = getExamTabId(exam)"
                >
                  {{ getExamTabLabel(exam) }}
                </span>
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 text-muted text-decoration-none"
                  style="min-width: 1.25rem; line-height: 1;"
                  aria-label="刪除此測驗"
                  :disabled="deleteExamLoading"
                  @click.stop="deleteExam(getExamTabId(exam))"
                >
                  ×
                </button>
              </div>
            </li>
            <li class="nav-item ms-2 d-flex align-items-center">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary mb-2"
                :disabled="createExamLoading"
                @click="addNewTab"
              >
                {{ createExamLoading ? '建立中...' : '+ 新增' }}
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="forExamError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ forExamError }}
      </div>
      <div v-if="examListError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ examListError }}
      </div>
      <div v-if="createExamError" class="alert alert-danger py-2 small mx-4 mb-3">
        {{ createExamError }}
      </div>
      <div v-if="deleteExamError" class="alert alert-danger py-2 small mx-4 mb-3">
        {{ deleteExamError }}
      </div>
    </div>

    <!-- 內容區：可上下捲動 -->
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <template v-if="examList.length > 0">
        <!-- 產生題目與作答：與建立 RAG 頁一模一樣（出題與評分）；資料來自 GET /rag/for-exam，使用 /exam/generate-quiz、/exam/quiz-grade -->
        <div
          v-if="activeTabId && forExamRag != null"
          class="text-start page-block-spacing"
          :class="{ 'opacity-75': generateDisabled }"
        >
          <!-- 題目區塊：每按一次「新增題目」才多一個「第 n 題」；按鈕固定在最下面 -->
          <div class="mb-4">
            <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
              <!-- 第 slotIndex 題：若已有該題卡片則顯示卡片，否則顯示產生題目表單 -->
              <template v-if="currentState.cardList[slotIndex - 1]">
                <!-- 已有卡片：顯示完整題目區塊 -->
                <div class="card mb-4" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
                  </div>
                  <div class="card-body text-start">
                    <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">單元</label>
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
                          <button type="button" class="btn btn-sm btn-primary" @click="confirmAnswer(currentState.cardList[slotIndex - 1])">確定</button>
                        </div>
                      </template>
                      <template v-else>
                        <div class="rounded bg-body-tertiary small mb-2 p-2">{{ currentState.cardList[slotIndex - 1].answer }}</div>
                      </template>
                    </div>
                    <div class="border rounded bg-light p-3 mb-3">
                      <div class="form-label small fw-semibold text-secondary mb-1">批改結果</div>
                      <div class="small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].gradingResult || '尚未批改' }}</div>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <!-- 尚未產生：顯示產生題目表單（第 slotIndex 題，每題獨立不連動） -->
                <div class="card mb-4" :class="{ 'mt-4': slotIndex > 1 }">
                  <div class="card-header py-2">
                    <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
                  </div>
                  <div class="card-body text-start pt-3">
                    <div class="d-flex flex-wrap align-items-end gap-3">
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1">單元</label>
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
                        產生題目
                      </button>
                    </div>
                    <div v-if="getSlotFormState(slotIndex).error" class="alert alert-danger mt-2 mb-0 py-2 small">
                      {{ getSlotFormState(slotIndex).error }}
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

      </template>
        </div>
      </div>
    </div>
  </div>
</template>
