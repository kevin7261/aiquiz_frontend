<script setup>
/**
 * CreateExamQuizBankPage - 建立測驗題庫頁面
 *
 * 一個分頁（tab）對應後端一筆 RAG（rag_id + rag_tab_id）。流程：建立 RAG → 上傳 ZIP → 設定 unit_list（虛擬資料夾群組）→ Build RAG ZIP → 產生題目 → 作答與評分（試卷用題庫由後端／系統設定與／或單題 POST for-exam 管理，見註解）。
 *
 * API 對應：
 * - 列表：GET /rag/tabs?local=（與 tab/create 的 local 一致）；useRagList 首次 watch(immediate) 載入，之後每次從側欄再進入本頁（KeepAlive onActivated）再抓一次
 * - 建立 tab（按 +）：POST /rag/tab/create（rag_tab_id、person_id、tab_name 必填；local 選填，預設 false；本機前端傳 true）
 * - 上傳 ZIP：POST /rag/tab/upload-zip（Form: file、rag_tab_id、person_id）
 * - 建 RAG：POST /rag/tab/build-rag-zip（NDJSON 串流；unit_list、chunk_size、chunk_overlap、system_prompt_instruction 等）
 * - 分頁更名：PUT /rag/tab/tab-name（body: rag_id、tab_name）
 * - 試卷用：僅依 GET /rag/tabs 每筆 `for_exam` 顯示分頁列綠點（不再呼叫 system-settings rag-for-exam-*）
 * - 出題（舊／整庫）：POST /rag/tab/quiz/create（rag_id 必填；rag_tab_id、unit_name 選填可 ""）；評分：POST /rag/tab/unit/quiz/llm-grade、GET /rag/tab/unit/quiz/grade-result/{job_id}，ready 時 result: quiz_grade、quiz_comments、rag_quiz_id、rag_answer_id
 * - 單元子分頁：GET /rag/tab/units；空白題 POST /rag/tab/unit/quiz/create；LLM 出題 POST /rag/tab/unit/quiz/llm-generate（body: rag_quiz_id、quiz_name、quiz_user_prompt_text）；單題設為測驗用 Rag_Quiz POST /rag/tab/unit/quiz/for-exam（body: rag_quiz_id、rag_tab_id、rag_unit_id；for_exam 可切 true／false）
 * 上述 API 不需 llm_api_key。
 */
import { ref, computed, watch, onMounted, onActivated, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
} from '../constants/api.js';
import {
  getPersonId,
  apiCreateUnit,
  apiUploadZip,
  apiDeleteRag,
  apiUpdateRagTabName,
  apiBuildRagZip,
  apiGetRagTabUnits,
  apiCreateRagUnitQuiz,
  apiRagUnitQuizLlmGenerate,
  apiMarkRagQuizForExam,
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
  normalizeQuizLevelLabel,
  unitSelectValue,
  reconcileQuizUnitSelectSlot,
  findQuizUnitBySlotSelection,
  examOrRagQuizRowKey,
  examOrRagAnswerRowKey,
  quizAnswerPresetFromReference,
} from '../utils/rag.js';
import { useRagList } from '../composables/useRagList.js';
import { useRagTabState } from '../composables/useRagTabState.js';
import { usePackTasks } from '../composables/usePackTasks.js';
import QuizCard from '../components/QuizCard.vue';
import UnitSelectDropdown from '../components/UnitSelectDropdown.vue';
import TabRenameModal from '../components/TabRenameModal.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import EnglishExamMarkdownEditor from '../components/EnglishExamMarkdownEditor.vue';

defineProps({
  tabId: { type: String, required: true },
});

const pageTitle = computed(() => '建立測驗題庫');
/** 用於載入中、新增、錯誤訊息等可讀名詞 */
const quizBankNoun = computed(() => '測驗題庫');

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** POST /rag/tab/upload-zip 允許的副檔名（與後端可解析格式一致） */
const UPLOAD_ALLOWED_EXTENSIONS = ['.zip', '.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const UPLOAD_ACCEPT_ATTR = UPLOAD_ALLOWED_EXTENSIONS.join(',');
/** 教材上傳單檔大小上限（位元組）：與檔案總管／Finder 顯示的「MB」一致（50×10⁶），非 50×1024² */
const UPLOAD_MAX_FILE_BYTES = 50 * 1000 * 1000;
function uploadFileExceedsMaxSize(file) {
  if (!file || typeof file.size !== 'number' || !Number.isFinite(file.size)) return false;
  return file.size > UPLOAD_MAX_FILE_BYTES;
}
function fileHasAllowedUploadExtension(file) {
  if (!file?.name) return false;
  const lower = file.name.toLowerCase();
  return UPLOAD_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const authStore = useAuthStore();

const { ragList, ragListLoading, ragListError, fetchRagList } = useRagList();
const createRagLoading = ref(false);
const createRagError = ref('');
const renameRagTabModalOpen = ref(false);
/** 重新命名 API 用 Rag 主鍵（PUT /rag/tab/tab-name） */
const renameRagTabDraftRagId = ref(null);
const renameRagTabInitialName = ref('');
const renameRagTabSaving = ref(false);
const renameRagTabError = ref('');
/** 正在送出批改的題卡 id（全螢幕 LoadingOverlay「批改中...」；結果區待回傳） */
const gradingSubmittingCardId = ref(null);
const deleteRagLoading = ref(false);
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);

const { getTabState, currentState, isNewTabId } = useRagTabState(activeTabId, newTabIds, ragList, authStore, { defaultSystemInstruction: DEFAULT_SYSTEM_INSTRUCTION });

const zipFileInputAccept = UPLOAD_ACCEPT_ATTR;

const showCreateBankMainForm = computed(
  () => ragList.value.length > 0 || showFormWhenNoData.value
);
const showStepperSection = computed(() => !!activeTabId.value);

function checkRagHasMetadata(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return rag.rag_metadata != null && (typeof rag.rag_metadata === 'string' ? String(rag.rag_metadata).trim() !== '' : true);
}

function extractUnitsFromRag(rag) {
  if (!rag || typeof rag !== 'object') return [];
  const raw =
    rag.units ??
    rag.rag_units ??
    rag.ragUnits ??
    rag.unit_rows ??
    rag.unitRows;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function checkRagHasList(rag) {
  if (!rag || typeof rag !== 'object') return false;
  if (extractUnitsFromRag(rag).length > 0) return true;
  return getRagUnitListString(rag) !== '';
}

/** 至少一個出題單元，且每個出題單元至少一個單元（與出題設定「開始建立題庫」按鈕啟用條件一致） */
function isPackTasksListReady(list) {
  if (!Array.isArray(list) || list.length < 1) return false;
  return list.every((g) => Array.isArray(g) && g.length >= 1);
}

const hasRagMetadata = computed(() => checkRagHasMetadata(currentRagItem.value));
const hasRagListOrMetadata = computed(() => checkRagHasMetadata(currentRagItem.value) || checkRagHasList(currentRagItem.value));
/** 建置完成判斷：後端已有 rag_metadata/unit_list，或前端本輪 build 已拿到回傳 */
const hasBuiltRagSummary = computed(
  () => hasRagListOrMetadata.value || currentState.value.packResponseJson != null
);

/** 後端已有 rag_metadata 時，出題單元（unit_list）拆成條列：每個 li 為一群，群內資料夾以 + 連接 */
const ragListReadonlyGroups = computed(() => {
  const list = currentState.value.packTasksList;
  if (Array.isArray(list) && list.length > 0) {
    const groups = list.filter((g) => Array.isArray(g) && g.length > 0).map((g) => g.filter(Boolean));
    if (groups.length > 0) return groups;
  }
  const rag = currentRagItem.value;
  const units = extractUnitsFromRag(rag);
  if (units.length > 0) {
    const mapped = units
      .map((u) => String(u?.unit_name ?? u?.rag_name ?? u?.name ?? '').trim())
      .filter(Boolean)
      .map((name) => [name.replace(/\+/g, '_')]);
    if (mapped.length > 0) return mapped;
  }
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

/** chunk 參數（共用）；chunk_size / chunk_overlap 一律為數字 */
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

/** GET /rag/tabs 列之 Rag.for_exam===true 時為試卷用（不做 system-settings 對照） */
function ragIsForExamFromListRow(rag) {
  return !!rag?.for_exam;
}

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
    console.log('[CreateExamQuizBankPage] rag_id:', v.rag_id, 'rag_tab_id:', v.rag_tab_id);
  },
  { immediate: true }
);

const hasAnySlotGenerating = computed(() => {
  const state = currentState.value;
  const n = Number(state.quizSlotsCount) || 0;
  for (let i = 1; i <= n; i++) {
    const slot = state.slotFormState[i];
    if (slot?.loading || slot?.unitQuizCreateLoading) return true;
  }
  return false;
});

const isGradingSubmitting = computed(() => gradingSubmittingCardId.value != null);

/** 全螢幕 LoadingOverlay：列表／建立分頁／刪除／更名／ZIP 上傳（上傳區 UI 不變，僅 overlay）／建題庫／產生題目／批改 */
const loadingOverlayVisible = computed(
  () =>
    ragListLoading.value ||
    createRagLoading.value ||
    deleteRagLoading.value ||
    renameRagTabSaving.value ||
    !!currentState.value?.zipLoading ||
    !!currentState.value?.packLoading ||
    hasAnySlotGenerating.value ||
    isGradingSubmitting.value
);

const loadingOverlayText = computed(() => {
  if (isGradingSubmitting.value) return '批改中...';
  if (hasAnySlotGenerating.value) return '產生題目中...';
  const st = currentState.value;
  if (st?.zipLoading) return '上傳中...';
  if (st?.packLoading) return '建立題庫中...';
  if (deleteRagLoading.value) return '刪除中...';
  if (renameRagTabSaving.value) return '儲存中...';
  if (createRagLoading.value) return '建立中...';
  if (ragListLoading.value) return `載入${quizBankNoun.value}中`;
  return '處理中...';
});

/** 建題庫串流進度（僅 LoadingOverlay subText：筆數、目前序號、儲存 repack／RAG；不含工作檔名） */
const packBuildOverlayLines = computed(() => {
  const st = currentState.value;
  if (!st?.packLoading) return [];
  const total = Number(st.packBuildTotal) || 0;
  if (total <= 0) return [];
  const done = Number(st.packBuildDone) || 0;
  const cur = Number(st.packBuildCurrent) || 0;
  const repackKey = String(st.packBuildRepackFilename ?? '').trim();
  const ragKey = String(st.packBuildRagFilename ?? '').trim();
  const lines = [`共 ${total} 個 RAG ZIP，已完成 ${done} 個`];
  if (cur > 0) lines.push(`目前建置：第 ${cur} / ${total} 個`);
  if (repackKey) lines.push(`儲存 repack：${repackKey}`);
  if (ragKey) lines.push(`儲存 RAG：${ragKey}`);
  return lines;
});

/** 建題庫串流進度（LoadingOverlay subText；全螢幕遮罩會蓋住表單下方進度區） */
const loadingOverlaySubText = computed(() => {
  const st = currentState.value;
  if (!st?.packLoading) return '';
  if (packBuildOverlayLines.value.length) return packBuildOverlayLines.value.join('\n');
  return '正在連線並準備建置…';
});

/** 用於顯示 file_metadata：上傳回傳的 zipResponseJson、GET /rag/tabs 的 file_metadata；若列表已建題庫但未內嵌 file_metadata，則由 rag 與 unit_list 合成，避免「出題設定」整塊被隱藏 */
const fileMetadataToShow = computed(() => {
  const state = currentState.value;
  if (state.zipResponseJson != null) return state.zipResponseJson;
  const rag = currentRagItem.value;
  if (rag == null || typeof rag !== 'object') return null;
  if (rag.file_metadata != null && typeof rag.file_metadata === 'object') return rag.file_metadata;
  const hasMeta = checkRagHasMetadata(rag);
  const unitStr = getRagUnitListString(rag);
  if (!hasMeta && !unitStr) return null;
  const groups = parsePackTasksList(unitStr);
  const fromUnits = [...new Set(groups.flat())];
  const secondFolders =
    fromUnits.length > 0
      ? fromUnits
      : (Array.isArray(rag.second_folders) ? rag.second_folders : []);
  return {
    filename: rag.filename ?? rag.zip_filename ?? rag.original_filename ?? '',
    file_size: rag.file_size,
    second_folders: secondFolders,
  };
});

/** 是否已上傳過 ZIP（file_metadata 僅在上傳後才會有） */
const hasUploadedFileMetadata = computed(() => fileMetadataToShow.value != null);

const showUploadFileSection = computed(
  () => !!activeTabId.value && !hasUploadedFileMetadata.value
);

/** 「確定上傳」：須有本機選取的 File，且未超過 50 MB、非上傳中（不可僅依 zipFileName，避免列表同步檔名後誤啟用） */
const examZipConfirmUploadDisabled = computed(() => {
  const st = currentState.value;
  if (st.zipLoading) return true;
  const f = st.uploadedZipFile;
  if (!f) return true;
  return uploadFileExceedsMaxSize(f);
});

/** 建立流程 stepper 階段：1 上傳檔案 → 2 已上傳、建置題庫中 → 3 已建置、可測試題目 */
const createRagStepperPhase = computed(() => {
  if (hasRagMetadata.value) return 3;
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

/** 上傳教材檔大小（後端為 MB）：優先 file_metadata.file_size，否則 Rag 表頂層 file_size */
const uploadZipFileSizeDisplay = computed(() => {
  const meta = fileMetadataToShow.value;
  const rag = currentRagItem.value;
  let raw;
  if (meta && typeof meta === 'object' && meta.file_size != null) raw = meta.file_size;
  else if (rag && typeof rag === 'object' && rag.file_size != null) raw = rag.file_size;
  return formatFileSize(raw, 'MB');
});

/** 唯讀 input 一列顯示：檔名 + 全形括號內檔案大小 */
const uploadZipReadonlyInputValue = computed(() => {
  const name = String(uploadedZipDisplayName.value ?? '').trim();
  const size = String(uploadZipFileSizeDisplay.value ?? '').trim();
  if (!name && !size) return '—';
  if (size && name) return `${name}（${size}）`;
  if (size) return `（${size}）`;
  return name;
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
  clearAllRagListGroups,
  addAllSecondFoldersAsGroups,
  setAllSecondFoldersAsSingleGroup,
} = usePackTasks(currentState, fileMetadataToShow, packGroupsEditBlocked);

/** Tab 列用：rag 項目含 _tabId、_label、_isExamRag（試卷用者分頁列綠點／刪除確認） */
const ragItems = computed(() =>
  ragList.value.map((r) => ({
    ...r,
    _tabId: r.rag_tab_id ?? r.id ?? r,
    _label: getRagTabLabel(r),
    _isExamRag: ragIsForExamFromListRow(r),
  }))
);
/** Tab 列用：新增 tab 項目含 id、label */
const newTabItems = computed(() =>
  newTabIds.value.map((tid) => ({
    id: tid,
    label: `未命名${quizBankNoun.value}`,
  }))
);

function firstRagQuizAnchorIdFromUnit(unit) {
  if (!unit || typeof unit !== 'object') return null;
  const directCandidates = [
    unit.rag_quiz_id,
    unit.template_rag_quiz_id,
    unit.anchor_rag_quiz_id,
    unit.anchorRagQuizId,
  ];
  for (const c of directCandidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  let list = [];
  if (Array.isArray(unit.quizzes)) list = unit.quizzes;
  else if (Array.isArray(unit.quiz_list)) list = unit.quiz_list;
  else if (Array.isArray(unit.Quizzes)) list = unit.Quizzes;

  for (const q of list) {
    const id =
      q?.rag_quiz_id ?? q?.RagQuizId ?? q?.quiz_id ?? q?.exam_quiz_id ?? q?.id;
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function ragUnitIdFromRawUnit(unit) {
  if (!unit || typeof unit !== 'object') return null;
  const raw = unit.rag_unit_id ?? unit.unit_id ?? unit.id;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 來源／RAG ZIP 檔名：後端可能回 rag_file_name（Rag_Unit） */
function unitSourceFilename(unit) {
  if (!unit || typeof unit !== 'object') return '';
  const raw =
    unit.rag_file_name
    ?? unit.ragFileName
    ?? unit.filename
    ?? unit.rag_filename
    ?? unit.zip_filename;
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).trim();
}

function normalizeUnitFromRagTabsRow(unit, fallbackTabId) {
  if (!unit || typeof unit !== 'object') return null;
  const rawName =
    unit.unit_name ??
    unit.rag_name ??
    unit.name ??
    unit.rag_unit_name;
  const name = String(rawName ?? '').trim();
  if (!name) return null;
  const tabId = String(unit.rag_tab_id ?? fallbackTabId ?? '').trim();
  const safeName = name.replace(/\+/g, '_');
  const anchorRagQuizId = firstRagQuizAnchorIdFromUnit(unit);
  const ragUnitId = ragUnitIdFromRawUnit(unit);
  const src = unitSourceFilename(unit);
  const qptRaw = unit.quiz_system_prompt_text ?? unit.quizSystemPromptText;
  const quiz_system_prompt_text =
    qptRaw != null && String(qptRaw).trim() !== '' ? String(qptRaw).trim() : '';
  return {
    rag_tab_id: tabId || safeName,
    filename: src || `${safeName}_rag.zip`,
    rag_name: String(unit.rag_name ?? name).trim() || safeName,
    unit_name: safeName,
    anchor_rag_quiz_id: anchorRagQuizId,
    rag_unit_id: ragUnitId,
    quiz_system_prompt_text,
  };
}

/** 當 rag 未內嵌 units[] 時，由 outputs／rag_metadata.outputs／unit_list 推導單元列（與出題下拉、build-rag-zip 一致；供單元 sub-tab） */
function fallbackUnitsRawFromRag(rag) {
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
}

function unitsFromRagTabsRow(rag) {
  if (!rag || typeof rag !== 'object') return [];
  const fallbackTabId = String(rag.rag_tab_id ?? rag.id ?? '').trim();
  let rows = extractUnitsFromRag(rag);
  if (!rows.length) {
    rows = fallbackUnitsRawFromRag(rag);
  }
  return rows
    .map((u) => normalizeUnitFromRagTabsRow(u, fallbackTabId))
    .filter(Boolean);
}

/** 從 /rag/tabs 的 outputs（頂層或 rag_metadata 內）或 unit_list 推導 generateQuizUnits（與 ExamPage／tab/build-rag-zip 一致） */
const generateQuizUnitsFromRag = computed(() => {
  const rag = currentRagItem.value;
  if (!rag || typeof rag !== 'object') return [];
  return unitsFromRagTabsRow(rag);
});

function unitTabLabelFromUnit(unit, index = 0) {
  const raw = String(unit?.unit_name ?? unit?.rag_name ?? '').trim();
  return raw || `單元 ${index + 1}`;
}

function buildUnitTabItem(unit, index = 0) {
  const ragTabId = String(unit?.rag_tab_id ?? '').trim();
  const unitName = String(unit?.unit_name ?? unit?.rag_name ?? '').trim();
  const keyBase = unitName || unit?.rag_name || `idx-${index + 1}`;
  const anchorRagQuizId =
    unit?.anchor_rag_quiz_id != null
      ? Number(unit.anchor_rag_quiz_id)
      : firstRagQuizAnchorIdFromUnit(unit);
  const ragUnitId =
    unit?.rag_unit_id != null ? Number(unit.rag_unit_id) : ragUnitIdFromRawUnit(unit);
  return {
    id: `${ragTabId || 'tab'}::${keyBase}::${index}`,
    label: unitTabLabelFromUnit(unit, index),
    generateQuizTabId: unitSelectValue(unit),
    unitName: unitName || unitTabLabelFromUnit(unit, index),
    ragName: String(unit?.rag_name ?? '').trim(),
    filename: unitSourceFilename(unit),
    ragTabId,
    anchorRagQuizId: Number.isFinite(anchorRagQuizId) && anchorRagQuizId > 0 ? anchorRagQuizId : null,
    ragUnitDbId: Number.isFinite(ragUnitId) && ragUnitId > 0 ? ragUnitId : null,
    quizSystemPromptText: String(unit?.quiz_system_prompt_text ?? '').trim(),
  };
}

function setUnitSubTabsFromUnits(state, units) {
  const safeUnits = Array.isArray(units) ? units : [];
  const tabs = safeUnits.map((u, i) => buildUnitTabItem(u, i));
  state.unitTabOrder = tabs;
  if (!tabs.length) {
    state.activeUnitTabId = null;
    return;
  }
  const active = String(state.activeUnitTabId ?? '');
  if (!active || !tabs.some((t) => t.id === active)) {
    state.activeUnitTabId = tabs[0].id;
  }
}

const activeUnitTabItem = computed(() => {
  const tabs = currentState.value.unitTabOrder ?? [];
  const activeId = String(currentState.value.activeUnitTabId ?? '');
  if (!tabs.length || !activeId) return null;
  return tabs.find((t) => t.id === activeId) ?? null;
});

const activeUnitSlotIndex = computed(() => {
  const tabs = currentState.value.unitTabOrder ?? [];
  const activeId = String(currentState.value.activeUnitTabId ?? '');
  const idx = tabs.findIndex((t) => t.id === activeId);
  return idx >= 0 ? idx + 1 : 1;
});

/** 目前單元槽對應之 rag_tab_id／rag_unit_id（供單題設為測驗用 POST /rag/tab/unit/quiz/for-exam） */
function getRagQuizUnitMeta(slotIndex) {
  const state = currentState.value;
  const tabs = state.unitTabOrder ?? [];
  const t = tabs[slotIndex - 1];
  const ragTabId = t ? String(t.ragTabId ?? '').trim() : '';
  const ru = t?.ragUnitDbId != null ? Number(t.ragUnitDbId) : 0;
  return {
    rag_tab_id: ragTabId,
    rag_unit_id: Number.isFinite(ru) && ru >= 0 ? ru : 0,
  };
}

/** 切換 Rag_Quiz.for_exam（需已批改有結果；題卡綠／線框鈕與試卷試題來源對齊） */
async function onMarkRagQuizForExam(card) {
  if (!card || typeof card !== 'object') return;
  const personId = getPersonId(authStore);
  if (!personId) {
    alert('請先登入');
    return;
  }
  const rqid = positiveRagQuizIdFromQuizRow(card);
  if (rqid == null || rqid < 1) return;
  const slotIndex = activeUnitSlotIndex.value;
  const meta = getRagQuizUnitMeta(slotIndex);
  const rag = currentRagItem.value;
  const state = currentState.value;
  const ragTabId =
    String(card.rag_tab_id ?? meta.rag_tab_id ?? '').trim()
    || String(rag?.rag_tab_id ?? activeTabId.value ?? state.zipTabId ?? '').trim();
  let ragUnitId =
    card.rag_unit_id != null && card.rag_unit_id !== ''
      ? Number(card.rag_unit_id)
      : Number(meta.rag_unit_id);
  if (!Number.isFinite(ragUnitId) || ragUnitId < 0) ragUnitId = 0;
  const nextForExam = !(card.rag_quiz_for_exam === true || card.rag_quiz_for_exam === 1);
  card.ragQuizForExamLoading = true;
  card.ragQuizForExamError = '';
  try {
    await apiMarkRagQuizForExam(
      {
        rag_quiz_id: rqid,
        rag_tab_id: ragTabId,
        rag_unit_id: ragUnitId,
        for_exam: nextForExam,
      },
      personId
    );
    card.rag_quiz_for_exam = nextForExam;
    card.rag_tab_id = ragTabId;
    card.rag_unit_id = ragUnitId;
  } catch (err) {
    card.ragQuizForExamError = err?.message || String(err);
  } finally {
    card.ragQuizForExamLoading = false;
  }
}
const activeUnitQuizCards = computed(() => {
  const state = currentState.value;
  const i = activeUnitSlotIndex.value - 1;
  const stacks = state.unitSlotQuizCards;
  if (!Array.isArray(stacks) || i < 0 || i >= stacks.length) return [];
  const row = stacks[i];
  return Array.isArray(row) ? row : [];
});

const hasUnitSubTabs = computed(() => (currentState.value.unitTabOrder ?? []).length > 0);

/** quiz_content（card.quiz）為空時：該列出題 prompt 可編輯、顯示「產生題目」（不依賴 showGenerateForm／草稿對齊；多筆空白題各自綁 quizUserPromptText） */
function quizRowQuizEmpty(card) {
  return !String(card?.quiz ?? '').trim();
}

/** 該列出題文字：優先題卡本身，再以 slot（舊相容）回填 */
function promptTextForQuizRow(card, slotIndex) {
  const row = String(card?.quizUserPromptText ?? '').trim();
  if (row) return row;
  return String(getSlotFormState(slotIndex).quizUserPromptText ?? '').trim();
}

function extractQuizUserPromptText(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = [
    'quiz_user_prompt_text',
    'quizUserPromptText',
    'user_prompt_text',
    'userPromptText',
    'prompt_text',
    'promptText',
  ];
  for (const key of keys) {
    const val = raw[key];
    if (val == null) continue;
    const text = String(val);
    if (text.trim()) return text;
  }
  return '';
}

function syncSlotPromptFromCard(slotIndex) {
  const state = currentState.value;
  const slot = getSlotFormState(slotIndex);
  if (String(slot.quizUserPromptText ?? '').trim()) return;
  const unitStacks = state.unitSlotQuizCards?.[slotIndex - 1];
  if (Array.isArray(unitStacks) && unitStacks.length) {
    for (let i = unitStacks.length - 1; i >= 0; i--) {
      const c = unitStacks[i];
      const from =
        extractQuizUserPromptText(c)
        || extractQuizUserPromptText(c?.generateQuizResponseJson);
      if (from) {
        slot.quizUserPromptText = from;
        return;
      }
    }
  }
  const card = state.cardList[slotIndex - 1];
  if (!card) return;
  const fromCard =
    extractQuizUserPromptText(card)
    || extractQuizUserPromptText(card.generateQuizResponseJson);
  if (fromCard) slot.quizUserPromptText = fromCard;
}

function sortUnitQuizCardsByRagQuizId(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  return arr.sort((a, b) => {
    const ia = positiveRagQuizIdFromQuizRow(a);
    const ib = positiveRagQuizIdFromQuizRow(b);
    return (Number.isFinite(ia) ? ia : 0) - (Number.isFinite(ib) ? ib : 0);
  });
}

/** 與兼容用 cardList[slot] 對齊：草稿 id 優先，否則最後一張有題幹者 */
function focalCardFromUnitQuizList(unitCards, slotForm) {
  const cards = Array.isArray(unitCards) ? unitCards : [];
  if (cards.length === 0) return null;
  const pid =
    parsePositiveQuizId(slotForm?.unitDraftRagQuizId)
    ?? parsePositiveQuizId(slotForm?.lastSuccessfulCreatedRagQuizId);
  if (pid != null && pid > 0) {
    const m = cards.find((c) => positiveRagQuizIdFromQuizRow(c) === pid);
    if (m) return m;
  }
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (String(c?.quiz ?? '').trim()) return c;
  }
  return cards[cards.length - 1];
}

/** 自 GET /rag/tabs 單筆灌入測試題卡：優先各 unit 的 quizzes[]，否則頂層 rag.quizzes */
function hydrateQuizCardsFromRag(rag, state) {
  const ragAnswers = rag.answers ?? [];
  const answersByQuizId = ragAnswers.reduce((acc, a) => {
    const id = examOrRagAnswerRowKey(a);
    if (!id) return acc;
    if (!acc[id]) acc[id] = [];
    acc[id].push(a);
    return acc;
  }, {});

  function stitchQuizRow(q, indexFallback) {
    const qKey = examOrRagQuizRowKey(q);
    const byId = q.answers ?? (qKey ? answersByQuizId[qKey] : undefined);
    const answers =
      (Array.isArray(byId) && byId.length > 0)
        ? byId
        : (ragAnswers[indexFallback] != null ? [ragAnswers[indexFallback]] : []);
    return { ...q, answers };
  }

  const rawUnits = extractUnitsFromRag(rag);
  /** 只要 RAG 帶得出單元列，就以每單元的 quizzes[] 灌入（長度可為 0）；無限多題對應為 unitSlotQuizCards[slot] 之多個 Card */
  const hasUnitRows = rawUnits.length > 0;

  if (hasUnitRows) {
    const metaParsed = parseRagMetadataObject(rag);
    const out0 = Array.isArray(rag.outputs) && rag.outputs.length > 0 ? rag.outputs[0] : metaParsed?.outputs?.[0];
    const packFirst = parsePackTasksList(getRagUnitListString(rag))[0]?.[0];
    const fallbackName = (packFirst ?? out0?.rag_name ?? '').trim();
    const ragIdFallback = rag.rag_id ?? rag.id;
    if (!state.unitSlotQuizCards) state.unitSlotQuizCards = [];
    const listOfLists = rawUnits.map((u, ui) => {
      const uqs = Array.isArray(u.quizzes) ? u.quizzes : [];
      if (uqs.length === 0) return [];
      const unitLabel = String(u.unit_name ?? u.rag_name ?? u.name ?? '').trim();
      const ragNameForCard = unitLabel || fallbackName || '';
      const built = uqs.map((qRaw) => {
        const qw = stitchQuizRow(qRaw, ui);
        const rn = ragNameForCard || String(qw.rag_name ?? '').trim();
        return buildCardFromRagQuiz(qw, rn, ragIdFallback);
      });
      return sortUnitQuizCardsByRagQuizId(built);
    });
    state.unitSlotQuizCards = listOfLists;
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = rawUnits.length;
    state.cardList = listOfLists.map((lst, ui) =>
      focalCardFromUnitQuizList(lst, state.slotFormState?.[ui + 1])
    );
    return;
  }

  state.unitSlotQuizCards = [];

  const quizzes = rag.quizzes ?? [];
  if (quizzes.length > 0) {
    const quizzesWithAnswers = quizzes.map((q, i) => stitchQuizRow(q, i));
    const metaParsed = parseRagMetadataObject(rag);
    const out0 = Array.isArray(rag.outputs) && rag.outputs.length > 0 ? rag.outputs[0] : metaParsed?.outputs?.[0];
    const firstRagName = (parsePackTasksList(getRagUnitListString(rag))[0]?.[0] ?? out0?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    const ragIdFallback = rag.rag_id ?? rag.id;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromRagQuiz(q, q.rag_name ?? firstRagName, ragIdFallback));
    return;
  }

  state.quizSlotsCount = 0;
  state.cardList = [];
  state.unitSlotQuizCards = [];
}

/** 從 Rag 項目同步到 tab state（packTasks、ragMetadata、chunk、quizzes 等） */
function syncRagItemToState(rag, state) {
  if (!rag || typeof rag !== 'object') return;
  setUnitSubTabsFromUnits(state, unitsFromRagTabsRow(rag));
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
  hydrateQuizCardsFromRag(rag, state);
  state._synced = true;
}

/** 僅在首次切換到該 RAG 分頁時自列表灌入狀態；已同步過的 tab 不再覆寫，保留使用者輸入 */
watch(
  activeTabId,
  (id) => {
    if (!id || isNewTabId(id)) return;
    const state = getTabState(id);
    if (state._synced) return;
    const rag = ragList.value.find(
      (r) => String(r.rag_tab_id ?? r.id ?? r) === String(id)
    );
    if (!rag) return;
    syncRagItemToState(rag, state);
  },
  { immediate: true }
);

watch(
  [activeTabId, hasBuiltRagSummary],
  async ([id, hasBuilt]) => {
    if (!id || isNewTabId(id) || !hasBuilt) return;
    try {
      await refreshUnitSubTabsFromApi(id);
    } catch {
      // 單元 sub tab 載入失敗不阻斷主流程，維持既有出題區可用
    }
  },
  { immediate: true }
);

/** 正整數 rag_quiz_id（字串數字相容） */
function parsePositiveQuizId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'boolean') return null;
  const n =
    typeof raw === 'number'
      ? raw
      : Number(typeof raw === 'string' ? raw.trim() : raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/** 自題目列／題卡取下正整數 rag_quiz_id（llm-generate 錨點；相容後端別名） */
function positiveRagQuizIdFromQuizRow(quizOrCard) {
  if (!quizOrCard || typeof quizOrCard !== 'object') return null;
  const keys = ['rag_quiz_id', 'quiz_id', 'ragQuizId', 'quizId'];
  for (const k of keys) {
    const v = quizOrCard[k];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const idFallback = quizOrCard.id;
  if (idFallback != null && idFallback !== '') {
    const n = Number(idFallback);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** 題卡本體優先，其次產題 API 回覆（generateQuizResponseJson） */
function positiveRagQuizIdFromCard(card) {
  const direct = positiveRagQuizIdFromQuizRow(card);
  if (direct != null) return direct;
  const gj = card?.generateQuizResponseJson;
  if (gj != null && typeof gj === 'object') return positiveRagQuizIdFromQuizRow(gj);
  return null;
}

/** 由 /rag/tabs 的 quiz 組題卡：批改優先 quiz.answers 末筆；若無則讀列上 answer_content／quiz_score（或 quiz_grade）／answer_critique（Rag_Quiz 內嵌欄位） */
function buildCardFromRagQuiz(quiz, ragName, ragIdFallback) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? null;
  const refA = quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? '';
  const critStr = quiz.answer_critique != null ? String(quiz.answer_critique).trim() : '';
  const embeddedScore = quiz.quiz_score ?? quiz.quiz_grade;
  const hasEmbeddedScore =
    embeddedScore != null && String(embeddedScore).trim() !== '';
  const answerContentStr = quiz.answer_content != null ? String(quiz.answer_content) : '';
  const useInlineGrading = !latestAnswer && (critStr !== '' || hasEmbeddedScore);

  let quiz_answer;
  if (latestAnswer) {
    quiz_answer =
      latestSubmitted != null && String(latestSubmitted).trim() !== ''
        ? String(latestSubmitted)
        : quizAnswerPresetFromReference(refA);
  } else if (answerContentStr.trim() !== '') {
    quiz_answer = answerContentStr;
  } else {
    quiz_answer = quizAnswerPresetFromReference(refA);
  }

  let gradingResult = '';
  let gradingResponseJson = null;
  let confirmed = false;
  let answer_id = null;

  if (latestAnswer) {
    gradingResult =
      formatGradingResult(JSON.stringify(latestAnswer)) ||
      (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : '');
    confirmed = true;
    gradingResponseJson = latestAnswer;
    answer_id = latestAnswer?.answer_id ?? latestAnswer?.rag_answer_id ?? null;
  } else if (useInlineGrading) {
    if (critStr !== '') {
      gradingResult = formatGradingResult(critStr) || '';
    }
    if (!gradingResult && hasEmbeddedScore) {
      gradingResult = `總分：${embeddedScore} / 5`;
    }
    confirmed = true;
    const parsedCritique =
      critStr !== ''
        ? (() => {
            try {
              return JSON.parse(critStr);
            } catch {
              return null;
            }
          })()
        : null;
    gradingResponseJson =
      parsedCritique && typeof parsedCritique === 'object'
        ? parsedCritique
        : {
            quiz_score: embeddedScore,
            quiz_grade: embeddedScore,
            answer_critique: quiz.answer_critique,
            answer_content: quiz.answer_content,
          };
    answer_id = quiz.rag_answer_id ?? null;
  }

  const gradingPrompt = String(quiz.answer_user_prompt_text ?? '').trim();
  const generateLevel = normalizeQuizLevelLabel(quiz.quiz_level);
  const rid = quiz.rag_id ?? quiz.ragId ?? ragIdFallback;
  const ragIdStr = rid != null && String(rid).trim() !== '' ? String(rid) : null;
  const fe =
    quiz.for_exam === true
    || quiz.for_exam === 1
    || quiz.rag_quiz_for_exam === true;
  const rtid = quiz.rag_tab_id != null ? String(quiz.rag_tab_id).trim() : '';
  const ruidRaw = quiz.rag_unit_id != null ? Number(quiz.rag_unit_id) : NaN;
  const ruid = Number.isFinite(ruidRaw) && ruidRaw >= 0 ? ruidRaw : 0;
  const quizBodyTrimmed = String(quiz.quiz_content ?? '').trim();
  /** 題幹仍空白時題名輸入預設為空（不依後端 quiz_name 預填檔名等）；有題幹後才顯示 Rag_Quiz.quiz_name */
  const quizNameResolved =
    quizBodyTrimmed !== ''
      ? String(quiz.quiz_name ?? quiz.quizName ?? '').trim()
      : '';
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? '',
    hint: quiz.quiz_hint ?? '',
    referenceAnswer: quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? '',
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.rag_name || '').trim() || null,
    rag_id: ragIdStr,
    quiz_answer,
    hintVisible: false,
    confirmed,
    gradingResult,
    gradingResponseJson,
    generateQuizResponseJson: null,
    quizUserPromptText: extractQuizUserPromptText(quiz),
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: null,
    rag_quiz_id: positiveRagQuizIdFromQuizRow(quiz),
    rag_tab_id: rtid,
    rag_unit_id: ruid,
    rag_quiz_for_exam: fe,
    ragQuizForExamLoading: false,
    ragQuizForExamError: '',
    answer_id,
    gradingPrompt,
    quizName: quizNameResolved,
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

watch(
  () => currentState.value.unitTabOrder,
  (tabs) => {
    const state = currentState.value;
    const list = Array.isArray(tabs) ? tabs : [];
    if (!list.length) return;
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = Math.max(state.quizSlotsCount || 0, list.length);
    while (state.cardList.length < state.quizSlotsCount) {
      state.cardList.push(null);
    }
    for (let i = 0; i < list.length; i++) {
      const tab = list[i];
      const slot = getSlotFormState(i + 1);
      if (!String(slot.generateQuizTabId ?? '').trim()) {
        slot.generateQuizTabId = tab.generateQuizTabId;
      }
    }
  },
  { immediate: true, deep: true }
);

watch(activeUnitTabItem, (tab) => {
  if (!tab) return;
  const state = currentState.value;
  const unitPrompt = String(tab.quizSystemPromptText ?? '').trim();
  if (unitPrompt) {
    state.systemInstruction = unitPrompt;
  }
  const slot = getSlotFormState(activeUnitSlotIndex.value);
  if (!slot) return;
  slot.generateQuizTabId = tab.generateQuizTabId;
  syncSlotPromptFromCard(activeUnitSlotIndex.value);
});

watch(
  () => currentState.value.cardList,
  () => {
    syncSlotPromptFromCard(activeUnitSlotIndex.value);
  },
  { deep: true, immediate: true }
);

watch(
  () => currentState.value.unitSlotQuizCards,
  () => {
    syncSlotPromptFromCard(activeUnitSlotIndex.value);
  },
  { deep: true, immediate: true }
);

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

async function refreshUnitSubTabsFromApi(tabId) {
  const state = getTabState(tabId);
  const personId = getPersonId(authStore);
  if (!personId || !tabId || isNewTabId(tabId)) {
    setUnitSubTabsFromUnits(state, []);
    return [];
  }
  let units = [];
  try {
    units = await apiGetRagTabUnits(tabId, personId);
  } catch {
    units = [];
  }
  if (!Array.isArray(units) || units.length === 0) {
    const rag = ragList.value.find((r) => String(r?.rag_tab_id ?? r?.id ?? r) === String(tabId));
    units = unitsFromRagTabsRow(rag);
  }
  setUnitSubTabsFromUnits(state, units);
  const ragRow = ragList.value.find((r) => String(r?.rag_tab_id ?? r?.id ?? r) === String(tabId));
  if (
    ragRow
    && Array.isArray(units)
    && units.length > 0
  ) {
    hydrateQuizCardsFromRag({ ...ragRow, units }, state);
  }
  return units;
}

/** GET /rag/tabs 由 useRagList 內 watch(immediate) 首次載入；每次從側欄再進入本頁（KeepAlive onActivated）再抓 GET /rag/tabs */
const createBankActivatedOnce = ref(false);
onActivated(() => {
  if (!createBankActivatedOnce.value) {
    createBankActivatedOnce.value = true;
    return;
  }
  fetchRagList();
});

/** 檔案欄位初值 */
onMounted(() => {
  clearZipFileInput();
});

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
  const label = getRagTabLabel(rag);
  const isExam = ragIsForExamFromListRow(rag);
  const msg = isExam
    ? `「${label}」已標為試卷用題庫（for_exam）。確定刪除嗎？`
    : `確定要刪除「${label}」嗎？`;
  if (!confirm(msg)) return;
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
  const personId = getPersonId(authStore);
  if (!personId) {
    createRagError.value = '請先登入';
    return;
  }
  createRagError.value = '';
  createRagLoading.value = true;
  const ragTabId = generateTabId(personId);
  const tabName = `未命名${quizBankNoun.value}`;
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
    createRagError.value = err.message || `建立${quizBankNoun.value}失敗`;
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
  const rid = renameRagTabDraftRagId.value;
  if (rid == null || !Number.isFinite(rid) || rid < 1) {
    renameRagTabError.value = `找不到此${quizBankNoun.value}，請重新整理頁面後再試`;
    return;
  }
  renameRagTabSaving.value = true;
  renameRagTabError.value = '';
  try {
    await apiUpdateRagTabName(rid, name);
    await fetchRagList({ silent: true });
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
  const allowed = fileHasAllowedUploadExtension(file);
  if (!allowed) {
    resetZipState(state, tabId);
    state.zipError = '請選擇允許的檔案：.pdf、.doc、.docx、.ppt、.pptx';
    return;
  }
  if (uploadFileExceedsMaxSize(file)) {
    resetZipState(state, tabId);
    state.zipError = '檔案大小不可超過 50 MB，請選擇較小的檔案';
    return;
  }
  resetZipState(state, tabId);
  state.uploadedZipFile = file;
  state.zipFileName = file.name;
  state.zipError = '';
}

function onZipChange(e) {
  const state = currentState.value;
  if (state.zipLoading) return;
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
  if (state.zipLoading) return;
  const tabId = activeTabId.value;
  setZipFileFromFile(state, tabId, file);
  clearZipFileInput();
}
function openZipFileDialog() {
  if (currentState.value.zipLoading) return;
  if (zipFileInputRef.value) zipFileInputRef.value.click();
}

/** 上傳 ZIP */
async function confirmUploadZip() {
  if (currentState.value.zipLoading) return;
  const state = currentState.value;
  if (!state.uploadedZipFile) {
    state.zipError = '請先選擇要上傳的檔案';
    return;
  }
  if (uploadFileExceedsMaxSize(state.uploadedZipFile)) {
    state.zipError = '檔案大小不可超過 50 MB，請選擇較小的檔案';
    return;
  }
  const tabId = activeTabId.value;
  if (isNewTabId(tabId) || !tabId) {
    state.zipError = `請先按「＋」建立${quizBankNoun.value}分頁，再上傳檔案`;
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

/** 出題設定建立題庫：tab/build-rag-zip（按鈕文案「開始建立題庫」） */
async function confirmPack() {
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
  state.packBuildTotal = 0;
  state.packBuildDone = 0;
  state.packBuildCurrent = 0;
  state.packBuildFilename = '';
  state.packBuildRepackFilename = '';
  state.packBuildRagFilename = '';
  try {
    state.packResponseJson = await apiBuildRagZip(
      {
        rag_tab_id: fileId,
        person_id: personId,
        unit_list: unitList,
        chunk_size: ensureNumber(chunkSize.value, 1000),
        chunk_overlap: ensureNumber(chunkOverlap.value, 200),
        system_prompt_instruction: (state.systemInstruction ?? '').trim() || '',
      },
      (ev) => {
        if (!ev || typeof ev !== 'object') return;
        if (ev.type === 'start') {
          state.packBuildTotal = Number(ev.total) || 0;
          state.packBuildDone = 0;
          state.packBuildCurrent = 0;
          state.packBuildFilename = '';
          state.packBuildRepackFilename = '';
          state.packBuildRagFilename = '';
        } else if (ev.type === 'building') {
          state.packBuildTotal = Number(ev.total) || state.packBuildTotal;
          state.packBuildCurrent = Number(ev.index) || 0;
          state.packBuildDone = Number(ev.completed_before) || 0;
          state.packBuildFilename = ev.filename != null ? String(ev.filename) : '';
          state.packBuildRepackFilename = '';
          state.packBuildRagFilename = '';
        } else if (ev.type === 'unit') {
          state.packBuildTotal = Number(ev.total) || state.packBuildTotal;
          state.packBuildDone = Number(ev.index) || state.packBuildDone;
          const out = ev.output;
          if (out && typeof out === 'object') {
            if (out.filename != null && String(out.filename).trim() !== '') {
              state.packBuildFilename = String(out.filename).trim();
            }
            if (out.repack_filename != null && String(out.repack_filename).trim() !== '') {
              state.packBuildRepackFilename = String(out.repack_filename).trim();
            } else {
              state.packBuildRepackFilename = '';
            }
            if (out.rag_filename != null && String(out.rag_filename).trim() !== '') {
              state.packBuildRagFilename = String(out.rag_filename).trim();
            } else {
              state.packBuildRagFilename = '';
            }
          }
        } else if (ev.type === 'complete') {
          state.packBuildTotal = Number(ev.total) || state.packBuildTotal;
          if (ev.built_ok != null) state.packBuildDone = Number(ev.built_ok) || 0;
        }
      }
    );
    state.ragMetadata = typeof state.packResponseJson === 'string' ? state.packResponseJson : JSON.stringify(state.packResponseJson, null, 2);
    await fetchRagList();
    await refreshUnitSubTabsFromApi(fileId);
  } catch (err) {
    state.packError = is504OrNetworkError(err)
      ? '服務正在啟動（約需一分鐘），請稍後再試'
      : err.message || '壓縮失敗';
    state.packResponseJson = null;
  } finally {
    state.packLoading = false;
    state.packBuildTotal = 0;
    state.packBuildDone = 0;
    state.packBuildCurrent = 0;
    state.packBuildFilename = '';
    state.packBuildRepackFilename = '';
    state.packBuildRagFilename = '';
  }
}

/** 取得第 slotIndex 題的產生題目表單狀態（獨立、不連動） */
function getSlotFormState(slotIndex) {
  const state = currentState.value;
  if (!state.slotFormState[slotIndex]) {
    state.slotFormState[slotIndex] = reactive({
      generateQuizTabId: '',
      showGenerateForm: false,
      quizUserPromptText: '',
      unitDraftRagQuizId: null,
      /** POST create 成功後備份 rag_quiz_id，避免草稿欄偶發遺漏時仍可送 llm-generate */
      lastSuccessfulCreatedRagQuizId: null,
      /** 目前此槽位在「所屬單元」內的第幾題（建立空白題成功時寫入，僅該單元內遞增） */
      unitPromptOrdinalInUnit: null,
      unitQuizCreateLoading: false,
      unitQuizCreateError: '',
      loading: false,
      error: '',
      responseJson: null,
    });
  }
  const slot = state.slotFormState[slotIndex];
  if (slot.unitDraftRagQuizId === undefined) slot.unitDraftRagQuizId = null;
  if (slot.lastSuccessfulCreatedRagQuizId === undefined) slot.lastSuccessfulCreatedRagQuizId = null;
  if (slot.unitPromptOrdinalInUnit === undefined) slot.unitPromptOrdinalInUnit = null;
  if (slot.unitQuizCreateLoading === undefined) slot.unitQuizCreateLoading = false;
  if (slot.unitQuizCreateError === undefined) slot.unitQuizCreateError = '';
  return slot;
}

/** POST /rag/tab/unit/quiz/create：依目前單元建立空白 Rag_Quiz（不呼叫 LLM），再展開出題說明 */
async function createBlankUnitQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  let tab = activeUnitTabItem.value;
  const state = currentState.value;
  const rag = currentRagItem.value;
  const personId = getPersonId(authStore);
  if (!personId) {
    slotState.unitQuizCreateError = '請先登入';
    return;
  }
  const ragTabId =
    String(tab?.ragTabId ?? rag?.rag_tab_id ?? activeTabId.value ?? state.zipTabId ?? '').trim();
  let ragUnitId = tab?.ragUnitDbId != null ? Number(tab.ragUnitDbId) : 0;
  if (!Number.isFinite(ragUnitId) || ragUnitId < 1) {
    if (tab?.ragTabId && String(tab.ragTabId).trim()) {
      try {
        await refreshUnitSubTabsFromApi(tab.ragTabId);
        tab = activeUnitTabItem.value;
        ragUnitId = tab?.ragUnitDbId != null ? Number(tab.ragUnitDbId) : 0;
      } catch {
        // 仍由下一段錯誤訊息處理
      }
    }
  }
  if (!ragTabId) {
    slotState.unitQuizCreateError = '無法取得 rag_tab_id';
    return;
  }
  if (!Number.isFinite(ragUnitId) || ragUnitId < 1) {
    slotState.unitQuizCreateError = '無法取得 rag_unit_id，請確認單元已建立並重新整理頁面';
    return;
  }
  slotState.unitQuizCreateLoading = true;
  slotState.unitQuizCreateError = '';
  try {
    const data = await apiCreateRagUnitQuiz(
      { rag_tab_id: ragTabId, rag_unit_id: ragUnitId },
      personId
    );
    const rawId = data?.rag_quiz_id ?? data?.quiz_id ?? data?.id;
    const draftId = parsePositiveQuizId(rawId);
    if (draftId == null) {
      throw new Error('後端未回傳有效的 rag_quiz_id');
    }
    slotState.unitDraftRagQuizId = draftId;
    slotState.lastSuccessfulCreatedRagQuizId = draftId;
    slotState.showGenerateForm = true;
    slotState.quizUserPromptText = String(slotState.quizUserPromptText ?? '');
    if (tab?.generateQuizTabId) {
      slotState.generateQuizTabId = tab.generateQuizTabId;
    }
    try {
      await refreshUnitSubTabsFromApi(ragTabId);
    } catch {
      // 子分頁可選更新
    }
    const tabForOrdinal = activeUnitTabItem.value ?? tab;
    const unitTabKey = tabForOrdinal?.id != null ? String(tabForOrdinal.id).trim() : '';
    if (unitTabKey) {
      if (!state.unitPromptOrdinalByUnitTabId) state.unitPromptOrdinalByUnitTabId = {};
      const map = state.unitPromptOrdinalByUnitTabId;
      const prev = Number(map[unitTabKey]);
      const next = (Number.isFinite(prev) && prev > 0 ? prev : 0) + 1;
      map[unitTabKey] = next;
      slotState.unitPromptOrdinalInUnit = next;
    } else {
      slotState.unitPromptOrdinalInUnit = slotState.unitPromptOrdinalInUnit ?? null;
    }
  } catch (err) {
    slotState.unitQuizCreateError = err.message || '建立空白題目失敗';
  } finally {
    slotState.unitQuizCreateLoading = false;
  }
}

/** POST /rag/tab/unit/quiz/llm-generate：body 僅 rag_quiz_id、quiz_name、quiz_user_prompt_text；quizCardRow 必傳時以該列 rag_quiz_id／prompt 為準（多題同單元） */
async function submitUnitQuizLlmGenerate(slotIndex, quizCardRow = null) {
  const slotState = getSlotFormState(slotIndex);
  const tab = activeUnitTabItem.value;
  const state = currentState.value;
  const rag = currentRagItem.value;
  const personId = getPersonId(authStore);
  if (!personId) {
    slotState.unitQuizCreateError = '請先登入';
    return;
  }
  const rqFromRow =
    quizCardRow != null && typeof quizCardRow === 'object'
      ? positiveRagQuizIdFromQuizRow(quizCardRow)
      : null;
  const draftN =
    parsePositiveQuizId(slotState.unitDraftRagQuizId)
    ?? parsePositiveQuizId(slotState.lastSuccessfulCreatedRagQuizId);
  const stack = Array.isArray(state.unitSlotQuizCards?.[slotIndex - 1])
    ? state.unitSlotQuizCards[slotIndex - 1]
    : [];
  const draftCard =
    draftN != null
      ? stack.find((c) => positiveRagQuizIdFromQuizRow(c) === draftN)
      : null;
  const slotCard = draftCard ?? state.cardList[slotIndex - 1];
  const fromCard = slotCard ? positiveRagQuizIdFromCard(slotCard) : null;
  const anchorTab = tab?.anchorRagQuizId != null ? parsePositiveQuizId(tab.anchorRagQuizId) : null;
  const rqid =
    (rqFromRow != null && rqFromRow >= 1 ? rqFromRow : null)
    ?? draftN
    ?? fromCard
    ?? anchorTab;
  if (rqid == null || rqid < 1) {
    slotState.unitQuizCreateError =
      '無法取得 rag_quiz_id。請先按「新增題目」（POST create 已成功應已取得編號）；若已按過仍發生請重新整理，或確認未切到其他單元槽位後再試。';
    return;
  }
  const promptText =
    (quizCardRow != null && typeof quizCardRow === 'object'
      ? String(quizCardRow.quizUserPromptText ?? '').trim()
      : '')
    || String(slotState.quizUserPromptText ?? '').trim();
  if (!promptText) {
    slotState.unitQuizCreateError = '請填寫出題prompt（quiz_user_prompt_text），再產生題目';
    return;
  }
  const quizNameOut =
    quizCardRow != null && typeof quizCardRow === 'object'
      ? String(quizCardRow.quizName ?? '').trim()
      : '';
  if (!quizNameOut) {
    slotState.unitQuizCreateError = '請填寫題目名稱（quiz_name），再產生題目';
    return;
  }
  slotState.unitQuizCreateLoading = true;
  slotState.unitQuizCreateError = '';
  try {
    const data = await apiRagUnitQuizLlmGenerate(
      {
        rag_quiz_id: rqid,
        quiz_name: quizNameOut,
        quiz_user_prompt_text: promptText,
      },
      personId
    );
    slotState.responseJson = data;
    const quizContentRaw = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? data.quiz_content ?? '';
    const quizContent = String(quizContentRaw ?? '');
    const quizContentTrimmed = quizContent.trim();
    const hintText = data.quiz_hint ?? data.hint ?? '';
    const targetFilename = data.unit_filename ?? data.target_filename ?? tab?.filename ?? '';
    const referenceAnswerText =
      data.quiz_reference_answer
      ?? data.quiz_answer_reference
      ?? data.quiz_answer
      ?? data.answer
      ?? '';
    const rawRagQuizId =
      data.rag_quiz_id != null ? Number(data.rag_quiz_id) : (data.quiz_id != null ? Number(data.quiz_id) : null);
    const ragQuizId = Number.isFinite(rawRagQuizId) ? rawRagQuizId : rqid;
    const ragName = String(tab?.unitName ?? tab?.label ?? '').trim();
    const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
    if (!quizContentTrimmed) {
      slotState.unitQuizCreateError = '產生失敗：後端回傳 quiz_content 為空，請調整 prompt 後重試';
      return;
    }
    slotState.unitDraftRagQuizId = null;
    slotState.lastSuccessfulCreatedRagQuizId = null;
    slotState.quizUserPromptText = promptText;
    setCardAtSlot(
      slotIndex,
      quizContent,
      hintText,
      targetFilename,
      referenceAnswerText,
      ragName,
      data,
      null,
      (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
      ragId,
      ragQuizId,
      quizCardRow
    );
  } catch (err) {
    slotState.unitQuizCreateError = err.message || '產生題目失敗';
  } finally {
    slotState.unitQuizCreateLoading = false;
  }
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

/**
 * 將第 slotIndex 題設為指定卡片（每題獨立，不連動）。
 * @param {object | null} [mergeTargetRow] - 單元多題時：優先合併此列（與 unitSlotQuizCards 內同一引用），避免該列無 rag_quiz_id 時誤 push 新列導致 UI 仍顯示空白 prompt。
 */
function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed, ragId, ragQuizId, mergeTargetRow = null) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const slotStatePrompt = getSlotFormState(slotIndex);
  const promptSnap = String(slotStatePrompt.quizUserPromptText ?? '').trim();
  const gj =
    generateQuizResponseJson != null && typeof generateQuizResponseJson === 'object'
      ? generateQuizResponseJson
      : null;
  const apiQuizName = gj ? String(gj.quiz_name ?? gj.quizName ?? '').trim() : '';
  const mergeRowName =
    mergeTargetRow != null && typeof mergeTargetRow === 'object'
      ? String(mergeTargetRow.quizName ?? '').trim()
      : '';
  /** 優先後端回傳 quiz_name，其次使用者輸入之題名，再為既有列。 */
  /** @param {object | null | undefined} prevRow */
  function computeQuizName(prevRow) {
    if (apiQuizName !== '') return apiQuizName;
    if (mergeRowName !== '') return mergeRowName;
    if (prevRow != null && typeof prevRow === 'object') {
      const p = String(prevRow.quizName ?? '').trim();
      if (p !== '') return p;
    }
    return '';
  }
  const ragIdStr = ragId != null && String(ragId).trim() !== '' ? String(ragId) : null;
  const hasUnitTabsEarly = (currentState.value.unitTabOrder || []).length > 0;
  const unitExamDefaults = hasUnitTabsEarly
    ? {
      ...getRagQuizUnitMeta(slotIndex),
      rag_quiz_for_exam: false,
      ragQuizForExamLoading: false,
      ragQuizForExamError: '',
    }
    : {
      rag_tab_id: '',
      rag_unit_id: 0,
      rag_quiz_for_exam: false,
      ragQuizForExamLoading: false,
      ragQuizForExamError: '',
    };
  const card = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    hint: hint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    rag_id: ragIdStr,
    quiz_answer: quizAnswerPresetFromReference(referenceAnswer),
    hintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
    rag_quiz_id: ragQuizId ?? null,
    quizUserPromptText: promptSnap,
    gradingPrompt: '',
    quizName: computeQuizName(null),
    ...unitExamDefaults,
  };

  const hasUnitTabs = (state.unitTabOrder || []).length > 0;
  if (hasUnitTabs) {
    if (!state.unitSlotQuizCards) state.unitSlotQuizCards = [];
    while (state.unitSlotQuizCards.length < slotIndex) state.unitSlotQuizCards.push([]);
    let sub = state.unitSlotQuizCards[slotIndex - 1];
    if (!Array.isArray(sub)) {
      state.unitSlotQuizCards[slotIndex - 1] = [];
      sub = state.unitSlotQuizCards[slotIndex - 1];
    }
    const targetRid = parsePositiveQuizId(ragQuizId);
    let idx = -1;
    if (mergeTargetRow != null && typeof mergeTargetRow === 'object') {
      idx = sub.findIndex((c) => c === mergeTargetRow);
    }
    if (idx < 0 && targetRid != null) {
      idx = sub.findIndex((c) => positiveRagQuizIdFromQuizRow(c) === targetRid);
    }
    if (idx >= 0) {
      const prev = sub[idx];
      card.id = prev.id;
      const prevAns = prev.quiz_answer ?? '';
      const preset = quizAnswerPresetFromReference(referenceAnswer);
      card.quiz_answer =
        String(prevAns).trim() !== '' ? prevAns : preset;
      card.hintVisible = prev.hintVisible ?? false;
      card.confirmed = prev.confirmed ?? false;
      card.gradingResult = prev.gradingResult ?? '';
      card.gradingResponseJson = prev.gradingResponseJson ?? null;
      card.answer_id = prev.answer_id ?? null;
      card.quizUserPromptText = promptSnap || prev.quizUserPromptText || '';
      card.gradingPrompt = prev.gradingPrompt ?? '';
      card.quizName = computeQuizName(prev);
      card.rag_tab_id =
        prev.rag_tab_id != null && String(prev.rag_tab_id).trim() !== ''
          ? prev.rag_tab_id
          : card.rag_tab_id;
      card.rag_unit_id = prev.rag_unit_id != null ? prev.rag_unit_id : card.rag_unit_id;
      card.rag_quiz_for_exam = prev.rag_quiz_for_exam ?? card.rag_quiz_for_exam;
      card.ragQuizForExamLoading = false;
      card.ragQuizForExamError = '';
      sub[idx] = { ...prev, ...card };
    } else {
      sub.push(card);
    }
    state.unitSlotQuizCards[slotIndex - 1] = sortUnitQuizCardsByRagQuizId(sub);
    state.cardList[slotIndex - 1] = focalCardFromUnitQuizList(
      state.unitSlotQuizCards[slotIndex - 1],
      state.slotFormState?.[slotIndex]
    );
    return;
  }

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
    slotState.error = '無法取得題庫編號，請先上傳教材或重新整理頁面';
    return;
  }
  if (!generateQuizUnits.value.length) {
    slotState.error = '請先在「出題設定」按「開始建立題庫」完成題庫建立，或重新整理頁面';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  try {
    const data = await apiGenerateQuiz(ragId, sourceTabId, unitName);
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
      null,
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

/** 評分：POST /rag/tab/unit/quiz/llm-grade；body: rag_id、rag_tab_id（選填）、rag_quiz_id、quiz_content、quiz_answer；選填 answer_user_prompt_text（題卡 gradingPrompt）；回傳 202 + job_id；輪詢 GET /rag/tab/unit/quiz/grade-result/{job_id}。 */
async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
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
    item.gradingResult = '請先上傳教材並完成題庫建立，再進行批改。';
    return;
  }
  if (ragId == null) {
    item.gradingResult = '無法批改：請先上傳教材或重新整理頁面後再試。';
    return;
  }
  gradingSubmittingCardId.value = item.id;
  try {
    await submitGrade(item, { sourceTabId, ragId }, {});
  } finally {
    gradingSubmittingCardId.value = null;
  }
}
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay
      :is-visible="loadingOverlayVisible"
      :loading-text="loadingOverlayText"
      :sub-text="loadingOverlaySubText"
    />
    <TabRenameModal
      v-model="renameRagTabModalOpen"
      :initial-name="renameRagTabInitialName"
      :saving="renameRagTabSaving"
      :error="renameRagTabError"
      title="修改名稱"
      @save="onRenameRagTabSave"
    />
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">{{ pageTitle }}</p>
      </div>
    </header>
    <div class="flex-shrink-0 my-rag-tabs-bar my-bgcolor-gray-4">
      <div class="d-flex justify-content-center align-items-center w-100">
        <template v-if="ragListLoading && ragItems.length === 0 && newTabItems.length === 0">
          <div class="w-100 py-2" aria-busy="true" />
        </template>
        <template v-else-if="ragItems.length === 0 && newTabItems.length === 0">
          <div class="w-100 py-2" aria-hidden="true" />
        </template>
        <template v-else>
          <ul class="nav nav-tabs w-100">
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
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4 pe-2"
                  title="重新命名分頁"
                  :disabled="deleteRagLoading || renameRagTabSaving"
                  @click.stop="openRenameRagTab(item._tabId)"
                >
                  <i class="fa-solid fa-pen" aria-hidden="true" />
                </button>
                <span
                  v-if="item._isExamRag"
                  class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn"
                  title="試卷用題庫"
                  role="img"
                >
                  <span
                    class="rounded-circle d-inline-block my-bgcolor-green"
                    style="width: 0.5rem; height: 0.5rem"
                  />
                </span>
                <button
                  v-if="activeTabId === item._tabId"
                  type="button"
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4"
                  :title="item._isExamRag ? '刪除此題庫（將取消試卷用設定）' : '刪除此出題單元'"
                  :disabled="deleteRagLoading || renameRagTabSaving"
                  @click.stop="onDeleteRagTab(item._tabId)"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true" />
                </button>
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
                aria-label="新增分頁"
                :aria-busy="createRagLoading"
                class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle mb-2"
                :disabled="createRagLoading"
                @click="addNewTab"
              >
                <i class="fa-solid fa-plus" aria-hidden="true" />
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

    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div
        v-if="!showCreateBankMainForm"
        class="flex-grow-1 d-flex align-items-center justify-content-center px-3 py-5 min-h-0"
      >
        <button
          type="button"
          class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
          :title="`新增${quizBankNoun}`"
          :aria-label="`新增${quizBankNoun}`"
          :disabled="createRagLoading"
          :aria-busy="createRagLoading"
          @click="addNewTab"
        >
          <i class="fa-solid fa-plus" aria-hidden="true" />
          新增{{ quizBankNoun }}
        </button>
      </div>
      <div v-else class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <!-- 有資料或已點新增後顯示表單 -->
      <template v-if="showCreateBankMainForm">
      <!-- 建立流程 stepper：依 file_metadata / rag_metadata 亮起 1～3 步 -->
      <section v-if="showStepperSection" class="my-page-block-spacing">
        <div class="my-create-rag-stepper text-start">
          <div class="d-flex justify-content-between align-items-start gap-2 gap-sm-3 w-100">
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="my-create-rag-stepper-num rounded-circle d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-600"
              :class="createRagStepperPhase >= 1 ? 'my-create-rag-stepper-num--on' : 'my-create-rag-stepper-num--off'"
            >1</span>
            <span
              class="my-create-rag-stepper-label"
              :class="createRagStepperPhase >= 1 ? 'my-create-rag-stepper-label--current my-font-sm-600' : 'my-create-rag-stepper-label--inactive my-font-sm-400'"
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
              class="my-create-rag-stepper-label"
              :class="createRagStepperPhase >= 2 ? 'my-create-rag-stepper-label--current my-font-sm-600' : 'my-create-rag-stepper-label--inactive my-font-sm-400'"
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
              class="my-create-rag-stepper-label"
              :class="createRagStepperPhase >= 3 ? 'my-create-rag-stepper-label--current my-font-sm-600' : 'my-create-rag-stepper-label--inactive my-font-sm-400'"
            >測試單元</span>
          </div>
          </div>
        </div>
      </section>
      <!-- 尚無 file_metadata 時顯示上傳區；DesignPage 同款 rounded-4 my-bgcolor-gray-3 p-4 mb-5 + 區塊標題 -->
      <section v-if="showUploadFileSection" class="text-start my-page-block-spacing">
        <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
          <div class="my-font-lg-600 my-color-black text-break mb-4" role="heading" aria-level="2">上傳檔案</div>

            <input
              ref="zipFileInputRef"
              type="file"
              :accept="zipFileInputAccept"
              class="d-none"
              @change="onZipChange"
            >
            <div
              class="my-zip-drop-zone text-center position-relative"
              :class="{ 'my-zip-drop-zone-over': isZipDragOver }"
              @dragover="onZipDragOver"
              @dragenter="onZipDragOver"
              @dragleave="onZipDragLeave"
              @drop="onZipDrop"
              @click="openZipFileDialog()"
            >
              <template v-if="currentState.zipFileName">
                <span class="my-font-sm-400 my-color-black">{{ currentState.zipFileName }}</span>
                <div class="my-font-sm-400 my-color-gray-4 mt-1">點擊可重新選擇檔案</div>
              </template>
              <span v-else class="my-font-sm-400 my-color-gray-4">拖曳.zip檔到這裡，或點擊選擇檔案</span>
              <div class="my-font-sm-400 my-color-gray-4 mt-2">
                單檔不可超過 50 MB
              </div>
              <div class="my-font-sm-400 my-color-gray-4 mt-1">
                可解析的檔案副檔名：.pdf、.doc、.docx、.ppt、.pptx
              </div>
            </div>
            <div v-if="currentState.zipError" class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0">
              {{ currentState.zipError }}
            </div>
            <div class="d-flex justify-content-center mt-3">
              <button
                type="button"
                class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                :disabled="examZipConfirmUploadDisabled"
                @click.stop="confirmUploadZip"
              >
                確定上傳
              </button>
            </div>
        </div>
      </section>
      <!-- 建立 RAG：要有 file_metadata 才顯示；未建置時僅可編輯「出題設定」卡，建置完成後另顯唯讀摘要卡（rounded-4 深灰） -->
      <template v-if="fileMetadataToShow != null">
        <div
          class="w-100"
          :class="{ 'pe-none my-color-gray-4': !hasRagMetadata && packGroupsEditBlocked }"
        >
          <!-- 建置完成後僅保留下方唯讀「出題設定」卡，不重複檔名／已套用提示 -->
          <section
            v-if="!hasBuiltRagSummary"
            class="text-start my-page-block-spacing"
          >
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div
              class="my-font-lg-600 my-color-black text-break mb-4"
              role="heading"
              aria-level="2"
            >
              出題設定
            </div>
            <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                for="rag-upload-zip-fn-prod-edit"
              >上傳檔案名稱（檔案大小）</label>
              <input
                id="rag-upload-zip-fn-prod-edit"
                type="text"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                readonly
                :value="uploadZipReadonlyInputValue"
                autocomplete="off"
              >
            </div>
          <!-- 課程：可拖曳至出題單元 -->
          <div v-if="secondFoldersFull.length" class="mb-3">
            <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">資料夾</div>
            <div
              class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 d-flex flex-wrap gap-2 align-items-center"
              role="group"
              aria-label="資料夾"
            >
              <div
                v-for="(name, i) in secondFoldersFull"
                :key="'sf-' + i"
                class="badge my-bgcolor-surface my-color-black border user-select-none my-font-sm-400 rounded px-2 py-1"
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

          <!-- 出題單元：可放置課程標籤（與其他 input 同 form-control + px-3 py-2） -->
          <div class="mb-3 d-flex flex-column gap-2 w-100 min-w-0">
            <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">出題單元</div>
            <div
              class="d-flex flex-wrap align-items-stretch justify-content-start gap-2 w-100 min-w-0"
              role="group"
              aria-label="出題單元"
            >
              <template v-for="(group, gi) in ragListDisplayGroups" :key="'rg-' + gi">
                <div
                  class="form-control my-input-md my-input-md--on-dark rounded-2 min-w-0 px-3 py-2 d-flex align-items-center gap-1 position-relative my-pack-drop-target"
                  style="min-width: 120px; min-height: 2.5rem; flex: 0 1 auto;"
                  @dragover.prevent="onDragOver($event)"
                  @dragenter.prevent="onDragEnter($event)"
                  @dragleave="onDragLeave($event)"
                  @drop.prevent="onDropRagList($event, gi)"
                >
                  <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
                    <div
                      v-for="(tag, ti) in group"
                      :key="'t-' + gi + '-' + ti"
                      class="badge my-bgcolor-surface my-color-black border user-select-none my-font-sm-400 d-inline-flex align-items-center gap-1 rounded px-2 py-1"
                      style="cursor: grab;"
                      draggable="true"
                      role="button"
                      @dragstart="onDragStartTag($event, tag, true, gi, ti)"
                      @dragend="onDragEndTag"
                    >
                      {{ tag }}
                      <span
                        class="my-color-gray-4 ms-1"
                        style="cursor: pointer;"
                        @click.stop="removeFromRagList(gi, ti)"
                      >×</span>
                    </div>
                    <span v-if="!group.length" class="my-color-gray-4 my-font-sm-400">拖入此處</span>
                  </div>
                  <button
                    v-if="(currentState.packTasksList || []).length > 0"
                    type="button"
                    class="btn btn-link my-color-gray-4 text-decoration-none flex-shrink-0 p-0 ms-1"
                    style="min-width: 1.5rem;"
                    @click.stop="removeRagListGroup(gi)"
                  >
                    ×
                  </button>
                </div>
              </template>
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2 w-100 min-w-0">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-center flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1 my-pack-drop-target"
                  style="flex: 0 0 auto;"
                  @dragover.prevent="onDragOver($event)"
                  @dragenter.prevent="onDragEnter($event)"
                  @dragleave="onDragLeave($event)"
                  @drop.prevent="onDropRagList($event, (currentState.packTasksList || []).length)"
                  @click="addRagListGroup"
                >
                  + 新增出題單元
                </button>
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-center flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
                  style="flex: 0 0 auto;"
                  :disabled="!(currentState.packTasksList || []).length"
                  aria-label="刪除所有出題單元"
                  title="清空所有出題單元（含空位）"
                  @click="clearAllRagListGroups"
                >
                  刪除所有單元
                </button>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-2 ms-auto">
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-button-gray-4 px-3 py-1"
                  :disabled="!secondFoldersFull.length"
                  @click="addAllSecondFoldersAsGroups"
                >
                  每個資料夾獨立單元
                </button>
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-button-gray-4 px-3 py-1"
                  :disabled="!secondFoldersFull.length"
                  title="在現有出題單元之後追加一組，內含全部資料夾；打包時檔名以 + 連接"
                  @click="setAllSecondFoldersAsSingleGroup"
                >
                  每個資料夾合併單元
                </button>
              </div>
            </div>
          </div>

          <div class="d-flex flex-row flex-wrap align-items-end gap-3 mb-2">
            <div class="d-flex flex-column gap-0 flex-grow-1 min-w-0 my-rag-pack-chunk-col">
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                for="rag-pack-chunk-size"
              >分段長度（字元）</label>
              <input
                id="rag-pack-chunk-size"
                v-model.number="chunkSize"
                type="number"
                min="1"
                step="1"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                placeholder="1000"
                autocomplete="off"
              >
            </div>
            <div class="d-flex flex-column gap-0 flex-grow-1 min-w-0 my-rag-pack-chunk-col">
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                for="rag-pack-chunk-overlap"
              >分段重疊（字元）</label>
              <input
                id="rag-pack-chunk-overlap"
                v-model.number="chunkOverlap"
                type="number"
                min="0"
                step="1"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                placeholder="200"
                autocomplete="off"
              >
            </div>
          </div>
          <div class="d-flex justify-content-center mt-3">
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 flex-shrink-0 px-3 py-2 my-font-md-400 my-button-white"
              :disabled="
                packGroupsEditBlocked ||
                !isPackTasksListReady(currentState.packTasksList ?? []) ||
                currentState.packLoading
              "
              :aria-busy="currentState.packLoading"
              aria-label="開始建立題庫"
              @click="confirmPack"
            >
              開始建立題庫
            </button>
          </div>
          <div
            v-if="currentState.packLoading"
            class="my-font-sm-400 my-color-gray-4 text-break text-center mt-2 mb-1"
            role="status"
            aria-live="polite"
          >
            <template v-if="currentState.packBuildTotal > 0">
              <div>共 {{ currentState.packBuildTotal }} 個 RAG ZIP；已完成 {{ currentState.packBuildDone }} 個</div>
              <div v-if="currentState.packBuildCurrent > 0" class="mt-1">
                建置中 {{ currentState.packBuildCurrent }} / {{ currentState.packBuildTotal }}
              </div>
            </template>
            <template v-else>建立題庫中…</template>
          </div>
          <div
            v-if="currentState.packError"
            class="my-alert-danger-soft my-font-sm-400 py-2 mb-2 text-break"
            style="white-space: pre-wrap"
          >
            {{ currentState.packError }}
          </div>
          </div>
          </section>
          <!-- 唯讀摘要：建置完成後顯示（含剛 build 完但列表尚未同步 rag_metadata 的情況） -->
          <section
            v-if="hasBuiltRagSummary"
            class="text-start my-page-block-spacing"
          >
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div
              class="my-font-lg-600 my-color-black text-break mb-4"
              role="heading"
              aria-level="2"
            >
              出題設定
            </div>
            <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                for="rag-upload-zip-fn-prod-ro"
              >上傳檔案名稱（檔案大小）</label>
              <input
                id="rag-upload-zip-fn-prod-ro"
                type="text"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                readonly
                :value="uploadZipReadonlyInputValue"
                autocomplete="off"
              >
            </div>
              <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
                <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">出題單元</div>
                <div
                  class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 lh-base text-break"
                  :class="ragListReadonlyGroups.length ? 'my-color-white' : 'my-color-gray-4'"
                >
                  {{ ragListReadonlyGroups.length ? ragListReadonlyInlineText : '—' }}
                </div>
              </div>
              <div class="d-flex flex-row flex-wrap align-items-end gap-3 mb-3">
                <div class="d-flex flex-column gap-0 flex-grow-1 min-w-0 my-rag-pack-chunk-col">
                  <label
                    class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                    for="rag-pack-chunk-size-ro"
                  >分段長度（字元）</label>
                  <input
                    id="rag-pack-chunk-size-ro"
                    type="text"
                    class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                    :value="String(chunkSize)"
                    readonly
                    autocomplete="off"
                  >
                </div>
                <div class="d-flex flex-column gap-0 flex-grow-1 min-w-0 my-rag-pack-chunk-col">
                  <label
                    class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                    for="rag-pack-chunk-overlap-ro"
                  >分段重疊（字元）</label>
                  <input
                    id="rag-pack-chunk-overlap-ro"
                    type="text"
                    class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                    :value="String(chunkOverlap)"
                    readonly
                    autocomplete="off"
                  >
                </div>
              </div>
          </div>
          </section>
        </div>
      </template>
      <!-- 測試題目：標題在區塊外；每題（題卡或產生題目槽）各一 rounded-4 深灰塊 -->
      <div
        v-if="hasBuiltRagSummary"
        class="text-start my-page-block-spacing"
      >
          <div
            class="d-flex align-items-center gap-3 mb-4 w-100 min-w-0"
            role="heading"
            aria-level="2"
          >
            <div class="my-test-section-heading-line flex-grow-1" aria-hidden="true" />
            <span class="my-font-lg-600 my-test-section-heading-title flex-shrink-0">測試單元</span>
            <div class="my-test-section-heading-line flex-grow-1" aria-hidden="true" />
          </div>
          <div
            class="d-flex flex-column gap-4 w-100 min-w-0"
            :class="{ 'my-color-gray-4': ragGenerateDisabled }"
          >
            <div
              v-if="(currentState.unitTabOrder || []).length > 0"
              class="w-100 my-rag-tabs-bar my-bgcolor-gray-4"
            >
              <div class="d-flex justify-content-center align-items-center w-100">
                <ul class="nav nav-tabs w-100" role="tablist">
                  <li
                    v-for="item in currentState.unitTabOrder"
                    :key="item.id"
                    class="nav-item"
                  >
                    <div
                      role="tab"
                      class="nav-link d-flex align-items-center gap-1"
                      :class="{ active: currentState.activeUnitTabId === item.id }"
                      :aria-selected="currentState.activeUnitTabId === item.id"
                      :tabindex="currentState.activeUnitTabId === item.id ? 0 : -1"
                    >
                      <span
                        class="flex-grow-1 text-start pe-2 min-w-0 text-truncate"
                        style="cursor: pointer"
                        :title="item.label"
                        @click="currentState.activeUnitTabId = item.id"
                      >{{ item.label }}</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
            <div
              v-if="(currentState.unitTabOrder || []).length > 0"
              class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0"
            >
              <div class="my-font-md-600 my-color-black mb-3">單元基本資訊</div>
              <div class="row g-3">
                <div class="col-12 col-md-6 d-flex flex-column gap-1">
                  <span class="my-font-sm-400 my-color-gray-1">單元名稱</span>
                  <span class="my-font-md-400 my-color-black text-break">{{ activeUnitTabItem?.unitName || activeUnitTabItem?.label || '—' }}</span>
                </div>
                <div class="col-12 col-md-6 d-flex flex-column gap-1">
                  <span class="my-font-sm-400 my-color-gray-1">來源檔案</span>
                  <span class="my-font-md-400 my-color-black text-break">{{ activeUnitTabItem?.filename || '—' }}</span>
                </div>
              </div>
            </div>
            <!-- ── 單元底下多題：每題獨立一區塊（prompt + 題卡）── -->
            <template v-if="hasUnitSubTabs && (getSlotFormState(activeUnitSlotIndex).showGenerateForm || activeUnitQuizCards.length > 0)">
              <div class="d-flex flex-column align-items-stretch gap-4 w-100">
                <div
                  v-for="(quizCard, qIdx) in activeUnitQuizCards"
                  :key="String(quizCard.rag_quiz_id ?? quizCard.id ?? qIdx)"
                  class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 text-start d-flex flex-column gap-3"
                >
                  <div class="my-font-md-600 my-color-black">
                    第 {{ qIdx + 1 }} 題
                  </div>
                  <div class="d-flex flex-column gap-2 min-w-0">
                    <label
                      class="my-color-gray-1 my-font-sm-400 mb-0 d-block"
                      :for="quizRowQuizEmpty(quizCard) ? `rag-unit-quiz-name-${activeUnitSlotIndex}-${qIdx}` : undefined"
                    >
                      題目名稱<span class="text-danger" aria-hidden="true">＊</span>
                    </label>
                    <input
                      v-if="quizRowQuizEmpty(quizCard)"
                      :id="`rag-unit-quiz-name-${activeUnitSlotIndex}-${qIdx}`"
                      v-model="quizCard.quizName"
                      type="text"
                      class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0"
                      placeholder="請輸入題目名稱（必填）"
                      maxlength="500"
                      autocomplete="off"
                      required
                      :disabled="!!getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                    >
                    <div
                      v-else
                      class="form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2"
                      role="status"
                    >
                      {{ String(quizCard.quizName ?? '').trim() ? quizCard.quizName : '—' }}
                    </div>
                  </div>
                  <div class="d-flex flex-column gap-2 min-w-0">
                    <label
                      class="my-color-gray-1 my-font-sm-400 mb-0 d-block"
                      :for="quizRowQuizEmpty(quizCard) ? `rag-unit-quiz-prompt-${activeUnitSlotIndex}-${qIdx}` : undefined"
                    >
                      出題prompt
                    </label>
                    <div class="my-rag-unit-quiz-prompt-editor min-w-0">
                      <EnglishExamMarkdownEditor
                        v-if="quizRowQuizEmpty(quizCard)"
                        v-model="quizCard.quizUserPromptText"
                        :preview-only="false"
                        placeholder="貼上或輸入出題 Markdown（必填）…"
                        :textarea-id="`rag-unit-quiz-prompt-${activeUnitSlotIndex}-${qIdx}`"
                        :disabled="!!getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                      />
                      <EnglishExamMarkdownEditor
                        v-else
                        :model-value="String(quizCard.quizUserPromptText ?? '')"
                        preview-only
                        :textarea-id="`rag-unit-quiz-preview-${activeUnitSlotIndex}-${qIdx}`"
                      />
                    </div>
                  </div>
                  <template v-if="quizRowQuizEmpty(quizCard)">
                    <div class="d-flex justify-content-center">
                      <button
                        type="button"
                        class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                        :disabled="
                          getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading ||
                          !promptTextForQuizRow(quizCard, activeUnitSlotIndex) ||
                          !String(quizCard?.quizName ?? '').trim().length
                        "
                        :aria-busy="getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                        @click="submitUnitQuizLlmGenerate(activeUnitSlotIndex, quizCard)"
                      >
                        產生題目
                      </button>
                    </div>
                    <div
                      v-if="getSlotFormState(activeUnitSlotIndex).unitQuizCreateError"
                      class="my-alert-danger-soft my-font-sm-400 py-2 mb-0"
                    >
                      {{ getSlotFormState(activeUnitSlotIndex).unitQuizCreateError }}
                    </div>
                  </template>
                  <QuizCard
                    v-if="String(quizCard.quiz ?? '').trim().length > 0"
                    :card="quizCard"
                    :slot-index="qIdx + 1"
                    :current-rag-id="currentRagIdForQuizCards"
                    design-embedded
                    hide-unit-difficulty
                    hide-slot-index
                    :grade-submitting="
                      gradingSubmittingCardId != null &&
                      String(gradingSubmittingCardId) === String(quizCard.id)
                    "
                    design-ui
                    show-rag-quiz-for-exam-action
                    @mark-rag-quiz-for-exam="onMarkRagQuizForExam"
                    @toggle-hint="toggleHint"
                    @confirm-answer="confirmAnswer"
                    @update:quiz_answer="(val) => { quizCard.quiz_answer = val }"
                    @update:grading_prompt="(val) => { quizCard.gradingPrompt = val }"
                  />
                </div>
              </div>
            </template>
            <template v-else-if="!hasUnitSubTabs">
              <div
                class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 d-flex flex-column gap-3"
              >
                <div class="my-font-lg-600 my-color-black mb-0">
                  {{ activeUnitTabItem ? activeUnitTabItem.label : `第 ${activeUnitSlotIndex} 題` }}
                </div>
                <div class="text-start w-100 min-w-0">
                  <div
                    class="d-flex flex-row align-items-end gap-3 w-100 min-w-0 flex-nowrap justify-content-center"
                  >
                    <div class="d-flex flex-column gap-0 w-100 min-w-0 flex-grow-1">
                      <label
                        class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                        :for="`rag-quiz-unit-${activeUnitSlotIndex}-toggle`"
                      >單元</label>
                      <UnitSelectDropdown
                        v-model="getSlotFormState(activeUnitSlotIndex).generateQuizTabId"
                        :options="generateQuizUnits"
                        :menu-id="`rag-quiz-unit-${activeUnitSlotIndex}`"
                        :disabled="getSlotFormState(activeUnitSlotIndex).loading"
                      />
                    </div>
                  </div>
                  <div class="d-flex justify-content-center mt-3">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                      :disabled="getSlotFormState(activeUnitSlotIndex).loading || !String(getSlotFormState(activeUnitSlotIndex).generateQuizTabId || '').trim()"
                      :aria-busy="getSlotFormState(activeUnitSlotIndex).loading"
                      aria-label="產生題目"
                      @click="generateQuiz(activeUnitSlotIndex)"
                    >
                      產生題目
                    </button>
                  </div>
                  <div v-if="getSlotFormState(activeUnitSlotIndex).error" class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0">
                    {{ getSlotFormState(activeUnitSlotIndex).error }}
                  </div>
                </div>
              </div>
            </template>

            <!-- 單元子分頁：題卡／出題 prompt 區塊下方，維持最底「新增題目」 -->
            <div
              v-if="hasUnitSubTabs"
              class="d-flex justify-content-center pt-4 mb-0 w-100"
            >
              <button
                type="button"
                class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
                :disabled="getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                :aria-busy="getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                @click="createBlankUnitQuiz(activeUnitSlotIndex)"
              >
                <i class="fa-solid fa-plus" aria-hidden="true" />
                新增題目
              </button>
            </div>

            <!-- 新增題目按鈕：無單元子分頁時固定在最下面；與「新增測驗題庫」同款灰底膠囊＋加號 -->
            <div
              v-if="(currentState.unitTabOrder || []).length === 0"
              class="d-flex justify-content-center pt-2 mb-0"
            >
              <button
                type="button"
                class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
                title="新增題目"
                aria-label="新增題目"
                @click="openNextQuizSlot"
              >
                <i class="fa-solid fa-plus" aria-hidden="true" />
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
/* 區塊外標題：────── 測試題目 ────── */
.my-test-section-heading-line {
  display: block;
  border: 0;
  border-top: 1px solid var(--my-color-gray-2);
  flex: 1 1 0;
  min-width: 1rem;
}
.my-pack-drop-target.my-pack-drop-active {
  background-color: var(--my-drop-pack-active-bg) !important;
  border-color: var(--my-color-blue) !important;
}
/* 與英文測驗題庫「文字內容」同源 EasyMDE；略拉高編輯區高度對齊舊題說明文塊約 400px */
.my-rag-unit-quiz-prompt-editor :deep(.english-exam-md-editor-root) {
  --english-md-preview-max-h: min(60vh, 28rem);
}
.my-rag-unit-quiz-prompt-editor :deep(.english-exam-md-editor-wrap .CodeMirror-scroll),
.my-rag-unit-quiz-prompt-editor :deep(.english-exam-md-preview-panel) {
  min-height: 400px;
}
/* 深底稿頁：拖放啟用態在黑底 input 上可辨識 */
.form-control.my-input-md.my-input-md--on-dark.my-pack-drop-target.my-pack-drop-active {
  background-color: color-mix(in srgb, var(--my-color-blue) 22%, var(--my-color-black)) !important;
  border-color: var(--my-color-blue) !important;
}

</style>
