<script setup>
/**
 * CreateExamQuizBankPage - 建立測驗題庫頁面
 *
 * 一個分頁（tab）對應後端一筆 RAG（rag_id + rag_tab_id）。流程：建立 RAG → 上傳 ZIP → 設定 unit_list（虛擬資料夾群組）→ Build RAG ZIP → 可設為測驗用 → 產生題目 → 作答與評分。
 *
 * API 對應：
 * - 列表：GET /rag/tabs?local=（與 tab/create 的 local 一致）
 * - 建立 tab（按 +）：POST /rag/tab/create（rag_tab_id、person_id、tab_name 必填；local 選填，預設 false；本機前端傳 true）
 * - 上傳 ZIP：POST /rag/tab/upload-zip（Form: file、rag_tab_id、person_id）
 * - 建 RAG：POST /rag/tab/build-rag-zip（unit_list、chunk_size、chunk_overlap、system_prompt_instruction 等）
 * - 分頁更名：PUT /rag/tab/tab-name（body: rag_id、tab_name）
 * - 測驗用：GET／PUT /system-settings/rag-for-exam-localhost 或 rag-for-exam-deploy；PUT rag_id 正整數或 '' 清空；列表 for_exam 與設定併用於按鈕「取消設為測驗用」
 * - 出題：POST /rag/tab/quiz/create（rag_id 必填；rag_tab_id、unit_name 選填可 ""，空 unit_name 後端用 outputs 第一筆）；評分：POST /rag/tab/quiz/grade、GET /rag/tab/quiz/grade-result/{job_id}，ready 時 result: { quiz_score, quiz_comments, rag_answer_id }
 * 上述 API 不需 llm_api_key。
 */
import { ref, computed, watch, onMounted, reactive, nextTick } from 'vue';
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
  apiUpdateRagTabName,
  apiGetRagForExamSetting,
  apiSetRagForExam,
  parseRagIdFromRagForExamSettingPayload,
  apiBuildRagZip,
  apiGenerateQuiz,
  is504OrNetworkError,
} from '../services/ragApi.js';
import { formatGradingResult } from '../utils/grading.js';
import { formatFileSize } from '../utils/formatFileSize.js';
import { submitGrade } from '../composables/useQuizGrading.js';
import {
  generateTabId,
  deriveRagNameFromTabId,
  deriveRagName,
  getRagUnitListString,
  parsePackTasksList,
  parseRagMetadataObject,
  DEFAULT_SYSTEM_INSTRUCTION,
  QUIZ_LEVEL_LABELS,
  normalizeQuizLevelLabel,
  quizLevelStringForApi,
  reconcileQuizUnitSelectSlot,
  findQuizUnitBySlotSelection,
  examOrRagQuizRowKey,
  examOrRagAnswerRowKey,
} from '../utils/rag.js';
import { useRagList } from '../composables/useRagList.js';
import { useRagTabState } from '../composables/useRagTabState.js';
import { usePackTasks } from '../composables/usePackTasks.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import QuizCard from '../components/QuizCard.vue';
import UnitSelectDropdown from '../components/UnitSelectDropdown.vue';
import TabRenameModal from '../components/TabRenameModal.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';

const props = defineProps({
  tabId: { type: String, required: true },
  /** 本機示範：不呼叫後端 API，畫面與 /create-test-bank 相同；由 CreateExamQuizBankDesignPage 傳入 */
  mockWithoutApi: { type: Boolean, default: false },
});

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** POST /rag/tab/upload-zip 允許的副檔名（與後端可解析格式一致） */
const UPLOAD_ALLOWED_EXTENSIONS = ['.zip', '.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const UPLOAD_ACCEPT_ATTR = UPLOAD_ALLOWED_EXTENSIONS.join(',');
function fileHasAllowedUploadExtension(file) {
  if (!file?.name) return false;
  const lower = file.name.toLowerCase();
  return UPLOAD_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const authStore = useAuthStore();

const ragListFetchEnabled = computed(() => !props.mockWithoutApi);
const { ragList, ragListLoading, ragListError, fetchRagList } = useRagList({
  fetchEnabled: ragListFetchEnabled,
});
const createRagLoading = ref(false);
const createRagError = ref('');
const renameRagTabModalOpen = ref(false);
/** 重新命名 API 用 Rag 主鍵（PUT /rag/tab/tab-name） */
const renameRagTabDraftRagId = ref(null);
const renameRagTabInitialName = ref('');
const renameRagTabSaving = ref(false);
const renameRagTabError = ref('');
const gradingLoading = ref(false);
const deleteRagLoading = ref(false);
/** 與左側標題相同：GET /system-settings/course-name 的 course_name，失敗時維持 AIQuiz */
const courseNameForPrompt = ref('AIQuiz');
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);

const { getTabState, currentState, isNewTabId } = useRagTabState(activeTabId, newTabIds, ragList, authStore, { defaultSystemInstruction: DEFAULT_SYSTEM_INSTRUCTION });

/** 本機示範用分頁 id（不呼叫 GET /rag/tabs；由 mockWithoutApi 灌入單筆假 RAG） */
const STATIC_MOCK_TAB_ID = 'static-mock-tab';

const showCreateBankMainForm = computed(
  () => ragList.value.length > 0 || showFormWhenNoData.value || props.mockWithoutApi
);
const showStepperSection = computed(() => props.mockWithoutApi || !!activeTabId.value);

/** 供 /create-test-bank_design：與正式頁相同資料結構的單筆 RAG（純前端，無 API） */
function buildStaticMockRag() {
  return {
    rag_tab_id: STATIC_MOCK_TAB_ID,
    rag_id: 999001,
    tab_name: '示範測驗題庫',
    unit_list: '第一章+第二章',
    file_metadata: {
      filename: '範例教材.zip',
      file_size: 2.5,
      second_folders: ['第一章', '第二章'],
    },
    rag_metadata: '{"demo":true}',
    chunk_size: 1000,
    chunk_overlap: 200,
    outputs: [
      { rag_tab_id: STATIC_MOCK_TAB_ID, rag_name: '示範單元甲', unit_name: '示範單元甲', filename: '甲.zip' },
      { rag_tab_id: STATIC_MOCK_TAB_ID, rag_name: '示範單元乙', unit_name: '示範單元乙', filename: '乙.zip' },
    ],
    quizzes: [
      {
        quiz_content: '（示範）請說明本單元的學習目標。',
        quiz_hint: '可參考教材章節開頭的學習重點。',
        quiz_answer_reference: '能簡要說出該單元欲培養的核心概念或能力。',
        rag_name: '示範單元甲',
        rag_id: 999001,
        quiz_level: '基礎',
      },
    ],
    answers: [],
    for_exam: false,
  };
}

watch(
  () => props.mockWithoutApi,
  (useMock) => {
    if (useMock) {
      ragList.value = [buildStaticMockRag()];
    }
  },
  { immediate: true }
);

function checkRagHasMetadata(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return rag.rag_metadata != null && (typeof rag.rag_metadata === 'string' ? String(rag.rag_metadata).trim() !== '' : true);
}

function checkRagHasList(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return getRagUnitListString(rag) !== '';
}

/** 至少一個出題單元，且每個出題單元至少一個單元（與出題群組區「確定」按鈕啟用條件一致） */
function isPackTasksListReady(list) {
  if (!Array.isArray(list) || list.length < 1) return false;
  return list.every((g) => Array.isArray(g) && g.length >= 1);
}

const hasRagMetadata = computed(() => checkRagHasMetadata(currentRagItem.value));
const hasRagListOrMetadata = computed(() => checkRagHasMetadata(currentRagItem.value) || checkRagHasList(currentRagItem.value));

/** 後端已有 rag_metadata 時，出題單元（unit_list）拆成條列：每個 li 為一群，群內資料夾以 + 連接 */
const ragListReadonlyGroups = computed(() => {
  const list = currentState.value.packTasksList;
  if (Array.isArray(list) && list.length > 0) {
    const groups = list.filter((g) => Array.isArray(g) && g.length > 0).map((g) => g.filter(Boolean));
    if (groups.length > 0) return groups;
  }
  const rag = currentRagItem.value;
  const unitStr = getRagUnitListString(rag);
  if (unitStr) return parsePackTasksList(unitStr);
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
  // fallback：Pack 尚未執行，從 /rags 的 unit_list（或 rag_list）推導
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

/** 當前 tab 對應的 RAG 項目（來自 GET /rag/tabs），僅在非「新增」tab 時有值 */
const currentRagItem = computed(() => {
  const id = activeTabId.value;
  if (!id || isNewTabId(id)) return null;
  return ragList.value.find(
    (rag) => (rag.rag_tab_id ?? rag.id ?? String(rag)) === id
  ) ?? null;
});

/** 與評分／題卡比對用：目前分頁 RAG 的 rag_id（與 confirmAnswer 取法一致） */
const currentRagIdForQuizCards = computed(() => {
  const state = currentState.value;
  const rag = currentRagItem.value;
  const v = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  return v != null && String(v).trim() !== '' ? v : null;
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
    if (props.mockWithoutApi) return;
    // 畫面不顯示 rag_id／rag_tab_id，改由此處輸出供除錯
    // eslint-disable-next-line no-console -- 依需求於開發者工具查看
    console.log('[CreateExamQuizBankPage] rag_id:', v.rag_id, 'rag_tab_id:', v.rag_tab_id);
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

/** 任一非同步載入或處理進行中時為 true，用於全螢幕遮罩 */
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

/** 用於顯示 file_metadata：僅在上傳 ZIP 後才有（上傳回傳的 zipResponseJson，或 GET /rag/tabs 該筆的 file_metadata）；未上傳則為 null */
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

/** mockWithoutApi 時仍顯示上傳區（與下方「已上傳」區塊並列，與正式頁相同元件） */
const showUploadFileSection = computed(
  () => props.mockWithoutApi || (!!activeTabId.value && !hasUploadedFileMetadata.value)
);

/** 建立流程 stepper 階段（固定為 1，不隨上傳／題庫進度變化） */
const createRagStepperPhase = 1;

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

/** 上傳教材檔大小（後端為 MB）：優先 file_metadata.file_size，否則 Rag 表頂層 file_size */
const uploadZipFileSizeDisplay = computed(() => {
  const meta = fileMetadataToShow.value;
  const rag = currentRagItem.value;
  let raw;
  if (meta && typeof meta === 'object' && meta.file_size != null) raw = meta.file_size;
  else if (rag && typeof rag === 'object' && rag.file_size != null) raw = rag.file_size;
  return formatFileSize(raw, 'MB');
});

/** 建置後 outputs[] 每項的 file_size（MB；頂層或 rag_metadata 內），僅在至少一項有大小時顯示 */
const ragBuildOutputSizeSummary = computed(() => {
  const rag = currentRagItem.value;
  if (!rag || !hasRagMetadata.value) return '';
  const metaObj = parseRagMetadataObject(rag);
  const outputs =
    Array.isArray(rag.outputs) && rag.outputs.length > 0
      ? rag.outputs
      : Array.isArray(metaObj?.outputs) && metaObj.outputs.length > 0
        ? metaObj.outputs
        : null;
  if (!outputs) return '';
  const parts = outputs.map((o) => {
    const sz = formatFileSize(o.file_size, 'MB');
    if (!sz) return null;
    const label = deriveRagName(o) || String(o.unit_name || o.rag_name || '').trim() || '—';
    return `${label} ${sz}`;
  }).filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
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
    label: '未命名測驗題庫',
  }))
);

/** 從 /rag/tabs 的 outputs（頂層或 rag_metadata 內）或 unit_list 推導 generateQuizUnits（與 ExamPage／tab/build-rag-zip 一致） */
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
  const ragListStr = getRagUnitListString(rag);
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
  const unitListStr = getRagUnitListString(rag);
  if (unitListStr) {
    state.packTasks = unitListStr;
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
      const id = examOrRagAnswerRowKey(a);
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(a);
      return acc;
    }, {});
    const quizzesWithAnswers = quizzes.map((q, i) => {
      const qKey = examOrRagQuizRowKey(q);
      const byId = q.answers ?? (qKey ? answersByQuizId[qKey] : undefined);
      const answers = (Array.isArray(byId) && byId.length > 0) ? byId : (ragAnswers[i] != null ? [ragAnswers[i]] : []);
      return { ...q, answers };
    });
    const metaParsed = parseRagMetadataObject(rag);
    const out0 = Array.isArray(rag.outputs) && rag.outputs.length > 0 ? rag.outputs[0] : metaParsed?.outputs?.[0];
    const firstRagName = (parsePackTasksList(getRagUnitListString(rag))[0]?.[0] ?? out0?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    const ragIdFallback = rag.rag_id ?? rag.id;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromRagQuiz(q, q.rag_name ?? firstRagName, ragIdFallback));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}

watch(currentRagItem, (rag) => syncRagItemToState(rag, currentState.value), { immediate: true });

/** mockWithoutApi：本機示範 RAG 同步後多開一題槽，同時顯示題卡與「產生題目」表單 */
watch(
  () => [
    props.mockWithoutApi,
    currentRagItem.value?.rag_tab_id,
    activeTabId.value,
    currentState.value?.quizSlotsCount,
  ],
  async () => {
    if (!props.mockWithoutApi) return;
    const rag = currentRagItem.value;
    if (!rag || String(rag.rag_tab_id ?? '') !== STATIC_MOCK_TAB_ID) return;
    await nextTick();
    const id = activeTabId.value;
    if (!id) return;
    const st = getTabState(id);
    const target = Math.max(Number(st.quizSlotsCount) || 0, 2);
    st.quizSlotsCount = target;
    while (st.cardList.length < target) st.cardList.push(null);
    if (st.cardList.length >= 2) st.cardList[1] = null;
    getSlotFormState(2);
  },
  { flush: 'post', immediate: true }
);

/** 由 /rag/tabs 的 quiz（含 answers）組成一張題目卡片，供測試問題區塊顯示；批改結果從作答紀錄的 answer_metadata / answer_feedback_metadata 格式化 */
function buildCardFromRagQuiz(quiz, ragName, ragIdFallback) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? null;
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) || (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : ''))
    : '';
  const generateLevel = normalizeQuizLevelLabel(quiz.quiz_level);
  const rid = quiz.rag_id ?? quiz.ragId ?? ragIdFallback;
  const ragIdStr = rid != null && String(rid).trim() !== '' ? String(rid) : null;
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? '',
    hint: quiz.quiz_hint ?? '',
    referenceAnswer: quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? '',
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.rag_name || '').trim() || null,
    rag_id: ragIdStr,
    quiz_answer: latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? '',
    hintVisible: false,
    confirmed: !!latestAnswer,
    gradingResult,
    gradingResponseJson: latestAnswer ?? null,
    generateQuizResponseJson: null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: null,
    rag_quiz_id: quiz.rag_quiz_id ?? quiz.quiz_id ?? null,
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
  if (props.mockWithoutApi) return;
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

/** GET /rag/tabs 由 useRagList 內 watch(immediate) 載入；此處僅試題用設定、檔案欄位、課程名稱 */
onMounted(() => {
  refreshRagForExamSetting();
  clearZipFileInput();
  fetchCourseNameForPrompt();
});

/** 設為測驗用（PUT system-settings rag-for-exam-*） */
async function setRagForExam() {
  if (props.mockWithoutApi) return;
  const rag = currentRagItem.value;
  if (!rag || isNewTabId(activeTabId.value)) return;
  const ragId = rag.rag_id ?? rag.id;
  if (ragId == null || ragId === '') {
    const state = getTabState(activeTabId.value);
    state.forExamError = '無法取得題庫編號，請先建立分頁並上傳教材檔';
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
  if (props.mockWithoutApi) return;
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
  if (props.mockWithoutApi) return;
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
    await apiDeleteRag(fileId);
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

/** tab/create 回傳的 created_at 與 tab 標籤用 name（key = rag_id） */
const ragCreatedAtMap = ref({});

/** 點「新增」：建立 RAG，成功後重整列表並切到新 tab */
async function addNewTab() {
  if (props.mockWithoutApi) {
    createRagError.value = '';
    createRagLoading.value = false;
    const personId = getPersonId(authStore);
    const ragTabId = personId ? generateTabId(personId) : `new-design-${Date.now()}`;
    if (!newTabIds.value.includes(ragTabId)) {
      newTabIds.value = [...newTabIds.value, ragTabId];
    }
    activeTabId.value = ragTabId;
    clearZipFileInput();
    showFormWhenNoData.value = true;
    return;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    createRagError.value = '請先登入';
    return;
  }
  createRagError.value = '';
  createRagLoading.value = true;
  const ragTabId = generateTabId(personId);
  const tabName = '未命名測驗題庫';
  try {
    const data = await apiCreateUnit(personId, ragTabId, tabName);
    if (data?.rag_id != null && data?.created_at != null) {
      ragCreatedAtMap.value = { ...ragCreatedAtMap.value, [String(data.rag_id)]: data.created_at };
    }
    ragListError.value = '';
    await fetchRagList();
    if (data?.rag_tab_id != null) activeTabId.value = String(data.rag_tab_id);
    clearZipFileInput();
    if (ragList.value.length === 0) showFormWhenNoData.value = true;
  } catch (err) {
    createRagError.value = err.message || '建立測驗題庫失敗';
  } finally {
    createRagLoading.value = false;
  }
}

/** 取得 RAG 顯示名稱（用於 tab 標籤）；以 tab_name／rag_name 為主，預設為 rag_tab_id 底線後的時間 */
function getRagTabLabel(rag) {
  if (rag == null) return '題庫';
  if (typeof rag === 'string') return ragCreatedAtMap.value[rag] ?? String(rag);
  if (typeof rag !== 'object') return String(rag);
  const id = rag.rag_id ?? rag.rag_tab_id ?? rag.id;
  const fromMap = id != null ? ragCreatedAtMap.value[String(id)] : undefined;
  const label = (rag.tab_name != null && String(rag.tab_name).trim() !== '')
    ? String(rag.tab_name).trim()
    : (rag.rag_name != null && String(rag.rag_name).trim() !== '')
      ? String(rag.rag_name).trim()
      : deriveRagNameFromTabId(rag.rag_tab_id ?? rag.id ?? '');
  return (label && label !== '') ? label : (fromMap ?? rag.file_metadata?.filename ?? rag.course_name ?? rag.filename ?? rag.created_at ?? deriveRagNameFromTabId(rag.rag_tab_id ?? '') ?? '題庫');
}

/** 編輯分頁名稱用：優先後端 tab_name／rag_name，無則空 */
function getRagTabNameForEdit(rag) {
  if (!rag || typeof rag !== 'object') return '';
  const t = rag.tab_name;
  if (t != null && String(t).trim() !== '') return String(t).trim();
  const r = rag.rag_name;
  if (r != null && String(r).trim() !== '') return String(r).trim();
  return '';
}

function openRenameRagTab(tabId) {
  const rag = ragList.value.find((x) => String(x.rag_tab_id ?? x.id ?? '') === String(tabId));
  const rid = rag?.rag_id;
  renameRagTabDraftRagId.value =
    rid != null && String(rid).trim() !== '' ? Number(rid) : null;
  renameRagTabInitialName.value = getRagTabNameForEdit(rag) || getRagTabLabel(rag);
  renameRagTabError.value = '';
  renameRagTabModalOpen.value = true;
}

async function onRenameRagTabSave(name) {
  if (!name) {
    renameRagTabError.value = '請輸入名稱';
    return;
  }
  if (props.mockWithoutApi) {
    const rid = renameRagTabDraftRagId.value;
    const rag = ragList.value.find(
      (x) => x != null && Number(x.rag_id) === Number(rid)
    );
    if (rag && typeof rag === 'object') rag.tab_name = String(name).trim();
    renameRagTabModalOpen.value = false;
    renameRagTabError.value = '';
    return;
  }
  const rid = renameRagTabDraftRagId.value;
  if (rid == null || !Number.isFinite(rid) || rid < 1) {
    renameRagTabError.value = '找不到此測驗題庫，請重新整理頁面後再試';
    return;
  }
  renameRagTabSaving.value = true;
  renameRagTabError.value = '';
  try {
    await apiUpdateRagTabName(rid, name);
    await fetchRagList();
    renameRagTabModalOpen.value = false;
  } catch (err) {
    renameRagTabError.value = err.message || '更新失敗';
  } finally {
    renameRagTabSaving.value = false;
  }
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
  if (props.mockWithoutApi) {
    const state = currentState.value;
    if (!state.uploadedZipFile) {
      state.zipError = '請先選擇要上傳的檔案';
      return;
    }
    const tabId = activeTabId.value;
    if (isNewTabId(tabId) || !tabId) {
      state.zipError = '請先按「＋」建立測驗題庫分頁，再上傳檔案';
      return;
    }
    state.zipLoading = true;
    state.zipError = '';
    try {
      const name = state.uploadedZipFile?.name || '本機檔案.zip';
      const rag = currentRagItem.value;
      const rid = rag?.rag_id ?? rag?.id ?? 999001;
      state.zipResponseJson = {
        filename: name,
        file_size: 0.5,
        second_folders: ['示範章節甲', '示範章節乙'],
        rag_id: rid,
        rag_tab_id: tabId,
      };
      state.zipTabId = String(tabId);
      state.zipFileName = name;
      state.zipSecondFolders = state.zipResponseJson.second_folders;
    } finally {
      state.zipLoading = false;
    }
    return;
  }
  const state = currentState.value;
  if (!state.uploadedZipFile) {
    state.zipError = '請先選擇要上傳的檔案';
    return;
  }
  const tabId = activeTabId.value;
  if (isNewTabId(tabId) || !tabId) {
    state.zipError = '請先按「＋」建立測驗題庫分頁，再上傳檔案';
    return;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    state.zipError = '請先登入';
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
      ? '服務正在啟動（約需一分鐘），請稍後再試'
      : err.message || '上傳失敗';
    state.zipSecondFolders = [];
    state.zipResponseJson = null;
  } finally {
    state.zipLoading = false;
  }
}

/** 出題群組確定：tab/build-rag-zip（按鈕文案「確定」） */
async function confirmPack() {
  if (props.mockWithoutApi) {
    const state = currentState.value;
    const fileId = String(state.zipTabId ?? '').trim();
    const unitList = state.packTasks?.trim();
    if (!fileId) {
      state.packError = '請先上傳教材檔，完成後再建立題庫';
      return;
    }
    if (!isPackTasksListReady(state.packTasksList ?? [])) {
      state.packError = '請至少建立一個出題單元，且每個出題單元至少包含一個單元';
      return;
    }
    if (!unitList) {
      state.packError = '請輸入單元清單（例：220222+220301 或 220222,220301+220302）';
      return;
    }
    state.packLoading = true;
    state.packError = '';
    try {
      const mock = buildStaticMockRag();
      state.packResponseJson = {
        rag_tab_id: fileId,
        outputs: mock.outputs,
      };
      state.ragMetadata =
        typeof state.packResponseJson === 'string'
          ? state.packResponseJson
          : JSON.stringify(state.packResponseJson, null, 2);
    } finally {
      state.packLoading = false;
    }
    return;
  }
  const state = currentState.value;
  const fileId = String(state.zipTabId ?? '').trim();
  const unitList = state.packTasks?.trim();
  const personId = getPersonId(authStore);
  if (!fileId) {
    state.packError = '請先上傳教材檔，完成後再建立題庫';
    return;
  }
  if (!personId) {
    state.packError = '請先登入';
    return;
  }
  if (!isPackTasksListReady(state.packTasksList ?? [])) {
    state.packError = '請至少建立一個出題單元，且每個出題單元至少包含一個單元';
    return;
  }
  if (!unitList) {
    state.packError = '請輸入單元清單（例：220222+220301 或 220222,220301+220302）';
    return;
  }
  state.packLoading = true;
  state.packError = '';
  state.packResponseJson = null;
  try {
    state.packResponseJson = await apiBuildRagZip({
      rag_tab_id: fileId,
      person_id: personId,
      unit_list: unitList,
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

/** 難度選項；tab/quiz/create 的 quiz_level 直接送「基礎」／「進階」字串 */
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
function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed, ragId, ragQuizId) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const ragIdStr = ragId != null && String(ragId).trim() !== '' ? String(ragId) : null;
  const card = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    hint: hint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    rag_id: ragIdStr,
    quiz_answer: '',
    hintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
    rag_quiz_id: ragQuizId ?? null,
  };
  state.cardList[slotIndex - 1] = card;
}

/** 產生題目 */
async function generateQuiz(slotIndex) {
  if (props.mockWithoutApi) {
    const state = currentState.value;
    const slotState = getSlotFormState(slotIndex);
    const selectedUnit = findQuizUnitBySlotSelection(generateQuizUnits.value, slotState.generateQuizTabId);
    if (!selectedUnit) {
      slotState.error = '請先選擇單元';
      return;
    }
    const unitName = String(selectedUnit.unit_name ?? selectedUnit.rag_name ?? '').trim();
    const ragName = selectedUnit.rag_name?.trim() || unitName;
    const ragId = currentRagItem.value?.rag_id ?? currentRagItem.value?.id ?? state?.zipResponseJson?.rag_id ?? 999001;
    slotState.loading = true;
    slotState.error = '';
    try {
      setCardAtSlot(
        slotIndex,
        '（示範）本機預覽題目，不會呼叫後端出題 API。',
        '可參考教材中與「' + unitName + '」相關的段落。',
        selectedUnit?.filename ?? '',
        '（示範參考答案）',
        ragName,
        { demo: true },
        filterDifficulty.value,
        (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
        ragId,
        null
      );
    } finally {
      slotState.loading = false;
    }
    return;
  }
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
    slotState.error = '無法取得題庫編號，請先上傳教材或重新整理頁面';
    return;
  }
  if (!generateQuizUnits.value.length) {
    slotState.error = '請先在「出題單元」區按「確定」完成題庫建立，或重新整理頁面';
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
    const rawRagQuizId =
      data.rag_quiz_id != null ? Number(data.rag_quiz_id) : (data.quiz_id != null ? Number(data.quiz_id) : null);
    const ragQuizId = Number.isFinite(rawRagQuizId) ? rawRagQuizId : null;
    setCardAtSlot(
      slotIndex,
      quizContent,
      hintText,
      targetFilename,
      referenceAnswerText,
      ragName,
      data,
      filterDifficulty.value,
      (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
      ragId,
      ragQuizId
    );
  } catch (err) {
    slotState.error = err.message || '產生題目失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

/** 評分：POST /rag/tab/quiz/grade；body: rag_id、rag_tab_id、rag_quiz_id、quiz_content、quiz_answer、quiz_answer_reference（皆 string，選填可 ""）；回傳 202 + job_id；輪詢 GET /rag/tab/quiz/grade-result/{job_id}；ready 時 result: { quiz_score, quiz_comments, rag_answer_id }。 */
async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
  if (props.mockWithoutApi) {
    applyMockGradingPreview(item);
    return;
  }
  const state = currentState.value;
  const rag = currentRagItem.value;
  const activeRagId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  const cardRag = item?.rag_id;
  if (
    activeRagId != null &&
    cardRag != null &&
    String(activeRagId).trim() !== '' &&
    String(cardRag).trim() !== '' &&
    String(activeRagId).trim() !== String(cardRag).trim()
  ) {
    return;
  }
  const sourceTabId = String(state.zipTabId ?? '').trim();
  const ragId = activeRagId;
  if (!sourceTabId) {
    item.confirmed = true;
    item.gradingResult = '請先上傳教材並完成題庫建立，再進行批改。';
    return;
  }
  if (ragId == null) {
    item.confirmed = true;
    item.gradingResult = '無法批改：請先上傳教材或重新整理頁面後再試。';
    return;
  }
  gradingLoading.value = true;
  try {
    await submitGrade(item, { sourceTabId, ragId });
  } finally {
    gradingLoading.value = false;
  }
}

/** 本機示範：預覽批改結果（不呼叫評分 API） */
function applyMockGradingPreview(item) {
  const preview = JSON.stringify({
    quiz_score: 4,
    quiz_comments: ['示範：本機預覽不連後端。', '內容大致正確，可再補充例證。'],
  });
  item.confirmed = true;
  item.gradingResult = formatGradingResult(preview) || preview;
}
</script>

<template>
  <div
    class="d-flex flex-column h-100 position-relative"
    :class="mockWithoutApi ? 'overflow-hidden my-bgcolor-black' : 'my-bgcolor-page-block'"
  >
    <LoadingOverlay
      :is-visible="isAnyLoading"
      loading-text="請稍候，正在載入或處理..."
    />
    <TabRenameModal
      v-model="renameRagTabModalOpen"
      :initial-name="renameRagTabInitialName"
      :saving="renameRagTabSaving"
      :error="renameRagTabError"
      title="修改測驗題庫分頁名稱"
      @save="onRenameRagTabSave"
    />
    <header v-if="mockWithoutApi" class="flex-shrink-0 my-bgcolor-black py-3 px-3 px-md-4">
      <div class="container-fluid px-0">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
            <p class="my-font-xl-600 my-color-white text-break mb-0">建立測驗題庫</p>
          </div>
        </div>
      </div>
    </header>
    <div v-else class="navbar navbar-expand-lg my-bgcolor-surface flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand my-font-xl-400 mb-0">建立測驗題庫</span>
      </div>
    </div>
    <div
      class="flex-shrink-0 my-rag-tabs-bar"
      :class="mockWithoutApi ? 'my-rag-tabs-bar--design my-bgcolor-black my-rag-tabs-bar--design-fullwidth-bottom' : 'my-bgcolor-surface'"
    >
      <div
        class="d-flex justify-content-center w-100 px-4"
        :class="mockWithoutApi ? 'align-items-end pb-0' : 'align-items-center my-border-bottom-border-muted'"
      >
        <template v-if="ragListLoading">
          <span class="my-font-sm-400 my-color-gray-light">載入中...</span>
        </template>
        <template v-else-if="ragItems.length === 0 && newTabItems.length === 0">
          <div
            class="w-100 d-flex justify-content-center"
            :class="mockWithoutApi ? 'py-0' : 'py-2'"
          >
            <button
              type="button"
              class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle"
              title="新增分頁"
              :aria-label="createRagLoading ? '建立中' : '新增分頁'"
              :aria-busy="createRagLoading"
              :disabled="mockWithoutApi ? false : createRagLoading"
              @click="addNewTab"
            >
              <i
                class="fa-solid"
                :class="createRagLoading ? 'fa-spinner fa-spin' : 'fa-plus'"
                aria-hidden="true"
              />
            </button>
          </div>
        </template>
        <template v-else>
          <ul class="nav nav-tabs border-bottom-0">
            <li v-for="item in ragItems" :key="'rag-' + item._tabId" class="nav-item">
              <div
                role="tab"
                class="nav-link d-flex align-items-center gap-1"
                :class="{ active: activeTabId === item._tabId }"
                :aria-current="activeTabId === item._tabId ? 'page' : undefined"
              >
                <span
                  class="flex-grow-1 text-start pe-2"
                  style="cursor: pointer"
                  @click="activeTabId = item._tabId"
                >
                  {{ item._label }}
                </span>
                <button
                  v-if="activeTabId === item._tabId"
                  type="button"
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-light pe-2"
                  title="重新命名分頁"
                  :disabled="mockWithoutApi ? false : deleteRagLoading || renameRagTabSaving"
                  @click.stop="openRenameRagTab(item._tabId)"
                >
                  <i class="fa-solid fa-pen" aria-hidden="true" />
                </button>
                <span
                  v-else
                  class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn pe-2"
                  aria-hidden="true"
                />
                <span
                  v-if="item._isExamRag"
                  class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn"
                  title="試卷用題庫"
                  role="img"
                >
                  <span
                    class="rounded-circle d-inline-block"
                    :class="mockWithoutApi ? 'my-bgcolor-blue' : 'my-bgcolor-green'"
                    style="width: 0.5rem; height: 0.5rem"
                  />
                </span>
                <button
                  v-else-if="activeTabId === item._tabId"
                  type="button"
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-light"
                  title="刪除此出題單元"
                  :disabled="mockWithoutApi ? false : deleteRagLoading || renameRagTabSaving"
                  @click.stop="onDeleteRagTab(item._tabId)"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true" />
                </button>
                <span
                  v-else-if="!item._isExamRag"
                  class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn"
                  aria-hidden="true"
                />
              </div>
            </li>
            <li v-for="item in newTabItems" :key="'new-' + item.id" class="nav-item">
              <button
                type="button"
                class="nav-link d-flex align-items-center gap-1 w-100 text-start border-0 bg-transparent"
                :class="{ active: activeTabId === item.id }"
                :aria-current="activeTabId === item.id ? 'page' : undefined"
                @click="activeTabId = item.id"
              >
                <span class="flex-grow-1 text-start pe-2">{{ item.label }}</span>
              </button>
            </li>
            <li class="nav-item d-flex align-items-center ms-2">
              <button
                type="button"
                title="新增分頁"
                :aria-label="createRagLoading ? '建立中' : '新增分頁'"
                :aria-busy="createRagLoading"
                class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle"
                :class="{ 'mb-2': !mockWithoutApi }"
                :disabled="mockWithoutApi ? false : createRagLoading"
                @click="addNewTab"
              >
                <i
                  class="fa-solid"
                  :class="createRagLoading ? 'fa-spinner fa-spin' : 'fa-plus'"
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="ragListError" class="my-alert-warning-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ ragListError }}
      </div>
      <div v-if="createRagError" class="my-alert-danger-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ createRagError }}
      </div>
    </div>

    <!-- 內容區：/create-test-bank 白底；/create-test-bank_design 與 DesignPage 同黑底與欄寬 -->
    <div
      class="flex-grow-1 overflow-auto"
      :class="mockWithoutApi ? 'my-bgcolor-black create-exam-quiz-bank--design-mock' : 'my-bgcolor-surface px-4 py-5'"
    >
      <div :class="mockWithoutApi ? 'container-fluid px-3 px-md-4 py-4' : ''">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <!-- 無資料時不顯示表單，點「+」後才顯示；mockWithoutApi 時仍顯示示範表單 -->
      <template v-if="showCreateBankMainForm">
      <!-- 建立流程 stepper：依 file_metadata / rag_metadata 亮起 1～3 步 -->
      <div v-if="showStepperSection" class="my-create-rag-stepper text-start my-page-block-spacing">
        <div class="d-flex justify-content-between align-items-start gap-2 gap-sm-3 w-100">
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="my-create-rag-stepper-num rounded-circle d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-600"
              :class="createRagStepperPhase >= 1 ? 'my-create-rag-stepper-num--on' : 'my-create-rag-stepper-num--off'"
            >1</span>
            <span
              class="mt-2"
              :class="createRagStepperPhase >= 1 ? 'my-color-black my-font-sm-600' : 'my-color-gray-light my-font-sm-400'"
            >上傳檔案</span>
          </div>
          <div
            class="my-create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
            :class="createRagStepperPhase >= 2 ? 'my-create-rag-stepper-line--on' : ''"
            aria-hidden="true"
          />
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="my-create-rag-stepper-num rounded-circle d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-600"
              :class="createRagStepperPhase >= 2 ? 'my-create-rag-stepper-num--on' : 'my-create-rag-stepper-num--off'"
            >2</span>
            <span
              class="mt-2"
              :class="createRagStepperPhase >= 2 ? 'my-color-black my-font-sm-600' : 'my-color-gray-light my-font-sm-400'"
            >建立測驗題庫</span>
          </div>
          <div
            class="my-create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
            :class="createRagStepperPhase >= 3 ? 'my-create-rag-stepper-line--on' : ''"
            aria-hidden="true"
          />
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="my-create-rag-stepper-num rounded-circle d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-600"
              :class="createRagStepperPhase >= 3 ? 'my-create-rag-stepper-num--on' : 'my-create-rag-stepper-num--off'"
            >3</span>
            <span
              class="mt-2"
              :class="createRagStepperPhase >= 3 ? 'my-color-black my-font-sm-600' : 'my-color-gray-light my-font-sm-400'"
            >測試問題</span>
          </div>
        </div>
      </div>
      <!-- 尚無 file_metadata 時顯示上傳區；mockWithoutApi 時固定一併顯示（標題與 DesignPage 深灰區塊內 h2 同規） -->
      <section v-if="showUploadFileSection" class="text-start my-page-block-spacing">
        <div class="rounded-4 my-bgcolor-gray-dark p-3 p-lg-4 mb-4">
          <h2 class="my-font-lg-600 my-color-white text-break mb-4">上傳檔案</h2>
          <input
            ref="zipFileInputRef"
            type="file"
            :accept="UPLOAD_ACCEPT_ATTR"
            class="d-none"
            @change="onZipChange"
          >
          <div
            class="my-zip-drop-zone rounded border border-dashed text-center position-relative p-5"
            :class="{ 'my-zip-drop-zone-over': isZipDragOver }"
            @dragover="onZipDragOver"
            @dragenter="onZipDragOver"
            @dragleave="onZipDragLeave"
            @drop="onZipDrop"
            @click="openZipFileDialog()"
          >
            <template v-if="currentState.zipLoading">
              <span class="my-font-sm-400 my-color-gray-light">上傳中...</span>
            </template>
            <template v-else>
              <template v-if="currentState.zipFileName">
                <span class="my-font-sm-400 my-color-white">{{ currentState.zipFileName }}</span>
                <div class="my-font-sm-400 my-color-gray-light mt-1">點擊可重新選擇檔案</div>
              </template>
              <span v-else class="my-font-sm-400 my-color-gray-light">拖曳檔案到這裡，或點擊選擇檔案</span>
              <div class="my-font-sm-400 my-color-gray-light mt-2">
                可解析的檔案副檔名：.zip、.pdf、.doc、.docx、.ppt、.pptx
              </div>
            </template>
          </div>
          <div v-if="currentState.zipError" class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0">
            {{ currentState.zipError }}
          </div>
          <div class="d-flex justify-content-end mt-3">
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
              :disabled="currentState.zipLoading || !currentState.zipFileName"
              @click.stop="confirmUploadZip"
            >
              確定上傳
            </button>
          </div>
        </div>
      </section>
      <!-- 建立 RAG：要有 file_metadata 才顯示；已有 rag_metadata 時僅純文字顯示出題單元／chunk／規範 -->
      <div
        v-if="fileMetadataToShow != null"
        class="text-start my-page-block-spacing"
        :class="{ 'pe-none my-color-gray-light': !hasRagMetadata && packGroupsEditBlocked }"
      >
        <div class="my-bgcolor-page-block rounded-3 p-3 p-lg-4 mb-4">
        <div class="mb-3">
          <div class="my-font-sm-600 my-color-gray-light mb-1">上傳檔案名稱</div>
          <div class="my-font-sm-400 text-break">{{ uploadedZipDisplayName }}</div>
          <div v-if="uploadZipFileSizeDisplay" class="my-font-sm-400 my-color-gray-light mt-1">檔案大小：{{ uploadZipFileSizeDisplay }}</div>
        </div>

        <template v-if="hasRagMetadata">
          <div class="mb-3">
            <div class="my-font-sm-600 my-color-gray-light mb-1">出題單元</div>
            <div v-if="ragListReadonlyGroups.length" class="my-font-sm-400 text-break">{{ ragListReadonlyInlineText }}</div>
            <div v-else class="my-font-sm-400 my-color-gray-light">—</div>
          </div>
          <div v-if="ragBuildOutputSizeSummary" class="mb-3">
            <div class="my-font-sm-600 my-color-gray-light mb-1">建置輸出檔大小</div>
            <div class="my-font-sm-400 text-break">{{ ragBuildOutputSizeSummary }}</div>
          </div>
          <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
            <div>
              <div class="my-font-sm-600 my-color-gray-light mb-1">分段長度（字元）</div>
              <div class="my-font-sm-400">{{ chunkSize }}</div>
            </div>
            <div>
              <div class="my-font-sm-600 my-color-gray-light mb-1">分段重疊（字元）</div>
              <div class="my-font-sm-400">{{ chunkOverlap }}</div>
            </div>
          </div>
          <div class="mb-3">
            <div class="my-font-sm-400 mb-1">出題說明（給 AI）</div>
            <div class="my-font-sm-400 border rounded my-bgcolor-surface-tint p-3">
              你是一個「{{ courseNameForPrompt }}」課程的教授，請給學生設計試卷題目：<br>
              【出題規範】<br>
              請根據輸入的「參考內容」設計試卷題目。<br>
              **請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。**<br>
              題目難度：{quiz_level}。<br>
              <span class="lh-base text-break my-color-red">{{ (currentState.systemInstruction ?? '').trim() || '—' }}</span><br>
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
              :class="
                currentRagIsExamRag
                  ? 'btn rounded-pill my-font-md-400 my-button-white-border'
                  : 'btn rounded-pill my-font-md-400 my-button-blue'
              "
              :disabled="currentState.forExamLoading"
              @click="currentRagIsExamRag ? clearRagForExam() : setRagForExam()"
            >
              {{ currentRagIsExamRag ? '取消設為測驗用' : '設為測驗用' }}
            </button>
          </div>
          <div v-if="currentState.forExamError" class="my-alert-danger-soft my-font-sm-400 py-2 mb-0 mt-2">
            {{ currentState.forExamError }}
          </div>
        </template>

        <template v-else>
          <!-- 課程：可拖曳至出題單元 -->
          <div v-if="secondFoldersFull.length" class="mb-3">
            <label class="form-label my-font-sm-600 my-color-gray-light mb-1">資料夾</label>
            <div class="d-flex flex-wrap gap-2 rounded border my-bgcolor-surface p-2">
              <div
                v-for="(name, i) in secondFoldersFull"
                :key="'sf-' + i"
                class="badge my-badge-surface-outline user-select-none px-2 py-1"
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
            <label class="form-label my-font-sm-600 my-color-gray-light mb-0">出題單元</label>
            <div class="d-flex flex-wrap align-items-start gap-2">
              <template v-for="(group, gi) in ragListDisplayGroups" :key="'rg-' + gi">
                <div
                  class="my-pack-drop-target border rounded d-flex align-items-center gap-1 position-relative my-bgcolor-surface-tint p-2"
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
                      class="badge my-bgcolor-blue my-color-white d-inline-flex align-items-center gap-1 px-2 py-1"
                      style="cursor: grab;"
                      draggable="true"
                      role="button"
                      @dragstart="onDragStartTag($event, tag, true, gi, ti)"
                      @dragend="onDragEndTag"
                    >
                      {{ tag }}
                      <span
                        class="my-color-gray-light ms-1"
                        style="cursor: pointer;"
                        @click.stop="removeFromRagList(gi, ti)"
                      >×</span>
                    </div>
                    <span v-if="!group.length" class="my-color-gray-light my-font-sm-400">拖入此處</span>
                  </div>
                  <button
                    v-if="(currentState.packTasksList || []).length > 0"
                    type="button"
                    class="btn btn-link my-color-gray-light text-decoration-none flex-shrink-0 p-0 ms-1"
                    style="min-width: 1.5rem;"
                    @click.stop="removeRagListGroup(gi)"
                  >
                    ×
                  </button>
                </div>
              </template>
              <div
                class="btn my-btn-outline-blue-hollow d-flex justify-content-center align-items-center my-pack-drop-target"
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
            <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
              <button
                type="button"
                class="btn my-btn-outline-neutral my-font-sm-400"
                :disabled="!secondFoldersFull.length"
                @click="addAllSecondFoldersAsGroups"
              >
                每個資料夾各新增一組出題單元
              </button>
              <button
                type="button"
                class="btn my-btn-outline-neutral my-font-sm-400"
                :disabled="!secondFoldersFull.length"
                title="在現有出題單元之後再追加一組；該組包含全部資料夾，打包時以 + 連成同一題庫"
                @click="setAllSecondFoldersAsSingleGroup"
              >
                新增一組出題單元（合併全部資料夾）
              </button>
            </div>
          </div>

          <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
            <div style="min-width: 180px; flex: 1 1 180px; max-width: 280px;">
              <label class="form-label my-font-sm-600 my-color-gray-light mb-1">分段長度（字元）</label>
              <input
                v-model.number="chunkSize"
                type="number"
                min="1"
                step="1"
                class="form-control form-control-sm"
                placeholder="1000"
              >
            </div>
            <div style="min-width: 180px; flex: 1 1 180px; max-width: 280px;">
              <label class="form-label my-font-sm-600 my-color-gray-light mb-1">分段重疊（字元）</label>
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
            <label class="form-label my-font-sm-600 my-color-gray-light mb-1">出題說明（給 AI）</label>
            <div class="my-font-sm-400 border rounded my-bgcolor-surface-tint p-3">
              【出題規範】<br>
              請根據輸入的「參考內容」設計試卷題目。<br>
              請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。<br>
              題目難度：{quiz_level}。<br>
              <textarea
                v-model="currentState.systemInstruction"
                class="form-control form-control-sm font-monospace my-font-sm-400 my-3"
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
          <div class="d-flex justify-content-end mt-3">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="packGroupsEditBlocked || !isPackTasksListReady(currentState.packTasksList ?? [])"
              @click="confirmPack"
            >
              確定
            </button>
          </div>
          <div v-if="currentState.packError" class="my-alert-danger-soft my-font-sm-400 py-2 mb-2">
            {{ currentState.packError }}
          </div>
        </template>
        </div>
      </div>
      <!-- 測試問題：有 rag_metadata（本機 Pack 或後端已帶入）即顯示 -->
      <div
        v-if="currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== ''"
        class="text-start my-page-block-spacing"
        :class="{ 'my-color-gray-light': ragGenerateDisabled }"
      >
        <div class="my-font-lg-600 my-color-white border-bottom pb-2 mb-4">測試問題</div>

        <!-- 題目區塊：每按一次「新增題目」才多一個「第 n 題」；按鈕固定在最下面 -->
        <div class="mb-4">
          <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
            <!-- 第 slotIndex 題：若已有該題卡片則顯示卡片，否則顯示產生題目表單 -->
            <template v-if="currentState.cardList[slotIndex - 1]">
              <QuizCard
                :card="currentState.cardList[slotIndex - 1]"
                :slot-index="slotIndex"
                :course-name="courseNameForPrompt"
                :current-rag-id="currentRagIdForQuizCards"
                :skip-rag-mismatch-guard="mockWithoutApi"
                @toggle-hint="toggleHint"
                @confirm-answer="confirmAnswer"
                @update:quiz_answer="(val) => { currentState.cardList[slotIndex - 1].quiz_answer = val }"
              />
            </template>
            <template v-else>
              <!-- 尚未產生：顯示產生題目表單（第 slotIndex 題，每題獨立不連動） -->
              <div class="my-bgcolor-page-block rounded-3 p-3 p-lg-4 mb-4" :class="{ 'mt-4': slotIndex > 1 }">
                <div class="my-font-lg-600 border-bottom pb-2 mb-3">第 {{ slotIndex }} 題</div>
                <div class="text-start pt-3">
                  <div class="d-flex flex-wrap align-items-end gap-3">
                    <div class="flex-grow-1 min-w-0" style="min-width: 10rem">
                      <label class="form-label my-font-sm-600 my-color-gray-light mb-1" :for="`rag-quiz-unit-${slotIndex}-toggle`">單元</label>
                      <UnitSelectDropdown
                        v-model="getSlotFormState(slotIndex).generateQuizTabId"
                        :options="generateQuizUnits"
                        :menu-id="`rag-quiz-unit-${slotIndex}`"
                      />
                    </div>
                    <div>
                      <label class="form-label my-font-sm-600 my-color-gray-light d-block mb-1">難度</label>
                      <div class="btn-group btn-group-sm" role="group">
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
                          <label class="btn my-btn-outline-blue-hollow" :for="'rag-quiz-diff-' + slotIndex + '-' + di">{{ opt }}</label>
                        </template>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-primary"
                      :disabled="getSlotFormState(slotIndex).loading || !String(getSlotFormState(slotIndex).generateQuizTabId || '').trim()"
                      @click="generateQuiz(slotIndex)"
                    >
                      產生題目
                    </button>
                  </div>
                  <div v-if="getSlotFormState(slotIndex).error" class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0">
                    {{ getSlotFormState(slotIndex).error }}
                  </div>
                </div>
              </div>
            </template>
          </template>

          <!-- 新增題目按鈕：固定在最下面，每按一次多一個「第 n 題」區塊 -->
          <div class="d-flex justify-content-center pt-2 mb-0">
            <button
              type="button"
              class="btn btn-primary"
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
  </div>
</template>

<style scoped>
.my-zip-drop-zone {
  cursor: pointer;
  border-width: 2px;
  border-color: var(--my-drop-zone-border);
  background: var(--my-drop-zone-bg);
}
.my-zip-drop-zone:hover:not(.my-zip-drop-zone-disabled) {
  border-color: var(--my-color-blue);
  background: var(--my-drop-zone-hover-bg);
}
.my-zip-drop-zone-over {
  border-color: var(--my-color-blue) !important;
  background: var(--my-drop-zone-active-bg) !important;
}
/* 上傳外層為稿頁同款 my-bgcolor-gray-dark 時，內嵌拖放區比照 DesignPage 深灰塊內黑底票 */
.my-bgcolor-gray-dark .my-zip-drop-zone {
  border-color: color-mix(in srgb, var(--my-color-white) 28%, transparent);
  background: var(--my-color-black);
}
.my-bgcolor-gray-dark .my-zip-drop-zone:hover:not(.my-zip-drop-zone-disabled) {
  border-color: var(--my-color-blue);
  background: color-mix(in srgb, var(--my-color-blue) 14%, var(--my-color-black));
}
.my-bgcolor-gray-dark .my-zip-drop-zone-over {
  background: color-mix(in srgb, var(--my-color-blue) 22%, var(--my-color-black)) !important;
}
.my-zip-drop-zone-disabled {
  cursor: not-allowed;
  border-color: color-mix(in srgb, var(--my-color-black) 20%, transparent);
  background-color: color-mix(in srgb, var(--my-color-surface) 88%, var(--my-color-gray-light));
  color: var(--my-color-gray-light);
}
.my-pack-drop-target.my-pack-drop-active {
  background-color: var(--my-drop-pack-active-bg) !important;
  border-color: var(--my-color-blue) !important;
}

/* 建立測驗題庫頁：流程 stepper（1–2–3） */
.my-create-rag-stepper-num {
  width: 2.25rem;
  height: 2.25rem;
  line-height: 1;
}
/* 與 DesignPage 白色填色鈕同語意：啟用步驟為白底＋黑字＋淡邊，不用藍 */
.my-create-rag-stepper-num--on {
  background-color: var(--my-color-surface);
  color: var(--my-color-black);
  border: 1px solid var(--my-color-border-muted);
}
.my-create-rag-stepper-num--off {
  background-color: color-mix(in srgb, var(--my-color-black) 6%, var(--my-color-surface));
  color: var(--my-color-gray-light);
  border: 1px solid color-mix(in srgb, var(--my-color-black) 20%, transparent);
}
.my-create-rag-stepper-line {
  flex: 1 1 1rem;
  min-width: 0.35rem;
  height: 2px;
  margin-top: 1.125rem;
  align-self: flex-start;
  background-color: color-mix(in srgb, var(--my-color-black) 20%, transparent);
  border-radius: 1px;
}
.my-create-rag-stepper-line--on {
  background-color: color-mix(in srgb, var(--my-color-black) 32%, transparent);
}

</style>
