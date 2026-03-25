<script setup>
/**
 * CreateUnit - 建立 RAG 頁面
 *
 * 一個分頁（tab）對應後端一筆 RAG（rag_id + rag_tab_id）。流程：建立 RAG → 上傳 ZIP → 設定 rag_list（虛擬資料夾群組）→ Build RAG ZIP → 可設為測驗用 → 產生題目 → 作答與評分。
 *
 * API 對應：
 * - 列表：GET /rag/rags?local=（與 create-unit 的 local 一致）
 * - 建立 tab（按 +）：POST /rag/create-unit（rag_tab_id、person_id、rag_name 必填；local 選填，預設 false；本機前端傳 true）
 * - 上傳 ZIP：POST /rag/upload-zip（Form: file、rag_tab_id、person_id）
 * - 建 RAG：POST /rag/build-rag-zip（rag_list、chunk_size、chunk_overlap、system_prompt_instruction 等）
 * - 測驗用：GET／PUT /system-settings/rag-for-exam-localhost 或 rag-for-exam-deploy；PUT rag_id 正整數或 '' 清空；列表 for_exam 與設定併用於按鈕「取消設為測驗用」
 * - 出題：POST /rag/create-quiz（rag_id 必填；rag_tab_id、unit_name 選填可 ""，空 unit_name 後端用 outputs 第一筆）；評分：POST /rag/quiz-grade、GET /rag/quiz-grade-result/{job_id}，ready 時 result: { quiz_score, quiz_comments, rag_answer_id }
 * 上述 API 不需 llm_api_key。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_GET_SYSTEM_SETTING_COURSE_NAME,
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
} from '../constants/api.js';
import {
  getPersonId,
  apiCreateUnit,
  apiUploadZip,
  apiDeleteRag,
  apiGetRagForExamSetting,
  apiSetRagForExam,
  parseRagIdFromRagForExamSettingPayload,
  apiBuildRagZip,
  apiGenerateQuiz,
  is504OrNetworkError,
} from '../services/ragApi.js';
import { formatGradingResult } from '../utils/grading.js';
import { submitGrade } from '../composables/useQuizGrading.js';
import {
  generateTabId,
  deriveRagNameFromTabId,
  deriveRagName,
  parsePackTasksList,
  parseRagMetadataObject,
  DEFAULT_SYSTEM_INSTRUCTION,
  QUIZ_LEVEL_LABELS,
  normalizeQuizLevelLabel,
  quizLevelStringForApi,
  unitSelectValue,
  reconcileQuizUnitSelectSlot,
  findQuizUnitBySlotSelection,
} from '../utils/rag.js';
import { useRagList } from '../composables/useRagList.js';
import { useRagTabState } from '../composables/useRagTabState.js';
import { usePackTasks } from '../composables/usePackTasks.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import QuizCard from '../components/QuizCard.vue';
import RagTabsBar from '../components/RagTabsBar.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';

defineProps({
  tabId: { type: String, required: true },
});

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** POST /rag/upload-zip 允許的副檔名（與後端可解析格式一致） */
const UPLOAD_ALLOWED_EXTENSIONS = ['.zip', '.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const UPLOAD_ACCEPT_ATTR = UPLOAD_ALLOWED_EXTENSIONS.join(',');
function fileHasAllowedUploadExtension(file) {
  if (!file?.name) return false;
  const lower = file.name.toLowerCase();
  return UPLOAD_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const authStore = useAuthStore();

const { ragList, ragListLoading, ragListError, fetchRagList } = useRagList();
const createRagLoading = ref(false);
const createRagError = ref('');
const gradingLoading = ref(false);
const deleteRagLoading = ref(false);
/** 與左側標題相同：GET /system-settings/course-name 的 course_name，失敗時維持 AIQuiz */
const courseNameForPrompt = ref('AIQuiz');
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);

const { getTabState, currentState, isNewTabId } = useRagTabState(activeTabId, newTabIds, ragList, authStore, { defaultSystemInstruction: DEFAULT_SYSTEM_INSTRUCTION });

function checkRagHasMetadata(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return rag.rag_metadata != null && (typeof rag.rag_metadata === 'string' ? String(rag.rag_metadata).trim() !== '' : true);
}

function checkRagHasList(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return rag.rag_list != null && String(rag.rag_list).trim() !== '';
}

/** 至少一個出題單元，且每個出題單元至少一個單元（與出題群組區「確定」按鈕啟用條件一致） */
function isPackTasksListReady(list) {
  if (!Array.isArray(list) || list.length < 1) return false;
  return list.every((g) => Array.isArray(g) && g.length >= 1);
}

const hasRagMetadata = computed(() => checkRagHasMetadata(currentRagItem.value));
const hasRagListOrMetadata = computed(() => checkRagHasMetadata(currentRagItem.value) || checkRagHasList(currentRagItem.value));

/** 後端已有 rag_metadata 時，出題單元（rag_list）拆成條列：每個 li 為一群，群內資料夾以 + 連接 */
const ragListReadonlyGroups = computed(() => {
  const list = currentState.value.packTasksList;
  if (Array.isArray(list) && list.length > 0) {
    const groups = list.filter((g) => Array.isArray(g) && g.length > 0).map((g) => g.filter(Boolean));
    if (groups.length > 0) return groups;
  }
  const rag = currentRagItem.value;
  if (rag && rag.rag_list != null && String(rag.rag_list).trim() !== '') {
    return parsePackTasksList(String(rag.rag_list).trim());
  }
  return [];
});

/** 唯讀出題單元：橫向純文字，群組間以 · 分隔、群內以 + */
const ragListReadonlyInlineText = computed(() =>
  ragListReadonlyGroups.value.map((g) => (Array.isArray(g) ? g.join(' + ') : '')).filter(Boolean).join(' · ')
);

/** 尚無法編輯出題單元（未上傳 ZIP 等）；與拖放、區塊鎖定一致，不包含「群組是否已填滿」 */
const packGroupsEditBlocked = computed(() => {
  if (hasRagMetadata.value) return true;
  if (hasRagListOrMetadata.value) return false;
  const id = activeTabId.value;
  if (!id) return true;
  if (isNewTabId(id)) return String(currentState.value.zipTabId ?? '').trim() === '';
  return false;
});

/** 尚未完成建立 RAG 壓縮時，產生題目區塊 disable（需有 packResponseJson）；若有 rag_metadata 則 enable */
const ragGenerateDisabled = computed(() => {
  if (hasRagMetadata.value) return false;
  return packGroupsEditBlocked.value || currentState.value.packResponseJson == null;
});

/** Pack 回傳的 outputs 陣列（依當前 tab 的 packResponseJson） */
const packOutputs = computed(() => {
  const data = currentState.value.packResponseJson;
  if (!data || typeof data !== 'object') return [];
  return Array.isArray(data.outputs) ? data.outputs : [];
});

/** 產生題目：選擇單元 = rag_name 下拉（供 API；Pack 無資料時從 /rags 推導） */
const generateQuizUnits = computed(() => {
  const data = currentState.value.packResponseJson;
  const out = packOutputs.value;
  const singleTabId = data && typeof data === 'object' && data.rag_tab_id != null ? data.rag_tab_id : null;
  const withId = out.filter((o) => o && o.rag_tab_id != null);
  if (withId.length) {
    return withId.map((o) => {
      const rag_name = deriveRagName(o);
      const unit_name = String(o.unit_name ?? o.rag_name ?? rag_name ?? '').trim().replace(/\+/g, '_') || rag_name;
      return {
        rag_tab_id: String(o.rag_tab_id),
        filename: o.filename || o.rag_filename || 'RAG',
        rag_name,
        unit_name,
      };
    });
  }
  if (singleTabId && out.length) {
    return out.map((o) => {
      const rag_name = deriveRagName(o);
      const unit_name = String(o.unit_name ?? o.rag_name ?? rag_name ?? '').trim().replace(/\+/g, '_') || rag_name;
      return {
        rag_tab_id: String(singleTabId),
        filename: o.filename || o.rag_filename || 'RAG',
        rag_name,
        unit_name,
      };
    });
  }
  // fallback：Pack 尚未執行，從 /rags 的 rag_list 推導
  return generateQuizUnitsFromRag.value;
});

/** 確保為數字，空字串/null/undefined/NaN 時回傳預設值 */
function ensureNumber(val, defaultVal) {
  if (val === '' || val == null) return defaultVal;
  const n = Number(val);
  return (n === n && isFinite(n)) ? n : defaultVal;
}

/** 難度、chunk 參數（共用）；chunk_size / chunk_overlap 一律為數字 */
const filterDifficulty = ref('基礎');
const chunkSize = ref(1000);
const chunkOverlap = ref(200);

/** 當前 tab 對應的 RAG 項目（來自 GET /rag/rags），僅在非「新增」tab 時有值 */
const currentRagItem = computed(() => {
  const id = activeTabId.value;
  if (!id || isNewTabId(id)) return null;
  return ragList.value.find(
    (rag) => (rag.rag_tab_id ?? rag.id ?? String(rag)) === id
  ) ?? null;
});

/** GET /system-settings/rag-for-exam-* 的 rag_id（列表未帶 for_exam 時仍可比對） */
const ragForExamSettingRagId = ref(null);

/** 列表 for_exam 或與系統設定 rag_id 相同時視為試題用 RAG（與分頁列綠點／刪除鈕一致） */
function ragMatchesExamSetting(rag, settingRagId) {
  if (!rag || typeof rag !== 'object') return false;
  if (rag.for_exam === true) return true;
  const rid = rag.rag_id ?? rag.id;
  if (rid == null || rid === '') return false;
  if (settingRagId == null) return false;
  return String(settingRagId) === String(rid);
}

/** 目前分頁 RAG 是否為試題用（列表 for_exam 或與系統設定 rag_id 相同） */
const currentRagIsExamRag = computed(() =>
  ragMatchesExamSetting(currentRagItem.value, ragForExamSettingRagId.value)
);

/** 當前 tab 的 rag_id、rag_tab_id（僅 console 記錄；未上傳則為「未上傳」） */
const currentRagIdAndTabId = computed(() => {
  const state = currentState.value;
  const rag = currentRagItem.value;
  if (state.zipResponseJson != null) {
    const rid = state.zipResponseJson.rag_id ?? state.zipResponseJson.id;
    const tid = state.zipTabId || state.zipResponseJson.rag_tab_id;
    return { rag_id: rid != null ? String(rid) : '未上傳', rag_tab_id: tid ? String(tid) : '未上傳' };
  }
  if (rag != null && typeof rag === 'object') {
    const rid = rag.rag_id ?? rag.id;
    const tid = rag.rag_tab_id ?? rag.id ?? activeTabId.value;
    return { rag_id: rid != null ? String(rid) : '未上傳', rag_tab_id: tid ? String(tid) : '未上傳' };
  }
  return { rag_id: '未上傳', rag_tab_id: '未上傳' };
});

watch(
  currentRagIdAndTabId,
  (v) => {
    // 畫面不顯示 rag_id／rag_tab_id，改由此處輸出供除錯
    // eslint-disable-next-line no-console -- 依需求於開發者工具查看
    console.log('[CreateUnit] rag_id:', v.rag_id, 'rag_tab_id:', v.rag_tab_id);
  },
  { immediate: true }
);

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
  ragListLoading.value ||
  createRagLoading.value ||
  deleteRagLoading.value ||
  gradingLoading.value ||
  currentState.value.forExamLoading ||
  currentState.value.zipLoading ||
  currentState.value.packLoading ||
  anySlotLoading.value
);

/** 用於顯示 file_metadata：僅在上傳 ZIP 後才有（上傳回傳的 zipResponseJson，或 GET /rag/rags 該筆的 file_metadata）；未上傳則為 null */
const fileMetadataToShow = computed(() => {
  const state = currentState.value;
  if (state.zipResponseJson != null) return state.zipResponseJson;
  const rag = currentRagItem.value;
  if (rag == null || typeof rag !== 'object') return null;
  if (rag.file_metadata != null && typeof rag.file_metadata === 'object') return rag.file_metadata;
  return null;
});

/** 是否已上傳過 ZIP（file_metadata 僅在上傳後才會有） */
const hasUploadedFileMetadata = computed(() => fileMetadataToShow.value != null);

/**
 * 建立流程 stepper：1 僅上傳、2 含建立出題單元、3 含題目測試
 * - 無 file_metadata／無 rag_metadata → 1
 * - 有 file_metadata／無 rag_metadata → 1–2
 * - 有 file_metadata／有 rag_metadata → 1–2–3
 */
const createRagStepperPhase = computed(() => {
  if (hasUploadedFileMetadata.value && hasRagMetadata.value) return 3;
  if (hasUploadedFileMetadata.value) return 2;
  return 1;
});

/** 已有 file_metadata 時，畫面僅顯示之 ZIP 檔名 */
const uploadedZipDisplayName = computed(() => {
  if (!hasUploadedFileMetadata.value) return '';
  const meta = fileMetadataToShow.value;
  if (meta && typeof meta === 'object') {
    const name = meta.filename ?? meta.rag_filename ?? meta.original_filename;
    if (name != null && String(name).trim() !== '') return String(name).trim();
  }
  const z = currentState.value.zipFileName;
  if (z != null && String(z).trim() !== '') return String(z).trim();
  return '（已上傳）';
});

const {
  secondFoldersFull,
  ragListDisplayGroups,
  onDragStartTag,
  onDragEndTag,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDropRagList,
  removeFromRagList,
  removeRagListGroup,
  addRagListGroup,
  addAllSecondFoldersAsGroups,
  setAllSecondFoldersAsSingleGroup,
} = usePackTasks(currentState, fileMetadataToShow, packGroupsEditBlocked);

/** Tab 列用：rag 項目含 _tabId、_label、_isExamRag（試題用者分頁列不顯示刪除） */
const ragItems = computed(() =>
  ragList.value.map((r) => ({
    ...r,
    _tabId: r.rag_tab_id ?? r.id ?? r,
    _label: getRagTabLabel(r),
    _isExamRag: ragMatchesExamSetting(r, ragForExamSettingRagId.value),
  }))
);
/** Tab 列用：新增 tab 項目含 id、label */
const newTabItems = computed(() =>
  newTabIds.value.map((tid) => ({
    id: tid,
    label: deriveRagNameFromTabId(getTabState(tid).tabId) || 'RAG',
  }))
);

/** 從 /rag/rags 的 outputs（頂層或 rag_metadata 內）或 rag_list 推導 generateQuizUnits（與 ExamPage／build-rag-zip 一致） */
const generateQuizUnitsFromRag = computed(() => {
  const rag = currentRagItem.value;
  if (!rag || typeof rag !== 'object') return [];
  const sourceTabId = String(rag.rag_tab_id ?? '');
  const metaObj = parseRagMetadataObject(rag);
  const topOutputs = rag.outputs;
  const nestedOutputs = metaObj?.outputs;
  const outputs =
    Array.isArray(topOutputs) && topOutputs.length > 0
      ? topOutputs
      : Array.isArray(nestedOutputs) && nestedOutputs.length > 0
        ? nestedOutputs
        : null;
  if (outputs) {
    return outputs.map((o) => {
      const derivedName = `${(o.rag_name ?? '').replace(/\+/g, '_')}`;
      const tabId =
        o.rag_tab_id != null && String(o.rag_tab_id).trim() !== ''
          ? String(o.rag_tab_id)
          : derivedName
            ? `${derivedName}_rag`
            : sourceTabId;
      const label = deriveRagName(o);
      const rawUnit =
        (o.unit_name != null && String(o.unit_name).trim() !== '')
          ? String(o.unit_name).trim()
          : (o.rag_name != null && String(o.rag_name).trim() !== '')
            ? String(o.rag_name).trim()
            : label;
      const unit_name = String(rawUnit || '').replace(/\+/g, '_') || label || sourceTabId;
      return {
        rag_tab_id: tabId,
        filename: o.filename ?? o.rag_filename ?? `${derivedName || label || 'RAG'}.zip`,
        rag_name: label,
        unit_name,
      };
    });
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
        unit_name: ragName,
      };
    });
});

/** 從 Rag 項目同步到 tab state（packTasks、ragMetadata、chunk、quizzes 等） */
function syncRagItemToState(rag, state) {
  if (!rag || typeof rag !== 'object') return;
  if (rag.rag_list != null && String(rag.rag_list).trim() !== '') {
    state.packTasks = String(rag.rag_list).trim();
    state.packTasksList = parsePackTasksList(state.packTasks);
  }
  if (rag.rag_metadata != null) {
    state.ragMetadata = typeof rag.rag_metadata === 'string' ? rag.rag_metadata : JSON.stringify(rag.rag_metadata, null, 2);
  }
  if (rag.chunk_size != null) chunkSize.value = ensureNumber(rag.chunk_size, 1000);
  if (rag.chunk_overlap != null) chunkOverlap.value = ensureNumber(rag.chunk_overlap, 200);
  const filename = rag.file_metadata?.filename ?? rag.filename;
  if (filename != null && String(filename).trim() !== '') state.zipFileName = String(filename).trim();
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    state.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
  const quizzes = rag.quizzes ?? [];
  const ragAnswers = rag.answers ?? [];
  if (quizzes.length > 0) {
    const answersByQuizId = ragAnswers.reduce((acc, a) => {
      const id = a.quiz_id != null && String(a.quiz_id).trim() !== '' ? String(a.quiz_id) : '';
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(a);
      return acc;
    }, {});
    const quizzesWithAnswers = quizzes.map((q, i) => {
      const qKey = q.quiz_id != null && String(q.quiz_id).trim() !== '' ? String(q.quiz_id) : '';
      const byId = q.answers ?? (qKey ? answersByQuizId[qKey] : undefined);
      const answers = (Array.isArray(byId) && byId.length > 0) ? byId : (ragAnswers[i] != null ? [ragAnswers[i]] : []);
      return { ...q, answers };
    });
    const metaParsed = parseRagMetadataObject(rag);
    const out0 = Array.isArray(rag.outputs) && rag.outputs.length > 0 ? rag.outputs[0] : metaParsed?.outputs?.[0];
    const firstRagName = (parsePackTasksList(rag.rag_list)[0]?.[0] ?? out0?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromRagQuiz(q, q.rag_name ?? firstRagName));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}

watch(currentRagItem, (rag) => syncRagItemToState(rag, currentState.value), { immediate: true });

/** 由 /rag/rags 的 quiz（含 answers）組成一張題目卡片，供測驗測試區塊顯示；批改結果從作答紀錄的 answer_metadata / answer_feedback_metadata 格式化 */
function buildCardFromRagQuiz(quiz, ragName) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? null;
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) || (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : ''))
    : '';
  const generateLevel = normalizeQuizLevelLabel(quiz.quiz_level);
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? '',
    hint: quiz.quiz_hint ?? '',
    referenceAnswer: quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? '',
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.rag_name || '').trim() || null,
    quiz_answer: latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? '',
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

/** 單元下拉預設不選；清單變動時用 unit_name／rag_tab_id 重新對齊選取（避免無匹配 value 時 select 誤顯示第一筆） */
watch(generateQuizUnits, (units) => {
  const state = currentState.value;
  reconcileQuizUnitSelectSlot(state, units);
  const count = state.quizSlotsCount || 0;
  for (let i = 1; i <= count; i++) {
    reconcileQuizUnitSelectSlot(state.slotFormState?.[i], units);
  }
}, { immediate: true });

/** 有 RAG 資料時預設選第一個 tab */
watch(ragList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = list[0].rag_tab_id ?? list[0].id ?? list[0];
  }
}, { immediate: true });

/** 上傳 ZIP 的 <input type="file"> ref，用於進入頁面／新增 tab 時清空，讓欄位一開始是空的 */
const zipFileInputRef = ref(null);

function clearZipFileInput() {
  if (zipFileInputRef.value) {
    zipFileInputRef.value.value = '';
  }
}

/** 切換到「新增」tab 時清空共用的 file input，避免顯示其他 tab 已選的 ZIP 檔名 */
watch(activeTabId, (id) => {
  if (id && isNewTabId(id)) clearZipFileInput();
});

/** chunk_size / chunk_overlap 一律為數字；無效輸入時還原為預設 */
watch(chunkSize, (v) => {
  const n = ensureNumber(v, 1000);
  if (n !== v && (v === '' || v == null || Number.isNaN(Number(v)))) chunkSize.value = n;
}, { flush: 'post' });
watch(chunkOverlap, (v) => {
  const n = ensureNumber(v, 200);
  if (n !== v && (v === '' || v == null || Number.isNaN(Number(v)))) chunkOverlap.value = n;
}, { flush: 'post' });

async function refreshRagForExamSetting() {
  try {
    const data = await apiGetRagForExamSetting();
    ragForExamSettingRagId.value = parseRagIdFromRagForExamSettingPayload(data);
  } catch {
    ragForExamSettingRagId.value = null;
  }
}

async function fetchCourseNameForPrompt() {
  try {
    const res = await loggedFetch(`${API_BASE}${API_GET_SYSTEM_SETTING_COURSE_NAME}`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data.course_name && String(data.course_name).trim()) {
        courseNameForPrompt.value = String(data.course_name).trim();
      }
    }
  } catch {
    // 保持預設 AIQuiz（與 LeftView 一致）
  }
}

/** 畫面一打開就抓 GET /rag/rags，每一筆 RAG 一個 tab；並清空檔案選擇讓上傳欄位一開始是空的 */
onMounted(() => {
  fetchRagList();
  refreshRagForExamSetting();
  clearZipFileInput();
  fetchCourseNameForPrompt();
});

/** 設為測驗用（PUT system-settings rag-for-exam-*） */
async function setRagForExam() {
  const rag = currentRagItem.value;
  if (!rag || isNewTabId(activeTabId.value)) return;
  const ragId = rag.rag_id ?? rag.id;
  if (ragId == null || ragId === '') {
    const state = getTabState(activeTabId.value);
    state.forExamError = '無法取得 rag_id（請先建立並上傳 ZIP）';
    return;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    alert('請先登入');
    return;
  }
  const state = getTabState(activeTabId.value);
  state.forExamLoading = true;
  state.forExamError = '';
  try {
    await apiSetRagForExam(ragId);
    await fetchRagList();
    await refreshRagForExamSetting();
  } catch (err) {
    state.forExamError = err.message || String(err);
  } finally {
    state.forExamLoading = false;
  }
}

/** 取消測驗用（PUT rag_id 空字串） */
async function clearRagForExam() {
  if (!currentRagIsExamRag.value || isNewTabId(activeTabId.value)) return;
  const personId = getPersonId(authStore);
  if (!personId) {
    alert('請先登入');
    return;
  }
  const state = getTabState(activeTabId.value);
  state.forExamLoading = true;
  state.forExamError = '';
  try {
    await apiSetRagForExam(null);
    await fetchRagList();
    await refreshRagForExamSetting();
  } catch (err) {
    state.forExamError = err.message || String(err);
  } finally {
    state.forExamLoading = false;
  }
}

/** 刪除 RAG */
async function deleteRag(rag, e) {
  if (e) e.stopPropagation();
  const fileId = rag?.rag_tab_id ?? rag?.id ?? rag;
  if (fileId == null || fileId === '') return;
  const personId = getPersonId(authStore);
  if (!personId) {
    alert('請先登入');
    return;
  }
  if (!confirm(`確定要刪除「${getRagTabLabel(rag)}」嗎？`)) return;
  deleteRagLoading.value = true;
  try {
    await apiDeleteRag(fileId, personId);
    await fetchRagList();
    if (activeTabId.value === (rag?.rag_tab_id ?? rag?.id ?? String(fileId))) {
      if (ragList.value.length > 0) {
        activeTabId.value = ragList.value[0].rag_tab_id ?? ragList.value[0].id ?? ragList.value[0];
      } else if (newTabIds.value.length > 0) {
        activeTabId.value = newTabIds.value[0];
      } else {
        addNewTab();
      }
    }
  } catch (err) {
    alert('刪除失敗：' + (err.message || String(err)));
  } finally {
    deleteRagLoading.value = false;
  }
}

/** 分頁列 ×：依 tab id 找到列表項目後刪除 */
function onDeleteRagTab(tabId) {
  const id = tabId != null ? String(tabId) : '';
  if (!id) return;
  const rag = ragList.value.find((r) => String(r.rag_tab_id ?? r.id ?? r) === id);
  if (rag) deleteRag(rag, null);
}

/** create-unit 回傳的 created_at 與 tab 標籤用 name（key = rag_id） */
const ragCreatedAtMap = ref({});

/** 點「新增」：建立 RAG，成功後重整列表並切到新 tab */
async function addNewTab() {
  const personId = getPersonId(authStore);
  if (!personId) {
    createRagError.value = '請先登入以取得 person_id';
    return;
  }
  createRagError.value = '';
  createRagLoading.value = true;
  const ragTabId = generateTabId(personId);
  const ragName = deriveRagNameFromTabId(ragTabId) || ragTabId;
  try {
    const data = await apiCreateUnit(personId, ragTabId, ragName);
    if (data?.rag_id != null && data?.created_at != null) {
      ragCreatedAtMap.value = { ...ragCreatedAtMap.value, [String(data.rag_id)]: data.created_at };
    }
    ragListError.value = '';
    await fetchRagList();
    if (data?.rag_tab_id != null) activeTabId.value = String(data.rag_tab_id);
    clearZipFileInput();
    if (ragList.value.length === 0) showFormWhenNoData.value = true;
  } catch (err) {
    createRagError.value = err.message || '出題單元建立失敗';
  } finally {
    createRagLoading.value = false;
  }
}

/** 取得 RAG 顯示名稱（用於 tab 標籤）；以 rag_name 為主，預設為 rag_tab_id 底線後的時間 */
function getRagTabLabel(rag) {
  if (rag == null) return 'RAG';
  if (typeof rag === 'string') return ragCreatedAtMap.value[rag] ?? String(rag);
  if (typeof rag !== 'object') return String(rag);
  const id = rag.rag_id ?? rag.rag_tab_id ?? rag.id;
  const fromMap = id != null ? ragCreatedAtMap.value[String(id)] : undefined;
  const ragName = (rag.rag_name != null && String(rag.rag_name).trim() !== '')
    ? String(rag.rag_name).trim()
    : deriveRagNameFromTabId(rag.rag_tab_id ?? rag.id ?? '');
  return (ragName && ragName !== '') ? ragName : (fromMap ?? rag.file_metadata?.filename ?? rag.course_name ?? rag.filename ?? rag.created_at ?? deriveRagNameFromTabId(rag.rag_tab_id ?? '') ?? 'RAG');
}

function resetZipState(state, tabId) {
  state.uploadedZipFile = null;
  state.zipFileName = '';
  state.zipSecondFolders = [];
  state.zipResponseJson = null;
  state.zipTabId = isNewTabId(tabId) ? '' : tabId;
}

function setZipFileFromFile(state, tabId, file) {
  if (!file) {
    resetZipState(state, tabId);
    state.zipError = '';
    return;
  }
  if (!fileHasAllowedUploadExtension(file)) {
    resetZipState(state, tabId);
    state.zipError = '請選擇允許的檔案：.zip、.pdf、.doc、.docx、.ppt、.pptx';
    return;
  }
  resetZipState(state, tabId);
  state.uploadedZipFile = file;
  state.zipFileName = file.name;
  state.zipError = '';
}

function onZipChange(e) {
  const state = currentState.value;
  const file = e.target.files?.[0];
  const tabId = activeTabId.value;
  setZipFileFromFile(state, tabId, file);
}

/** 拖曳置放教材檔：僅接受 UPLOAD_ALLOWED_EXTENSIONS */
const isZipDragOver = ref(false);
function onZipDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer.types.includes('Files')) isZipDragOver.value = true;
}
function onZipDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  isZipDragOver.value = false;
}
function onZipDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  isZipDragOver.value = false;
  const file = e.dataTransfer.files?.[0];
  if (!file) return;
  const state = currentState.value;
  const tabId = activeTabId.value;
  setZipFileFromFile(state, tabId, file);
  clearZipFileInput();
}
function openZipFileDialog() {
  if (zipFileInputRef.value) zipFileInputRef.value.click();
}

/** 上傳 ZIP */
async function confirmUploadZip() {
  const state = currentState.value;
  if (!state.uploadedZipFile) {
    state.zipError = '請先選擇要上傳的檔案';
    return;
  }
  const tabId = activeTabId.value;
  if (isNewTabId(tabId) || !tabId) {
    state.zipError = '請先按 + 完成出題單元建立（此 tab 需先建立後端資料）';
    return;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    state.zipError = '請先登入以取得 person_id';
    return;
  }
  state.zipLoading = true;
  state.zipError = '';
  state.zipSecondFolders = [];
  state.zipResponseJson = null;
  try {
    const data = await apiUploadZip(state.uploadedZipFile, tabId, personId);
    const meta = data?.file_metadata ?? data;
    state.zipResponseJson = meta ?? data;
    state.zipTabId = String(tabId);
    if (meta && typeof meta === 'object') {
      if (meta.filename != null) state.zipFileName = meta.filename;
      state.zipSecondFolders = Array.isArray(meta.second_folders) ? meta.second_folders : [];
    } else if (data?.filename != null) {
      state.zipFileName = data.filename;
      state.zipSecondFolders = Array.isArray(data?.second_folders) ? data.second_folders : [];
    }
    await fetchRagList();
  } catch (err) {
    state.zipError = is504OrNetworkError(err)
      ? '後端正在啟動中（約需 1 分鐘），請稍後再試一次'
      : err.message || '上傳失敗';
    state.zipSecondFolders = [];
    state.zipResponseJson = null;
  } finally {
    state.zipLoading = false;
  }
}

/** 出題群組確定：build-rag-zip（按鈕文案「確定」） */
async function confirmPack() {
  const state = currentState.value;
  const fileId = String(state.zipTabId ?? '').trim();
  const ragList = state.packTasks?.trim();
  const personId = getPersonId(authStore);
  if (!fileId) {
    state.packError = '請先上傳 ZIP 取得 rag_tab_id';
    return;
  }
  if (!personId) {
    state.packError = '請先登入以取得 person_id';
    return;
  }
  if (!isPackTasksListReady(state.packTasksList ?? [])) {
    state.packError = '請至少建立一個出題單元，且每個出題單元至少包含一個單元';
    return;
  }
  if (!ragList) {
    state.packError = '請輸入 rag_list（例：220222+220301 或 220222,220301+220302）';
    return;
  }
  state.packLoading = true;
  state.packError = '';
  state.packResponseJson = null;
  try {
    state.packResponseJson = await apiBuildRagZip({
      rag_tab_id: fileId,
      person_id: personId,
      rag_list: ragList,
      chunk_size: ensureNumber(chunkSize.value, 1000),
      chunk_overlap: ensureNumber(chunkOverlap.value, 200),
      system_prompt_instruction: (state.systemInstruction ?? '').trim() || '',
    });
    state.ragMetadata = typeof state.packResponseJson === 'string' ? state.packResponseJson : JSON.stringify(state.packResponseJson, null, 2);
    await fetchRagList();
  } catch (err) {
    state.packError = err.message || '壓縮失敗';
    state.packResponseJson = null;
  } finally {
    state.packLoading = false;
  }
}

/** 難度選項；create-quiz 的 quiz_level 直接送「基礎」／「進階」字串 */
const difficultyOptions = QUIZ_LEVEL_LABELS;

/** 取得第 slotIndex 題的產生題目表單狀態（獨立、不連動） */
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

/** 點「新增題目」：展開一個新的題目區塊（第 n 題）；cardList 與 slot 對齊 */
function openNextQuizSlot() {
  const state = currentState.value;
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  while (state.cardList.length < state.quizSlotsCount) {
    state.cardList.push(null);
  }
}

/** 將第 slotIndex 題設為指定卡片（每題獨立，不連動） */
function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const card = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    hint: hint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    quiz_answer: '',
    hintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
  };
  state.cardList[slotIndex - 1] = card;
}

/** 產生題目 */
async function generateQuiz(slotIndex) {
  const state = currentState.value;
  const slotState = getSlotFormState(slotIndex);
  const rag = currentRagItem.value;
  const tidFromZip = String(state.zipTabId ?? '').trim();
  const tidFromRag = rag?.rag_tab_id != null ? String(rag.rag_tab_id).trim() : '';
  const aid = activeTabId.value;
  const tidFromActive = aid && !isNewTabId(aid) ? String(aid).trim() : '';
  const sourceTabId = tidFromZip || tidFromRag || tidFromActive;
  const selectedUnit = findQuizUnitBySlotSelection(generateQuizUnits.value, slotState.generateQuizTabId);
  if (!selectedUnit) {
    slotState.error = '請先選擇單元';
    return;
  }
  const unitName = String(selectedUnit.unit_name ?? selectedUnit.rag_name ?? '').trim();
  const ragName = selectedUnit.rag_name?.trim() || unitName;
  const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  if (ragId == null) {
    slotState.error = '無法取得 rag_id（請先上傳 ZIP 或確認已載入 RAG）';
    return;
  }
  if (!generateQuizUnits.value.length) {
    slotState.error = '請先按出題群組區「確定」取得 RAG 壓縮檔（outputs），或重新載入列表';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  try {
    const data = await apiGenerateQuiz(ragId, sourceTabId, quizLevelStringForApi(filterDifficulty.value), unitName);
    slotState.responseJson = data;
    const quizContent = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? data.quiz_content ?? '';
    const hintText = data.quiz_hint ?? data.hint ?? '';
    const targetFilename = data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? '';
    const referenceAnswerText =
      data.quiz_answer_reference ?? data.quiz_reference_answer ?? data.quiz_answer ?? data.answer ?? '';
    setCardAtSlot(slotIndex, quizContent, hintText, targetFilename, referenceAnswerText, ragName, data, filterDifficulty.value, (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION);
  } catch (err) {
    slotState.error = err.message || '產生題目失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

/** 評分：POST /rag/quiz-grade；body: rag_id、rag_tab_id、rag_quiz_id、quiz_content、quiz_answer、quiz_answer_reference（皆 string，選填可 ""）；回傳 202 + job_id；輪詢 GET /rag/quiz-grade-result/{job_id}；ready 時 result: { quiz_score, quiz_comments, rag_answer_id }。 */
async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
  const state = currentState.value;
  const sourceTabId = String(state.zipTabId ?? '').trim();
  const rag = currentRagItem.value;
  const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  if (!sourceTabId) {
    item.confirmed = true;
    item.gradingResult = '評分需要 rag_tab_id：請先上傳教材 ZIP 取得 rag_tab_id 後再進行評分。';
    return;
  }
  if (ragId == null) {
    item.confirmed = true;
    item.gradingResult = '評分失敗：無法取得 rag_id，請先上傳 ZIP 或確認已載入 RAG。';
    return;
  }
  gradingLoading.value = true;
  try {
    await submitGrade(item, { sourceTabId, ragId });
  } finally {
    gradingLoading.value = false;
  }
}

</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="isAnyLoading"
      loading-text="執行中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand mb-0">{{ hasRagMetadata ? '出題單元' : '出題單元建立' }}</span>
      </div>
    </div>
    <RagTabsBar
      :rag-items="ragItems"
      :new-tab-items="newTabItems"
      :active-tab-id="activeTabId"
      :rag-list-loading="ragListLoading"
      :create-rag-loading="createRagLoading"
      :rag-list-error="ragListError"
      :create-rag-error="createRagError"
      :delete-rag-loading="deleteRagLoading"
      @update:active-tab-id="activeTabId = $event"
      @add-new-tab="addNewTab"
      @delete-rag="onDeleteRagTab"
    />

    <!-- 內容區：可上下捲動 -->
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <!-- 無資料時不顯示表單，點「+」後才顯示；有資料時顯示對應 tab 表單 -->
      <template v-if="ragList.length > 0 || showFormWhenNoData">
      <!-- 建立流程 stepper：依 file_metadata / rag_metadata 亮起 1～3 步 -->
      <div v-if="activeTabId" class="create-rag-stepper text-start page-block-spacing" aria-label="建立流程">
        <div class="d-flex align-items-start justify-content-between gap-2 gap-sm-3 w-100">
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="create-rag-stepper-num rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold small"
              :class="createRagStepperPhase >= 1 ? 'create-rag-stepper-num--on' : 'create-rag-stepper-num--off'"
            >1</span>
            <span class="mt-2 small" :class="createRagStepperPhase >= 1 ? 'text-dark fw-medium' : 'text-muted'">上傳檔案</span>
          </div>
          <div
            class="create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
            :class="createRagStepperPhase >= 2 ? 'create-rag-stepper-line--on' : ''"
            aria-hidden="true"
          />
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="create-rag-stepper-num rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold small"
              :class="createRagStepperPhase >= 2 ? 'create-rag-stepper-num--on' : 'create-rag-stepper-num--off'"
            >2</span>
            <span class="mt-2 small" :class="createRagStepperPhase >= 2 ? 'text-dark fw-medium' : 'text-muted'">出題單元建立</span>
          </div>
          <div
            class="create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
            :class="createRagStepperPhase >= 3 ? 'create-rag-stepper-line--on' : ''"
            aria-hidden="true"
          />
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="create-rag-stepper-num rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold small"
              :class="createRagStepperPhase >= 3 ? 'create-rag-stepper-num--on' : 'create-rag-stepper-num--off'"
            >3</span>
            <span class="mt-2 small" :class="createRagStepperPhase >= 3 ? 'text-dark fw-medium' : 'text-muted'">測驗測試</span>
          </div>
        </div>
      </div>
      <!-- 尚無 file_metadata 時才顯示上傳區；檔名改顯示於「出題單元建立」內 -->
      <div v-if="activeTabId && !hasUploadedFileMetadata" class="text-start page-block-spacing border rounded p-3">
        <div class="">
          <input
            ref="zipFileInputRef"
            type="file"
            :accept="UPLOAD_ACCEPT_ATTR"
            class="d-none"
            @change="onZipChange"
          >
          <div
            class="zip-drop-zone rounded border border-dashed p-5 text-center position-relative"
            :class="{ 'zip-drop-zone-over': isZipDragOver }"
            @dragover="onZipDragOver"
            @dragenter="onZipDragOver"
            @dragleave="onZipDragLeave"
            @drop="onZipDrop"
            @click="openZipFileDialog()"
          >
            <template v-if="currentState.zipLoading">
              <span class="text-secondary small">上傳中...</span>
            </template>
            <template v-else>
              <template v-if="currentState.zipFileName">
                <span class="small text-body">{{ currentState.zipFileName }}</span>
                <div class="mt-1 small text-muted">點擊可重新選擇檔案</div>
              </template>
              <span v-else class="small text-secondary">拖曳檔案到這裡，或點擊選擇檔案</span>
              <div class="mt-2 small text-muted">
                可解析的檔案副檔名：.zip、.pdf、.doc、.docx、.ppt、.pptx
              </div>
            </template>
          </div>
          <div v-if="currentState.zipError" class="alert alert-danger mt-2 mb-0 py-2 small">
            {{ currentState.zipError }}
          </div>
          <div class="d-flex justify-content-end mt-2">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="currentState.zipLoading || !currentState.zipFileName"
              @click.stop="confirmUploadZip"
            >
              確定上傳
            </button>
          </div>
        </div>
      </div>
      <!-- 建立 RAG：要有 file_metadata 才顯示；已有 rag_metadata 時僅純文字顯示出題單元／chunk／規範 -->
      <div
        v-if="fileMetadataToShow != null"
        class="text-start page-block-spacing border rounded p-3"
        :class="{ 'opacity-75 pe-none': !hasRagMetadata && packGroupsEditBlocked }"
      >
        <div class="mb-3">
          <div class="small text-secondary fw-medium mb-1">上傳檔案名稱</div>
          <div class="small text-break">{{ uploadedZipDisplayName }}</div>
        </div>

        <template v-if="hasRagMetadata">
          <div class="mb-3">
            <div class="small text-secondary fw-medium mb-1">出題單元</div>
            <div v-if="ragListReadonlyGroups.length" class="small text-break">{{ ragListReadonlyInlineText }}</div>
            <div v-else class="small text-muted">—</div>
          </div>
          <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
            <div>
              <div class="small text-secondary fw-medium mb-1">chunk size</div>
              <div class="small">{{ chunkSize }}</div>
            </div>
            <div>
              <div class="small text-secondary fw-medium mb-1">chunk overlap</div>
              <div class="small">{{ chunkOverlap }}</div>
            </div>
          </div>
          <div class="mb-3">
            <div class="small mb-1">出題prompt</div>
            <div class="small border rounded p-3 bg-body-tertiary">
              你是一個「{{ courseNameForPrompt }}」課程的教授，請給學生設計測驗題目：<br>
              【出題規範】<br>
              請根據輸入的「參考內容」設計測驗題目。<br>
              **請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。**<br>
              題目難度：{quiz_level}。<br>
              <span class="lh-base text-break text-danger">{{ (currentState.systemInstruction ?? '').trim() || '—' }}</span><br>
            【回傳格式】<br>
            請以 JSON 格式回傳：<br>
            { "quiz_content": "問題內容", <br>
              "quiz_hint": "答案提示內容", <br>
              "quiz_answer_reference": "參考答案內容" }<br>
            </div>


          </div>
          <div
            v-if="!isNewTabId(activeTabId) && currentRagItem && (currentRagItem.rag_tab_id ?? currentRagItem.id)"
            class="d-flex flex-wrap justify-content-end align-items-center gap-2"
          >
            <button
              type="button"
              :class="currentRagIsExamRag ? 'btn btn-sm btn-outline-secondary' : 'btn btn-sm btn-success'"
              :disabled="currentState.forExamLoading"
              @click="currentRagIsExamRag ? clearRagForExam() : setRagForExam()"
            >
              {{ currentRagIsExamRag ? '取消設為測驗用' : '設為測驗用' }}
            </button>
          </div>
          <div v-if="currentState.forExamError" class="alert alert-danger py-2 small mb-0 mt-2">
            {{ currentState.forExamError }}
          </div>
        </template>

        <template v-else>
          <!-- 課程：可拖曳至出題單元 -->
          <div v-if="secondFoldersFull.length" class="mb-3">
            <label class="form-label small text-secondary fw-medium mb-1">資料夾</label>
            <div class="d-flex flex-wrap gap-2 p-2 rounded border bg-body">
              <div
                v-for="(name, i) in secondFoldersFull"
                :key="'sf-' + i"
                class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1 user-select-none"
                style="cursor: grab;"
                draggable="true"
                role="button"
                tabindex="0"
                @dragstart="onDragStartTag($event, name, false, -1, -1)"
                @dragend="onDragEndTag"
              >
                {{ name }}
              </div>
            </div>
          </div>

          <!-- 出題單元：可放置課程標籤 -->
          <div class="mb-2">
            <label class="form-label small text-secondary fw-medium mb-0">出題單元</label>
            <div class="d-flex flex-wrap align-items-start gap-2">
              <template v-for="(group, gi) in ragListDisplayGroups" :key="'rg-' + gi">
                <div
                  class="pack-drop-target border rounded p-2 d-flex align-items-center gap-1 position-relative bg-body-secondary"
                  style="min-width: 120px; min-height: 2.5rem;"
                  @dragover.prevent="onDragOver($event)"
                  @dragenter.prevent="onDragEnter($event)"
                  @dragleave="onDragLeave($event)"
                  @drop.prevent="onDropRagList($event, gi)"
                >
                  <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
                    <div
                      v-for="(tag, ti) in group"
                      :key="'t-' + gi + '-' + ti"
                      class="badge bg-primary px-2 py-1 d-inline-flex align-items-center gap-1"
                      style="cursor: grab;"
                      draggable="true"
                      role="button"
                      @dragstart="onDragStartTag($event, tag, true, gi, ti)"
                      @dragend="onDragEndTag"
                    >
                      {{ tag }}
                      <span
                        class="ms-1 opacity-75"
                        style="cursor: pointer;"
                        aria-label="移除標籤"
                        @click.stop="removeFromRagList(gi, ti)"
                      >×</span>
                    </div>
                    <span v-if="!group.length" class="text-muted small">拖入此處</span>
                  </div>
                  <button
                    v-if="(currentState.packTasksList || []).length > 0"
                    type="button"
                    class="btn btn-link btn-sm p-0 ms-1 text-muted text-decoration-none flex-shrink-0"
                    style="min-width: 1.5rem;"
                    aria-label="刪除此出題單元"
                    @click.stop="removeRagListGroup(gi)"
                  >
                    ×
                  </button>
                </div>
              </template>
              <div
                class="pack-drop-target btn btn-sm btn-outline-primary bg-white d-flex align-items-center justify-content-center"
                style="min-width: 140px; min-height: 2.5rem; cursor: pointer;"
                role="button"
                tabindex="0"
                @dragover.prevent="onDragOver($event)"
                @dragenter.prevent="onDragEnter($event)"
                @dragleave="onDragLeave($event)"
                @drop.prevent="onDropRagList($event, (currentState.packTasksList || []).length)"
                @click="addRagListGroup"
                @keydown.enter.prevent="addRagListGroup"
                @keydown.space.prevent="addRagListGroup"
              >
                + 新增出題單元
              </div>
            </div>
            <div class="mt-2 d-flex flex-wrap gap-2 align-items-center">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="!secondFoldersFull.length"
                @click="addAllSecondFoldersAsGroups"
              >
                每個單元建立出題單元
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="!secondFoldersFull.length"
                title="在現有出題單元之後新增一個出題單元，內含全部單元（rag_list 以 + 連接）"
                @click="setAllSecondFoldersAsSingleGroup"
              >
                每個單元建立一個出題單元
              </button>
            </div>
          </div>

          <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
            <div style="width: 100px;">
              <label class="form-label small text-secondary fw-medium mb-1">chunk size</label>
              <input
                v-model.number="chunkSize"
                type="number"
                min="1"
                step="1"
                class="form-control form-control-sm"
                placeholder="1000"
              >
            </div>
            <div style="width: 100px;">
              <label class="form-label small text-secondary fw-medium mb-1">chunk overlap</label>
              <input
                v-model.number="chunkOverlap"
                type="number"
                min="0"
                step="1"
                class="form-control form-control-sm"
                placeholder="200"
              >
            </div>
          </div>
          <div class="mt-3">
            <label class="form-label small text-secondary fw-medium mb-1">出題prompt</label>
            <div class="small border rounded p-3 bg-body-tertiary">
              【出題規範】<br>
              請根據輸入的「參考內容」設計測驗題目。<br>
              請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。<br>
              題目難度：{quiz_level}。<br>
              <textarea
                v-model="currentState.systemInstruction"
                class="form-control form-control-sm font-monospace small my-3"
                rows="5"
                :placeholder="'留空則使用預設：' + DEFAULT_SYSTEM_INSTRUCTION"
                style="max-width: 100%;"
              />
            【回傳格式】<br>
            請以 JSON 格式回傳：<br>
            { "quiz_content": "問題內容", <br>
              "quiz_hint": "答案提示內容", <br>
              "quiz_answer_reference": "參考答案內容" }<br>
            </div>
          </div>
          <div class="mt-3 d-flex justify-content-end">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="packGroupsEditBlocked || !isPackTasksListReady(currentState.packTasksList ?? [])"
              @click="confirmPack"
            >
              確定
            </button>
          </div>
          <div v-if="currentState.packError" class="alert alert-danger py-2 small mb-2">
            {{ currentState.packError }}
          </div>
        </template>
      </div>
      <!-- 測驗測試：有 rag_metadata（本機 Pack 或後端已帶入）即顯示 -->
      <div
        v-if="currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== ''"
        class="text-start page-block-spacing"
        :class="{ 'opacity-75': ragGenerateDisabled }"
      >
        <div class="fs-5 fw-semibold mb-4 pb-2 border-bottom">測驗測試</div>

        <!-- 題目區塊：每按一次「新增題目」才多一個「第 n 題」；按鈕固定在最下面 -->
        <div class="mb-4">
          <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
            <!-- 第 slotIndex 題：若已有該題卡片則顯示卡片，否則顯示產生題目表單 -->
            <template v-if="currentState.cardList[slotIndex - 1]">
              <QuizCard
                :card="currentState.cardList[slotIndex - 1]"
                :slot-index="slotIndex"
                @toggle-hint="toggleHint"
                @confirm-answer="confirmAnswer"
                @update:quiz_answer="(val) => { currentState.cardList[slotIndex - 1].quiz_answer = val }"
              />
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
                            :id="'rag-quiz-diff-' + slotIndex + '-' + di"
                            v-model="filterDifficulty"
                            type="radio"
                            class="btn-check"
                            :name="'rag-quiz-difficulty-' + slotIndex"
                            :value="opt"
                            autocomplete="off"
                          >
                          <label class="btn btn-outline-primary" :for="'rag-quiz-diff-' + slotIndex + '-' + di">{{ opt }}</label>
                        </template>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm btn-primary"
                      :disabled="getSlotFormState(slotIndex).loading || !String(getSlotFormState(slotIndex).generateQuizTabId || '').trim()"
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
          <div class="mb-0 pt-2 d-flex justify-content-center">
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

<style scoped>
.zip-drop-zone {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  border-width: 2px;
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.02);
}
.zip-drop-zone:hover:not(.zip-drop-zone-disabled) {
  border-color: var(--bs-primary);
  background: rgba(13, 110, 253, 0.04);
}
.zip-drop-zone-over {
  border-color: var(--bs-primary) !important;
  background: rgba(13, 110, 253, 0.08) !important;
}
.zip-drop-zone-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.pack-drop-target.pack-drop-active {
  background-color: rgba(13, 202, 240, 0.15) !important;
  border-color: var(--bs-info) !important;
}

/* 出題單元建立頁：流程 stepper（1–2–3） */
.create-rag-stepper-num {
  width: 2.25rem;
  height: 2.25rem;
  line-height: 1;
}
.create-rag-stepper-num--on {
  background-color: var(--bs-primary);
  color: var(--bs-white);
}
.create-rag-stepper-num--off {
  background-color: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
  border: 1px solid var(--bs-border-color);
}
.create-rag-stepper-line {
  flex: 1 1 1rem;
  min-width: 0.35rem;
  height: 2px;
  margin-top: 1.125rem;
  align-self: flex-start;
  background-color: var(--bs-border-color);
  border-radius: 1px;
}
.create-rag-stepper-line--on {
  background-color: var(--bs-primary);
}
</style>
