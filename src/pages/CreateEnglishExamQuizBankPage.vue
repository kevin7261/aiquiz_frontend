<script setup>
/**
 * CreateEnglishExamQuizBankPage - 建立英文測驗題庫（獨立頁面；RAG／列表／Pack／題卡／批改等皆走 `englishExam*` 專用模組，不與一般建立題庫共用 import 路徑）
 *
 * 分頁與 RAG 流程與後端契約同一般建立題庫；教材來源為文字／MP3／YouTube。
 * MP3 轉逐字稿：POST /english_system/transcript/audio（Deepgram，見 englishSystemApi）。YouTube：GET /english_system/transcript/youtube。
 */
import { ref, computed, watch, onMounted, onUnmounted, onActivated, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_GET_SYSTEM_SETTING_COURSE_NAME,
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
} from '../constants/api.js';
import { apiEnglishTranscriptAudio, apiEnglishTranscriptYoutube } from '../services/englishSystemApi.js';
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
} from '../services/englishExamRagApi.js';
import { formatGradingResult } from '../utils/grading.js';
import { formatFileSize } from '../utils/formatFileSize.js';
import { submitGrade } from '../composables/useEnglishExamQuizGrading.js';
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
} from '../utils/englishExamRag.js';
import { useEnglishExamRagList } from '../composables/useEnglishExamRagList.js';
import { useEnglishRagTabState } from '../composables/useEnglishRagTabState.js';
import { useEnglishExamPackTasks } from '../composables/useEnglishExamPackTasks.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import EnglishExamQuizCard from '../components/EnglishExamQuizCard.vue';
import EnglishExamUnitSelectDropdown from '../components/EnglishExamUnitSelectDropdown.vue';
import TabRenameModal from '../components/TabRenameModal.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';

defineProps({
  tabId: { type: String, required: true },
});

const pageTitle = '建立英文測驗題庫';
const quizBankNoun = '英文測驗題庫';

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

/** 建立英文測驗題庫：MP3 模式僅接受 .mp3 */
function fileHasAllowedEnglishMp3(file) {
  if (!file?.name) return false;
  return file.name.toLowerCase().endsWith('.mp3');
}

/** 本機 Whisper 轉逐字稿耗時（毫秒 → 可讀字串；秒皆為整數） */
function formatTranscribeDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const totalS = Math.round(ms / 1000);
  if (totalS < 60) return `${totalS} 秒`;
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`;
}

const ENGLISH_UPLOAD_MP3_ACCEPT = '.mp3,audio/mpeg,audio/mp3';

/**
 * 從 YouTube 網址或分享字串解析 11 字元影片 id（watch／youtu.be／embed／shorts）
 * @param {string} raw
 * @returns {string}
 */
function extractYoutubeVideoId(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  const tryUrl = s.includes('://') ? s : `https://${s}`;
  try {
    const u = new URL(tryUrl);
    const host = u.hostname.replace(/^www\./i, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]?.split('?')[0] ?? '';
      return /^[\w-]{11}$/.test(id) ? id : '';
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const embedI = parts.indexOf('embed');
      if (embedI >= 0 && parts[embedI + 1]) {
        const id = parts[embedI + 1].split('?')[0];
        if (/^[\w-]{11}$/.test(id)) return id;
      }
      const shortsI = parts.indexOf('shorts');
      if (shortsI >= 0 && parts[shortsI + 1]) {
        const id = parts[shortsI + 1].split('?')[0];
        if (/^[\w-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    /* ignore */
  }
  if (/^[\w-]{11}$/.test(s)) return s;
  return '';
}

const authStore = useAuthStore();

const { ragList, ragListLoading, ragListError, fetchRagList } = useEnglishExamRagList();
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
/** 與左側標題相同：GET /system-settings/course-name 的 course_name，失敗時維持 MyQuiz.ai */
const courseNameForPrompt = ref('MyQuiz.ai');
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);

const { getTabState, currentState, isNewTabId } = useEnglishRagTabState(activeTabId, newTabIds, ragList, authStore, { defaultSystemInstruction: DEFAULT_SYSTEM_INSTRUCTION });

/** MP3 模式：file input 的 accept */
const zipFileInputAccept = computed(() =>
  currentState.value?.englishSourceKind === 'mp3' ? ENGLISH_UPLOAD_MP3_ACCEPT : UPLOAD_ACCEPT_ATTR
);

/** YouTube 連結是否可嵌入預覽 */
const englishYoutubeVideoId = computed(() =>
  extractYoutubeVideoId(currentState.value?.englishYoutubeUrl ?? '')
);

const showCreateBankMainForm = computed(
  () => ragList.value.length > 0 || showFormWhenNoData.value
);
const showStepperSection = computed(() => !!activeTabId.value);

function checkRagHasMetadata(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return rag.rag_metadata != null && (typeof rag.rag_metadata === 'string' ? String(rag.rag_metadata).trim() !== '' : true);
}

function checkRagHasList(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return getRagUnitListString(rag) !== '';
}

/** 至少一個出題單元，且每個出題單元至少一個單元（與出題設定「開始建立題庫」按鈕啟用條件一致） */
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
    if (slot?.loading) return true;
  }
  return false;
});

const isGradingSubmitting = computed(() => gradingSubmittingCardId.value != null);

/** 全螢幕 LoadingOverlay：列表／建立分頁／刪除／更名／ZIP 上傳（上傳區 UI 不變，僅 overlay）／建題庫／測驗用設定／產生題目／批改／英文 MP3 Deepgram 轉逐字稿／YouTube 字幕 */
const loadingOverlayVisible = computed(
  () =>
    ragListLoading.value ||
    createRagLoading.value ||
    deleteRagLoading.value ||
    renameRagTabSaving.value ||
    !!currentState.value?.zipLoading ||
    !!currentState.value?.packLoading ||
    !!currentState.value?.forExamLoading ||
    !!currentState.value?.englishTranscriptAudioLoading ||
    !!currentState.value?.englishTranscriptYoutubeLoading ||
    hasAnySlotGenerating.value ||
    isGradingSubmitting.value
);

const loadingOverlayText = computed(() => {
  if (isGradingSubmitting.value) return '批改中...';
  if (hasAnySlotGenerating.value) return '產生題目中...';
  const st = currentState.value;
  if (st?.englishTranscriptAudioLoading) return '轉換逐字稿中...';
  if (st?.englishTranscriptYoutubeLoading) return '擷取字幕中...';
  if (st?.zipLoading) return '上傳中...';
  if (st?.packLoading) return '建立題庫中...';
  if (st?.forExamLoading) return '設定中...';
  if (deleteRagLoading.value) return '刪除中...';
  if (renameRagTabSaving.value) return '儲存中...';
  if (createRagLoading.value) return '建立中...';
  if (ragListLoading.value) return `載入${quizBankNoun}中`;
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
  if (st?.englishTranscriptAudioLoading) {
    void englishTranscriptOverlayTick.value;
    const ms = englishTranscriptOverlayStartedAt
      ? performance.now() - englishTranscriptOverlayStartedAt
      : 0;
    const elapsed = formatTranscribeDurationMs(ms) || '0 秒';
    return `已執行 ${elapsed}\n上傳至伺服器並以 Deepgram 轉成逐字稿…`;
  }
  if (st?.englishTranscriptYoutubeLoading) {
    void englishTranscriptOverlayTick.value;
    const ms = englishTranscriptOverlayStartedAt
      ? performance.now() - englishTranscriptOverlayStartedAt
      : 0;
    const elapsed = formatTranscribeDurationMs(ms) || '0 秒';
    return `已執行 ${elapsed}\n向伺服器取得 YouTube 公開字幕…`;
  }
  if (!st?.packLoading) return '';
  if (packBuildOverlayLines.value.length) return packBuildOverlayLines.value.join('\n');
  return '正在連線並準備建置…';
});

/** 英文逐字稿 LoadingOverlay：定時觸發 subText 重算以顯示已執行秒數 */
const englishTranscriptOverlayTick = ref(0);
let englishTranscriptOverlayStartedAt = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let englishTranscriptOverlayIntervalId = null;

function clearEnglishTranscriptOverlayTimer() {
  if (englishTranscriptOverlayIntervalId != null) {
    clearInterval(englishTranscriptOverlayIntervalId);
    englishTranscriptOverlayIntervalId = null;
  }
}

watch(
  () =>
    !!currentState.value?.englishTranscriptAudioLoading ||
    !!currentState.value?.englishTranscriptYoutubeLoading,
  (active) => {
    clearEnglishTranscriptOverlayTimer();
    if (!active) return;
    englishTranscriptOverlayStartedAt = performance.now();
    englishTranscriptOverlayTick.value = 0;
    englishTranscriptOverlayIntervalId = setInterval(() => {
      englishTranscriptOverlayTick.value++;
    }, 200);
  },
  { flush: 'sync' }
);

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
} = useEnglishExamPackTasks(currentState, fileMetadataToShow, packGroupsEditBlocked);

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
    label: `未命名${quizBankNoun}`,
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

/** 由 /rag/tabs 的 quiz（含 answers）組成一張題目卡片，供測試題目區塊顯示；批改結果從作答紀錄的 answer_metadata / answer_feedback_metadata 格式化 */
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

/** 切換教材類型時清空已選檔案，避免 MP3 與文字／YouTube 混淆 */
watch(
  () => currentState.value?.englishSourceKind,
  () => {
    const state = currentState.value;
    const tabId = activeTabId.value;
    resetZipState(state, tabId);
    state.zipError = '';
    state.englishTranscriptAudioError = '';
    state.englishTranscriptStorageBucket = '';
    state.englishTranscriptStoragePath = '';
    state.englishTranscriptYoutubeError = '';
    clearZipFileInput();
  }
);

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
    // 保持預設 MyQuiz.ai（與 LeftView 一致）
  }
}

/** GET /rag/tabs 由 useEnglishExamRagList 內 watch(immediate) 首次載入；每次從側欄再進入本頁（KeepAlive onActivated）再抓 GET /rag/tabs */
const createBankActivatedOnce = ref(false);
onActivated(() => {
  if (!createBankActivatedOnce.value) {
    createBankActivatedOnce.value = true;
    return;
  }
  fetchRagList();
});

/** 此處僅試題用設定、檔案欄位、課程名稱 */
onMounted(() => {
  refreshRagForExamSetting();
  clearZipFileInput();
  fetchCourseNameForPrompt();
});

onUnmounted(() => {
  clearEnglishTranscriptOverlayTimer();
});

/** 設為測驗用（PUT system-settings rag-for-exam-*） */
async function setRagForExam() {
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
    await fetchRagList({ silent: true });
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
    await fetchRagList({ silent: true });
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
  const tabName = `未命名${quizBankNoun}`;
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
    createRagError.value = err.message || `建立${quizBankNoun}失敗`;
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
    renameRagTabError.value = `找不到此${quizBankNoun}，請重新整理頁面後再試`;
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
  const englishMp3 = state.englishSourceKind === 'mp3';
  const allowed = englishMp3 ? fileHasAllowedEnglishMp3(file) : fileHasAllowedUploadExtension(file);
  if (!allowed) {
    resetZipState(state, tabId);
    state.zipError = englishMp3
      ? '請選擇 .mp3 音檔'
      : '請選擇允許的檔案：.pdf、.doc、.docx、.ppt、.pptx';
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
  if (currentState.value.englishSourceKind !== 'mp3') return;
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
  const tabId = activeTabId.value;
  if (isNewTabId(tabId) || !tabId) {
    state.zipError = `請先按「＋」建立${quizBankNoun}分頁，再上傳檔案`;
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

/** MP3：POST /english_system/transcript/audio（Deepgram）→ text 寫入 englishPasteText 並切至「文字」 */
async function onEnglishTranscriptAudioClick() {
  const state = currentState.value;
  const personId = getPersonId(authStore);
  if (!personId) {
    state.englishTranscriptAudioError = '請先登入';
    return;
  }
  if (!state.uploadedZipFile) {
    state.englishTranscriptAudioError = '請先選擇音訊檔';
    return;
  }
  const tabId = activeTabId.value;
  const systemTabId =
    tabId && !isNewTabId(tabId)
      ? String(tabId).trim()
      : String(state.tabId ?? '').trim();
  if (!systemTabId) {
    state.englishTranscriptAudioError = `請先按「＋」建立${quizBankNoun}分頁，再轉逐字稿`;
    return;
  }
  state.englishTranscriptAudioLoading = true;
  state.englishTranscriptAudioError = '';
  state.englishTranscriptAudioDurationMs = null;
  state.englishTranscriptStorageBucket = '';
  state.englishTranscriptStoragePath = '';
  const t0 = performance.now();
  try {
    const data = await apiEnglishTranscriptAudio(state.uploadedZipFile, {
      personId,
      systemTabId,
    });
    state.englishTranscriptAudioDurationMs = performance.now() - t0;
    const t = data?.text != null ? String(data.text) : '';
    state.englishPasteText = t;
    if (data?.bucket != null && String(data.bucket).trim() !== '') {
      state.englishTranscriptStorageBucket = String(data.bucket).trim();
    }
    if (data?.storage_path != null && String(data.storage_path).trim() !== '') {
      state.englishTranscriptStoragePath = String(data.storage_path).trim();
    }
    state.englishSourceKind = 'text';
  } catch (err) {
    state.englishTranscriptAudioDurationMs = null;
    state.englishTranscriptAudioError = is504OrNetworkError(err)
      ? '服務正在啟動或轉錄逾時，請稍後再試'
      : err?.message || '轉換失敗';
  } finally {
    state.englishTranscriptAudioLoading = false;
  }
}

/** YouTube：擷取字幕 → 寫入 englishPasteText 並切至「文字」 */
async function onEnglishTranscriptYoutubeClick() {
  const state = currentState.value;
  const personId = getPersonId(authStore);
  if (!personId) {
    state.englishTranscriptYoutubeError = '請先登入';
    return;
  }
  const raw = String(state.englishYoutubeUrl ?? '').trim();
  if (!raw) {
    state.englishTranscriptYoutubeError = '請輸入 YouTube 連結';
    return;
  }
  state.englishTranscriptYoutubeLoading = true;
  state.englishTranscriptYoutubeError = '';
  state.englishTranscriptYoutubeDurationMs = null;
  const ytT0 = performance.now();
  try {
    const lang = String(state.englishYoutubeTranscriptLanguages ?? '').trim();
    const data = await apiEnglishTranscriptYoutube(raw, {
      personId,
      ...(lang ? { languages: lang } : {}),
    });
    const t = data?.text != null ? String(data.text) : '';
    state.englishPasteText = t;
    const es = data?.elapsed_seconds;
    state.englishTranscriptYoutubeDurationMs =
      es != null && Number.isFinite(Number(es))
        ? Math.round(Number(es) * 1000)
        : Math.round(performance.now() - ytT0);
    state.englishSourceKind = 'text';
  } catch (err) {
    state.englishTranscriptYoutubeDurationMs = null;
    state.englishTranscriptYoutubeError = is504OrNetworkError(err)
      ? '服務正在啟動或逾時，請稍後再試'
      : err.message || '取得字幕失敗';
  } finally {
    state.englishTranscriptYoutubeLoading = false;
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
  gradingSubmittingCardId.value = item.id;
  try {
    await submitGrade(item, { sourceTabId, ragId });
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
                  v-else-if="activeTabId === item._tabId"
                  type="button"
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4"
                  title="刪除此出題單元"
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
            >測試題目</span>
          </div>
          </div>
        </div>
      </section>
      <!-- 尚無 file_metadata 時顯示上傳區；DesignPage 同款 rounded-4 my-bgcolor-gray-3 p-4 mb-5 + 區塊標題 -->
      <section v-if="showUploadFileSection" class="text-start my-page-block-spacing">
        <div class="rounded-4 my-bgcolor-gray-3 shadow-sm p-4 mb-5">
          <div class="my-font-lg-600 my-color-black text-break mb-4" role="heading" aria-level="2">上傳檔案</div>

          <!-- 教材類型與輸入區 -->
            <div class="mb-3 d-flex flex-column gap-1 w-100 min-w-0">
              <div
                id="english-bank-source-kind-label"
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
              >教材類型</div>
              <div
                class="btn-group my-btn-group-pill w-100"
                role="group"
                aria-labelledby="english-bank-source-kind-label"
              >
                <button
                  type="button"
                  class="btn d-flex justify-content-center align-items-center text-center my-font-md-400 px-2 px-sm-3 py-2 flex-fill"
                  :class="currentState.englishSourceKind === 'text' ? 'my-button-white' : 'my-button-gray-3'"
                  :aria-pressed="currentState.englishSourceKind === 'text'"
                  aria-label="文字"
                  @click="currentState.englishSourceKind = 'text'"
                >
                  文字
                </button>
                <button
                  type="button"
                  class="btn d-flex justify-content-center align-items-center text-center my-font-md-400 px-2 px-sm-3 py-2 flex-fill"
                  :class="currentState.englishSourceKind === 'mp3' ? 'my-button-white' : 'my-button-gray-3'"
                  :aria-pressed="currentState.englishSourceKind === 'mp3'"
                  aria-label="MP3"
                  @click="currentState.englishSourceKind = 'mp3'"
                >
                  MP3
                </button>
                <button
                  type="button"
                  class="btn d-flex justify-content-center align-items-center text-center my-font-md-400 px-2 px-sm-3 py-2 flex-fill"
                  :class="currentState.englishSourceKind === 'youtube' ? 'my-button-white' : 'my-button-gray-3'"
                  :aria-pressed="currentState.englishSourceKind === 'youtube'"
                  aria-label="YouTube 連結"
                  @click="currentState.englishSourceKind = 'youtube'"
                >
                  YouTube 連結
                </button>
              </div>
            </div>

            <!-- 文字 -->
            <div v-if="currentState.englishSourceKind === 'text'" class="mb-3">
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-1 d-block"
                for="english-bank-paste-text"
              >文字內容</label>
              <textarea
                id="english-bank-paste-text"
                v-model="currentState.englishPasteText"
                class="form-control my-input-md rounded-2 w-100 min-w-0 px-3 py-2"
                rows="10"
                placeholder="貼上或輸入英文教材文字…"
                autocomplete="off"
              />
              <div
                v-if="currentState.englishTranscriptAudioDurationMs != null"
                class="my-font-sm-400 my-color-black py-2 px-3 rounded-2 mt-2 mb-0 my-bgcolor-gray-3"
                role="status"
              >
                MP3 逐字稿轉換耗時：{{ formatTranscribeDurationMs(currentState.englishTranscriptAudioDurationMs) }}（上傳與後端 Deepgram 轉錄）
              </div>
              <div
                v-if="currentState.englishTranscriptYoutubeDurationMs != null"
                class="my-font-sm-400 my-color-black py-2 px-3 rounded-2 mt-2 mb-0 my-bgcolor-gray-3"
                role="status"
              >
                YouTube 字幕擷取耗時：{{ formatTranscribeDurationMs(currentState.englishTranscriptYoutubeDurationMs) }}
              </div>
              <div
                v-if="currentState.englishTranscriptStorageBucket && currentState.englishTranscriptStoragePath"
                class="my-font-sm-400 my-color-black py-2 px-3 rounded-2 mt-2 mb-0 my-bgcolor-gray-3"
                role="status"
              >
                轉逐字稿成功：音檔已寫入 Supabase—bucket「{{ currentState.englishTranscriptStorageBucket }}」；storage_path「<span class="text-break">{{ currentState.englishTranscriptStoragePath }}</span>」
              </div>
              <p class="my-font-sm-400 my-color-gray-4 mt-2 mb-0">
                送出與建題庫將於後端串接完成後開放；目前請改選 MP3 或改走「建立測驗題庫」上傳教材檔。
              </p>
            </div>

            <!-- MP3：與一般題庫相同流程（POST upload-zip） -->
            <template v-else-if="currentState.englishSourceKind === 'mp3'">
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
                <span v-else class="my-font-sm-400 my-color-gray-4">拖曳 MP3 到這裡，或點擊選擇檔案</span>
                <div class="my-font-sm-400 my-color-gray-4 mt-2">僅接受副檔名：.mp3</div>
              </div>
              <div class="d-flex flex-column align-items-center gap-2 mt-3 w-100">
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                  :disabled="!getPersonId(authStore) || !currentState.uploadedZipFile || currentState.englishTranscriptAudioLoading"
                  :aria-busy="currentState.englishTranscriptAudioLoading"
                  aria-label="轉換逐字稿"
                  @click="onEnglishTranscriptAudioClick"
                >
                  轉換逐字稿
                </button>
                <p
                  v-if="currentState.englishTranscriptAudioDurationMs != null"
                  class="my-font-sm-400 my-color-black mb-0 text-center"
                  role="status"
                >
                  轉換耗時：{{ formatTranscribeDurationMs(currentState.englishTranscriptAudioDurationMs) }}
                </p>
                <p class="my-font-sm-400 my-color-gray-4 mb-0 text-center">
                  後端 POST <code class="user-select-all">/english_system/transcript/audio</code>：音檔上傳至 Supabase（english bucket，路徑同 RAG upload），再以 Deepgram 轉成逐字稿（後端需 DEEPGRAM_API_KEY；可選 DEEPGRAM_MODEL，預設 nova-2）。不必先呼叫 english tab/create；無列時會依 <code class="user-select-all">system_tab_id</code> 與檔名自動建立。
                </p>
                <div
                  v-if="currentState.englishTranscriptAudioError"
                  class="my-alert-danger-soft my-font-sm-400 py-2 mb-0 w-100 text-start"
                  role="alert"
                >
                  {{ currentState.englishTranscriptAudioError }}
                </div>
              </div>
            </template>

            <!-- YouTube：連結 + 嵌入預覽 -->
            <div v-else class="mb-1">
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-1 d-block"
                for="english-bank-youtube-url"
              >YouTube 連結</label>
              <input
                id="english-bank-youtube-url"
                v-model="currentState.englishYoutubeUrl"
                type="url"
                class="form-control my-input-md rounded-2 w-100 min-w-0 px-3 py-2"
                placeholder="https://www.youtube.com/watch?v=… 或 youtu.be/…"
                autocomplete="off"
              >
              <label
                class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mt-2 mb-1 d-block"
                for="english-bank-youtube-langs"
              >字幕語言優先（選填）</label>
              <input
                id="english-bank-youtube-langs"
                v-model="currentState.englishYoutubeTranscriptLanguages"
                type="text"
                class="form-control my-input-md rounded-2 w-100 min-w-0 px-3 py-2"
                placeholder="例：en,zh-TW"
                autocomplete="off"
                aria-describedby="english-bank-youtube-langs-hint"
              >
              <p id="english-bank-youtube-langs-hint" class="my-font-sm-400 my-color-gray-4 mt-1 mb-0">
                逗號分隔；未填寫則由後端預設為 en。
              </p>
              <div class="d-flex flex-column gap-2 mt-2 w-100">
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white flex-shrink-0 px-3 py-2 align-self-start"
                  :disabled="!(currentState.englishYoutubeUrl || '').trim() || currentState.englishTranscriptYoutubeLoading"
                  :aria-busy="currentState.englishTranscriptYoutubeLoading"
                  aria-label="轉換逐字稿"
                  @click="onEnglishTranscriptYoutubeClick"
                >
                  轉換逐字稿
                </button>
                <p
                  v-if="currentState.englishTranscriptYoutubeDurationMs != null"
                  class="my-font-sm-400 my-color-black mb-0"
                  role="status"
                >
                  轉換耗時：{{ formatTranscribeDurationMs(currentState.englishTranscriptYoutubeDurationMs) }}
                </p>
                <p class="my-font-sm-400 my-color-gray-4 mb-0">
                  後端 GET <code class="user-select-all">/english_system/transcript/youtube</code>：擷取公開字幕並合併為單一純文字（與 Colab youtube-transcript-api 範例行為一致）；無字幕或無法存取時將顯示錯誤。
                </p>
                <div
                  v-if="currentState.englishTranscriptYoutubeError"
                  class="my-alert-danger-soft my-font-sm-400 py-2 mb-0"
                  role="alert"
                >
                  {{ currentState.englishTranscriptYoutubeError }}
                </div>
              </div>
              <div
                v-if="englishYoutubeVideoId"
                class="ratio ratio-16x9 mt-3 rounded-2 overflow-hidden border border-secondary border-opacity-25 bg-black"
              >
                <iframe
                  :src="`https://www.youtube-nocookie.com/embed/${englishYoutubeVideoId}`"
                  class="border-0"
                  title="YouTube 預覽"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allowfullscreen
                />
              </div>
              <div
                v-else-if="(currentState.englishYoutubeUrl || '').trim() !== ''"
                class="my-alert-warning-soft my-font-sm-400 py-2 mt-3 mb-0"
                role="status"
              >
                無法辨識此連結中的影片，請貼上有效的 YouTube 網址。
              </div>
              <p class="my-font-sm-400 my-color-gray-4 mt-3 mb-0">
                預覽僅供確認影片；建題庫上傳將於後端串接完成後開放。
              </p>
            </div>

            <div v-if="currentState.zipError" class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0">
              {{ currentState.zipError }}
            </div>
            <div v-if="currentState.englishSourceKind === 'mp3'" class="d-flex justify-content-center mt-3">
              <button
                type="button"
                class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                :disabled="!currentState.zipFileName"
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
          <!-- 建置完成後（hasRagMetadata）僅保留下方唯讀「出題設定」卡，不重複檔名／已套用提示 -->
          <section
            v-if="!hasRagMetadata"
            class="text-start my-page-block-spacing"
          >
            <div class="rounded-4 my-bgcolor-gray-3 shadow-sm p-4 mb-5">
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
          <div class="mt-3 d-flex flex-column gap-0 w-100 min-w-0">
            <label
              class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
              for="rag-pack-system-instruction"
            >出題說明 (prompt)</label>
            <div
              class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 d-flex flex-column gap-3"
            >
              <div class="my-font-md-400 my-color-gray-4 lh-base text-break">
                【出題規範】<br>
                請根據輸入的「參考內容」設計試卷題目。<br>
                請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。<br>
                題目難度：{quiz_level}。
              </div>
              <textarea
                id="rag-pack-system-instruction"
                v-model="currentState.systemInstruction"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 font-monospace"
                style="resize: vertical; min-height: 6rem;"
                rows="5"
                :placeholder="'留空則使用預設：' + DEFAULT_SYSTEM_INSTRUCTION"
                autocomplete="off"
              />
              <div class="my-font-md-400 my-color-gray-4 lh-base text-break">
                【回傳格式】<br>
                請以 JSON 格式回傳：<br>
                { "quiz_content": "問題內容", <br>
                "quiz_hint": "答案提示內容", <br>
                "quiz_answer_reference": "參考答案內容" }
              </div>
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
          <!-- 唯讀摘要：僅在已建置題庫（hasRagMetadata）後顯示；上傳後尚未建置時上方可編輯卡已含檔名，勿再重複一張卡 -->
          <section
            v-if="hasRagMetadata"
            class="text-start my-page-block-spacing"
          >
            <div class="rounded-4 my-bgcolor-gray-3 shadow-sm p-4 mb-5">
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
              <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
                <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">出題說明 (prompt)</div>
                <div
                  class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 my-font-md-400 lh-base text-break d-flex flex-column gap-3"
                >
                  <div class="my-color-gray-4">
                    你是一個「{{ courseNameForPrompt }}」課程的教授，請給學生設計試卷題目：<br>
                    【出題規範】<br>
                    請根據輸入的「參考內容」設計試卷題目。<br>
                    **請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。**<br>
                    題目難度：{quiz_level}。
                  </div>
                  <div>
                    <span class="my-color-red">{{ (currentState.systemInstruction ?? '').trim() || '—' }}</span>
                  </div>
                  <div class="my-color-gray-4">
                    【回傳格式】<br>
                    請以 JSON 格式回傳：<br>
                    { "quiz_content": "問題內容", <br>
                    "quiz_hint": "答案提示內容", <br>
                    "quiz_answer_reference": "參考答案內容" }
                  </div>
                </div>
              </div>
              <div
                v-if="!isNewTabId(activeTabId) && currentRagItem && (currentRagItem.rag_tab_id ?? currentRagItem.id)"
                class="d-flex flex-wrap justify-content-center align-items-center gap-2"
              >
                <button
                  type="button"
                  :class="
                    currentRagIsExamRag
                      ? 'btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-btn-outline-green-hollow px-3 py-2'
                      : 'btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-green px-3 py-2'
                  "
                  :disabled="currentState.forExamLoading"
                  :aria-busy="currentState.forExamLoading"
                  @click="currentRagIsExamRag ? clearRagForExam() : setRagForExam()"
                >
                  {{ currentRagIsExamRag ? '取消設為測驗用' : '設為測驗用' }}
                </button>
              </div>
              <div v-if="currentState.forExamError" class="my-alert-danger-soft my-font-sm-400 py-2 mb-0 mt-2">
                {{ currentState.forExamError }}
              </div>
          </div>
          </section>
        </div>
      </template>
      <!-- 測試題目：標題在區塊外；每題（題卡或產生題目槽）各一 rounded-4 深灰塊 -->
      <div
        v-if="currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== ''"
        class="text-start my-page-block-spacing"
      >
          <div
            class="d-flex align-items-center gap-3 mb-4 w-100 min-w-0"
            role="heading"
            aria-level="2"
          >
            <div class="my-test-section-heading-line flex-grow-1" aria-hidden="true" />
            <span class="my-font-lg-600 my-test-section-heading-title flex-shrink-0">測試題目</span>
            <div class="my-test-section-heading-line flex-grow-1" aria-hidden="true" />
          </div>
          <div
            class="d-flex flex-column gap-4 w-100 min-w-0"
            :class="{ 'my-color-gray-4': ragGenerateDisabled }"
          >
            <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
              <template v-if="currentState.cardList[slotIndex - 1]">
                <EnglishExamQuizCard
                  :card="currentState.cardList[slotIndex - 1]"
                  :slot-index="slotIndex"
                  :course-name="courseNameForPrompt"
                  :current-rag-id="currentRagIdForQuizCards"
                  :grade-submitting="
                    gradingSubmittingCardId != null &&
                    String(gradingSubmittingCardId) === String(currentState.cardList[slotIndex - 1].id)
                  "
                  design-ui
                  @toggle-hint="toggleHint"
                  @confirm-answer="confirmAnswer"
                  @update:quiz_answer="(val) => { currentState.cardList[slotIndex - 1].quiz_answer = val }"
                />
              </template>
              <template v-else>
                <div
                  class="rounded-4 my-bgcolor-gray-3 shadow-sm p-4 w-100 min-w-0 d-flex flex-column gap-3"
                >
                  <div class="my-font-lg-600 my-color-black mb-0">第 {{ slotIndex }} 題</div>
                  <div class="text-start w-100 min-w-0">
                  <div
                    class="d-flex flex-row align-items-end gap-3 w-100 min-w-0 flex-nowrap justify-content-center"
                  >
                    <div class="d-flex flex-column gap-0 w-100 min-w-0 flex-grow-1">
                      <label
                        class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                        :for="`rag-quiz-unit-${slotIndex}-toggle`"
                      >單元</label>
                      <EnglishExamUnitSelectDropdown
                        v-model="getSlotFormState(slotIndex).generateQuizTabId"
                        :options="generateQuizUnits"
                        :menu-id="`rag-quiz-unit-${slotIndex}`"
                        :disabled="getSlotFormState(slotIndex).loading"
                      />
                    </div>
                    <div class="d-flex flex-column gap-1 flex-shrink-0">
                      <div
                        class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                        :id="`rag-quiz-difficulty-label-${slotIndex}`"
                      >難度</div>
                      <div
                        class="btn-group my-btn-group-pill flex-shrink-0"
                        role="group"
                        :aria-labelledby="`rag-quiz-difficulty-label-${slotIndex}`"
                      >
                        <button
                          v-for="opt in difficultyOptions"
                          :key="'rag-quiz-diff-' + slotIndex + '-' + opt"
                          type="button"
                          class="btn d-flex justify-content-center align-items-center my-font-md-400 px-3 py-2"
                          :class="filterDifficulty === opt ? 'my-button-white' : 'my-button-gray-3'"
                          :aria-pressed="filterDifficulty === opt"
                          :disabled="getSlotFormState(slotIndex).loading"
                          @click="filterDifficulty = opt"
                        >
                          {{ opt }}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="d-flex justify-content-center mt-3">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                      :disabled="getSlotFormState(slotIndex).loading || !String(getSlotFormState(slotIndex).generateQuizTabId || '').trim()"
                      :aria-busy="getSlotFormState(slotIndex).loading"
                      aria-label="產生題目"
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

            <!-- 新增題目按鈕：固定在最下面；與「新增測驗題庫」同款灰底膠囊＋加號 -->
            <div class="d-flex justify-content-center pt-2 mb-0">
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
/* 深底稿頁：拖放啟用態在黑底 input 上可辨識 */
.form-control.my-input-md.my-input-md--on-dark.my-pack-drop-target.my-pack-drop-active {
  background-color: color-mix(in srgb, var(--my-color-blue) 22%, var(--my-color-black)) !important;
  border-color: var(--my-color-blue) !important;
}

</style>
