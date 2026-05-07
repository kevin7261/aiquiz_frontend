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
 * - 建 RAG：POST /rag/tab/build-rag-zip（NDJSON 串流；unit_list、unit_types、transcriptions〔與逗號分段同序〕、rag_chunk_sizes／rag_chunk_overlaps〔與群組同序之逗號字串；非 unit_type 1 時為 0〕、可選 unit_names〔與群組同序之逗號字串，名稱內逗號會轉空白〕；已不再傳 system_prompt_instruction）
 * - 設定單元：GET `/rag/transcript/text`、`/rag/transcript/audio`、`/rag/transcript/youtube`、`/rag/unit/mp3-file`、`/rag/unit/youtube-url` 期間全螢幕 LoadingOverlay（來源預覽／文字逐字稿讀取為「檔案讀取中…」，語音／影片逐字稿為「分析逐字稿中…」）；主按鈕文案固定為「載入檔案文字／載入語音文字／載入影片文字」。
 * - 分頁更名：PUT /rag/tab/tab-name（body: rag_id、tab_name）
 * - 試卷用：GET /rag/tabs 每筆 Rag.for_exam，或其 units／quizzes 任一有 Rag_Quiz.for_exam，或本機題卡 rag_quiz_for_exam，皆於分頁列顯示綠點並禁止刪除該題庫分頁（不再呼叫 system-settings rag-for-exam-*）
 * - 出題（舊／整庫）：POST /rag/tab/quiz/create（rag_id 必填；rag_tab_id、unit_name 選填可 ""）；評分：POST /rag/tab/unit/quiz/llm-grade（body 以 rag_id、rag_quiz_id、quiz_answer 為核心；quiz_content 可省略）、GET /rag/tab/unit/quiz/grade-result/{job_id}，ready 時 result: quiz_score、quiz_comments、rag_quiz_id、rag_answer_id
 * - 單元子分頁：GET /rag/tab/units；題型列「+」新增題庫 POST /rag/tab/unit/quiz/create（body: rag_tab_id、rag_unit_id；不呼叫 LLM）後推入一列（帶 rag_quiz_id）；後端若未帶 quiz_name 常將該欄預設為所屬 unit_name，故建立成功後前端會 PUT /rag/tab/unit/quiz/quiz-name 寫入「未命名題型」與草稿一致，再上傳／重整才不會被 hydrate 覆寫成單元名。再填題名／出題規則後按「產生題目」POST /rag/tab/unit/quiz/llm-generate；若列上尚無 rag_quiz_id（舊本機草稿），「產生題目」仍會先 create 再 llm；單題設為／取消測驗用 POST /rag/tab/unit/quiz/for-exam（body 僅 rag_quiz_id、for_exam）；題型 sub-tab 更名：PUT /rag/tab/unit/quiz/quiz-name（body: rag_quiz_id、quiz_name）；軟刪題型：PUT /rag/tab/quiz/delete/{rag_quiz_id}；「單元內容」：單元僅見上方子分頁；user_type 1／2／234；設定單元選 unit_type=2/3/4 時共用 Markdown 逐字稿編輯器，於編輯區上方按鈕載入檔案／語音／影片文字，完成載入前編輯區停用且不能開始建立單元；3 僅 `<audio>` 與「逐字稿」Modal（不列 mp3 檔名、不標聽取音訊）；4 內嵌 iframe 與逐字稿 Modal（不標 YouTube 字樣）；3 且已有 rag_unit_id 時 GET `/rag/tab/unit/mp3-file`；RAG（1）僅來源檔案
 * 上述 API 不需 llm_api_key。
 */
import { ref, computed, watch, onMounted, onActivated, reactive, nextTick } from 'vue';
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
  apiRagTranscriptText,
  apiRagTranscriptAudio,
  apiRagTranscriptYoutube,
  apiRagUnitMp3FileByFolder,
  apiRagUnitYoutubeUrlByFolder,
  transcriptResponseMarkdown,
  apiGetRagTabUnits,
  apiCreateRagUnitQuiz,
  apiRagUnitQuizLlmGenerate,
  apiMarkRagQuizForExam,
  apiGenerateQuiz,
  apiUpdateRagQuizName,
  apiDeleteRagQuiz,
  is504OrNetworkError,
} from '../services/ragApi.js';
import { formatGradingResult } from '../utils/grading.js';
import { formatFileSize } from '../utils/formatFileSize.js';
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js';
import { youtubeEmbedUrlFromInput } from '../utils/youtubeEmbed.js';
import { submitGrade } from '../composables/useQuizGrading.js';
import {
  generateTabId,
  deriveRagNameFromTabId,
  deriveRagName,
  getRagUnitListString,
  parsePackTasksList,
  parsePackUnitTypesFromRag,
  parseRagMetadataObject,
  unitSelectValue,
  reconcileQuizUnitSelectSlot,
  findQuizUnitBySlotSelection,
  examOrRagQuizRowKey,
  examOrRagAnswerRowKey,
  quizAnswerPresetFromReference,
  serializePackUnitTypesForApi,
  transcriptionsForBuildRagZip,
  chunkSizesOverlapsStringsForBuildRagZip,
  serializePackUnitNamesForApi,
  UNIT_TYPE_RAG,
  UNIT_TYPE_TEXT,
  UNIT_TYPE_MP3,
  UNIT_TYPE_YOUTUBE,
  DEFAULT_PACK_CHUNK_SIZE,
  DEFAULT_PACK_CHUNK_OVERLAP,
} from '../utils/rag.js';
import { useRagList } from '../composables/useRagList.js';
import { useRagTabState } from '../composables/useRagTabState.js';
import { usePackTasks } from '../composables/usePackTasks.js';
import QuizCard from '../components/QuizCard.vue';
import RagTabUnitMp3Player from '../components/RagTabUnitMp3Player.vue';
import Design08OptionDropdown from '../components/Design08OptionDropdown.vue';
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

// ─── 純輔助函式（不依賴 Vue 狀態） ────────────────────────────────────────────

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** POST /rag/tab/upload-zip：此頁僅接受 .zip */
const UPLOAD_ALLOWED_EXTENSIONS = ['.zip'];
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

// ─── RAG 列表與分頁狀態 ────────────────────────────────────────────────────────

const { ragList, ragListLoading, ragListError, fetchRagList } = useRagList();
const createRagLoading = ref(false);
const createRagError = ref('');
const renameRagTabModalOpen = ref(false);
/** 重新命名 API 用 Rag 主鍵（PUT /rag/tab/tab-name） */
const renameRagTabDraftRagId = ref(null);
const renameRagTabInitialName = ref('');
const renameRagTabSaving = ref(false);
const renameRagTabError = ref('');
/** 題型 sub-tab 更名（PUT /rag/tab/unit/quiz/quiz-name） */
const renameUnitQuizModalOpen = ref(false);
const renameUnitQuizDraftRagQuizId = ref(null);
const renameUnitQuizInitialName = ref('');
const renameUnitQuizSaving = ref(false);
const renameUnitQuizError = ref('');
/** POST build-rag-zip 成功後：Bootstrap Modal「單元建立完成」 */
const packBuildSuccessModalOpen = ref(false);
/** 題型 sub-tab 軟刪（PUT /rag/tab/quiz/delete/{rag_quiz_id}） */
const deleteUnitQuizLoading = ref(false);
/** 正在送出批改的題卡 id（全螢幕 LoadingOverlay「批改中...」；結果區待回傳） */
const gradingSubmittingCardId = ref(null);
const deleteRagLoading = ref(false);
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);
/** POST /rag/tab/unit/quiz/for-exam 成功後，列表尚未含嵌套欄位時仍標記該 rag_tab_id（綠點／鎖刪與目前選中哪個分頁無關） */
const ragTabExamHintByTabId = ref({});

const { getTabState, currentState, isNewTabId, tabStateMap } = useRagTabState(activeTabId, newTabIds, ragList, authStore);

/** 重新整理後還原主 tab／單元子分頁／題型子分頁（sessionStorage，依使用者分鍵） */
const CREATE_BANK_TAB_UI_STORAGE_PREFIX = 'myquiz:createBankTabUI:v1:';

function createBankTabUiStorageKey(personId) {
  const p = String(personId ?? '').trim();
  return `${CREATE_BANK_TAB_UI_STORAGE_PREFIX}${p || 'anon'}`;
}

function readCreateBankTabUiPersisted(personId) {
  try {
    const raw = sessionStorage.getItem(createBankTabUiStorageKey(personId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return {
      rag_tab_id: o.rag_tab_id != null ? String(o.rag_tab_id) : '',
      unit_tab_id: o.unit_tab_id != null ? String(o.unit_tab_id) : '',
      quiz_type_index: Number(o.quiz_type_index) || 0,
      rag_unit_id:
        o.rag_unit_id != null && String(o.rag_unit_id).trim() !== ''
          ? Number(o.rag_unit_id)
          : 0,
    };
  } catch {
    return null;
  }
}

function writeCreateBankTabUiPersisted(personId, payload) {
  try {
    sessionStorage.setItem(
      createBankTabUiStorageKey(personId),
      JSON.stringify({
        v: 1,
        rag_tab_id: payload.rag_tab_id,
        unit_tab_id: payload.unit_tab_id,
        quiz_type_index: payload.quiz_type_index,
        rag_unit_id: payload.rag_unit_id,
      })
    );
  } catch {
    /* private mode / quota */
  }
}

function ragTabIdExistsInBankLists(ragTabId, list, newIds) {
  const id = String(ragTabId ?? '').trim();
  if (!id) return false;
  if (Array.isArray(newIds) && newIds.some((x) => String(x) === id)) return true;
  if (!Array.isArray(list)) return false;
  return list.some((r) => String(r?.rag_tab_id ?? r?.id ?? r) === id);
}

function persistCreateBankTabUiSelection() {
  const personId = getPersonId(authStore);
  if (!personId) return;
  const ragTab = String(activeTabId.value ?? '').trim();
  if (!ragTab) return;
  const state = currentState.value;
  const tabs = state.unitTabOrder ?? [];
  const activeUid = String(state.activeUnitTabId ?? '').trim();
  const activeRow = tabs.find((t) => t.id === activeUid);
  const ru =
    activeRow?.ragUnitDbId != null && Number(activeRow.ragUnitDbId) > 0
      ? Number(activeRow.ragUnitDbId)
      : 0;
  writeCreateBankTabUiPersisted(personId, {
    rag_tab_id: ragTab,
    unit_tab_id: activeUid,
    quiz_type_index: Number(state.activeUnitQuizTypeIndex ?? 0) || 0,
    rag_unit_id: Number.isFinite(ru) ? ru : 0,
  });
}

/** 與 session 儲存之 unit_tab_id 對齊：含舊版 `tab::name::index` 與 rag_unit_id 後備（API 單元順序與列表不同時仍要能還原） */
function resolvePersistedUnitTabId(tabs, persisted) {
  const list = Array.isArray(tabs) ? tabs : [];
  const wantUnit = String(persisted?.unit_tab_id ?? '').trim();
  if (wantUnit && list.some((t) => t.id === wantUnit)) return wantUnit;
  const ru = Number(persisted?.rag_unit_id);
  if (Number.isFinite(ru) && ru > 0) {
    const hit = list.find((t) => Number(t.ragUnitDbId) === ru);
    if (hit) return String(hit.id);
  }
  if (wantUnit) {
    const parts = wantUnit.split('::');
    if (parts.length >= 3) {
      const legacyIdx = Number(parts[parts.length - 1]);
      if (Number.isFinite(legacyIdx) && legacyIdx >= 0 && legacyIdx < list.length) {
        return String(list[legacyIdx].id);
      }
    }
  }
  return '';
}

/**
 * 若目前選中的頂層 tab 為 tabId，則依 session 還原單元與題型子分頁（需在 unitTabOrder／題卡 hydrate 之後呼叫）
 */
function applyPersistedUnitSubTabsIfActive(tabId) {
  const id = String(tabId ?? '').trim();
  if (!id || String(activeTabId.value ?? '').trim() !== id) return;
  const personId = getPersonId(authStore);
  if (!personId) return;
  const persisted = readCreateBankTabUiPersisted(personId);
  if (!persisted || String(persisted.rag_tab_id) !== id) return;
  const state = getTabState(id);
  const tabs = state.unitTabOrder ?? [];
  const resolvedUnit = resolvePersistedUnitTabId(tabs, persisted);
  if (resolvedUnit) {
    state.activeUnitTabId = resolvedUnit;
  }
  const qiPersist = Number(persisted.quiz_type_index);
  nextTick(() => {
    if (String(activeTabId.value ?? '').trim() !== id) return;
    const s = getTabState(id);
    const tabsNow = s.unitTabOrder ?? [];
    const activeId = String(s.activeUnitTabId ?? '');
    const slotIdx = tabsNow.findIndex((t) => t.id === activeId);
    const i = slotIdx >= 0 ? slotIdx : 0;
    const stacks = s.unitSlotQuizCards;
    const row = Array.isArray(stacks) && stacks[i] ? stacks[i] : [];
    const cards = Array.isArray(row) ? row : [];
    let qi = Number.isFinite(qiPersist) ? qiPersist : 0;
    if (!Number.isFinite(qi) || qi < 0 || qi >= cards.length) qi = 0;
    s.activeUnitQuizTypeIndex = qi;
  });
}

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

/** 至少一列出題單元，且每列至少一個課程標籤（與「開始建立單元」按鈕啟用條件一致） */
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

/** 後端已有 rag_metadata 時，設定單元（unit_list）拆成條列：每個 li 為一群，群內資料夾以 + 連接 */
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

/** 尚無法編輯設定單元（未上傳 ZIP 等）；與拖放、區塊鎖定一致，不包含「群組是否已填滿」 */
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

// ─── 當前 tab / RAG 資料存取 ──────────────────────────────────────────────────

/** 確保為數字，空字串/null/undefined/NaN 時回傳預設值 */
function ensureNumber(val, defaultVal) {
  const n = Number(val);
  return (n === n && isFinite(n)) ? n : defaultVal;
}

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

/** GET /rag/tabs 之 quiz 列是否標為測驗用（與 buildCardFromRagQuiz 一致） */
function ragQuizApiRowIsForExam(quiz) {
  if (!quiz || typeof quiz !== 'object') return false;
  return (
    quiz.for_exam === true
    || quiz.for_exam === 1
    || quiz.rag_quiz_for_exam === true
    || quiz.rag_quiz_for_exam === 1
  );
}

/** 單元列：quizzes／quiz_list／Quizzes */
function quizRowsFromUnitApiRow(u) {
  if (!u || typeof u !== 'object') return [];
  if (Array.isArray(u.quizzes)) return u.quizzes;
  if (Array.isArray(u.quiz_list)) return u.quiz_list;
  if (Array.isArray(u.Quizzes)) return u.Quizzes;
  return [];
}

/** GET /rag/tabs 單筆：units[] 或頂層 quizzes[] 是否含任一測驗用題型 */
function ragListRowHasNestedForExamQuiz(rag) {
  if (!rag || typeof rag !== 'object') return false;
  const rawUnits = extractUnitsFromRag(rag);
  if (rawUnits.length > 0) {
    for (const u of rawUnits) {
      for (const q of quizRowsFromUnitApiRow(u)) {
        if (ragQuizApiRowIsForExam(q)) return true;
      }
    }
    return false;
  }
  const top = rag.quizzes;
  return Array.isArray(top) && top.some((q) => ragQuizApiRowIsForExam(q));
}

/** 本機 tabState：掃描 stacks／cardList 是否有 Rag_Quiz.for_exam */
function stateHasExamQuizCardsInTabState(st) {
  if (!st || typeof st !== 'object') return false;
  const stacks = st.unitSlotQuizCards;
  if (Array.isArray(stacks)) {
    for (const stack of stacks) {
      if (!Array.isArray(stack)) continue;
      for (const c of stack) {
        if (c?.rag_quiz_for_exam === true || c?.rag_quiz_for_exam === 1) return true;
      }
    }
  }
  const flat = st.cardList;
  if (Array.isArray(flat)) {
    for (const c of flat) {
      if (c?.rag_quiz_for_exam === true || c?.rag_quiz_for_exam === 1) return true;
    }
  }
  return false;
}

/**
 * 本機該分頁：任一題卡為測驗用。
 * 除 tabStateMap[rag_tab_id] 外，亦比對 zipTabId／tabId／map key（避免鍵不一致時換分頁後綠點消失）。
 */
function tabStateHasAnyRagQuizForExam(tabStateMapRef, tabId) {
  const tid = tabId != null ? String(tabId).trim() : '';
  if (!tid || !tabStateMapRef || typeof tabStateMapRef !== 'object') return false;
  const seen = new Set();
  function trySt(st) {
    if (!st || typeof st !== 'object' || seen.has(st)) return false;
    seen.add(st);
    return stateHasExamQuizCardsInTabState(st);
  }
  if (trySt(tabStateMapRef[tid])) return true;
  for (const k of Object.keys(tabStateMapRef)) {
    const st = tabStateMapRef[k];
    const z = String(st?.zipTabId ?? '').trim();
    const td = String(st?.tabId ?? '').trim();
    const ks = String(k).trim();
    if (z === tid || td === tid || ks === tid) {
      if (trySt(st)) return true;
    }
  }
  return false;
}

/** 分頁列綠點與禁止刪除：整庫 for_exam、列表嵌套題型、本機 tabState、for-exam 成功提示 */
function ragTabIsExamProtected(rag, tabStateMapRef) {
  if (!rag || typeof rag !== 'object') return false;
  if (ragIsForExamFromListRow(rag)) return true;
  if (ragListRowHasNestedForExamQuiz(rag)) return true;
  const tabId = rag.rag_tab_id ?? rag.id ?? rag;
  const tid = tabId != null ? String(tabId).trim() : '';
  if (tid && ragTabExamHintByTabId.value[tid]) return true;
  return tabStateHasAnyRagQuizForExam(tabStateMapRef, tabId);
}

watch(
  ragList,
  (list) => {
    if (!Array.isArray(list)) return;
    const next = { ...ragTabExamHintByTabId.value };
    let dirty = false;
    for (const key of Object.keys(next)) {
      const rag = list.find((r) => String(r?.rag_tab_id ?? r?.id ?? '').trim() === key);
      if (!rag) {
        delete next[key];
        dirty = true;
        continue;
      }
      if (ragIsForExamFromListRow(rag) || ragListRowHasNestedForExamQuiz(rag)) {
        delete next[key];
        dirty = true;
      }
    }
    if (dirty) ragTabExamHintByTabId.value = next;
  },
  { deep: true }
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
    if (slot?.loading || slot?.unitQuizCreateLoading) return true;
  }
  return false;
});

/** 題型列「+」與「產生題目」共用 unitQuizCreateLoading，由此區分全螢幕 overlay 主文案 */
const activeUnitQuizLoadingOverlayKind = computed(() => {
  const state = currentState.value;
  const n = Number(state.quizSlotsCount) || 0;
  for (let i = 1; i <= n; i++) {
    const slot = state.slotFormState[i];
    if (!slot?.unitQuizCreateLoading) continue;
    if (slot.unitQuizLoadingOverlayKind === 'add-row') return 'add-row';
  }
  for (let i = 1; i <= n; i++) {
    const slot = state.slotFormState[i];
    if (!slot?.unitQuizCreateLoading) continue;
    if (slot.unitQuizLoadingOverlayKind === 'llm-generate') return 'llm-generate';
  }
  return null;
});

const isGradingSubmitting = computed(() => gradingSubmittingCardId.value != null);

/** 設定單元：逐字稿分析中（載入檔案／語音／影片文字）或檔案讀取（/rag/transcript/text、/rag/unit/mp3-file、youtube-url）期間，禁「開始建立單元」等 */
const hasPackUnitTranscriptLoading = computed(() => {
  const st = currentState.value;
  const t = Array.isArray(st?.packUnitTranscriptLoading) && st.packUnitTranscriptLoading.some(Boolean);
  const sf = Array.isArray(st?.packUnitSourceFileLoading) && st.packUnitSourceFileLoading.some(Boolean);
  return t || sf;
});

/** 設定單元：GET `/rag/transcript/text`（文字逐字稿）或 mp3／YouTube 來源預覽 fetch 期間（packUnitSourceFileLoading） */
const hasPackUnitSourceFileLoading = computed(
  () =>
    Array.isArray(currentState.value?.packUnitSourceFileLoading)
    && currentState.value.packUnitSourceFileLoading.some(Boolean),
);

/** 全螢幕 LoadingOverlay：列表／建立分頁／刪除／更名／ZIP 上傳／建題庫／產生題目／批改／設定單元（來源檔讀取或逐字稿載入含「分析逐字稿」） */
const loadingOverlayVisible = computed(
  () =>
    ragListLoading.value ||
    createRagLoading.value ||
    deleteRagLoading.value ||
    renameRagTabSaving.value ||
    renameUnitQuizSaving.value ||
    deleteUnitQuizLoading.value ||
    !!currentState.value?.zipLoading ||
    !!currentState.value?.packLoading ||
    hasAnySlotGenerating.value ||
    isGradingSubmitting.value ||
    hasPackUnitTranscriptLoading.value
);

const loadingOverlayText = computed(() => {
  if (isGradingSubmitting.value) return '批改中...';
  if (activeUnitQuizLoadingOverlayKind.value === 'add-row') return '產生題型中';
  if (hasAnySlotGenerating.value) return '儲存並產生題目中...';
  const st = currentState.value;
  if (st?.zipLoading) return '上傳中...';
  if (st?.packLoading) return '建立單元中...';
  if (hasPackUnitSourceFileLoading.value) return '檔案讀取中…';
  if (
    Array.isArray(st?.packUnitTranscriptLoading)
    && st.packUnitTranscriptLoading.some(Boolean)
  )
    return '分析逐字稿中…';
  if (deleteRagLoading.value) return '刪除中...';
  if (deleteUnitQuizLoading.value) return '刪除題型中...';
  if (renameRagTabSaving.value) return '儲存中...';
  if (renameUnitQuizSaving.value) return '儲存題型中...';
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

/** 建題庫串流進度（LoadingOverlay subText） */
const loadingOverlaySubText = computed(() => {
  const st = currentState.value;
  if (st?.packLoading) {
    if (packBuildOverlayLines.value.length) return packBuildOverlayLines.value.join('\n');
    return '正在連線並準備建置…';
  }
  return '';
});

/** 用於顯示 file_metadata：上傳回傳的 zipResponseJson、GET /rag/tabs 的 file_metadata；若列表已建題庫但未內嵌 file_metadata，則由 rag 與 unit_list 合成，避免「設定單元」整塊被隱藏 */
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

/**
 * Stepper 1–3 與畫面上可編輯區對齊：
 * 1 上傳檔案 → 2 設定單元（有檔中繼、尚未完成建置）→ 3 設定單元題型（已建置後：單元內容與題型設定）
 */
const createRagStepperPhase = computed(() => {
  if (!hasUploadedFileMetadata.value) return 1;
  if (!hasBuiltRagSummary.value) return 2;
  return 3;
});

/** 已到達步驟與目前步：黑底白字；未到：淺灰底 */
function createRagStepperNumVariant(step) {
  const p = createRagStepperPhase.value;
  if (!Number.isFinite(Number(p)) || p < 1 || p > 3) return 'my-create-rag-stepper-num--off';
  if (p >= step) return 'my-create-rag-stepper-num--on';
  return 'my-create-rag-stepper-num--off';
}

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

/** 唯讀顯示：檔名 + 全形括號內檔案大小（設定單元／純展示列） */
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

// ─── Pack 任務：單元類型與 Chunk 設定 ─────────────────────────────────────────

function packUnitTypeAt(gi) {
  const raw = currentState.value.packUnitTypes?.[gi];
  const t = Number(raw);
  if (Number.isFinite(t) && (t === 0 || t === 1 || t === 2 || t === 3 || t === 4)) return t;
  return 1;
}

function isTranscriptPackUnitType(ut) {
  return ut === UNIT_TYPE_TEXT || ut === UNIT_TYPE_MP3 || ut === UNIT_TYPE_YOUTUBE;
}

/** 設定單元 unit_type 2／3／4：逐字稿區主按鈕文案（對應 GET transcript text／audio／youtube） */
function packUnitLoadTranscriptButtonLabel(gi) {
  const ut = packUnitTypeAt(gi);
  if (ut === UNIT_TYPE_TEXT) return '載入檔案文字';
  if (ut === UNIT_TYPE_MP3) return '載入語音文字';
  if (ut === UNIT_TYPE_YOUTUBE) return '載入影片文字';
  return '載入逐字稿';
}

/** 設定單元類型：數值與後端 unit_types／unit_type_list 對齊（含 0 未選擇，供顯示／相容） */
const PACK_UNIT_TYPE_OPTIONS = [
  { value: 0, label: '未選擇' },
  { value: 1, label: 'rag' },
  { value: 2, label: '文字' },
  { value: 3, label: 'mp3' },
  { value: 4, label: 'youtube' },
];

function onPackUnitTypePick(gi, rawVal) {
  const v = Number(rawVal);
  if (!(v === 0 || v === 1 || v === 2 || v === 3 || v === 4)) return;
  const state = currentState.value;
  const n = state.packTasksList?.length ?? 0;
  const next = parsePackUnitTypesFromRag(state.packUnitTypes, n);
  next[gi] = v;
  state.packUnitTypes = next;
  clearPackUnitPreviewAt(gi);
  if (v === UNIT_TYPE_MP3 || v === UNIT_TYPE_YOUTUBE) {
    void loadPackUnitMediaPreviewForType(gi, state.packTasksList?.[gi]);
  }
}

function onPackChunkSizeInput(gi, ev) {
  const state = currentState.value;
  ensurePackUnitSidecarArrays();
  const raw = ev?.target?.value;
  const arr = [...(state.packChunkSizes || [])];
  arr[gi] = raw === '' || raw == null
    ? DEFAULT_PACK_CHUNK_SIZE
    : Math.max(1, Math.floor(ensureNumber(raw, DEFAULT_PACK_CHUNK_SIZE)));
  state.packChunkSizes = arr;
}

function onPackChunkOverlapInput(gi, ev) {
  const state = currentState.value;
  ensurePackUnitSidecarArrays();
  const raw = ev?.target?.value;
  const arr = [...(state.packChunkOverlaps || [])];
  arr[gi] = raw === '' || raw == null
    ? DEFAULT_PACK_CHUNK_OVERLAP
    : Math.max(0, Math.floor(ensureNumber(raw, DEFAULT_PACK_CHUNK_OVERLAP)));
  state.packChunkOverlaps = arr;
}

function onPackUnitNameInput(gi, ev) {
  const state = currentState.value;
  ensurePackUnitSidecarArrays();
  const arr = [...(state.packUnitNames || [])];
  const raw = ev?.target?.value;
  arr[gi] = raw != null ? String(raw) : '';
  state.packUnitNames = arr;
}

function ensurePackUnitSidecarArrays() {
  const s = currentState.value;
  const n = s.packTasksList?.length ?? 0;
  const stretch = (key, emptyVal) => {
    let a = Array.isArray(s[key]) ? [...s[key]] : [];
    if (a.length > n) a = a.slice(0, n);
    while (a.length < n) a.push(emptyVal);
    s[key] = a;
  };
  stretch('packUnitMarkdownTexts', '');
  stretch('packUnitYoutubeUrls', '');
  stretch('packUnitMp3PreviewUrls', '');
  stretch('packUnitSourceFileLoading', false);
  stretch('packUnitTranscriptLoading', false);
  stretch('packUnitTranscriptLoaded', false);
  stretch('packUnitTranscriptError', '');
  stretch('packChunkSizes', DEFAULT_PACK_CHUNK_SIZE);
  stretch('packChunkOverlaps', DEFAULT_PACK_CHUNK_OVERLAP);
  stretch('packUnitNames', '');
}

/**
 * 重設第 N 個設定單元：清空該列「資料夾組合」，其餘類型→rag、分段長度／重疊為預設、單元名稱清空並清除逐字稿／預覽／錯誤／載入旗標。
 */
function resetPackUnitGroup(groupIdx) {
  if (packGroupsEditBlocked.value) return;
  const gi = Number(groupIdx);
  const state = currentState.value;
  const list = state.packTasksList;
  if (!Array.isArray(list) || !Number.isFinite(gi) || gi < 0 || gi >= list.length) return;
  ensurePackUnitSidecarArrays();

  const nextList = [...list];
  nextList[gi] = [];
  state.packTasksList = nextList;

  const types = [...(state.packUnitTypes || [])];
  while (types.length < nextList.length) types.push(UNIT_TYPE_RAG);
  types[gi] = UNIT_TYPE_RAG;
  state.packUnitTypes = types;
  const sizes = [...(state.packChunkSizes || [])];
  sizes[gi] = DEFAULT_PACK_CHUNK_SIZE;
  state.packChunkSizes = sizes;
  const overs = [...(state.packChunkOverlaps || [])];
  overs[gi] = DEFAULT_PACK_CHUNK_OVERLAP;
  state.packChunkOverlaps = overs;
  clearPackUnitPreviewAt(gi);
  const err = [...(state.packUnitTranscriptError || [])];
  err[gi] = '';
  state.packUnitTranscriptError = err;
  const load = [...(state.packUnitTranscriptLoading || [])];
  load[gi] = false;
  state.packUnitTranscriptLoading = load;
  const loaded = [...(state.packUnitTranscriptLoaded || [])];
  loaded[gi] = false;
  state.packUnitTranscriptLoaded = loaded;
  const unm = [...(state.packUnitNames || [])];
  while (unm.length < nextList.length) unm.push('');
  unm[gi] = '';
  state.packUnitNames = unm;
}

function ragTabIdForTranscript() {
  return String(currentState.value.zipTabId ?? activeTabId.value ?? '').trim();
}

function firstFolderNameInGroup(group) {
  if (!Array.isArray(group) || group.length === 0) return '';
  return String(group[0] ?? '').trim();
}

/** 單元名稱未填時，預設為該列資料夾組合的第一個資料夾名稱 */
function fillDefaultPackUnitNamesWhereEmpty() {
  const state = currentState.value;
  const list = state.packTasksList;
  if (!Array.isArray(list) || list.length === 0) return;
  ensurePackUnitSidecarArrays();
  const names = [...(state.packUnitNames || [])];
  let changed = false;
  for (let i = 0; i < list.length; i++) {
    if (String(names[i] ?? '').trim() !== '') continue;
    const def = firstFolderNameInGroup(list[i]);
    if (!def) continue;
    names[i] = def;
    changed = true;
  }
  if (changed) {
    state.packUnitNames = names;
  }
}

watch(
  () => currentState.value.packTasksList,
  (list, prevList) => {
    ensurePackUnitSidecarArrays();
    fillDefaultPackUnitNamesWhereEmpty();
    if (!Array.isArray(list)) return;
    for (let gi = 0; gi < list.length; gi++) {
      const ut = packUnitTypeAt(gi);
      if (ut !== UNIT_TYPE_MP3 && ut !== UNIT_TYPE_YOUTUBE) continue;
      const folderNow = firstFolderNameInGroup(list[gi]);
      const folderWas =
        Array.isArray(prevList) && prevList[gi] != null ? firstFolderNameInGroup(prevList[gi]) : '';
      if (!folderNow) {
        setPackUnitMp3PreviewUrlAt(gi, '');
        setPackUnitYoutubeUrlAt(gi, '');
        continue;
      }
      if (folderNow !== folderWas) {
        void loadPackUnitMediaPreviewForType(gi, list[gi]);
      }
    }
  },
  { deep: true, immediate: true }
);

function setPackUnitMarkdownAt(gi, text) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const arr = [...s.packUnitMarkdownTexts];
  arr[gi] = text != null ? String(text) : '';
  s.packUnitMarkdownTexts = arr;
}

function setPackUnitYoutubeUrlAt(gi, url) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const arr = [...s.packUnitYoutubeUrls];
  arr[gi] = url != null ? String(url) : '';
  s.packUnitYoutubeUrls = arr;
}

function revokePackUnitMp3PreviewUrl(url) {
  const s = String(url ?? '').trim();
  if (!s || !s.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(s);
  } catch {
    // ignore browser object URL revoke failures
  }
}

function setPackUnitMp3PreviewUrlAt(gi, url) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const arr = [...s.packUnitMp3PreviewUrls];
  revokePackUnitMp3PreviewUrl(arr[gi]);
  arr[gi] = url != null ? String(url) : '';
  s.packUnitMp3PreviewUrls = arr;
}

function setPackUnitTranscriptLoadedAt(gi, loaded) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const arr = [...s.packUnitTranscriptLoaded];
  arr[gi] = !!loaded;
  s.packUnitTranscriptLoaded = arr;
}

function setPackUnitSourceFileLoadingAt(gi, on) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const sf = [...(s.packUnitSourceFileLoading || [])];
  sf[gi] = !!on;
  s.packUnitSourceFileLoading = sf;
}

function clearPackUnitPreviewAt(gi) {
  setPackUnitMarkdownAt(gi, '');
  setPackUnitYoutubeUrlAt(gi, '');
  setPackUnitMp3PreviewUrlAt(gi, '');
  setPackUnitSourceFileLoadingAt(gi, false);
  setPackUnitTranscriptLoadedAt(gi, false);
  const s = currentState.value;
  const err = [...(s.packUnitTranscriptError || [])];
  err[gi] = '';
  s.packUnitTranscriptError = err;
}

function packUnitTranscriptBusy(gi) {
  return !!(currentState.value.packUnitTranscriptLoading && currentState.value.packUnitTranscriptLoading[gi]);
}

function packUnitTranscriptLoadedAt(gi) {
  return !!(currentState.value.packUnitTranscriptLoaded && currentState.value.packUnitTranscriptLoaded[gi]);
}

function packUnitTranscriptTextAt(gi) {
  const raw = currentState.value.packUnitMarkdownTexts?.[gi];
  return raw != null ? String(raw) : '';
}

function packUnitTranscriptReadyAt(gi) {
  const ut = packUnitTypeAt(gi);
  if (!isTranscriptPackUnitType(ut)) return true;
  return packUnitTranscriptLoadedAt(gi) && packUnitTranscriptTextAt(gi).trim() !== '';
}

function missingPackUnitTranscriptIndexes(state = currentState.value) {
  const list = Array.isArray(state?.packTasksList) ? state.packTasksList : [];
  return list
    .map((_, i) => i)
    .filter((i) => isTranscriptPackUnitType(packUnitTypeAt(i)) && !packUnitTranscriptReadyAt(i));
}

function arePackUnitTranscriptsReadyForBuild(state = currentState.value) {
  return missingPackUnitTranscriptIndexes(state).length === 0;
}

/** 「開始建立單元」按鈕：unit_type 2／3／4 時須已取得非空逐字稿；另需資料夾就緒、不在載入中、未在建置中 */
const startPackUnitBuildDisabled = computed(() => {
  const st = currentState.value;
  return (
    packGroupsEditBlocked.value ||
    !isPackTasksListReady(st.packTasksList ?? []) ||
    !arePackUnitTranscriptsReadyForBuild(st) ||
    hasPackUnitTranscriptLoading.value ||
    !!st.packLoading
  );
});

/**
 * 準備載入逐字稿：確認 folder／rag_tab_id／personId；成功後設 packUnitTranscriptLoading（全螢幕 LoadingOverlay「分析逐字稿中…」）。
 * 失敗已寫入 err[gi] 並回傳 null。
 */
function preparePackUnitPreviewCall(gi, group) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const folder = firstFolderNameInGroup(group);
  const err = [...s.packUnitTranscriptError];
  const load = [...s.packUnitTranscriptLoading];
  if (!folder) {
    err[gi] = '請先在上方拖入一個資料夾';
    s.packUnitTranscriptError = err;
    return null;
  }
  const rag_tab_id = ragTabIdForTranscript();
  if (!rag_tab_id) {
    err[gi] = '請先上傳教材 ZIP';
    s.packUnitTranscriptError = err;
    return null;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    err[gi] = '請先登入';
    s.packUnitTranscriptError = err;
    return null;
  }
  err[gi] = '';
  s.packUnitTranscriptError = err;
  load[gi] = true;
  s.packUnitTranscriptLoading = load;
  return { folder, rag_tab_id, personId };
}

/**
 * 載入 mp3／YouTube 來源預覽：GET `/rag/unit/mp3-file`、`/rag/unit/youtube-url`（query 含 person_id；期間區塊內「檔案讀取中」）
 */
function preparePackUnitMediaPreviewCall(gi, group) {
  const folder = firstFolderNameInGroup(group);
  const rag_tab_id = ragTabIdForTranscript();
  const personId = getPersonId(authStore);
  if (!folder || !rag_tab_id || !personId) return null;
  return { folder, rag_tab_id, personId };
}

async function refreshPackUnitMediaAssets(gi, ut, ctx) {
  if (ut !== UNIT_TYPE_MP3 && ut !== UNIT_TYPE_YOUTUBE) return false;
  setPackUnitSourceFileLoadingAt(gi, true);
  try {
    try {
      if (ut === UNIT_TYPE_MP3) {
        const blob = await apiRagUnitMp3FileByFolder({
          rag_tab_id: ctx.rag_tab_id,
          folder_name: ctx.folder,
          personId: ctx.personId,
        });
        if (!(blob instanceof Blob) || blob.size <= 0) throw new Error('empty audio');
        setPackUnitMp3PreviewUrlAt(gi, URL.createObjectURL(blob));
        return true;
      }
      if (ut === UNIT_TYPE_YOUTUBE) {
        const ytData = await apiRagUnitYoutubeUrlByFolder({
          rag_tab_id: ctx.rag_tab_id,
          folder_name: ctx.folder,
          personId: ctx.personId,
        });
        const url = youtubeUrlFromUnitUrlResponse(ytData);
        if (!url || !youtubeEmbedUrlFromInput(url)) throw new Error('invalid youtube');
        setPackUnitYoutubeUrlAt(gi, url);
        return true;
      }
    } catch {
      // noop：由呼叫端決定是否要寫錯誤／是否影響逐字稿
    }
    return false;
  } finally {
    setPackUnitSourceFileLoadingAt(gi, false);
  }
}

/** 自動或手動載入來源播放器（zip 資料夾內 mp3 / YouTube）；失敗時不動逐字稿 */
async function loadPackUnitMediaPreviewForType(gi, group) {
  const ut = packUnitTypeAt(gi);
  if (ut !== UNIT_TYPE_MP3 && ut !== UNIT_TYPE_YOUTUBE) return;
  const ctx = preparePackUnitMediaPreviewCall(gi, group);
  if (!ctx) return;
  ensurePackUnitSidecarArrays();
  const ok = await refreshPackUnitMediaAssets(gi, ut, ctx);
  const s = currentState.value;
  const err = [...s.packUnitTranscriptError];
  const prev = String(err[gi] ?? '');
  const retryHint =
    ut === UNIT_TYPE_MP3
      ? '仍可嘗試「載入語音文字」'
      : ut === UNIT_TYPE_YOUTUBE
        ? '仍可嘗試「載入影片文字」'
        : '仍可嘗試載入文字';
  const mediaMsg =
    `來源影音預覽載入失敗（請確認 ZIP 資料夾內有對應音訊／YouTube 說明檔）；${retryHint}`;
  if (ok) {
    if (prev.startsWith('來源影音')) err[gi] = '';
  } else if (!prev.startsWith('逐字稿')) {
    err[gi] = mediaMsg;
  }
  s.packUnitTranscriptError = err;
}

function markPackUnitPreviewDone(gi) {
  const s = currentState.value;
  const lo = [...s.packUnitTranscriptLoading];
  lo[gi] = false;
  s.packUnitTranscriptLoading = lo;
}

const PACK_UNIT_TRANSCRIPT_ERROR_FALLBACK =
  '逐字稿讀取失敗：請確認已上傳教材 ZIP／資料夾名稱與 ZIP 內二層資料夾一致，且資料夾內有可作為逐字稿的內容。';

/** 將載入 transcript（檔案／語音／影片文字）fetch 異常／空內容寫入對列（若有 Error.message 會一併顯示以利除錯） */
function packUnitPreviewTranscriptError(gi, caught) {
  const s = currentState.value;
  ensurePackUnitSidecarArrays();
  const arr = [...s.packUnitTranscriptError];
  let detail =
    caught instanceof Error
      ? String(caught.message ?? '').trim()
      : String(caught ?? '').trim();
  if (/^empty transcript$/i.test(detail))
    detail = '伺服器回傳的逐字稿為空（可能無對應 .md 或可讀欄位）；請檢查該資料夾內容。';
  if (detail && detail.length > 600) detail = `${detail.slice(0, 597)}…`;
  arr[gi] = detail ? `逐字稿讀取失敗：${detail}` : PACK_UNIT_TRANSCRIPT_ERROR_FALLBACK;
  s.packUnitTranscriptError = arr;
}

function youtubeUrlFromUnitUrlResponse(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.youtube_url,
    data.youtubeUrl,
    data.url,
    data.watch_url,
    data.watchUrl,
    data.video_url,
    data.videoUrl,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '';
}

function packUnitYoutubeEmbedUrl(gi) {
  const raw = currentState.value.packUnitYoutubeUrls?.[gi];
  return youtubeEmbedUrlFromInput(raw != null ? String(raw) : '');
}

/**
 * 主按鈕依 unit_type：文字「載入檔案文字」→ GET `/rag/transcript/text`；mp3「載入語音文字」→ `/rag/transcript/audio`；YouTube「載入影片文字」→ `/rag/transcript/youtube`（有嵌入網址時附 `youtube_url`）。
 * 播放器預覽仍見 `loadPackUnitMediaPreviewForType`。
 */
async function loadPackUnitPreviewForType(gi, group) {
  const ut = packUnitTypeAt(gi);
  if (!isTranscriptPackUnitType(ut)) return;
  const ctx = preparePackUnitPreviewCall(gi, group);
  if (!ctx) return;
  try {
    let data;
    if (ut === UNIT_TYPE_TEXT) {
      setPackUnitSourceFileLoadingAt(gi, true);
      try {
        data = await apiRagTranscriptText({
          rag_tab_id: ctx.rag_tab_id,
          folder_name: ctx.folder,
          personId: ctx.personId,
        });
      } finally {
        setPackUnitSourceFileLoadingAt(gi, false);
      }
    } else if (ut === UNIT_TYPE_MP3) {
      data = await apiRagTranscriptAudio({
        rag_tab_id: ctx.rag_tab_id,
        folder_name: ctx.folder,
        personId: ctx.personId,
      });
    } else if (ut === UNIT_TYPE_YOUTUBE) {
      const pageUrl =
        String(currentState.value.packUnitYoutubeUrls?.[gi] ?? '').trim() || '';
      data = await apiRagTranscriptYoutube({
        rag_tab_id: ctx.rag_tab_id,
        folder_name: ctx.folder,
        personId: ctx.personId,
        ...(pageUrl ? { youtubeUrl: pageUrl } : {}),
      });
    } else {
      throw new Error('不支援此單元類型的逐字稿載入');
    }
    const md = transcriptResponseMarkdown(data);
    if (!String(md ?? '').trim()) throw new Error('empty transcript');
    setPackUnitMarkdownAt(gi, md);
    setPackUnitTranscriptLoadedAt(gi, true);
    const mediaCtx = preparePackUnitMediaPreviewCall(gi, group);
    if (mediaCtx) {
      await refreshPackUnitMediaAssets(gi, ut, mediaCtx);
    }
    const s = currentState.value;
    const err = [...s.packUnitTranscriptError];
    err[gi] = '';
    s.packUnitTranscriptError = err;
  } catch (e) {
    setPackUnitMarkdownAt(gi, '');
    setPackUnitTranscriptLoadedAt(gi, false);
    packUnitPreviewTranscriptError(gi, e);
  } finally {
    markPackUnitPreviewDone(gi);
  }
}

// ─── RAG Tab 項目與 Unit（單元）解析 ──────────────────────────────────────────

/** Tab 列用：rag 項目含 _tabId、_label、_isExamRag（測驗用題型／整庫 for_exam：綠點且鎖刪） */
const ragItems = computed(() => {
  void ragTabExamHintByTabId.value;
  return ragList.value.map((r) => ({
    ...r,
    _tabId: r.rag_tab_id ?? r.id ?? r,
    _label: getRagTabLabel(r),
    _isExamRag: ragTabIsExamProtected(r, tabStateMap),
  }));
});
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

/** 來源／RAG ZIP 檔名：後端可能回 rag_file_name（Rag_Unit）；題目產生 fallback 仍會使用 */
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

/**
 * 文字單元來源檔名（unit_type=2／POST build-rag-zip output 之 transcript_md）。
 * 優先後端 `text_file_name`；若缺漏且為文字單元，後端可能將 .md 來源放在 `filename`（非 *_rag.zip）。
 */
function unitTextFileName(unit) {
  if (!unit || typeof unit !== 'object') return '';
  const raw = unit.text_file_name ?? unit.textFileName;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  const ut = Number(unit.unit_type ?? unit.unitType);
  const mode = String(unit.rag_mode ?? unit.ragMode ?? '').toLowerCase();
  const isTextUnit = ut === UNIT_TYPE_TEXT || mode === 'transcript_md';
  if (!isTextUnit) return '';
  const fn =
    unit.filename
    ?? unit.rag_filename
    ?? unit.rag_file_name
    ?? unit.ragFileName;
  if (fn == null || String(fn).trim() === '') return '';
  const s = String(fn).trim();
  if (/_rag\.zip$/i.test(s)) return '';
  return s;
}

function unitMp3FileName(unit) {
  if (!unit || typeof unit !== 'object') return '';
  const raw = unit.mp3_file_name ?? unit.mp3FileName;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

function unitYoutubeUrl(unit) {
  if (!unit || typeof unit !== 'object') return '';
  const raw = unit.youtube_url ?? unit.youtubeUrl;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

/** 後端資料夾組合字串（GET units／rag 內嵌 units 等；與 unit_list 之 + 連接語意一致） */
function folderCombinationFromUnitRaw(unit) {
  if (!unit || typeof unit !== 'object') return '';
  const raw = unit.folder_combination ?? unit.folderCombination;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

/**
 * 後端 folder_combination：`資料夾A/t資料夾B/t資料夾C`（以 `/t` 串多個資料夾名）；
 * 若無則將 fallback（unit_list 群組之「a + b」）拆成與拖曳 tag 相同的一列名稱。
 * @param {string} folderCombinationStr
 * @param {string} [fallbackFolderLine]
 * @returns {string[]}
 */
function parseFolderCombinationTags(folderCombinationStr, fallbackFolderLine) {
  const fc = String(folderCombinationStr ?? '').trim();
  if (fc) {
    if (fc.includes('/t')) {
      return fc.split('/t').map((s) => s.trim()).filter(Boolean);
    }
    if (/\t/.test(fc)) {
      return fc.split(/\t+/).map((s) => s.trim()).filter(Boolean);
    }
    if (fc.includes(' + ')) {
      return fc.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean);
    }
    return [fc];
  }
  const line = String(fallbackFolderLine ?? '').trim();
  if (!line) return [];
  if (line.includes(' + ')) {
    return line.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return [line];
}

/** Rag_Unit／GET /rag/tab/units／build-rag-zip output：逐字稿欄位（含 NDJSON output.transcript_plain） */
function rawUnitTranscriptionString(unit) {
  if (!unit || typeof unit !== 'object') return '';
  const out = unit.output && typeof unit.output === 'object' ? unit.output : null;
  const candidates = [
    unit.transcription,
    unit.transcript,
    unit.transcript_plain,
    unit.transcriptPlain,
    unit.transcript_text,
    unit.transcriptText,
    out?.transcription,
    out?.transcript,
    out?.transcript_plain,
    out?.transcriptPlain,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '';
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
  const transcription = rawUnitTranscriptionString(unit);
  const ut = Number(unit.unit_type ?? unit.unitType);
  const rag_mode = unit.rag_mode ?? unit.ragMode;
  const csRaw =
    unit.rag_chunk_size ?? unit.ragChunkSize ?? unit.chunk_size ?? unit.chunkSize;
  const coRaw =
    unit.rag_chunk_overlap ?? unit.ragChunkOverlap ?? unit.chunk_overlap ?? unit.chunkOverlap;
  return {
    rag_tab_id: tabId || safeName,
    filename: src || `${safeName}_rag.zip`,
    rag_name: String(unit.rag_name ?? name).trim() || safeName,
    unit_name: safeName,
    anchor_rag_quiz_id: anchorRagQuizId,
    rag_unit_id: ragUnitId,
    transcription,
    ...(Number.isFinite(ut) && ut > 0 ? { unit_type: ut } : {}),
    ...(rag_mode != null && String(rag_mode).trim() !== '' ? { rag_mode } : {}),
    text_file_name: unitTextFileName(unit),
    mp3_file_name: unitMp3FileName(unit),
    youtube_url: unitYoutubeUrl(unit),
    ...(csRaw != null && String(csRaw).trim() !== '' && !Number.isNaN(Number(csRaw))
      ? { rag_chunk_size: ensureNumber(csRaw, DEFAULT_PACK_CHUNK_SIZE) }
      : {}),
    ...(coRaw != null && String(coRaw).trim() !== '' && !Number.isNaN(Number(coRaw))
      ? { rag_chunk_overlap: ensureNumber(coRaw, DEFAULT_PACK_CHUNK_OVERLAP) }
      : {}),
    folder_combination: folderCombinationFromUnitRaw(unit),
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
    const rawUt = rag.unit_types ?? rag.unit_type_list;
    const typesArr = parsePackUnitTypesFromRag(rawUt, outputs.length);
    return outputs.map((o, idx) => {
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
      const transcription = rawUnitTranscriptionString(o);
      const utMerged = Number(o.unit_type ?? o.unitType ?? typesArr[idx]);
      const merged = {
        ...o,
        rag_tab_id: tabId,
        filename: o.filename ?? o.rag_filename ?? `${derivedName || label || 'RAG'}.zip`,
        rag_name: label,
        unit_name,
        transcription,
      };
      if (Number.isFinite(utMerged) && utMerged > 0) merged.unit_type = utMerged;
      const ragModeOut = merged.rag_mode ?? merged.ragMode;
      const folderCombo = folderCombinationFromUnitRaw(o);
      return {
        rag_tab_id: tabId,
        filename: merged.filename,
        rag_name: label,
        unit_name,
        transcription,
        ...(Number.isFinite(utMerged) && utMerged > 0 ? { unit_type: utMerged } : {}),
        ...(ragModeOut != null && String(ragModeOut).trim() !== '' ? { rag_mode: ragModeOut } : {}),
        text_file_name: unitTextFileName(merged),
        mp3_file_name: unitMp3FileName(merged),
        youtube_url: unitYoutubeUrl(merged),
        ...(folderCombo !== '' ? { folder_combination: folderCombo } : {}),
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
  } else {
    const rawUt = rag.unit_types ?? rag.unit_type_list;
    const typesArr = parsePackUnitTypesFromRag(rawUt, rows.length);
    rows = rows.map((u, i) => {
      const utMerged = Number(u.unit_type ?? u.unitType ?? typesArr[i]);
      if (!Number.isFinite(utMerged) || utMerged <= 0) return u;
      return { ...u, unit_type: utMerged };
    });
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

/** 單元「來源」列類型（與 POST build-rag-zip unit_types 對齊；未知或非 2／3／4 視為 RAG／PDF Office） */
function tabUnitTypeFromUnit(unit) {
  const utRaw = Number(unit?.unit_type ?? unit?.unitType);
  if (utRaw === UNIT_TYPE_TEXT || utRaw === UNIT_TYPE_MP3 || utRaw === UNIT_TYPE_YOUTUBE) return utRaw;
  return UNIT_TYPE_RAG;
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
  const ruStable = Number.isFinite(ragUnitId) && ragUnitId > 0;
  const unitType = tabUnitTypeFromUnit(unit);
  const rs =
    unit.rag_chunk_size ?? unit.ragChunkSize ?? unit.chunk_size ?? unit.chunkSize;
  const ro =
    unit.rag_chunk_overlap ?? unit.ragChunkOverlap ?? unit.chunk_overlap ?? unit.chunkOverlap;
  const ragChunkSize =
    rs != null && !Number.isNaN(Number(rs)) ? ensureNumber(rs, DEFAULT_PACK_CHUNK_SIZE) : null;
  const ragChunkOverlap =
    ro != null && !Number.isNaN(Number(ro))
      ? ensureNumber(ro, DEFAULT_PACK_CHUNK_OVERLAP)
      : null;
  return {
    id: ruStable
      ? `${ragTabId || 'tab'}::ru-${ragUnitId}`
      : `${ragTabId || 'tab'}::${keyBase}::${index}`,
    label: unitTabLabelFromUnit(unit, index),
    generateQuizTabId: unitSelectValue(unit),
    unitName: unitName || unitTabLabelFromUnit(unit, index),
    ragName: String(unit?.rag_name ?? '').trim(),
    filename: unitSourceFilename(unit),
    unitType,
    ragTabId,
    anchorRagQuizId: Number.isFinite(anchorRagQuizId) && anchorRagQuizId > 0 ? anchorRagQuizId : null,
    ragUnitDbId: Number.isFinite(ragUnitId) && ragUnitId > 0 ? ragUnitId : null,
    transcription: rawUnitTranscriptionString(unit),
    textFileName: unitTextFileName(unit),
    mp3FileName: unitMp3FileName(unit),
    youtubeUrl: unitYoutubeUrl(unit),
    ragChunkSize,
    ragChunkOverlap,
    folderCombination: folderCombinationFromUnitRaw(unit),
  };
}

/** 設定單元子分頁：滿版下拉 value／label（UnitSelectDropdown） */
function unitSubTabDropdownValue(tab) {
  if (!tab || tab.id == null) return '';
  return String(tab.id);
}
function unitSubTabDropdownLabel(tab) {
  return String(tab?.label ?? '').trim() || '—';
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

/** 逐字稿 Modal：唯讀「設定單元」列傳入全文時覆寫；否則用目前選定單元之 transcription */
const ragUnitTranscriptModalMarkdownOverride = ref(/** @type {string | null} */ (null));

const ragUnitTranscriptModalBodyHtml = computed(() => {
  const override = ragUnitTranscriptModalMarkdownOverride.value;
  if (override != null) {
    return renderMarkdownToSafeHtml(String(override));
  }
  const tab = activeUnitTabItem.value;
  const raw = tab?.transcription;
  return renderMarkdownToSafeHtml(raw != null ? String(raw) : '');
});

/** 「單元內容」文字單元：內嵌 Markdown（與唯讀設定單元之 markdown segment 同 render） */
const activeUnitTranscriptionMdHtml = computed(() => {
  const tab = activeUnitTabItem.value;
  const raw = tab?.transcription;
  return renderMarkdownToSafeHtml(raw != null ? String(raw) : '');
});

/** unit_type=3：RagTabUnitMp3Player 參數（fetch /rag/tab/unit/mp3-file 為 blob 後播放，不附 person_id） */
const activeUnitMp3PlayerProps = computed(() => {
  const tab = activeUnitTabItem.value;
  if (!tab || tab.unitType !== UNIT_TYPE_MP3) return null;
  const rag_tab_id = String(tab.ragTabId ?? '').trim();
  const ru = tab.ragUnitDbId != null ? Number(tab.ragUnitDbId) : 0;
  if (!rag_tab_id || !Number.isFinite(ru) || ru < 1) return null;
  return { ragTabId: rag_tab_id, ragUnitId: ru };
});

/** unit_type=4：內嵌播放器用 embed URL */
const activeUnitYoutubeEmbedUrl = computed(() => {
  const tab = activeUnitTabItem.value;
  if (!tab || tab.unitType !== UNIT_TYPE_YOUTUBE) return '';
  const raw = tab.youtubeUrl != null ? String(tab.youtubeUrl).trim() : '';
  return youtubeEmbedUrlFromInput(raw);
});

const ragUnitTranscriptModalOpen = ref(false);

/** @param {unknown} [markdownOverride] 僅限 string：設定單元唯讀列傳入全文；來自 `@click` 時忽略事件物件 */
function openRagUnitTranscriptModal(markdownOverride) {
  const isStr = typeof markdownOverride === 'string';
  const s = isStr ? String(markdownOverride).trim() : '';
  if (isStr && s !== '') {
    ragUnitTranscriptModalMarkdownOverride.value = s;
  } else {
    ragUnitTranscriptModalMarkdownOverride.value = null;
  }
  ragUnitTranscriptModalOpen.value = true;
}

function closeRagUnitTranscriptModal() {
  ragUnitTranscriptModalOpen.value = false;
  ragUnitTranscriptModalMarkdownOverride.value = null;
}

function closePackBuildSuccessModal() {
  packBuildSuccessModalOpen.value = false;
}

const activeUnitSlotIndex = computed(() => {
  const tabs = currentState.value.unitTabOrder ?? [];
  const activeId = String(currentState.value.activeUnitTabId ?? '');
  const idx = tabs.findIndex((t) => t.id === activeId);
  return idx >= 0 ? idx + 1 : 1;
});

/** 目前單元槽對應之 rag_tab_id／rag_unit_id（供題卡狀態與 for-exam API 對齊 Rag_Quiz 關聯欄） */
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

// ─── 題目卡片：for_exam 標記與 Quiz Sub-Tab 管理 ──────────────────────────────

/** 切換 Rag_Quiz.for_exam；「設為測驗用」置於題型區塊最下方常駐，未出題或未批改時按鈕 disabled（見 isRagQuizForExamToolbarButtonDisabled） */
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
  const nextForExam = !(card.rag_quiz_for_exam === true || card.rag_quiz_for_exam === 1);
  card.ragQuizForExamLoading = true;
  card.ragQuizForExamError = '';
  try {
    await apiMarkRagQuizForExam(
      {
        rag_quiz_id: rqid,
        rag_tab_id: String(card.rag_tab_id ?? meta.rag_tab_id ?? rag?.rag_tab_id ?? '').trim(),
        rag_unit_id: Number(card.rag_unit_id ?? meta.rag_unit_id),
        for_exam: nextForExam,
      },
      personId
    );
    card.rag_quiz_for_exam = nextForExam;
    const ragTabId =
      String(card.rag_tab_id ?? meta.rag_tab_id ?? '').trim()
      || String(rag?.rag_tab_id ?? activeTabId.value ?? state.zipTabId ?? '').trim();
    let ragUnitId =
      card.rag_unit_id != null && card.rag_unit_id !== ''
        ? Number(card.rag_unit_id)
        : Number(meta.rag_unit_id);
    if (!Number.isFinite(ragUnitId) || ragUnitId < 0) ragUnitId = 0;
    if (ragTabId) card.rag_tab_id = ragTabId;
    if (Number.isFinite(ragUnitId) && ragUnitId >= 1) card.rag_unit_id = ragUnitId;
    if (ragTabId) {
      if (nextForExam) {
        ragTabExamHintByTabId.value = { ...ragTabExamHintByTabId.value, [ragTabId]: true };
      } else if (!tabStateHasAnyRagQuizForExam(tabStateMap, ragTabId)) {
        const nextHint = { ...ragTabExamHintByTabId.value };
        delete nextHint[ragTabId];
        ragTabExamHintByTabId.value = nextHint;
      }
    }
  } catch (err) {
    card.ragQuizForExamError = err?.message || String(err);
  } finally {
    card.ragQuizForExamLoading = false;
  }
}

/** 單元題型列／草稿預設名稱（無後端 quiz_name、使用者未填時） */
const DEFAULT_UNIT_QUIZ_DISPLAY_NAME = '未命名題型';

/**
 * POST /rag/tab/unit/quiz/create 未附 quiz_name 時，後端常將 quiz_name 設為 unit_name；
 * 與前端草稿一致：建立後立刻 PUT quiz-name（失敗則略過，不阻斷新增／出題）。
 */
async function persistDefaultUnitQuizNameAfterCreate(ragQuizId, personId) {
  const id = Number(ragQuizId);
  if (!Number.isFinite(id) || id < 1) return;
  const pid = String(personId ?? '').trim();
  if (!pid) return;
  try {
    await apiUpdateRagQuizName(
      { rag_quiz_id: id, quiz_name: DEFAULT_UNIT_QUIZ_DISPLAY_NAME },
      pid
    );
  } catch {
    /* 後端不支援或網路錯誤時保留後端預設題名 */
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

/** 題型 sub-tab 顯示文字：有題名用題名，否則預設「未命名題型」（不顯示題型編號） */
function quizTypeTabLabel(row) {
  const n = String(row?.quizName ?? '').trim();
  if (n) return n;
  return DEFAULT_UNIT_QUIZ_DISPLAY_NAME;
}

const activeUnitQuizTypeIdxResolved = computed(() => {
  const state = currentState.value;
  const cards = activeUnitQuizCards.value;
  let i = Number(state.activeUnitQuizTypeIndex ?? 0);
  if (!Array.isArray(cards) || cards.length === 0) return 0;
  if (!Number.isFinite(i) || i < 0 || i >= cards.length) return 0;
  return i;
});

const activeUnitQuizCard = computed(() => {
  const cards = activeUnitQuizCards.value;
  const i = activeUnitQuizTypeIdxResolved.value;
  if (!Array.isArray(cards) || cards.length === 0) return null;
  return cards[i] ?? null;
});

watch(activeUnitQuizCards, () => {
  const state = currentState.value;
  const cards = activeUnitQuizCards.value;
  if (!Array.isArray(cards) || cards.length === 0) {
    state.activeUnitQuizTypeIndex = 0;
    return;
  }
  let i = Number(state.activeUnitQuizTypeIndex ?? 0);
  if (!Number.isFinite(i) || i < 0 || i >= cards.length) {
    state.activeUnitQuizTypeIndex = 0;
  }
}, { deep: true });

watch(
  () => currentState.value.activeUnitTabId,
  () => {
    currentState.value.activeUnitQuizTypeIndex = 0;
  }
);

/** user_type 1／2／234 才顯示「單元內容」區塊（依 unit_type）；其餘僅見上方單元分頁標籤。與個人設定之 AI／LLM 服務 API 金鑰無關（僅角色權限）。 */
const canSeeRagUnitSourceFilename = computed(() => {
  const t = Number(authStore.user?.user_type);
  return t === 1 || t === 2 || t === 234;
});

/** quiz_content（card.quiz）為空與否：出題規則欄皆為編輯器；空白列顯示「產生題目」等仍用此判斷（不依賴 showGenerateForm／草稿對齊；多筆各自綁 quizUserPromptText） */
function quizRowQuizEmpty(card) {
  return !String(card?.quiz ?? '').trim();
}

/** 題卡已標為試卷／測驗用 Rag_Quiz.for_exam */
function isRagQuizMarkedForExam(card) {
  if (!card || typeof card !== 'object') return false;
  return card.rag_quiz_for_exam === true || card.rag_quiz_for_exam === 1;
}

/**
 * 「設為測驗用」常駐顯示；不可操作時為 true。
 * — 標為測驗用後「取消設為測驗用」仍應可操作（不依賴當前有無題文／批改）。
 * — 標記前須已有題目與批改結果；送批改中／API 請求中也停用。
 */
function isRagQuizForExamToolbarButtonDisabled(card) {
  if (!card || typeof card !== 'object') return true;
  if (card.ragQuizForExamLoading) return true;
  if (
    gradingSubmittingCardId.value != null &&
    String(gradingSubmittingCardId.value) === String(card.id)
  ) {
    return true;
  }
  const raw = card.rag_quiz_id ?? card.quiz_id;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return true;

  if (isRagQuizMarkedForExam(card)) return false;

  const hasQuiz = String(card.quiz ?? '').trim() !== '';
  const hasGrade = String(card.gradingResult ?? '').trim() !== '';
  return !hasQuiz || !hasGrade;
}

/** 題卡與「上次載入／產生／批改成功」對齊之比對欄位（重設還原用） */
function syncQuizCardPromptBaselines(row) {
  if (!row || typeof row !== 'object') return;
  row.quizUserPromptBaseline = String(row.quizUserPromptText ?? '');
  row.gradingPromptBaseline = String(row.gradingPrompt ?? '');
  row.quizAnswerBaseline = String(row.quiz_answer ?? '');
}

function isQuizUserPromptDirty(card) {
  if (!card || typeof card !== 'object') return false;
  return (
    String(card.quizUserPromptText ?? '') !== String(card.quizUserPromptBaseline ?? '')
  );
}

function resetUnitQuizUserPrompt(card) {
  if (!card || typeof card !== 'object') return;
  card.quizUserPromptText = String(card.quizUserPromptBaseline ?? '');
}

function resetUnitQuizGradingPrompt(card) {
  if (!card || typeof card !== 'object') return;
  card.gradingPrompt = String(card.gradingPromptBaseline ?? '');
}

/** 「產生題目」可按：須有非空白之出題規則，且出題規則內容須與 baseline 不同（已編輯） */
function canEnableUnitQuizGenerate(card, slotIndex) {
  if (!card || typeof card !== 'object') return false;
  if (!promptTextForQuizRow(card, slotIndex)) return false;
  return isQuizUserPromptDirty(card);
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

/**
 * 自 GET /rag/tabs 欄位還原 rag_chunk_sizes／rag_chunk_overlaps（與 unit_list 群組同序）；
 * 若僅有舊版 chunk_* 或單一 rag_chunk_size／rag_chunk_overlap 則每群填入同值。
 * @returns {{ sizes: number[], overs: number[] }}
 */
function hydratePackChunkArraysFromRag(rag, groupCount) {
  const count = Math.max(0, Math.floor(Number(groupCount)) || 0);
  let sizes = [];
  let overs = [];
  const sizesArr = rag?.rag_chunk_sizes ?? rag?.chunk_sizes;
  if (Array.isArray(sizesArr) && sizesArr.length) {
    sizes = sizesArr.map((x) => ensureNumber(x, DEFAULT_PACK_CHUNK_SIZE));
  } else if ((rag?.rag_chunk_size ?? rag?.chunk_size) != null && count > 0) {
    const v = ensureNumber(rag?.rag_chunk_size ?? rag?.chunk_size, DEFAULT_PACK_CHUNK_SIZE);
    sizes = Array(count).fill(v);
  }
  const oversArr = rag?.rag_chunk_overlaps ?? rag?.chunk_overlaps;
  if (Array.isArray(oversArr) && oversArr.length) {
    overs = oversArr.map((x) => ensureNumber(x, DEFAULT_PACK_CHUNK_OVERLAP));
  } else if ((rag?.rag_chunk_overlap ?? rag?.chunk_overlap) != null && count > 0) {
    const v = ensureNumber(rag?.rag_chunk_overlap ?? rag?.chunk_overlap, DEFAULT_PACK_CHUNK_OVERLAP);
    overs = Array(count).fill(v);
  }
  if (count === 0) return { sizes: [], overs: [] };
  while (sizes.length < count) sizes.push(DEFAULT_PACK_CHUNK_SIZE);
  while (overs.length < count) overs.push(DEFAULT_PACK_CHUNK_OVERLAP);
  return {
    sizes: sizes.slice(0, count),
    overs: overs.slice(0, count),
  };
}

/** 設定單元唯讀：unit_type → 下拉同款文字（0＝未選擇） */
function packUnitTypeDisplayLabel(unitType) {
  const hit = PACK_UNIT_TYPE_OPTIONS.find((o) => Number(o.value) === Number(unitType));
  if (hit) return hit.label;
  return 'rag';
}

/** 唯讀「設定單元」：RAG 分段參數顯示在與類型／來源檔同列（不外層縮排） */
function quizBankReadonlyOutlineChunkFields(ragChunkSize, ragChunkOverlap) {
  return [
    { label: '分段長度（字元）', value: String(ensureNumber(ragChunkSize, DEFAULT_PACK_CHUNK_SIZE)) },
    { label: '分段重疊（字元）', value: String(ensureNumber(ragChunkOverlap, DEFAULT_PACK_CHUNK_OVERLAP)) },
  ];
}

/** 唯讀「設定單元」：來源檔一行（與單元 tab 欄位對齊） */
function quizBankReadonlySourceDisplay(tab) {
  if (!tab || typeof tab !== 'object') return '';
  const ut = Number(tab.unitType ?? UNIT_TYPE_RAG);
  if (ut === UNIT_TYPE_TEXT) return String(tab.textFileName ?? '').trim();
  if (ut === UNIT_TYPE_MP3) return String(tab.mp3FileName ?? '').trim();
  if (ut === UNIT_TYPE_YOUTUBE) return String(tab.youtubeUrl ?? '').trim();
  if (ut === UNIT_TYPE_RAG) return String(tab.filename ?? '').trim();
  return '';
}

/**
 * 唯讀「設定單元」細節：MP3／YouTube 與「單元內容」同層級（播放器／嵌入）；逐字稿另以「逐字稿」開 Modal。
 * @returns {( { kind: 'text', text: string } | { kind: 'field', label: string, value: string } | { kind: 'markdown', markdown: string } | { kind: 'audio', ragTabId: string, ragUnitId: number } | { kind: 'youtube', embedSrc: string, pageUrl: string } | { kind: 'transcript_button', markdown: string } )[]}
 */
function buildQuizBankReadonlyDetailSegments(tab) {
  const ut = Number(tab?.unitType ?? UNIT_TYPE_RAG);
  const trRaw = String(tab?.transcription ?? '').trim();
  const trLen = trRaw.length;
  const personId = getPersonId(authStore);
  /** @type {( { kind: 'text', text: string } | { kind: 'field', label: string, value: string } | { kind: 'markdown', markdown: string } | { kind: 'audio', ragTabId: string, ragUnitId: number } | { kind: 'youtube', embedSrc: string, pageUrl: string } | { kind: 'transcript_button', markdown: string } )[]} */
  const segments = [];

  if (ut === UNIT_TYPE_RAG) {
    if (trLen) segments.push({ kind: 'transcript_button', markdown: trRaw });
    return segments;
  }
  if (ut === UNIT_TYPE_TEXT) {
    if (trLen) segments.push({ kind: 'markdown', markdown: trRaw });
    else segments.push({ kind: 'field', label: '逐字稿', value: '尚未載入或無內容' });
    return segments;
  }
  if (ut === UNIT_TYPE_MP3) {
    const rag_tab_id = String(tab.ragTabId ?? '').trim();
    const ru = tab.ragUnitDbId != null ? Number(tab.ragUnitDbId) : 0;
    if (personId && rag_tab_id && Number.isFinite(ru) && ru > 0) {
      segments.push({ kind: 'audio', ragTabId: rag_tab_id, ragUnitId: ru });
    }
    if (trLen) segments.push({ kind: 'transcript_button', markdown: trRaw });
    return segments;
  }
  if (ut === UNIT_TYPE_YOUTUBE) {
    const pageUrl = String(tab.youtubeUrl ?? '').trim();
    const embedSrc = youtubeEmbedUrlFromInput(pageUrl);
    segments.push({ kind: 'youtube', embedSrc, pageUrl });
    if (trLen) segments.push({ kind: 'transcript_button', markdown: trRaw });
    return segments;
  }
  return segments;
}

function quizBankReadonlyMarkdownHtml(md) {
  return renderMarkdownToSafeHtml(md != null ? String(md) : '');
}

/** 唯讀「設定單元」逐字稿：API 省略全文時依本頁索引補 pack 稿／最近一次 build outputs／列表 rag.outputs */
function resolveUnitSlotTranscription(index, tabLike, state, rag) {
  const i = Number(index);
  const fromTab = rawUnitTranscriptionString(tabLike ?? {});
  if (fromTab) return fromTab;
  const md = state?.packUnitMarkdownTexts?.[i];
  if (md != null && String(md).trim() !== '') return String(md).trim();
  const packOutputs = Array.isArray(state?.packResponseJson?.outputs) ? state.packResponseJson.outputs : null;
  if (packOutputs && packOutputs[i] != null) {
    const t2 = rawUnitTranscriptionString(packOutputs[i]);
    if (t2) return t2;
  }
  if (rag && Array.isArray(rag.outputs) && rag.outputs[i] != null) {
    const t3 = rawUnitTranscriptionString(rag.outputs[i]);
    if (t3) return t3;
  }
  const metaParsed = rag ? parseRagMetadataObject(rag) : null;
  const nested = metaParsed?.outputs;
  if (Array.isArray(nested) && nested[i] != null) {
    const t4 = rawUnitTranscriptionString(nested[i]);
    if (t4) return t4;
  }
  return '';
}

function tabWithResolvedTranscription(tab, index, state, rag) {
  const tr = resolveUnitSlotTranscription(index, tab, state, rag);
  return { ...tab, transcription: tr };
}

/**
 * 打包建置區唯讀「設定單元」：優先現有 unit 子分頁列（後端／GET units 對齊）；
 * 若尚未載入 tabs，fallback 資料夾群組 + Rag 列表之 unit_types／rag_chunk_*。
 */
const quizBankSettingReadonlyUnitRows = computed(() => {
  const state = currentState.value;
  const rag = currentRagItem.value;
  const tabs = state.unitTabOrder ?? [];
  const nTabs = tabs.length;

  if (nTabs > 0) {
    const chunkHL = rag ? hydratePackChunkArraysFromRag(rag, nTabs) : { sizes: [], overs: [] };
    const groupsRo = ragListReadonlyGroups.value;
    return tabs.map((t, i) => {
      const tResolved = tabWithResolvedTranscription(t, i, state, rag);
      const srcDisp = quizBankReadonlySourceDisplay(tResolved);
      const ut = Number(t.unitType ?? UNIT_TYPE_RAG);
      const cs =
        t.ragChunkSize != null ? t.ragChunkSize : chunkHL.sizes[i] ?? DEFAULT_PACK_CHUNK_SIZE;
      const co =
        t.ragChunkOverlap != null ? t.ragChunkOverlap : chunkHL.overs[i] ?? DEFAULT_PACK_CHUNK_OVERLAP;
      const folderLineRo =
        Array.isArray(groupsRo[i]) && groupsRo[i].length
          ? groupsRo[i].filter(Boolean).join(' + ')
          : '';
      const fc = String(t.folderCombination ?? '').trim();
      const folderComboTags = parseFolderCombinationTags(fc, folderLineRo);
      const folderComboTitle =
        folderComboTags.length > 0
          ? folderComboTags.join(' + ')
          : (fc || folderLineRo || String(t?.label ?? `單元 ${i + 1}`).trim() || `單元 ${i + 1}`);
      return {
        key: String(t?.id ?? `idx-${i}`),
        title: folderComboTitle,
        folderComboTags,
        unitNameDisplay: String(t.unitName ?? t.label ?? '').trim() || '—',
        unitType: t.unitType,
        typeLabel: packUnitTypeDisplayLabel(t.unitType),
        sourceDisplay: srcDisp || '—',
        outlineChunkFields: ut === UNIT_TYPE_RAG ? quizBankReadonlyOutlineChunkFields(cs, co) : [],
        detailSegments: buildQuizBankReadonlyDetailSegments(tResolved),
      };
    });
  }

  const groups = ragListReadonlyGroups.value;
  if (!Array.isArray(groups) || groups.length === 0) return [];

  const types = rag
    ? parsePackUnitTypesFromRag(rag.unit_types ?? rag.unit_type_list, groups.length)
    : [];
  const chunkHL = rag ? hydratePackChunkArraysFromRag(rag, groups.length) : { sizes: [], overs: [] };
  const unitsRow = rag ? unitsFromRagTabsRow(rag) : [];

  return groups.map((g, i) => {
    const folderLine = Array.isArray(g) ? g.filter(Boolean).join(' + ') : '';
    const fcRow = String(unitsRow[i]?.folder_combination ?? '').trim();
    const rawT = Number(types[i]);
    const ut = rawT === 0 || rawT === 1 || rawT === 2 || rawT === 3 || rawT === 4 ? rawT : UNIT_TYPE_RAG;
    const ragChunkSizeRow = chunkHL.sizes[i] ?? DEFAULT_PACK_CHUNK_SIZE;
    const ragChunkOverlapRow = chunkHL.overs[i] ?? DEFAULT_PACK_CHUNK_OVERLAP;

    const synTab = unitsRow[i] != null ? buildUnitTabItem(unitsRow[i], i) : null;
    /** @type {( { kind: 'text', text: string } | { kind: 'field', label: string, value: string } | { kind: 'markdown', markdown: string } | { kind: 'audio', ragTabId: string, ragUnitId: number } | { kind: 'youtube', embedSrc: string, pageUrl: string } | { kind: 'transcript_button', markdown: string } )[]} */
    const folderFieldLine = fcRow || (folderLine.trim() ? folderLine : '');
    const folderComboTags = parseFolderCombinationTags(fcRow, folderLine);
    const folderFieldLineForDetail =
      folderComboTags.length > 0 ? folderComboTags.join(' + ') : (folderFieldLine || '—');
    let detailSegments = [{ kind: 'field', label: '資料夾', value: folderFieldLineForDetail }];
    let sourceDisplay = folderFieldLine || '—';
    /** @type {{ label: string, value: string }[]} */
    let outlineChunkFields = [];
    if (synTab) {
      const cs = synTab.ragChunkSize != null ? synTab.ragChunkSize : ragChunkSizeRow;
      const co = synTab.ragChunkOverlap != null ? synTab.ragChunkOverlap : ragChunkOverlapRow;
      const synResolved = tabWithResolvedTranscription(synTab, i, state, rag);
      const s = quizBankReadonlySourceDisplay(synResolved);
      if (String(s ?? '').trim() !== '') sourceDisplay = String(s).trim();
      const utSyn = Number(synResolved.unitType ?? UNIT_TYPE_RAG);
      if (utSyn === UNIT_TYPE_RAG) outlineChunkFields = quizBankReadonlyOutlineChunkFields(cs, co);
      detailSegments = [
        { kind: 'field', label: '資料夾', value: folderFieldLineForDetail },
        ...buildQuizBankReadonlyDetailSegments(synResolved),
      ];
    } else if (ut === UNIT_TYPE_RAG) {
      outlineChunkFields = quizBankReadonlyOutlineChunkFields(ragChunkSizeRow, ragChunkOverlapRow);
    } else {
      detailSegments.push({
        kind: 'text',
        text: `詳細來源請至下方「設定單元題型」區選擇「${folderLine || `單元 ${i + 1}`}」後，於「單元內容」檢視。`,
      });
    }
    const synUnitName = synTab ? String(synTab.unitName ?? '').trim() : '';
    const unitFromRow = unitsRow[i] ? String(unitsRow[i].unit_name ?? '').trim() : '';
    const unitNameFromState = String(state.packUnitNames?.[i] ?? '').trim();
    const unitNameDisplay = synUnitName || unitFromRow || unitNameFromState || '—';
    const folderComboTitleFb =
      folderComboTags.length > 0
        ? folderComboTags.join(' + ')
        : (fcRow || folderLine || `設定單元 ${i + 1}`);
    return {
      key: `fb-${i}-${String(folderLine).slice(0, 32)}`,
      title: folderComboTitleFb,
      folderComboTags,
      unitNameDisplay,
      unitType: ut,
      typeLabel: packUnitTypeDisplayLabel(ut),
      sourceDisplay,
      outlineChunkFields,
      detailSegments,
    };
  });
});

/** 從 Rag 項目同步到 tab state（packTasks、ragMetadata、chunk、quizzes 等） */
function syncRagItemToState(rag, state) {
  if (!rag || typeof rag !== 'object') return;
  setUnitSubTabsFromUnits(state, unitsFromRagTabsRow(rag));
  const unitListStr = getRagUnitListString(rag);
  if (unitListStr) {
    state.packTasks = unitListStr;
    state.packTasksList = parsePackTasksList(state.packTasks);
    const rawUt = rag.unit_types ?? rag.unit_type_list;
    state.packUnitTypes = parsePackUnitTypesFromRag(rawUt, state.packTasksList.length);
  }
  if (rag.rag_metadata != null) {
    state.ragMetadata = typeof rag.rag_metadata === 'string' ? rag.rag_metadata : JSON.stringify(rag.rag_metadata, null, 2);
  }
  const nGroups = Array.isArray(state.packTasksList) ? state.packTasksList.length : 0;
  const chunkHL = hydratePackChunkArraysFromRag(rag, nGroups);
  state.packChunkSizes = chunkHL.sizes;
  state.packChunkOverlaps = chunkHL.overs;
  const unitsHydr = unitsFromRagTabsRow(rag);
  const listForNames = state.packTasksList;
  const packNamesHydr = [];
  for (let i = 0; i < nGroups; i++) {
    const u = unitsHydr[i];
    const fromApi = u ? String(u.unit_name ?? u.rag_name ?? '').trim() : '';
    const g = Array.isArray(listForNames) ? listForNames[i] : [];
    const fromGroup = firstFolderNameInGroup(g);
    packNamesHydr.push(fromApi || fromGroup || '');
  }
  state.packUnitNames = packNamesHydr;
  const filename = rag.file_metadata?.filename ?? rag.filename;
  if (filename != null && String(filename).trim() !== '') state.zipFileName = String(filename).trim();
  hydrateQuizCardsFromRag(rag, state);
  state._synced = true;
  applyPersistedUnitSubTabsIfActive(String(rag?.rag_tab_id ?? rag?.id ?? '').trim());
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

/** 由 /rag/tabs 的 quiz 組題卡：批改優先 quiz.answers 末筆；若無則讀列上 answer_content／quiz_score／answer_critique（Rag_Quiz 內嵌欄位） */
function buildCardFromRagQuiz(quiz, ragName, ragIdFallback) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? null;
  const refA = quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? '';
  const critStr = quiz.answer_critique != null ? String(quiz.answer_critique).trim() : '';
  const embeddedScore = quiz.quiz_score;
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
            answer_critique: quiz.answer_critique,
            answer_content: quiz.answer_content,
          };
    answer_id = quiz.rag_answer_id ?? null;
  }

  const gradingPrompt = String(quiz.answer_user_prompt_text ?? '').trim();
  const rid = quiz.rag_id ?? quiz.ragId ?? ragIdFallback;
  const ragIdStr = rid != null && String(rid).trim() !== '' ? String(rid) : null;
  const fe =
    quiz.for_exam === true
    || quiz.for_exam === 1
    || quiz.rag_quiz_for_exam === true
    || quiz.rag_quiz_for_exam === 1;
  const rtid = quiz.rag_tab_id != null ? String(quiz.rag_tab_id).trim() : '';
  const ruidRaw = quiz.rag_unit_id != null ? Number(quiz.rag_unit_id) : NaN;
  const ruid = Number.isFinite(ruidRaw) && ruidRaw >= 0 ? ruidRaw : 0;
  const rawQuizName = String(quiz.quiz_name ?? quiz.quizName ?? '').trim();
  const quizNameResolved =
    rawQuizName !== '' ? rawQuizName : DEFAULT_UNIT_QUIZ_DISPLAY_NAME;
  const quizUserPromptTextResolved = extractQuizUserPromptText(quiz);
  const card = {
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
    quizUserPromptText: quizUserPromptTextResolved,
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
  syncQuizCardPromptBaselines(card);
  return card;
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

/** 有 RAG 資料時預設選第一個 tab；若 session 有合法上次選擇則還原該頂層 tab */
watch(ragList, (list) => {
  if (list.length === 0 || activeTabId.value != null) return;
  const personId = getPersonId(authStore);
  const persisted = personId ? readCreateBankTabUiPersisted(personId) : null;
  const pick =
    persisted?.rag_tab_id
    && ragTabIdExistsInBankLists(persisted.rag_tab_id, list, newTabIds.value)
      ? persisted.rag_tab_id
      : null;
  activeTabId.value = pick ?? (list[0].rag_tab_id ?? list[0].id ?? list[0]);
}, { immediate: true });

watch(
  [
    activeTabId,
    () => currentState.value.activeUnitTabId,
    () => currentState.value.activeUnitQuizTypeIndex,
  ],
  () => {
    persistCreateBankTabUiSelection();
  },
  { flush: 'post' }
);

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
  applyPersistedUnitSubTabsIfActive(String(tabId));
  return units;
}

/** GET /rag/tabs 由 useRagList 內 watch(immediate) 首次載入；每次從側欄再進入本頁（KeepAlive onActivated）再抓 GET /rag/tabs */
const createBankActivatedOnce = ref(false);

// ─── 生命週期：頁面啟動與初始載入 ────────────────────────────────────────────
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

// ─── RAG Tab CRUD（新增 / 刪除 / 更名） ───────────────────────────────────────

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
  if (ragTabIsExamProtected(rag, tabStateMap)) {
    alert('此題庫含有已設為測驗用之題型，無法刪除。請先於題型區將「設為測驗用」全部取消後再試。');
    return;
  }
  const label = getRagTabLabel(rag);
  const msg = `確定要刪除「${label}」嗎？`;
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
        activeTabId.value = null;
        showFormWhenNoData.value = false;
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

function openRenameUnitQuizTab(qi) {
  const cards = activeUnitQuizCards.value;
  const row = Array.isArray(cards) ? cards[qi] : null;
  const rqid = row ? positiveRagQuizIdFromQuizRow(row) : null;
  if (rqid == null) return;
  renameUnitQuizDraftRagQuizId.value = rqid;
  renameUnitQuizInitialName.value = String(row?.quizName ?? '').trim();
  renameUnitQuizError.value = '';
  renameUnitQuizModalOpen.value = true;
}

async function onRenameUnitQuizSave(name) {
  if (!name || !String(name).trim()) {
    renameUnitQuizError.value = '請輸入名稱';
    return;
  }
  const rqid = renameUnitQuizDraftRagQuizId.value;
  if (rqid == null || !Number.isFinite(rqid) || rqid < 1) {
    renameUnitQuizError.value = '找不到此題型，請重新整理頁面後再試';
    return;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    renameUnitQuizError.value = '請先登入';
    return;
  }
  renameUnitQuizSaving.value = true;
  renameUnitQuizError.value = '';
  try {
    const data = await apiUpdateRagQuizName(
      { rag_quiz_id: rqid, quiz_name: String(name).trim() },
      personId
    );
    const resolved = String(data?.quiz_name ?? name).trim();
    const si = activeUnitSlotIndex.value;
    const stack = currentState.value.unitSlotQuizCards?.[si - 1];
    if (Array.isArray(stack)) {
      const hit = stack.find((c) => positiveRagQuizIdFromQuizRow(c) === rqid);
      if (hit && resolved) hit.quizName = resolved;
    }
    await fetchRagList({ silent: true });
    renameUnitQuizModalOpen.value = false;
  } catch (err) {
    renameUnitQuizError.value = err.message || '更新失敗';
  } finally {
    renameUnitQuizSaving.value = false;
  }
}

async function onDeleteUnitQuizTab(qi) {
  const slotIndex = activeUnitSlotIndex.value;
  const state = currentState.value;
  const stackRaw = state.unitSlotQuizCards?.[slotIndex - 1];
  const cards = Array.isArray(stackRaw) ? [...stackRaw] : [];
  const row = cards[qi];
  if (!row) return;
  const rqid = positiveRagQuizIdFromQuizRow(row);
  if (rqid == null) {
    alert('此題型尚未建立於伺服器，無法刪除。');
    return;
  }
  const personId = getPersonId(authStore);
  if (!personId) {
    alert('請先登入');
    return;
  }
  const label = quizTypeTabLabel(row);
  const isExam = row.rag_quiz_for_exam === true || row.rag_quiz_for_exam === 1;
  const msg = isExam
    ? `「${label}」已標為測驗用。確定刪除此題型嗎？`
    : `確定要刪除題型「${label}」嗎？`;
  if (!confirm(msg)) return;
  deleteUnitQuizLoading.value = true;
  try {
    await apiDeleteRagQuiz(rqid, personId);
    cards.splice(qi, 1);
    state.unitSlotQuizCards[slotIndex - 1] = cards;
    const slotState = getSlotFormState(slotIndex);
    if (parsePositiveQuizId(slotState.unitDraftRagQuizId) === rqid) {
      slotState.unitDraftRagQuizId =
        cards.length > 0 ? positiveRagQuizIdFromQuizRow(cards[cards.length - 1]) : null;
    }
    if (parsePositiveQuizId(slotState.lastSuccessfulCreatedRagQuizId) === rqid) {
      slotState.lastSuccessfulCreatedRagQuizId =
        cards.length > 0 ? positiveRagQuizIdFromQuizRow(cards[cards.length - 1]) : null;
    }
    let idx = Number(state.activeUnitQuizTypeIndex ?? 0);
    if (qi < idx) idx -= 1;
    else if (qi === idx) idx = Math.min(Math.max(0, idx), Math.max(0, cards.length - 1));
    if (cards.length === 0) idx = 0;
    else if (idx >= cards.length) idx = cards.length - 1;
    if (idx < 0) idx = 0;
    state.activeUnitQuizTypeIndex = idx;
    state.cardList[slotIndex - 1] = focalCardFromUnitQuizList(cards, slotState);
    await fetchRagList({ silent: true });
  } catch (err) {
    alert('刪除失敗：' + (err.message || String(err)));
  } finally {
    deleteUnitQuizLoading.value = false;
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
    state.zipError = '請選擇 .zip 檔案';
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

// ─── 上傳 ZIP 與 Pack（Build RAG ZIP） ────────────────────────────────────────

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

/** POST /rag/tab/build-rag-zip（按鈕「開始建立單元」） */
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
    state.packError = '請至少建立一個設定單元，且每個設定單元至少於資料夾組合放入一個課程標籤';
    return;
  }
  if (hasPackUnitTranscriptLoading.value) {
    state.packError = '逐字稿尚在分析或檔案讀取中，請稍候再開始建立單元';
    return;
  }
  const missingTranscriptIndexes = missingPackUnitTranscriptIndexes(state);
  if (missingTranscriptIndexes.length > 0) {
    const labels = missingTranscriptIndexes.map((i) => `單元 ${i + 1}`).join('、');
    state.packError = `${labels} 尚未載入內容；請於各單元編輯區上方依類型點選「載入檔案文字」、「載入語音文字」或「載入影片文字」。`;
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
    const unitTypesNormalized = parsePackUnitTypesFromRag(
      state.packUnitTypes,
      state.packTasksList?.length ?? 0
    );
    const transcriptions = transcriptionsForBuildRagZip(
      unitTypesNormalized,
      state.packUnitMarkdownTexts ?? []
    );
    ensurePackUnitSidecarArrays();
    const { rag_chunk_sizes: chunkSizesStr, rag_chunk_overlaps: chunkOverlapsStr } =
      chunkSizesOverlapsStringsForBuildRagZip(
        unitTypesNormalized,
        state.packChunkSizes,
        state.packChunkOverlaps,
        DEFAULT_PACK_CHUNK_SIZE,
        DEFAULT_PACK_CHUNK_OVERLAP
      );
    const unitNamesStr = serializePackUnitNamesForApi(
      state.packUnitNames,
      state.packTasksList?.length ?? 0
    );
    state.packResponseJson = await apiBuildRagZip(
      {
        rag_tab_id: fileId,
        person_id: personId,
        unit_list: unitList,
        rag_chunk_size: DEFAULT_PACK_CHUNK_SIZE,
        rag_chunk_overlap: DEFAULT_PACK_CHUNK_OVERLAP,
        rag_chunk_sizes: chunkSizesStr,
        rag_chunk_overlaps: chunkOverlapsStr,
        unit_types: serializePackUnitTypesForApi(unitTypesNormalized),
        transcriptions,
        unit_names: unitNamesStr,
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
    packBuildSuccessModalOpen.value = true;
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
      /** 「產生題目」時 POST create 成功後備份 rag_quiz_id，避免列上遺漏時仍可送 llm-generate */
      lastSuccessfulCreatedRagQuizId: null,
      /** 目前此槽位在「所屬單元」內的第幾題（按題型列「+」推入草稿列時遞增） */
      unitPromptOrdinalInUnit: null,
      unitQuizCreateLoading: false,
      /** LoadingOverlay 文案：`add-row`＝題型列「+」；`llm-generate`＝單元內「產生題目」 */
      unitQuizLoadingOverlayKind: null,
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
  if (slot.unitQuizLoadingOverlayKind === undefined) slot.unitQuizLoadingOverlayKind = null;
  if (slot.unitQuizCreateError === undefined) slot.unitQuizCreateError = '';
  return slot;
}

/** 本機草稿列（無 rag_quiz_id）：供先顯示題名／出題規則介面，待「產生題目」再 POST create。 */
function createLocalDraftUnitQuizCard() {
  const tab = activeUnitTabItem.value;
  const rag = currentRagItem.value;
  const state = currentState.value;
  const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  const ragIdStr = ragId != null && String(ragId).trim() !== '' ? String(ragId) : null;
  const ragTabId = String(tab?.ragTabId ?? rag?.rag_tab_id ?? activeTabId.value ?? state.zipTabId ?? '').trim();
  const ruRaw = tab?.ragUnitDbId != null ? Number(tab.ragUnitDbId) : NaN;
  const ragUnitId = Number.isFinite(ruRaw) && ruRaw >= 0 ? ruRaw : 0;
  const ragName = String(tab?.unitName ?? tab?.label ?? '').trim();
  return {
    id: nextCardId(),
    quiz: '',
    hint: '',
    referenceAnswer: '',
    sourceFilename: null,
    ragName: ragName || null,
    rag_id: ragIdStr,
    quiz_answer: '',
    hintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: null,
    rag_quiz_id: null,
    rag_tab_id: ragTabId,
    rag_unit_id: ragUnitId,
    rag_quiz_for_exam: false,
    ragQuizForExamLoading: false,
    ragQuizForExamError: '',
    answer_id: null,
    gradingPrompt: '',
    quizName: DEFAULT_UNIT_QUIZ_DISPLAY_NAME,
    quizUserPromptText: '',
    quizUserPromptBaseline: '',
    gradingPromptBaseline: '',
    quizAnswerBaseline: '',
  };
}

// ─── 題目生成（LLM）與評分（Grading） ────────────────────────────────────────

/**
 * 題型列「+」新增題庫：POST /rag/tab/unit/quiz/create 建立空白 Rag_Quiz（不呼叫 LLM），回傳 rag_quiz_id 後推入題列並展開出題區。
 * 可選 await GET 子分頁以補齊 rag_unit_id。
 */
async function createBlankUnitQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  let tab = activeUnitTabItem.value;
  const state = currentState.value;
  const rag = currentRagItem.value;
  const personId = getPersonId(authStore);
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
  slotState.unitQuizCreateError = '';
  if (!personId) {
    slotState.unitQuizCreateError = '請先登入';
    return;
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
  slotState.unitQuizLoadingOverlayKind = 'add-row';
  try {
    const createData = await apiCreateRagUnitQuiz(
      { rag_tab_id: ragTabId, rag_unit_id: ragUnitId },
      personId
    );
    const rawNew = createData?.rag_quiz_id ?? createData?.quiz_id ?? createData?.id;
    const newRq = parsePositiveQuizId(rawNew);
    if (newRq == null) {
      throw new Error('後端未回傳有效的 rag_quiz_id');
    }
    await persistDefaultUnitQuizNameAfterCreate(newRq, personId);
    slotState.showGenerateForm = true;
    slotState.quizUserPromptText = String(slotState.quizUserPromptText ?? '');
    if (tab?.generateQuizTabId) {
      slotState.generateQuizTabId = tab.generateQuizTabId;
    }
    if (!state.unitSlotQuizCards) state.unitSlotQuizCards = [];
    while (state.unitSlotQuizCards.length < slotIndex) state.unitSlotQuizCards.push([]);
    let sub = state.unitSlotQuizCards[slotIndex - 1];
    if (!Array.isArray(sub)) {
      state.unitSlotQuizCards[slotIndex - 1] = [];
      sub = state.unitSlotQuizCards[slotIndex - 1];
    }
    const draft = createLocalDraftUnitQuizCard();
    draft.rag_quiz_id = newRq;
    draft.rag_tab_id = ragTabId;
    draft.rag_unit_id = ragUnitId;
    sub.push(draft);
    const sortedSub = sortUnitQuizCardsByRagQuizId(sub);
    state.unitSlotQuizCards[slotIndex - 1] = sortedSub;
    state.activeUnitQuizTypeIndex = sortedSub.length > 0 ? sortedSub.length - 1 : 0;
    slotState.unitDraftRagQuizId = newRq;
    slotState.lastSuccessfulCreatedRagQuizId = newRq;
    state.cardList[slotIndex - 1] = focalCardFromUnitQuizList(sortedSub, slotState);
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
    slotState.unitQuizCreateError = err?.message || String(err) || '新增題庫失敗';
  } finally {
    slotState.unitQuizCreateLoading = false;
    slotState.unitQuizLoadingOverlayKind = null;
  }
}

/**
 * POST /rag/tab/unit/quiz/llm-generate：body 僅 rag_quiz_id、quiz_name、quiz_user_prompt_text（API 允許空字串；前端按鈕仍須已填出題規則）。
 * 若該列尚無 rag_quiz_id（相容舊本機草稿），先 POST /rag/tab/unit/quiz/create 再 llm-generate；一般流程已由題型列「+」先 create。
 */
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
  let rqid =
    (rqFromRow != null && rqFromRow >= 1 ? rqFromRow : null)
    ?? draftN
    ?? fromCard
    ?? anchorTab;
  const promptText =
    (quizCardRow != null && typeof quizCardRow === 'object'
      ? String(quizCardRow.quizUserPromptText ?? '').trim()
      : '')
    || String(slotState.quizUserPromptText ?? '').trim();
  const quizNameRaw =
    (quizCardRow != null && typeof quizCardRow === 'object'
      ? String(quizCardRow.quizName ?? '').trim()
      : '')
    || String(slotCard?.quizName ?? '').trim();
  const quizNameOut =
    quizNameRaw !== '' ? quizNameRaw : DEFAULT_UNIT_QUIZ_DISPLAY_NAME;
  if (!String(promptText ?? '').trim()) {
    slotState.unitQuizCreateError = '請填寫出題規則';
    return;
  }
  slotState.unitQuizCreateLoading = true;
  slotState.unitQuizLoadingOverlayKind = 'llm-generate';
  slotState.unitQuizCreateError = '';
  try {
    if (
      (rqid == null || rqid < 1)
      && quizCardRow != null
      && typeof quizCardRow === 'object'
      && quizRowQuizEmpty(quizCardRow)
    ) {
      const ragTabIdCreate = String(
        quizCardRow.rag_tab_id
        ?? tab?.ragTabId
        ?? rag?.rag_tab_id
        ?? activeTabId.value
        ?? state.zipTabId
        ?? ''
      ).trim();
      const ruRaw = quizCardRow.rag_unit_id ?? tab?.ragUnitDbId;
      const ragUnitIdCreate = ruRaw != null && ruRaw !== '' ? Number(ruRaw) : 0;
      if (!ragTabIdCreate || !Number.isFinite(ragUnitIdCreate) || ragUnitIdCreate < 1) {
        slotState.unitQuizCreateError =
          '無法建立空白題目：缺少 rag_tab_id／rag_unit_id，請確認單元與題庫狀態後重試';
        return;
      }
      const createData = await apiCreateRagUnitQuiz(
        { rag_tab_id: ragTabIdCreate, rag_unit_id: ragUnitIdCreate },
        personId
      );
      const rawNew = createData?.rag_quiz_id ?? createData?.quiz_id ?? createData?.id;
      const newRq = parsePositiveQuizId(rawNew);
      if (newRq == null) {
        throw new Error('後端未回傳有效的 rag_quiz_id');
      }
      await persistDefaultUnitQuizNameAfterCreate(newRq, personId);
      quizCardRow.rag_quiz_id = newRq;
      if (quizCardRow.rag_tab_id == null || String(quizCardRow.rag_tab_id).trim() === '') {
        quizCardRow.rag_tab_id = ragTabIdCreate;
      }
      if (!Number.isFinite(Number(quizCardRow.rag_unit_id)) || Number(quizCardRow.rag_unit_id) < 1) {
        quizCardRow.rag_unit_id = ragUnitIdCreate;
      }
      rqid = newRq;
      slotState.unitDraftRagQuizId = newRq;
      slotState.lastSuccessfulCreatedRagQuizId = newRq;
      /** 不在此呼叫 refreshUnitSubTabsFromApi：會 hydrate 覆寫整份 unitSlotQuizCards，抹掉同單元其他僅本機草稿列。 */
      const subRef = state.unitSlotQuizCards?.[slotIndex - 1];
      if (Array.isArray(subRef)) {
        state.unitSlotQuizCards[slotIndex - 1] = sortUnitQuizCardsByRagQuizId(subRef);
      }
    }

    if (rqid == null || rqid < 1) {
      slotState.unitQuizCreateError =
        '無法取得 rag_quiz_id。請在空白列填寫出題規則後按「儲存並產生題目」，或重新整理頁面。';
      return;
    }

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
      slotState.unitQuizCreateError = '產生失敗：後端回傳 quiz_content 為空，請調整出題規則後重試';
      return;
    }

    /** 同一題重新產生：立即隱藏舊批改結果（合併 setCardAtSlot 亦會清空，避免短暫殘留） */
    if (quizCardRow != null && typeof quizCardRow === 'object') {
      quizCardRow.confirmed = false;
      quizCardRow.gradingResult = '';
      quizCardRow.gradingResponseJson = null;
      quizCardRow.answer_id = null;
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
      ragId,
      ragQuizId,
      quizCardRow
    );
  } catch (err) {
    slotState.unitQuizCreateError = err.message || '產生題目失敗';
  } finally {
    slotState.unitQuizCreateLoading = false;
    slotState.unitQuizLoadingOverlayKind = null;
  }
}

/** 無單元子分頁時點「新增題目」：展開一個新的題目區塊（第 n 題）；cardList 與 slot 對齊 */
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
 * @param {object | null} [mergeTargetRow] - 單元多題時：優先合併此列（與 unitSlotQuizCards 內同一引用），避免該列無 rag_quiz_id 時誤 push 新列導致 UI 仍顯示空白出題規則。
 */
function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, ragId, ragQuizId, mergeTargetRow = null) {
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
      /** 重新產生題目時須帶入新題的暫存參考答案；勿沿用上一版題幹留在答案欄的內容 */
      card.quiz_answer = quizAnswerPresetFromReference(referenceAnswer);
      card.hintVisible = prev.hintVisible ?? false;
      /** 題幹已由 LLM 更新，勿沿用上一版批改／作答對應（否則仍顯示舊評語） */
      card.confirmed = false;
      card.gradingResult = '';
      card.gradingResponseJson = null;
      card.answer_id = null;
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
      const merged = { ...prev, ...card };
      syncQuizCardPromptBaselines(merged);
      sub[idx] = merged;
    } else {
      syncQuizCardPromptBaselines(card);
      sub.push(card);
    }
    state.unitSlotQuizCards[slotIndex - 1] = sortUnitQuizCardsByRagQuizId(sub);
    state.cardList[slotIndex - 1] = focalCardFromUnitQuizList(
      state.unitSlotQuizCards[slotIndex - 1],
      state.slotFormState?.[slotIndex]
    );
    return;
  }

  syncQuizCardPromptBaselines(card);
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
    slotState.error = '請先在「設定單元」按「開始建立單元」完成題庫建立，或重新整理頁面';
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

/** 評分：POST /rag/tab/unit/quiz/llm-grade；body 以 rag_id、rag_quiz_id、quiz_answer 為核心；quiz_content 可省略（後端自 Rag_Quiz 讀）；選填 rag_tab_id、answer_user_prompt_text（題卡「批改規則」gradingPrompt，前端須先有內容才允許送出）；回傳 202 + job_id；輪詢 GET /rag/tab/unit/quiz/grade-result/{job_id}。 */
async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
  if (!String(item.gradingPrompt ?? '').trim()) {
    item.gradingResult = '請填寫批改規則';
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
    if (item.confirmed) {
      item.gradingPromptBaseline = String(item.gradingPrompt ?? '');
      item.quizAnswerBaseline = String(item.quiz_answer ?? '');
    }
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
    <TabRenameModal
      v-model="renameUnitQuizModalOpen"
      :initial-name="renameUnitQuizInitialName"
      :saving="renameUnitQuizSaving"
      :error="renameUnitQuizError"
      title="修改題型"
      @save="onRenameUnitQuizSave"
    />
    <Teleport to="body">
      <div
        v-if="ragUnitTranscriptModalOpen"
        class="modal fade show d-block my-modal-backdrop"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rag-unit-transcript-modal-title"
      >
        <div
          class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
          @click.stop
        >
          <div class="modal-content border-0 my-bgcolor-gray-3 p-4 d-flex flex-column gap-3">
            <div class="modal-header border-bottom-0 p-0">
              <h5 id="rag-unit-transcript-modal-title" class="modal-title my-color-black">逐字稿</h5>
              <button
                type="button"
                class="btn-close"
                aria-label="關閉"
                @click="closeRagUnitTranscriptModal"
              />
            </div>
            <div class="modal-body p-0" style="max-height: 70vh; overflow: auto;">
              <div
                v-if="ragUnitTranscriptModalBodyHtml"
                class="my-markdown-rendered my-font-md-400 my-color-black text-break"
                v-html="ragUnitTranscriptModalBodyHtml"
              />
              <span
                v-else
                class="my-font-md-400 my-color-black"
              >—</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="packBuildSuccessModalOpen"
        class="modal fade show d-block my-modal-backdrop"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="單元建立完成"
      >
        <div class="modal-dialog modal-dialog-centered" @click.stop>
          <div class="modal-content border-0 my-bgcolor-gray-3 p-4 d-flex flex-column gap-3">
            <div class="modal-body p-0 text-center">
              <p class="my-font-md-400 my-color-black mb-0">單元建立完成</p>
            </div>
            <div class="modal-footer border-top-0 p-0 d-flex justify-content-center w-100">
              <button
                type="button"
                class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-black px-3 py-2"
                @click="closePackBuildSuccessModal"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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
                  :disabled="deleteRagLoading || renameRagTabSaving || renameUnitQuizSaving || deleteUnitQuizLoading"
                  @click.stop="openRenameRagTab(item._tabId)"
                >
                  <i class="fa-solid fa-pen" aria-hidden="true" />
                </button>
                <!-- 綠點／× 同槽；綠點僅依題庫是否含測驗用，不依是否選中該分頁 -->
                <span
                  v-if="item._isExamRag || activeTabId === item._tabId"
                  class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn"
                >
                  <span
                    v-if="item._isExamRag"
                    class="d-inline-flex justify-content-center align-items-center"
                    title="試卷用題庫"
                    role="img"
                    aria-label="試卷用題庫"
                  >
                    <span
                      class="rounded-circle d-inline-block my-bgcolor-green"
                      style="width: 0.5rem; height: 0.5rem"
                    />
                  </span>
                  <button
                    v-else
                    type="button"
                    class="btn btn-link text-decoration-none my-color-gray-4 p-0 border-0 lh-1 align-middle"
                    title="刪除此題庫"
                    :disabled="deleteRagLoading || renameRagTabSaving || renameUnitQuizSaving || deleteUnitQuizLoading"
                    @click.stop="onDeleteRagTab(item._tabId)"
                  >
                    <i class="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </span>
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
          v-if="!ragListLoading"
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
      <!-- 建立流程 stepper：1–3（已完成灰底細框／當前黑底／未到淺灰；連線達下一階即加深） -->
      <section v-if="showStepperSection" class="my-page-block-spacing">
        <div class="my-create-rag-stepper text-start">
          <div class="d-flex justify-content-between align-items-start gap-2 gap-sm-3 w-100">
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="my-create-rag-stepper-num rounded-circle d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-600"
              :class="createRagStepperNumVariant(1)"
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
              :class="createRagStepperNumVariant(2)"
            >2</span>
            <span
              class="my-create-rag-stepper-label"
              :class="createRagStepperPhase >= 2 ? 'my-create-rag-stepper-label--current my-font-sm-600' : 'my-create-rag-stepper-label--inactive my-font-sm-400'"
            >設定單元</span>
          </div>
          <div
            class="my-create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
            :class="createRagStepperPhase >= 3 ? 'my-create-rag-stepper-line--on' : ''"
            aria-hidden="true"
          />
          <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
            <span
              class="my-create-rag-stepper-num rounded-circle d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-600"
              :class="createRagStepperNumVariant(3)"
            >3</span>
            <span
              class="my-create-rag-stepper-label"
              :class="createRagStepperPhase >= 3 ? 'my-create-rag-stepper-label--current my-font-sm-600' : 'my-create-rag-stepper-label--inactive my-font-sm-400'"
            >設定單元題型</span>
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
              <div
                class="my-font-sm-400 my-color-gray-4 mt-2 text-start lh-sm w-100 mx-auto"
                style="max-width: 28rem;"
              >
                <div class="mb-1">
                  請在「設定單元」為 ZIP 內各資料夾分別選單元類型；各資料夾裡，後端會讀取的副檔名依類型如下：
                </div>
                <ul class="my-font-sm-400 my-color-gray-4 mb-0 ps-3">
                  <li class="mb-0">RAG：.pdf、.doc、.docx、.ppt、.pptx</li>
                  <li class="mb-0">文字：該資料夾內只能有一個 .md、.txt、.doc 或 .docx</li>
                  <li class="mb-0">mp3：該資料夾內只能有一個.mp3檔</li>
                  <li class="mb-0">youtube：.md、.txt、.doc 或 .docx（檔內須為 YouTube 網址）</li>
                </ul>
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
      <!-- 建立 RAG：要有 file_metadata 才顯示；未建置時僅可編輯「設定單元」卡，建置完成後另顯唯讀摘要卡（rounded-4 深灰） -->
      <template v-if="fileMetadataToShow != null">
        <div
          class="w-100"
          :class="{ 'pe-none my-color-gray-4': !hasRagMetadata && packGroupsEditBlocked }"
        >
          <!-- 建置完成後僅保留下方唯讀「設定單元」卡，不重複檔名／已套用提示 -->
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
              設定單元
            </div>
            <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
              <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                上傳檔案名稱（檔案大小）
              </div>
              <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                {{ uploadZipReadonlyInputValue }}
              </div>
            </div>
          <!-- 課程：可拖曳至設定單元 -->
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

          <!-- 單元：外層列出各出題單元區塊；區塊內「資料夾組合」可放置課程標籤（與其他 input 同 form-control + px-3 py-2） -->
          <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
            <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">單元</div>
            <div
              class="d-flex flex-column gap-3 w-100 min-w-0 mt-2"
              role="group"
              aria-label="單元"
            >
              <template v-for="(group, gi) in ragListDisplayGroups" :key="'rg-' + gi">
                <div class="rounded-2 p-3 w-100 min-w-0 lh-base text-break my-bgcolor-gray-4 my-border-muted d-flex flex-column">
                  <div class="mb-2 d-flex flex-column gap-0 w-100 min-w-0">
                    <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                      資料夾組合
                    </div>
                    <div
                      class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 d-flex align-items-center gap-1 position-relative my-pack-drop-target"
                      style="min-height: 2.5rem;"
                      @dragover.prevent="onDragOver($event)"
                      @dragenter.prevent="onDragEnter($event)"
                      @dragleave="onDragLeave($event)"
                      @drop.prevent="onDropRagList($event, gi)"
                    >
                      <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1 min-w-0">
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
                    </div>
                  </div>
                  <div
                    class="mb-2 d-flex flex-row flex-nowrap gap-3 w-100 min-w-0 align-items-start"
                  >
                    <div class="d-flex flex-column gap-0 min-w-0" style="flex: 1 1 0;">
                      <label
                        class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                        :for="'rag-pack-unit-name-' + gi"
                      >單元名稱</label>
                      <input
                        :id="'rag-pack-unit-name-' + gi"
                        type="text"
                        class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 my-font-md-400"
                        :disabled="packGroupsEditBlocked || group.length === 0"
                        :value="currentState.packUnitNames?.[gi] ?? ''"
                        :aria-label="`設定單元 ${gi + 1} 單元名稱`"
                        autocomplete="off"
                        placeholder="選填"
                        @input="onPackUnitNameInput(gi, $event)"
                      >
                    </div>
                    <div
                      class="d-flex flex-column gap-0 min-w-0"
                      style="flex: 1 1 0;"
                    >
                      <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                        類型
                      </div>
                      <Design08OptionDropdown
                        :model-value="packUnitTypeAt(gi)"
                        :options="PACK_UNIT_TYPE_OPTIONS"
                        :menu-id="'pack-unit-type-' + gi"
                        :disabled="packGroupsEditBlocked || group.length === 0"
                        block
                        :aria-label="`設定單元 ${gi + 1} 類型`"
                        @update:model-value="onPackUnitTypePick(gi, $event)"
                      />
                    </div>
                  </div>
                  <div
                    v-if="packUnitTypeAt(gi) === UNIT_TYPE_RAG"
                    class="mb-2 d-flex flex-row flex-nowrap gap-3 w-100 min-w-0 align-items-start"
                  >
                    <div class="d-flex flex-column gap-0 min-w-0" style="flex: 1 1 0;">
                      <label
                        class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                        :for="'rag-pack-chunk-size-' + gi"
                      >分段長度（字元）</label>
                      <input
                        :id="'rag-pack-chunk-size-' + gi"
                        type="number"
                        min="1"
                        step="1"
                        class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 my-font-md-400"
                        :disabled="packGroupsEditBlocked || group.length === 0"
                        :value="ensureNumber(currentState.packChunkSizes?.[gi], DEFAULT_PACK_CHUNK_SIZE)"
                        :aria-label="`設定單元 ${gi + 1} 分段長度（字元）`"
                        autocomplete="off"
                        @input="onPackChunkSizeInput(gi, $event)"
                      >
                    </div>
                    <div class="d-flex flex-column gap-0 min-w-0" style="flex: 1 1 0;">
                      <label
                        class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                        :for="'rag-pack-chunk-overlap-' + gi"
                      >分段重疊（字元）</label>
                      <input
                        :id="'rag-pack-chunk-overlap-' + gi"
                        type="number"
                        min="0"
                        step="1"
                        class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 my-font-md-400"
                        :disabled="packGroupsEditBlocked || group.length === 0"
                        :value="ensureNumber(currentState.packChunkOverlaps?.[gi], DEFAULT_PACK_CHUNK_OVERLAP)"
                        :aria-label="`設定單元 ${gi + 1} 分段重疊（字元）`"
                        autocomplete="off"
                        @input="onPackChunkOverlapInput(gi, $event)"
                      >
                    </div>
                  </div>
                  <div
                    v-if="packUnitTypeAt(gi) === UNIT_TYPE_TEXT || packUnitTypeAt(gi) === UNIT_TYPE_MP3 || packUnitTypeAt(gi) === UNIT_TYPE_YOUTUBE"
                    class="w-100 min-w-0"
                  >
                    <div class="d-flex flex-column gap-2 w-100 min-w-0">
                      <audio
                        v-if="packUnitTypeAt(gi) === UNIT_TYPE_MP3 && (currentState.packUnitMp3PreviewUrls?.[gi] ?? '').trim() !== ''"
                        :key="currentState.packUnitMp3PreviewUrls[gi]"
                        controls
                        class="w-100"
                        preload="none"
                        :src="currentState.packUnitMp3PreviewUrls[gi]"
                      />
                      <div
                        v-if="packUnitTypeAt(gi) === UNIT_TYPE_YOUTUBE && packUnitYoutubeEmbedUrl(gi)"
                        class="ratio ratio-16x9 w-100 rounded-2 overflow-hidden my-border-muted"
                      >
                        <iframe
                          class="border-0"
                          title="YouTube 影片"
                          :src="packUnitYoutubeEmbedUrl(gi)"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerpolicy="strict-origin-when-cross-origin"
                          allowfullscreen
                        />
                      </div>
                      <div class="d-flex justify-content-center w-100 min-w-0 pt-1 pb-1">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-sm-400 my-button-white px-3 py-1"
                          :disabled="packUnitTranscriptBusy(gi) || packGroupsEditBlocked || group.length === 0"
                          :aria-busy="packUnitTranscriptBusy(gi)"
                          :aria-label="packUnitLoadTranscriptButtonLabel(gi)"
                          @click="loadPackUnitPreviewForType(gi, group)"
                        >
                          {{ packUnitLoadTranscriptButtonLabel(gi) }}
                        </button>
                      </div>
                      <div
                        class="my-pack-unit-md-editor min-w-0"
                        role="region"
                        aria-label="逐字稿 Markdown"
                      >
                        <EnglishExamMarkdownEditor
                          :model-value="packUnitTranscriptTextAt(gi)"
                          :disabled="packGroupsEditBlocked || !packUnitTranscriptLoadedAt(gi) || packUnitTranscriptBusy(gi)"
                          :preview-only="false"
                          :textarea-id="'pack-unit-transcript-md-' + gi"
                          @update:model-value="(v) => setPackUnitMarkdownAt(gi, v)"
                        />
                      </div>
                    </div>
                    <p
                      v-if="currentState.packUnitTranscriptError?.[gi]"
                      class="my-font-sm-400 my-color-red mt-2 mb-0"
                    >
                      {{ currentState.packUnitTranscriptError[gi] }}
                    </p>
                  </div>
                  <div
                    v-if="(currentState.packTasksList || []).length > 0"
                    class="d-flex flex-wrap justify-content-center align-items-center gap-2 w-100 min-w-0 pt-2 mt-1 mb-0"
                  >
                    <button
                      type="button"
                      class="btn rounded-pill d-inline-flex justify-content-center align-items-center my-font-sm-400 my-button-gray-2 px-3 py-1"
                      aria-label="重設此資料夾組合"
                      :disabled="packGroupsEditBlocked"
                      @click.stop="resetPackUnitGroup(gi)"
                    >
                      重設
                    </button>
                    <button
                      type="button"
                      class="btn rounded-pill d-inline-flex justify-content-center align-items-center my-font-sm-400 my-button-gray-2 px-3 py-1"
                      aria-label="刪除此資料夾組合"
                      :disabled="packGroupsEditBlocked"
                      @click.stop="removeRagListGroup(gi)"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </template>
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2 w-100 min-w-0 mt-2">
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
                  + 新增設定單元
                </button>
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-center flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
                  style="flex: 0 0 auto;"
                  :disabled="!(currentState.packTasksList || []).length"
                  aria-label="刪除所有設定單元"
                  title="清空所有設定單元（含空位）"
                  @click="clearAllRagListGroups"
                >
                  刪除所有單元
                </button>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-2 ms-auto">
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-button-gray-2 px-3 py-1"
                  :disabled="!secondFoldersFull.length"
                  @click="addAllSecondFoldersAsGroups"
                >
                  每個資料夾獨立單元
                </button>
                <button
                  type="button"
                  class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-button-gray-2 px-3 py-1"
                  :disabled="!secondFoldersFull.length"
                  title="在現有設定單元之後追加一組，內含全部資料夾；打包時檔名以 + 連接"
                  @click="setAllSecondFoldersAsSingleGroup"
                >
                  每個資料夾合併單元
                </button>
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-center mt-3">
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 flex-shrink-0 px-3 py-2 my-font-md-400 my-button-white"
              :disabled="startPackUnitBuildDisabled"
              :aria-busy="currentState.packLoading"
              aria-label="開始建立單元"
              @click="confirmPack"
            >
              開始建立單元
            </button>
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
              設定單元
            </div>
            <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
              <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                上傳檔案名稱（檔案大小）
              </div>
              <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                {{ uploadZipReadonlyInputValue }}
              </div>
            </div>
              <div class="mb-3 d-flex flex-column gap-0 w-100 min-w-0">
                <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">單元</div>
                <template v-if="!quizBankSettingReadonlyUnitRows.length">
                  <div
                    class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 lh-base text-break my-color-gray-4"
                  >
                    —
                  </div>
                </template>
                <div
                  v-else
                  class="d-flex flex-column gap-3 w-100 min-w-0 mt-2"
                >
                  <div
                    v-for="row in quizBankSettingReadonlyUnitRows"
                    :key="row.key"
                    class="rounded-2 p-3 w-100 min-w-0 lh-base text-break my-bgcolor-gray-4 my-border-muted d-flex flex-column"
                  >
                    <div class="mb-2 d-flex flex-row flex-nowrap gap-3 w-100 min-w-0 align-items-start">
                      <div
                        class="d-flex flex-column gap-0 min-w-0"
                        style="flex: 1 1 0;"
                      >
                        <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                          資料夾組合
                        </div>
                        <div
                          class="d-flex flex-wrap align-items-center gap-1 w-100 min-w-0"
                          role="group"
                          aria-label="資料夾組合"
                        >
                          <template v-if="row.folderComboTags?.length">
                            <span
                              v-for="(tag, ti) in row.folderComboTags"
                              :key="`${row.key}-fc-${ti}`"
                              class="badge my-bgcolor-surface my-color-black border user-select-none my-font-sm-400 d-inline-flex align-items-center gap-1 rounded px-2 py-1"
                            >{{ tag }}</span>
                          </template>
                          <span
                            v-else
                            class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0"
                          >{{ row.title }}</span>
                        </div>
                      </div>
                      <div
                        v-if="Number(row.unitType) !== UNIT_TYPE_RAG"
                        class="d-flex flex-column gap-0 min-w-0"
                        style="flex: 1 1 0;"
                      >
                        <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                          來源檔
                        </div>
                        <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                          {{ row.sourceDisplay }}
                        </div>
                      </div>
                    </div>
                    <div class="mb-2 d-flex flex-row flex-nowrap gap-3 w-100 min-w-0 align-items-start">
                      <div
                        class="d-flex flex-column gap-0 min-w-0"
                        style="flex: 1 1 0;"
                      >
                        <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                          單元名稱
                        </div>
                        <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                          {{ row.unitNameDisplay }}
                        </div>
                      </div>
                      <div
                        class="d-flex flex-column gap-0 min-w-0"
                        style="flex: 1 1 0;"
                      >
                        <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                          類型
                        </div>
                        <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                          {{ row.typeLabel }}
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="row.outlineChunkFields.length"
                      class="mb-2 d-flex flex-row flex-nowrap gap-3 w-100 min-w-0 align-items-start"
                    >
                      <div
                        v-for="(och, oi) in row.outlineChunkFields"
                        :key="row.key + '-ochunk-' + oi"
                        class="d-flex flex-column gap-0 min-w-0"
                        style="flex: 1 1 0;"
                      >
                        <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                          {{ och.label }}
                        </div>
                        <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                          {{ och.value }}
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="row.detailSegments.length"
                      class="w-100 min-w-0"
                    >
                      <template
                        v-for="(seg, li) in row.detailSegments"
                        :key="row.key + '-seg-' + li"
                      >
                        <div
                          v-if="seg.kind === 'text'"
                          class="my-font-sm-400 lh-base my-color-black"
                          :class="li < row.detailSegments.length - 1 ? 'mb-2' : 'mb-0'"
                        >
                          {{ seg.text }}
                        </div>
                        <div
                          v-else-if="seg.kind === 'field'"
                          class="d-flex flex-column gap-0 w-100 min-w-0"
                          :class="li < row.detailSegments.length - 1 ? 'mb-2' : 'mb-0'"
                        >
                          <div class="form-label my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">
                            {{ seg.label }}
                          </div>
                          <div class="my-font-md-400 my-color-black lh-base text-break w-100 min-w-0">
                            {{ seg.value }}
                          </div>
                        </div>
                        <div
                          v-else-if="seg.kind === 'markdown'"
                          class="my-rag-unit-type-text-scroll rounded-2 my-border-muted px-3 py-2 my-bgcolor-gray-4 min-w-0"
                          :class="li < row.detailSegments.length - 1 ? 'mb-2' : 'mb-0'"
                          role="region"
                          aria-label="單元逐字稿"
                        >
                          <div
                            class="my-markdown-rendered my-font-md-400 my-color-black text-break"
                            v-html="quizBankReadonlyMarkdownHtml(seg.markdown)"
                          />
                        </div>
                        <div
                          v-else-if="seg.kind === 'audio'"
                          class="col-12 min-w-0"
                          :class="li < row.detailSegments.length - 1 ? 'mb-2' : 'mb-0'"
                          style="padding: 0;"
                        >
                          <RagTabUnitMp3Player
                            :rag-tab-id="seg.ragTabId"
                            :rag-unit-id="seg.ragUnitId"
                          />
                        </div>
                        <div
                          v-else-if="seg.kind === 'youtube'"
                          class="d-flex flex-column gap-2 min-w-0"
                          :class="li < row.detailSegments.length - 1 ? 'mb-2' : 'mb-0'"
                        >
                          <div
                            v-if="seg.embedSrc"
                            class="ratio ratio-16x9 w-100 rounded-2 overflow-hidden my-border-muted"
                          >
                            <iframe
                              class="border-0"
                              title="YouTube 影片"
                              :src="seg.embedSrc"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              referrerpolicy="strict-origin-when-cross-origin"
                              allowfullscreen
                            />
                          </div>
                          <span
                            v-else-if="seg.pageUrl"
                            class="my-font-md-400 my-color-black text-break"
                          >{{ seg.pageUrl }}</span>
                          <span
                            v-else
                            class="my-font-md-400 my-color-black text-break"
                          >—</span>
                        </div>
                        <div
                          v-else-if="seg.kind === 'transcript_button'"
                          class="d-flex justify-content-center w-100 min-w-0 pt-1"
                          :class="li < row.detailSegments.length - 1 ? 'mb-2' : 'mb-0'"
                        >
                          <button
                            type="button"
                            class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border flex-shrink-0 px-3 py-1"
                            @click="openRagUnitTranscriptModal(seg.markdown)"
                          >
                            逐字稿
                          </button>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
          </div>
          </section>
        </div>
      </template>
      <!-- 設定單元題型：標題在區塊外；每題（題卡或產生題目槽）各一 rounded-4 深灰塊 -->
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
            <span class="my-font-lg-600 my-test-section-heading-title flex-shrink-0">設定單元題型</span>
            <div class="my-test-section-heading-line flex-grow-1" aria-hidden="true" />
          </div>
          <div
            class="d-flex flex-column gap-4 w-100 min-w-0"
            :class="{ 'my-color-gray-4': ragGenerateDisabled }"
          >
            <div
              v-if="(currentState.unitTabOrder || []).length > 0"
              class="w-100 min-w-0 d-flex flex-column gap-0"
            >
              <label
                class="my-color-gray-1 my-font-sm-400 mb-0 d-block"
                :for="`rag-exam-unit-subtab-${activeTabId}-toggle`"
              >選擇單元 ({{ (currentState.unitTabOrder || []).length }})</label>
              <UnitSelectDropdown
                v-model="currentState.activeUnitTabId"
                :options="currentState.unitTabOrder"
                :option-value="unitSubTabDropdownValue"
                :option-label="unitSubTabDropdownLabel"
                :menu-id="`rag-exam-unit-subtab-${activeTabId}`"
                omit-empty-choice
                :placeholder="`選擇單元 (${(currentState.unitTabOrder || []).length})`"
              />
            </div>
            <div
              v-if="(currentState.unitTabOrder || []).length > 0 && canSeeRagUnitSourceFilename"
              class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0"
            >
              <div class="my-font-md-600 my-color-black mb-3">單元內容</div>
              <div class="row g-3">
                <div
                  v-if="canSeeRagUnitSourceFilename && activeUnitTabItem?.unitType === UNIT_TYPE_TEXT"
                  class="col-12 d-flex flex-column gap-1 min-w-0"
                >
                  <div
                    class="my-rag-unit-type-text-scroll rounded-2 my-border-muted px-3 py-2 my-bgcolor-gray-4 min-w-0"
                    role="region"
                    aria-label="單元逐字稿"
                  >
                    <div
                      v-if="activeUnitTranscriptionMdHtml"
                      class="my-markdown-rendered my-font-md-400 my-color-black text-break"
                      v-html="activeUnitTranscriptionMdHtml"
                    />
                    <span
                      v-else
                      class="my-font-md-400 my-color-black"
                    >—</span>
                  </div>
                </div>
                <div
                  v-if="canSeeRagUnitSourceFilename && activeUnitTabItem?.unitType === UNIT_TYPE_MP3 && activeUnitMp3PlayerProps"
                  class="col-12 min-w-0"
                >
                  <RagTabUnitMp3Player
                    :rag-tab-id="activeUnitMp3PlayerProps.ragTabId"
                    :rag-unit-id="activeUnitMp3PlayerProps.ragUnitId"
                  />
                </div>
                <div
                  v-if="canSeeRagUnitSourceFilename && activeUnitTabItem?.unitType === UNIT_TYPE_MP3"
                  class="col-12 d-flex justify-content-center w-100 min-w-0 pt-1"
                >
                  <button
                    type="button"
                    class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border flex-shrink-0 px-3 py-1"
                    @click="openRagUnitTranscriptModal"
                  >
                    逐字稿
                  </button>
                </div>
                <div
                  v-if="canSeeRagUnitSourceFilename && activeUnitTabItem?.unitType === UNIT_TYPE_YOUTUBE"
                  class="col-12 d-flex flex-column gap-2 min-w-0"
                >
                  <div
                    v-if="activeUnitYoutubeEmbedUrl"
                    class="ratio ratio-16x9 w-100 rounded-2 overflow-hidden my-border-muted"
                  >
                    <iframe
                      class="border-0"
                      title="YouTube 影片"
                      :src="activeUnitYoutubeEmbedUrl"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerpolicy="strict-origin-when-cross-origin"
                      allowfullscreen
                    />
                  </div>
                  <span
                    v-if="!activeUnitYoutubeEmbedUrl && activeUnitTabItem?.youtubeUrl"
                    class="my-font-md-400 my-color-black text-break"
                  >{{ activeUnitTabItem.youtubeUrl }}</span>
                  <span
                    v-else-if="!activeUnitYoutubeEmbedUrl"
                    class="my-font-md-400 my-color-black text-break"
                  >—</span>
                  <div class="d-flex justify-content-center w-100 pt-1">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border flex-shrink-0 px-3 py-1"
                      @click="openRagUnitTranscriptModal"
                    >
                      逐字稿
                    </button>
                  </div>
                </div>
                <div
                  v-if="canSeeRagUnitSourceFilename && activeUnitTabItem?.unitType === UNIT_TYPE_RAG"
                  class="col-12 d-flex flex-column gap-1 min-w-0"
                >
                  <span class="my-font-sm-400 my-color-gray-1">來源檔案</span>
                  <span class="my-font-md-400 my-color-black text-break">{{ activeUnitTabItem?.filename || '—' }}</span>
                </div>
              </div>
            </div>
            <template v-if="hasUnitSubTabs">
              <div
                v-if="!activeUnitQuizCards.length"
                class="w-100 d-flex justify-content-center align-items-center px-3 py-5 min-w-0"
              >
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
                  title="新增題型"
                  aria-label="新增題型"
                  :aria-busy="getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                  :disabled="
                    getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading
                    || renameUnitQuizSaving
                    || deleteUnitQuizLoading
                  "
                  @click="createBlankUnitQuiz(activeUnitSlotIndex)"
                >
                  <i class="fa-solid fa-plus" aria-hidden="true" />
                  新增題型
                </button>
              </div>
              <div
                v-else
                class="w-100 my-rag-tabs-bar my-bgcolor-gray-4"
              >
                <div class="d-flex justify-content-center align-items-center w-100">
                  <ul class="nav nav-tabs w-100" role="tablist">
                    <li
                      v-for="(qRow, qi) in activeUnitQuizCards"
                      :key="String(qRow.rag_quiz_id ?? qRow.id ?? qi)"
                      class="nav-item"
                    >
                      <div
                        role="tab"
                        class="nav-link d-flex align-items-center gap-1"
                        :class="{ active: activeUnitQuizTypeIdxResolved === qi }"
                        :aria-selected="activeUnitQuizTypeIdxResolved === qi"
                        :tabindex="activeUnitQuizTypeIdxResolved === qi ? 0 : -1"
                      >
                        <span
                          class="flex-grow-1 text-start pe-2 min-w-0 text-truncate"
                          style="cursor: pointer"
                          :title="quizTypeTabLabel(qRow)"
                          @click="currentState.activeUnitQuizTypeIndex = qi"
                        >{{ quizTypeTabLabel(qRow) }}</span>
                        <button
                          v-if="activeUnitQuizTypeIdxResolved === qi && positiveRagQuizIdFromQuizRow(qRow) != null"
                          type="button"
                          class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4 pe-2"
                          title="重新命名題型"
                          :disabled="
                            getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading
                            || renameUnitQuizSaving
                            || deleteUnitQuizLoading
                            || deleteRagLoading
                            || renameRagTabSaving
                          "
                          @click.stop="openRenameUnitQuizTab(qi)"
                        >
                          <i class="fa-solid fa-pen" aria-hidden="true" />
                        </button>
                        <!-- 綠點／× 同槽；測驗用時綠點固定顯示，不依是否選中該題型列 -->
                        <span
                          v-if="
                            isRagQuizMarkedForExam(qRow)
                            || (
                              activeUnitQuizTypeIdxResolved === qi
                              && positiveRagQuizIdFromQuizRow(qRow) != null
                            )
                          "
                          class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn"
                        >
                          <span
                            v-if="isRagQuizMarkedForExam(qRow)"
                            class="d-inline-flex justify-content-center align-items-center"
                            title="測驗用題型"
                            role="img"
                            aria-label="測驗用題型"
                          >
                            <span
                              class="rounded-circle d-inline-block my-bgcolor-green"
                              style="width: 0.5rem; height: 0.5rem"
                            />
                          </span>
                          <button
                            v-else
                            type="button"
                            class="btn btn-link text-decoration-none my-color-gray-4 p-0 border-0 lh-1 align-middle"
                            title="刪除此題型"
                            :disabled="
                              getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading
                              || renameUnitQuizSaving
                              || deleteUnitQuizLoading
                              || deleteRagLoading
                              || renameRagTabSaving
                            "
                            @click.stop="onDeleteUnitQuizTab(qi)"
                          >
                            <i class="fa-solid fa-xmark" aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                    </li>
                    <li class="nav-item d-flex align-items-center ms-2">
                      <button
                        type="button"
                        title="新增題庫"
                        aria-label="新增題庫"
                        :aria-busy="getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                        class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle mb-2"
                        :disabled="
                          getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading
                          || renameUnitQuizSaving
                          || deleteUnitQuizLoading
                        "
                        @click="createBlankUnitQuiz(activeUnitSlotIndex)"
                      >
                        <i class="fa-solid fa-plus" aria-hidden="true" />
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
              <div
                v-if="getSlotFormState(activeUnitSlotIndex).unitQuizCreateError"
                class="d-flex justify-content-center pt-2 mb-0 w-100 px-1"
              >
                <div
                  class="my-alert-danger-soft my-font-sm-400 py-2 mb-0 text-break w-100"
                  style="max-width: 42rem"
                  role="alert"
                >
                  {{ getSlotFormState(activeUnitSlotIndex).unitQuizCreateError }}
                </div>
              </div>
              <div
                v-if="activeUnitQuizCard"
                class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 text-start d-flex flex-column gap-3"
              >
                <div class="d-flex flex-column gap-0 min-w-0">
                  <label
                    class="form-label my-color-gray-1 my-font-sm-400 mb-0 d-block"
                    :for="
                      isRagQuizMarkedForExam(activeUnitQuizCard)
                        ? undefined
                        : `rag-unit-quiz-prompt-${activeUnitSlotIndex}-${activeUnitQuizTypeIdxResolved}`
                    "
                  >
                    出題規則
                  </label>
                  <div class="my-rag-unit-quiz-prompt-editor min-w-0">
                    <EnglishExamMarkdownEditor
                      v-if="!isRagQuizMarkedForExam(activeUnitQuizCard)"
                      v-model="activeUnitQuizCard.quizUserPromptText"
                      :preview-only="false"
                      :textarea-id="`rag-unit-quiz-prompt-${activeUnitSlotIndex}-${activeUnitQuizTypeIdxResolved}`"
                      :disabled="!!getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                    />
                    <EnglishExamMarkdownEditor
                      v-else
                      :model-value="String(activeUnitQuizCard.quizUserPromptText ?? '')"
                      preview-only
                      preview-design-dark
                      :textarea-id="`rag-unit-quiz-prompt-ro-${activeUnitSlotIndex}-${activeUnitQuizTypeIdxResolved}`"
                    />
                  </div>
                </div>
                <div
                  class="d-flex justify-content-center align-items-center flex-wrap gap-3"
                >
                  <button
                    v-if="!isRagQuizMarkedForExam(activeUnitQuizCard)"
                    type="button"
                    class="btn rounded-pill d-inline-flex justify-content-center align-items-center my-font-md-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-2"
                    title="還原為上次載入或產生後的內容"
                    aria-label="重設出題規則"
                    :disabled="
                      getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading
                      || !isQuizUserPromptDirty(activeUnitQuizCard)
                    "
                    @click="resetUnitQuizUserPrompt(activeUnitQuizCard)"
                  >
                    重設
                  </button>
                  <button
                    type="button"
                    class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                    :disabled="
                      getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading ||
                      !canEnableUnitQuizGenerate(activeUnitQuizCard, activeUnitSlotIndex)
                    "
                    :aria-busy="getSlotFormState(activeUnitSlotIndex).unitQuizCreateLoading"
                    @click="submitUnitQuizLlmGenerate(activeUnitSlotIndex, activeUnitQuizCard)"
                  >
                    儲存並產生題目
                  </button>
                </div>
                <QuizCard
                  v-if="String(activeUnitQuizCard.quiz ?? '').trim().length > 0"
                  :card="activeUnitQuizCard"
                  :slot-index="activeUnitQuizTypeIdxResolved + 1"
                  :current-rag-id="currentRagIdForQuizCards"
                  design-embedded
                  hide-slot-index
                  :grade-submitting="
                    gradingSubmittingCardId != null &&
                    String(gradingSubmittingCardId) === String(activeUnitQuizCard.id)
                  "
                  design-ui
                  show-rag-quiz-for-exam-action
                  hide-rag-quiz-for-exam-toolbar
                  @toggle-hint="toggleHint"
                  @confirm-answer="confirmAnswer"
                  @update:quiz_answer="(val) => { activeUnitQuizCard.quiz_answer = val }"
                  @update:grading_prompt="(val) => { activeUnitQuizCard.gradingPrompt = val }"
                  @reset-grading-prompt="resetUnitQuizGradingPrompt(activeUnitQuizCard)"
                />
                <div class="d-flex flex-column align-items-center gap-2 w-100 min-w-0 pt-1">
                  <button
                    type="button"
                    :class="
                      isRagQuizMarkedForExam(activeUnitQuizCard)
                        ? 'btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-btn-outline-green-hollow px-3 py-2'
                        : 'btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-green px-3 py-2'
                    "
                    :disabled="isRagQuizForExamToolbarButtonDisabled(activeUnitQuizCard)"
                    :aria-busy="activeUnitQuizCard.ragQuizForExamLoading"
                    @click="onMarkRagQuizForExam(activeUnitQuizCard)"
                  >
                    {{ isRagQuizMarkedForExam(activeUnitQuizCard) ? '取消設為測驗用' : '設為測驗用' }}
                  </button>
                  <div
                    v-if="String(activeUnitQuizCard.ragQuizForExamError ?? '').trim()"
                    class="my-alert-danger-soft my-font-sm-400 py-2 mb-0 w-100 text-break text-center"
                    style="max-width: 42rem"
                    role="alert"
                  >
                    {{ activeUnitQuizCard.ragQuizForExamError }}
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="!hasUnitSubTabs">
              <div
                class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 d-flex flex-column gap-3"
              >
                <div class="my-font-lg-600 my-color-black mb-0">
                  {{ activeUnitTabItem ? activeUnitTabItem.label : '出題' }}
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
                      aria-label="儲存並產生題目"
                      @click="generateQuiz(activeUnitSlotIndex)"
                    >
                      儲存並產生題目
                    </button>
                  </div>
                  <div v-if="getSlotFormState(activeUnitSlotIndex).error" class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0">
                    {{ getSlotFormState(activeUnitSlotIndex).error }}
                  </div>
                </div>
              </div>
            </template>

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
.my-pack-drop-target.my-pack-drop-active {
  background-color: var(--my-drop-pack-active-bg) !important;
  border-color: var(--my-color-blue) !important;
}
/* 設定單元「拖入此處」等：沿用上一則淺藍反白，勿另用藍+黑混色（會整塊過深） */
/* 與英文測驗題庫「文字內容」同源 EasyMDE；略拉高編輯區高度對齊舊題說明文塊約 400px */
.my-rag-unit-quiz-prompt-editor :deep(.english-exam-md-editor-root) {
  --english-md-preview-max-h: min(60vh, 28rem);
}
.my-rag-unit-quiz-prompt-editor :deep(.english-exam-md-editor-wrap .CodeMirror-scroll) {
  min-height: 400px;
}
.my-pack-unit-md-editor :deep(.english-exam-md-editor-root) {
  --english-md-preview-max-h: min(50vh, 22rem);
}
.my-pack-unit-md-editor :deep(.english-exam-md-editor-wrap .CodeMirror-scroll) {
  min-height: 200px;
}
</style>
