<script setup>
/**
 * ExamPage - 試卷頁面
 *
 * 與 CreateTestBankPage 版面類似（分頁、題目卡片、出題/評分），但無 RAG 建立/上傳/Pack；題目來源為「試題用 RAG」與「試卷」。
 *
 * 資料來源：
 * - 不呼叫 GET /system-settings/rag-for-exam-localhost 或 rag-for-exam-deploy（試卷／題目關聯由 GET /exam/exams 等提供即可）
 * - GET /rag/for-exam：試題用 RAG 完整 payload（outputs 等欄位可為 rag_name 或 unit_name；無 outputs／unit_list 時仍可用 rag_tab_id 合成單元）
 * - GET /exam/exams?local=&person_id=：local 與 GET /rag/rags 相同；回傳每筆含 quizzes、answers（或 exam_quizzes／exam_answers）時，以 syncExamItemToTabState 灌入卡片（同 CreateTestBankPage 由列表同步題目／作答／批改）
 * 出題：POST /exam/create-quiz（exam_id 或 exam_tab_id 二擇一；對齊 RAG 的 POST /rag/create-quiz）；評分：POST /exam/grade-quiz、GET /exam/grade-quiz-result/{job_id}（與 RAG 輪詢流程相同，見 useQuizGrading）；題目讚／差：POST /exam/rate-quiz（quiz_rate：1、-1、0）；刪除：POST /exam/delete/{exam_tab_id}
 *
 * 試題資料表 public."Exam_Quiz"（與 GET/POST 題目 payload 對齊）：exam_quiz_id、exam_id、exam_tab_id、person_id、rag_id、unit_name、file_name、quiz_content、quiz_hint、quiz_answer_reference、quiz_rate（-1／0／1）、quiz_metadata、updated_at、created_at。畫面「單元」優先 unit_name；難度優先 quiz_level，否則 quiz_metadata.quiz_level。
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
  API_EXAM_CREATE_QUIZ,
  API_EXAM_QUIZ_GRADE,
  API_EXAM_QUIZ_GRADE_RESULT,
  API_EXAM_RATE_QUIZ,
  isFrontendLocalHost,
} from '../constants/api.js';
import { parseFetchError } from '../utils/apiError.js';
import {
  parseRagMetadataObject,
  getRagUnitListString,
  unitSelectValue,
  reconcileQuizUnitSelectSlot,
  findQuizUnitBySlotSelection,
  QUIZ_LEVEL_LABELS,
  normalizeQuizLevelLabel,
  quizLevelStringForApi,
  examQuizLevelFromRow,
  normalizeExamListResponse,
} from '../utils/rag.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import { formatGradingResult } from '../utils/grading.js';
import { submitGrade } from '../composables/useQuizGrading.js';
import { loggedFetch } from '../utils/loggedFetch.js';

defineProps({
  tabId: { type: String, required: true },
});

const authStore = useAuthStore();
const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過200字';

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

/** 與後端 Exam_Quiz.quiz_rate 一致：僅 -1、0、1 */
function normalizeExamQuizRate(v) {
  const n = Number(v);
  if (n === 1 || n === -1 || n === 0) return n;
  return 0;
}

/** GET /rag/for-exam 回傳的試題用 RAG（for_exam=true，0 或 1 筆；格式同 file_metadata、quiz_metadata） */
const forExamRag = ref(null);
const forExamLoading = ref(false);
const forExamError = ref('');

/** 試題用 RAG 帶來的 system instruction（由 watch 填入）；llm_api_key 改為使用登入回傳的 authStore.user.llm_api_key */
const forExamState = reactive({
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
});

/** 試卷列表（GET /exam/exams 載入；按 + 呼叫 POST /exam/create-exam 新增） */
const examList = ref([]);
const examListLoading = ref(false);
const examListError = ref('');
const createExamLoading = ref(false);
const createExamError = ref('');
/** 當前選中的 tab = 該試卷的 test_tab_id / exam_tab_id */
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
    tabStateMap[resolvedId] = reactive({
      generateQuizTabId: '',
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
const difficultyOptions = QUIZ_LEVEL_LABELS;

/** 當前選中 tab 對應的 Exam（來自 GET /exam/exams 列表），格式同 GET /rag/rags 每筆含 quizzes、answers */
const currentExamItem = computed(() => {
  const id = activeTabId.value;
  if (!id) return null;
  return examList.value.find((exam) => getExamTabId(exam) === id) ?? null;
});

/** 從試題用 RAG 推導 generateQuizUnits；格式同 /rag/build-rag-zip；後端可能用 unit_name 取代 rag_name */
const generateQuizUnits = computed(() => {
  const rag = forExamRag.value;
  if (!rag || typeof rag !== 'object') return [];
  const sourceTabId = String(rag.rag_tab_id ?? '');
  const outputBaseName = (o) => String((o.rag_name ?? o.unit_name ?? '').trim()).replace(/\+/g, '_');
  const mapOutput = (o) => {
    const base = outputBaseName(o);
    const fromFile = (o.filename || o.rag_filename || '').replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '');
    const label = base || fromFile;
    const rawUnit =
      (o.unit_name != null && String(o.unit_name).trim() !== '')
        ? String(o.unit_name).trim()
        : (o.rag_name != null && String(o.rag_name).trim() !== '')
          ? String(o.rag_name).trim()
          : label;
    const unit_name = String(rawUnit || '').replace(/\+/g, '_') || label || sourceTabId;
    return {
      rag_tab_id: o.rag_tab_id || (base ? `${base}_rag` : '') || sourceTabId,
      filename: o.filename ?? o.rag_filename ?? (label ? `${label.replace(/\+/g, '_')}.zip` : `${sourceTabId}.zip`),
      rag_name: label || sourceTabId,
      unit_name,
    };
  };
  // 與 build-rag-zip 相同：頂層 outputs
  const topOutputs = rag.outputs;
  if (Array.isArray(topOutputs) && topOutputs.length > 0) {
    return topOutputs.map(mapOutput);
  }
  const nestedOutputs = parseRagMetadataObject(rag)?.outputs;
  if (Array.isArray(nestedOutputs) && nestedOutputs.length > 0) {
    return nestedOutputs.map(mapOutput);
  }
  const ragListStr = getRagUnitListString(rag);
  if (ragListStr) {
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
          unit_name: ragName,
        };
      });
  }
  // 僅有 rag_tab_id、尚無 outputs／unit_list（後端精簡回傳）時仍要能選單元並出題
  if (sourceTabId) {
    const nm = String(rag.rag_name ?? rag.unit_name ?? '').replace(/\+/g, '_').trim() || sourceTabId;
    return [{
      rag_tab_id: sourceTabId,
      filename: `${nm}_rag.zip`,
      rag_name: nm,
      unit_name: nm,
    }];
  }
  return [];
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

/** 當前試卷顯示用（exam_tab_id、名稱；列表可能為 tab_name 或舊欄位 exam_name） */
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

/** 原「基本資訊」區塊改為載入完成後於 console 輸出（切換試卷 tab、for-exam／列表載入就緒時） */
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
    // eslint-disable-next-line no-console -- 除錯：目前選中試卷與試題用 RAG 摘要
    console.log('[試卷] 基本資訊', {
      當前試卷: { ...currentExamDisplay.value },
      試題用RAG: { ...forExamRagIdAndTabId.value },
      system_prompt_instruction:
        forExamRag.value && forExamRag.value.system_prompt_instruction != null
          ? forExamRag.value.system_prompt_instruction
          : '—',
    });
  }
);

/** 可出題：以 GET /rag/for-exam 為準（含 rag_tab_id 且能組出至少一個單元，見 generateQuizUnits） */
const canGenerateExamQuiz = computed(() => {
  if (!activeTabId.value) return false;
  if (!sourceTabId.value || generateQuizUnits.value.length === 0) return false;
  return true;
});

/** 「產生題目」「新增題目」共用：for-exam 載入中或條件不足則停用 */
const generateQuizBlocked = computed(() =>
  forExamLoading.value ||
  !canGenerateExamQuiz.value
);

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

/** 有試卷列表時預設選第一個 tab */
watch(examList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = getExamTabId(list[0]) || list[0];
  }
}, { immediate: true });

/** 單元下拉預設不選；清單變動時重新對齊選取（與建立測試題庫頁一致） */
watch(generateQuizUnits, (units) => {
  const state = currentState.value;
  reconcileQuizUnitSelectSlot(state, units);
  const count = state.quizSlotsCount || 0;
  for (let i = 1; i <= count; i++) {
    reconcileQuizUnitSelectSlot(state.slotFormState?.[i], units);
  }
}, { immediate: true });

/** 與 RAG 的 quiz_id 對齊：合併 answers 時一律用字串當 key，避免 3 與 "3" 對不到 */
function examQuizRowKey(q) {
  if (!q || typeof q !== 'object') return '';
  const v = q.exam_quiz_id ?? q.quiz_id;
  return v != null && String(v).trim() !== '' ? String(v) : '';
}

function examAnswerRowKey(a) {
  if (!a || typeof a !== 'object') return '';
  const v = a.exam_quiz_id ?? a.quiz_id;
  return v != null && String(v).trim() !== '' ? String(v) : '';
}

/** 由 GET /exam/exams 回傳的 quiz（Exam_Quiz 列 + answers）組成一張題目卡片（欄位後備與 CreateTestBankPage buildCardFromRagQuiz 對齊） */
function buildCardFromExamQuiz(quiz, ragName) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ??
    latestAnswer?.student_answer ??
    latestAnswer?.answer_text ??
    latestAnswer?.content ??
    null;
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) || (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : ''))
    : '';
  const generateLevel = examQuizLevelFromRow(quiz);
  const quizId = quiz.exam_quiz_id ?? quiz.quiz_id ?? null;
  const answerId = latestAnswer?.exam_answer_id ?? latestAnswer?.answer_id ?? null;
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? quiz.quiz ?? quiz.question ?? '',
    hint: quiz.quiz_hint ?? quiz.hint ?? '',
    referenceAnswer: quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? quiz.reference_answer ?? '',
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.unit_name || quiz.rag_name || '').trim() || null,
    quiz_answer: latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? latestAnswer?.answer_text ?? latestAnswer?.content ?? '',
    hintVisible: false,
    quiz_rate: normalizeExamQuizRate(quiz.quiz_rate),
    rateQuizLoading: false,
    rateError: '',
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

/**
 * 從 GET /exam/exams 單筆 Exam 的 quizzes、answers 填入該 tab 的題目卡片（流程同 CreateTestBankPage syncRagItemToState）。
 * quizzes／answers 可能名為 exam_quizzes、exam_answers；與頂層 answers 合併時 ID 一律轉字串。
 */
function syncExamItemToTabState(exam) {
  if (!exam || typeof exam !== 'object') return;
  const tabId = getExamTabId(exam);
  if (!tabId) return;
  const state = getTabState(tabId);
  const quizzes = exam.quizzes ?? exam.exam_quizzes ?? [];
  const examAnswers = exam.answers ?? exam.exam_answers ?? [];
  const units = generateQuizUnits.value;
  const rag = forExamRag.value;
  const out0 = rag?.outputs?.[0];
  const meta0 = rag?.rag_metadata?.outputs?.[0];
  const firstRagName = (
    units[0]?.rag_name
    ?? out0?.rag_name ?? out0?.unit_name
    ?? meta0?.rag_name ?? meta0?.unit_name
    ?? quizzes[0]?.unit_name ?? quizzes[0]?.rag_name
    ?? ''
  ).trim();
  if (quizzes.length > 0) {
    const answersByQuizId = examAnswers.reduce((acc, a) => {
      const id = examAnswerRowKey(a);
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(a);
      return acc;
    }, {});
    const quizzesWithAnswers = quizzes.map((q, i) => {
      const qKey = examQuizRowKey(q);
      const byId = q.answers ?? (qKey ? answersByQuizId[qKey] : undefined);
      const answers = (Array.isArray(byId) && byId.length > 0) ? byId : (examAnswers[i] != null ? [examAnswers[i]] : []);
      return { ...q, answers };
    });
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromExamQuiz(q, q.unit_name ?? q.rag_name ?? firstRagName));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}

/** 目前選中試卷或列表／試題 RAG 巢狀更新時，重新自伺服器資料灌入卡片（deep 與 CreateTestBankPage 由 fetch 觸發更新一致） */
watch(
  [currentExamItem, forExamRag],
  () => {
    syncExamItemToTabState(currentExamItem.value);
  },
  { immediate: true, deep: true }
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

/** 載入試卷列表：GET /exam/exams；Exam.local 須與 query local 相符（與 /rag/rags?local= 一致） */
async function fetchExamTests() {
  examListLoading.value = true;
  examListError.value = '';
  try {
    const personId = getCurrentPersonId();
    const params = new URLSearchParams();
    params.set('local', String(isFrontendLocalHost()));
    if (personId) {
      params.set('person_id', personId);
    }
    const url = `${API_BASE}${API_EXAM_TESTS}?${params}`;
    const headers = {};
    if (personId) {
      headers['X-Person-Id'] = personId;
    }
    const res = await loggedFetch(url, { method: 'GET', headers });
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
    const list = normalizeExamListResponse(data);
    // 保留完整欄位與 quizzes、answers（供 watch(currentExamItem) 預填題目卡片）
    examList.value = list.map((row) => {
      const label = row.tab_name ?? row.exam_name ?? row.test_name;
      return {
        ...row,
        exam_id: row.exam_id ?? row.test_id,
        exam_tab_id: row.exam_tab_id ?? row.test_tab_id,
        exam_name: label,
        test_id: row.exam_id ?? row.test_id,
        test_tab_id: row.exam_tab_id ?? row.test_tab_id,
        test_name: label,
      };
    });
  } catch (err) {
    examListError.value = err.message || '無法載入試卷列表';
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
    const res = await loggedFetch(`${API_BASE}${API_RAG_FOR_EXAM}`, { method: 'GET' });
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

/** 試卷 tab 顯示名稱：優先 tab_name，其次 exam_name／test_name／exam_tab_id */
function getExamTabLabel(exam) {
  if (exam == null) return '試卷';
  if (typeof exam === 'string') return exam;
  const tabId = exam.exam_tab_id ?? exam.test_tab_id ?? exam.id ?? '';
  const raw = exam.tab_name ?? exam.exam_name ?? exam.test_name;
  const name = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
  const fromTabId = deriveNameFromTabId(tabId);
  const created = exam.created_at ?? '';
  return name || fromTabId || tabId || created || '試卷';
}

/** 取得試卷的 tab id（exam_tab_id 或 test_tab_id） */
function getExamTabId(exam) {
  if (exam == null || typeof exam !== 'object') return '';
  return String(exam.exam_tab_id ?? exam.test_tab_id ?? exam.id ?? '');
}

/** 按 + 新增試卷：POST /exam/create-exam，body 含 exam_tab_id、person_id、tab_name、local（與 create-unit 一致） */
async function addNewTab() {
  const personId = getCurrentPersonId();
  if (!personId) {
    createExamError.value = '請先登入以建立試卷';
    return;
  }
  createExamError.value = '';
  createExamLoading.value = true;
  const examTabId = generateTabId(personId);
  const tabName = '新增試卷';
  const local = isFrontendLocalHost();
  try {
    const res = await loggedFetch(`${API_BASE}${API_CREATE_EXAM}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_tab_id: examTabId,
        person_id: personId,
        tab_name: tabName,
        local,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(msg);
    }
    const data = await res.json();
    const tabIdVal = data?.exam_tab_id != null ? String(data.exam_tab_id) : (data?.test_tab_id != null ? String(data.test_tab_id) : examTabId);
    const resolvedName = data.tab_name ?? data.exam_name ?? data.test_name ?? tabName;
    const item = {
      exam_id: data.exam_id ?? data.test_id,
      exam_tab_id: tabIdVal,
      tab_name: resolvedName,
      exam_name: resolvedName,
      test_id: data.exam_id ?? data.test_id,
      test_tab_id: tabIdVal,
      test_name: resolvedName,
      person_id: data.person_id,
      local: data.local ?? local,
      created_at: data.created_at,
    };
    examList.value = [...examList.value, item];
    activeTabId.value = tabIdVal;
  } catch (err) {
    createExamError.value = err.message || '建立試卷失敗';
  } finally {
    createExamLoading.value = false;
  }
}

/** 刪除試卷：POST /exam/delete/{exam_tab_id}，成功後從列表移除並切到其他 tab */
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
  if (!confirm('確定要刪除此試卷嗎？')) return;
  deleteExamError.value = '';
  deleteExamLoading.value = true;
  try {
    const res = await loggedFetch(`${API_BASE}${API_EXAM_DELETE}/${encodeURIComponent(examTabId)}`, {
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
    deleteExamError.value = err.message || '刪除試卷失敗';
  } finally {
    deleteExamLoading.value = false;
  }
}

function getSlotFormState(slotIndex) {
  const state = currentState.value;
  if (!state.slotFormState[slotIndex]) {
    state.slotFormState[slotIndex] = reactive({
      generateQuizTabId: '',
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
    quiz_answer: '',
    hintVisible: false,
    quiz_rate: 0,
    rateQuizLoading: false,
    rateError: '',
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
    quiz_id: quizId ?? null,
  };
}

/** 出題：POST /exam/create-quiz；body 與 RAG POST /rag/create-quiz 同概念（四欄）；exam_id／exam_tab_id 二擇一。 */
async function generateQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const selectedUnit = findQuizUnitBySlotSelection(generateQuizUnits.value, slotState.generateQuizTabId);
  if (!selectedUnit) {
    slotState.error = '請先選擇單元';
    return;
  }
  const unitName = String(selectedUnit.unit_name ?? selectedUnit.rag_name ?? '').trim();
  const ragName = selectedUnit.rag_name?.trim();
  const exam = currentExamItem.value;
  const examIdRaw = exam?.exam_id ?? exam?.test_id;
  const examTabIdStr = activeTabId.value != null && activeTabId.value !== '' ? String(activeTabId.value).trim() : '';
  const eidNum = Number(examIdRaw);
  const hasValidExamId = Number.isFinite(eidNum) && eidNum >= 1;
  if (!canGenerateExamQuiz.value) {
    slotState.error = '目前沒有可用RAG';
    return;
  }
  if (!hasValidExamId && !examTabIdStr) {
    slotState.error = '尚未建立試卷（請按 + 新增試卷）或無法取得 exam_id／exam_tab_id';
    return;
  }
  if (!generateQuizUnits.value.length) {
    slotState.error = '請確認已載入試題用 RAG（GET /rag/for-exam）且具 outputs';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  const body = {
    exam_id: hasValidExamId ? eidNum : 0,
    exam_tab_id: hasValidExamId ? '' : examTabIdStr,
    quiz_level: quizLevelStringForApi(filterDifficulty.value),
    unit_name: unitName,
  };
  try {
    const res = await loggedFetch(`${API_BASE}${API_EXAM_CREATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(parseFetchError(res, text));
    const data = text ? JSON.parse(text) : {};
    slotState.responseJson = data;
    const quizContent = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? data.quiz_content ?? '';
    const hintText = data.quiz_hint ?? data.hint ?? '';
    const targetFilename = data.file_name ?? data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? null;
    const referenceAnswerText =
      data.quiz_answer_reference ?? data.quiz_reference_answer ?? data.quiz_answer ?? data.answer ?? '';
    const displayRagName = (data.unit_name ?? data.rag_name ?? ragName ?? '').trim() || ragName;
    const quizId = data.exam_quiz_id != null ? Number(data.exam_quiz_id) : (data.quiz_id != null ? Number(data.quiz_id) : null);
    const resolvedLevel =
      examQuizLevelFromRow(data) ?? normalizeQuizLevelLabel(filterDifficulty.value) ?? filterDifficulty.value;
    setCardAtSlot(
      slotIndex,
      quizContent,
      hintText,
      targetFilename,
      referenceAnswerText,
      displayRagName,
      data,
      resolvedLevel,
      (forExamState.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
      quizId
    );
    const newCard = currentState.value.cardList[slotIndex - 1];
    if (newCard) newCard.quiz_rate = normalizeExamQuizRate(data.quiz_rate);
  } catch (err) {
    slotState.error = err.message || '產生題目失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

/** 題目讚(1)／差(-1)；再點同一顆送 quiz_rate=0 取消。POST /exam/rate-quiz */
async function rateExamQuiz(item, direction) {
  if (!item || typeof item !== 'object') return;
  const examQuizId = item.quiz_id ?? item.exam_quiz_id;
  const idNum = Number(examQuizId);
  if (!Number.isFinite(idNum) || idNum < 1) {
    item.rateError = '無法評分：缺少題目編號（exam_quiz_id）。';
    return;
  }
  const target = direction === 'up' ? 1 : -1;
  const nextRate = item.quiz_rate === target ? 0 : target;
  item.rateQuizLoading = true;
  item.rateError = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_EXAM_RATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_quiz_id: idNum, quiz_rate: nextRate }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(parseFetchError(res, text));
    const data = text ? JSON.parse(text) : {};
    item.quiz_rate = normalizeExamQuizRate(data.quiz_rate ?? nextRate);
  } catch (err) {
    item.rateError = err.message || '評分失敗';
  } finally {
    item.rateQuizLoading = false;
  }
}

/** 評分：與 CreateTestBankPage 相同流程（submitGrade），路徑為 POST /exam/grade-quiz、GET /exam/grade-quiz-result/{job_id} */
async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
  if (!activeTabId.value) {
    item.confirmed = true;
    item.gradingResult = '評分需要試卷 tab：請選擇試卷或按 + 新增試卷。';
    return;
  }
  const exam = currentExamItem.value;
  const examId = exam?.exam_id ?? exam?.test_id;
  if (examId == null) {
    item.confirmed = true;
    item.gradingResult = '評分失敗：無法取得當前試卷的 exam_id。';
    return;
  }
  gradingLoading.value = true;
  try {
    await submitGrade(
      item,
      { examId, examTabId: String(activeTabId.value) },
      {
        gradingMode: 'exam',
        quizGradeSubmissionPath: API_EXAM_QUIZ_GRADE,
        quizGradeResultPath: API_EXAM_QUIZ_GRADE_RESULT,
      }
    );
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
        <span class="navbar-brand mb-0">試卷</span>
      </div>
    </div>
    <!-- 固定 tab 頁籤列（與建立 RAG 頁一致，僅內容區可上下滑） -->
    <div class="flex-shrink-0 bg-white">
      <div class="d-flex align-items-center justify-content-center px-4 w-100 border-bottom border-secondary-subtle">
        <template v-if="examListLoading || forExamLoading">
          <span class="small text-secondary">—</span>
        </template>
        <template v-else-if="examList.length === 0">
          <div class="w-100 d-flex justify-content-center py-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary bg-white"
              :disabled="createExamLoading"
              @click="addNewTab"
            >
              {{ createExamLoading ? '建立中...' : '+ 新增' }}
            </button>
          </div>
        </template>
        <template v-else>
          <ul class="nav nav-tabs border-bottom-0">
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
                  aria-label="刪除此試卷"
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
                class="btn btn-sm btn-outline-primary bg-white mb-2"
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
        <!-- 產生題目與作答：與建立 RAG 頁一致（出題與評分）；資料來自 GET /rag/for-exam，使用 POST /exam/create-quiz、submitGrade（/exam/grade-quiz） -->
        <div
          v-if="activeTabId"
          class="text-start page-block-spacing"
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
                      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                        <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="toggleHint(currentState.cardList[slotIndex - 1])">
                          {{ currentState.cardList[slotIndex - 1].hintVisible ? '隱藏提示' : '顯示提示' }}
                        </button>
                        <div class="btn-group btn-group-sm" role="group" aria-label="題目回饋">
                          <button
                            type="button"
                            class="btn btn-outline-secondary"
                            :class="{ active: currentState.cardList[slotIndex - 1].quiz_rate === 1 }"
                            title="讚"
                            :disabled="currentState.cardList[slotIndex - 1].rateQuizLoading"
                            @click="rateExamQuiz(currentState.cardList[slotIndex - 1], 'up')"
                          >
                            <i class="fa-solid fa-thumbs-up" aria-hidden="true"></i>
                            <span class="visually-hidden">讚</span>
                          </button>
                          <button
                            type="button"
                            class="btn btn-outline-secondary"
                            :class="{ active: currentState.cardList[slotIndex - 1].quiz_rate === -1 }"
                            title="差"
                            :disabled="currentState.cardList[slotIndex - 1].rateQuizLoading"
                            @click="rateExamQuiz(currentState.cardList[slotIndex - 1], 'down')"
                          >
                            <i class="fa-solid fa-thumbs-down" aria-hidden="true"></i>
                            <span class="visually-hidden">差</span>
                          </button>
                        </div>
                      </div>
                      <div v-if="currentState.cardList[slotIndex - 1].rateError" class="small text-danger text-end mt-1">
                        {{ currentState.cardList[slotIndex - 1].rateError }}
                      </div>
                      <div v-show="currentState.cardList[slotIndex - 1].hintVisible" class="rounded bg-body-tertiary small mt-2 p-2 text-secondary">
                        {{ currentState.cardList[slotIndex - 1].hint }}
                      </div>
                    </div>
                    <div v-if="currentState.cardList[slotIndex - 1].referenceAnswer" class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">參考答案(暫存)</div>
                      <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].referenceAnswer }}</div>
                    </div>
                    <div class="mb-3">
                      <label :for="`quiz-answer-${currentState.cardList[slotIndex - 1].id}`" class="form-label small text-secondary fw-medium mb-1">答案</label>
                      <template v-if="!currentState.cardList[slotIndex - 1].confirmed">
                        <textarea
                          :id="`quiz-answer-${currentState.cardList[slotIndex - 1].id}`"
                          v-model="currentState.cardList[slotIndex - 1].quiz_answer"
                          class="form-control"
                          rows="4"
                          placeholder="請輸入您的答案..."
                          maxlength="2000"
                        />
                        <div class="form-text small">{{ currentState.cardList[slotIndex - 1].quiz_answer.length }} / 2000</div>
                        <div class="d-flex justify-content-end mt-2">
                          <button type="button" class="btn btn-sm btn-primary" @click="confirmAnswer(currentState.cardList[slotIndex - 1])">確定</button>
                        </div>
                      </template>
                      <template v-else>
                        <div class="rounded bg-body-tertiary small mb-2 p-2">{{ currentState.cardList[slotIndex - 1].quiz_answer }}</div>
                      </template>
                    </div>
                    <div class="mb-3">
                      <div class="form-label small text-secondary fw-medium mb-1">批改結果</div>
                      <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].gradingResult || '尚未批改' }}</div>
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
                          <option value="">— 請選擇單元 —</option>
                          <option
                            v-for="(opt, i) in generateQuizUnits"
                            :key="unitSelectValue(opt) || 'u-' + i"
                            :value="unitSelectValue(opt)"
                          >
                            {{ opt.rag_name }}
                          </option>
                        </select>
                      </div>
                      <div>
                        <label class="form-label small text-secondary fw-medium mb-1 d-block">難度</label>
                        <div class="btn-group btn-group-sm" role="group" aria-label="難度">
                          <template v-for="(opt, di) in difficultyOptions" :key="opt">
                            <input
                              :id="'exam-quiz-diff-' + slotIndex + '-' + di"
                              v-model="filterDifficulty"
                              type="radio"
                              class="btn-check"
                              :name="'exam-quiz-difficulty-' + slotIndex"
                              :value="opt"
                              autocomplete="off"
                            >
                            <label class="btn btn-outline-primary" :for="'exam-quiz-diff-' + slotIndex + '-' + di">{{ opt }}</label>
                          </template>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        :disabled="getSlotFormState(slotIndex).loading || generateQuizBlocked || !String(getSlotFormState(slotIndex).generateQuizTabId || '').trim()"
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
            <div class="mb-0 pt-2 d-flex flex-column align-items-center">
              <button
                type="button"
                class="btn btn-sm btn-primary"
                :disabled="generateQuizBlocked"
                @click="openNextQuizSlot"
              >
                新增題目
              </button>
              <p
                v-if="generateQuizBlocked && !forExamLoading && activeTabId"
                class="small text-secondary mb-0 mt-2 text-center"
              >
                目前沒有可用RAG
              </p>
            </div>
          </div>
        </div>

      </template>
        </div>
      </div>
    </div>
  </div>
</template>
