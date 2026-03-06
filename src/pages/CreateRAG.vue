<script setup>
/**
 * 建立 RAG 頁面。
 * 資料對應：一個 RAG 頁面（一個 tab）= 後端 public."Rag" 表的一筆（主鍵 rag_id + rag_tab_id）。
 * 列表 GET /rag/rags；建立 tab（按 +）POST /rag/create-rag（rag_tab_id、person_id、rag_name 必填）；上傳 ZIP POST /rag/upload-zip（Form: file、rag_tab_id、person_id，可選 llm_api_key）；build-rag-zip 傳入 system_prompt_instruction 等，會更新同筆的 rag_list、rag_metadata、chunk_size、chunk_overlap。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_GENERATE_QUIZ, API_RESPONSE_QUIZ_CONTENT, API_RESPONSE_QUIZ_LEGACY, API_RAG_FOR_EXAM, API_CREATE_RAG, API_UPLOAD_ZIP, API_BUILD_RAG_ZIP } from '../constants/api.js';
import { parseFetchError } from '../utils/apiError.js';
import { formatGradingResult } from '../utils/grading.js';
import { submitGrade, rewriteAnswer } from '../composables/useQuizGrading.js';
import { generateTabId, deriveRagNameFromTabId, deriveRagName, parsePackTasksList, DEFAULT_SYSTEM_INSTRUCTION, QUIZ_LEVEL_LABELS } from '../utils/rag.js';
import { useRagList } from '../composables/useRagList.js';
import { useRagTabState } from '../composables/useRagTabState.js';
import { usePackTasks } from '../composables/usePackTasks.js';
import QuizCard from '../components/QuizCard.vue';
import RagTabsBar from '../components/RagTabsBar.vue';

defineProps({
  tabId: { type: String, required: true },
});

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

const authStore = useAuthStore();
const userLlmApiKey = computed(() => (authStore.user?.llm_api_key ?? '').trim());

const { ragList, ragListLoading, ragListError, fetchRagList } = useRagList();
const createRagLoading = ref(false);
const createRagError = ref('');
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);

const { getTabState, currentState, isNewTabId } = useRagTabState(activeTabId, newTabIds, ragList, authStore, { defaultSystemInstruction: DEFAULT_SYSTEM_INSTRUCTION });

/** 當前 RAG（來自 /rag/rags）是否有 rag_list 或 rag_metadata；有則壓縮資料夾 (Pack) 與 RAG 不 disable */
const hasRagListOrMetadata = computed(() => {
  const r = currentRagItem.value;
  if (!r || typeof r !== 'object') return false;
  const hasList = r.rag_list != null && String(r.rag_list).trim() !== '';
  const hasMeta = r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
  return hasList || hasMeta;
});

/** 未設定帳號 llm_api_key（登入回傳）或當前 tab 未上傳 ZIP 時，Pack、RAG 產生題目、產生題目按鈕皆 disable；若有 rag_list 或 rag_metadata 則不 disable */
const packAndGenerateDisabled = computed(() => {
  if (hasRagListOrMetadata.value) return false;
  if (!userLlmApiKey.value) return true;
  const id = activeTabId.value;
  if (!id) return true;
  if (isNewTabId(id)) {
    const tid = String(currentState.value.zipTabId ?? '').trim();
    return tid === '';
  }
  return false;
});

/** 當前 RAG 是否有 rag_metadata；有則 RAG 產生題目區塊 enable */
const hasRagMetadata = computed(() => {
  const r = currentRagItem.value;
  if (!r || typeof r !== 'object') return false;
  return r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
});

/** 未執行 Pack 時，RAG 產生題目區塊與產生題目按鈕 disable（需有 packResponseJson）；若有 rag_metadata 則 enable */
const ragGenerateDisabled = computed(() => {
  if (hasRagMetadata.value) return false;
  return packAndGenerateDisabled.value || currentState.value.packResponseJson == null;
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
  const withId = out.filter((o) => o && (o.rag_tab_id != null || o.rag_tab_id != null));
  if (withId.length) {
    return withId.map((o) => ({
      rag_tab_id: String(o.rag_tab_id ?? o.rag_tab_id),
      filename: o.filename || o.rag_filename || 'RAG',
      rag_name: deriveRagName(o),
    }));
  }
  if (singleTabId && out.length) {
    return out.map((o) => ({
      rag_tab_id: String(singleTabId),
      filename: o.filename || o.rag_filename || 'RAG',
      rag_name: deriveRagName(o),
    }));
  }
  // fallback：Pack 尚未執行，從 /rags 的 rag_list 推導
  return generateQuizUnitsFromRag.value;
});

/** 難度、chunk 參數（共用） */
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

/** 當前 tab 的 rag_id、rag_tab_id（供 llm_api_key 上方顯示；未上傳則為「未上傳」） */
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

const {
  secondFoldersFull,
  ragListDisplayGroups,
  onDragStartTag,
  onDragOver,
  onDragLeave,
  onDropRagList,
  removeFromRagList,
  removeRagListGroup,
  addRagListGroup,
  addAllSecondFoldersAsGroups,
} = usePackTasks(currentState, fileMetadataToShow, packAndGenerateDisabled);

/** Tab 列用：rag 項目含 _tabId、_label */
const ragItems = computed(() =>
  ragList.value.map((r) => ({
    ...r,
    _tabId: r.rag_tab_id ?? r.id ?? r,
    _label: getRagTabLabel(r),
  }))
);
/** Tab 列用：新增 tab 項目含 id、label */
const newTabItems = computed(() =>
  newTabIds.value.map((tid) => ({
    id: tid,
    label: deriveRagNameFromTabId(getTabState(tid).tabId) || 'RAG',
  }))
);

/** 從 /rag/rags 的 rag_metadata.outputs 或 rag_list 字串推導 generateQuizUnits（新格式優先用 outputs） */
const generateQuizUnitsFromRag = computed(() => {
  const rag = currentRagItem.value;
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

/** 當切換到既有 tab 時，從同一筆 Rag 資料填入（對應 GET /rag/rags 新格式：file_metadata、rag_metadata.outputs、頂層 course_name、quizzes + 頂層 answers）。 */
watch(currentRagItem, (rag) => {
  if (!rag || typeof rag !== 'object') return;
  const state = currentState.value;
  if (rag.rag_list != null && String(rag.rag_list).trim() !== '') {
    state.packTasks = String(rag.rag_list).trim();
    state.packTasksList = parsePackTasksList(state.packTasks);
  }
  if (rag.rag_metadata != null) {
    state.ragMetadata = typeof rag.rag_metadata === 'string' ? rag.rag_metadata : JSON.stringify(rag.rag_metadata, null, 2);
  }
  if (rag.chunk_size != null) chunkSize.value = Number(rag.chunk_size);
  if (rag.chunk_overlap != null) chunkOverlap.value = Number(rag.chunk_overlap);
  const filename = rag.file_metadata?.filename ?? rag.filename;
  if (filename != null && String(filename).trim() !== '') state.zipFileName = String(filename).trim();
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    state.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
  // 從 /rag/rags 回傳的 quizzes 與頂層 answers 合併後寫入題目卡片（新格式：answers 在 RAG 頂層；依 quiz_id 對應，若無則依索引對應，因後端可能回傳 quiz_id: 0）
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
    const firstRagName = (parsePackTasksList(rag.rag_list)[0]?.[0] ?? rag.rag_metadata?.outputs?.[0]?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromRagQuiz(q, q.rag_name ?? firstRagName));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}, { immediate: true });

/** 由 /rag/rags 的 quiz（含 answers）組成一張題目卡片，供題目與作答區塊顯示；批改結果從 answer 的 answer_metadata / answer_feedback_metadata 格式化 */
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

/** 選擇單元預設一定要第一筆 */
watch(generateQuizUnits, (units) => {
  const state = currentState.value;
  if (units.length === 0) return;
  const firstTabId = units[0].rag_tab_id;
  const currentInList = units.some((u) => u.rag_tab_id === state.generateQuizTabId);
  if (!state.generateQuizTabId || !currentInList) {
    state.generateQuizTabId = firstTabId;
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

/** 畫面一打開就抓 GET /rag/rags，每一筆 RAG 一個 tab；並清空檔案選擇讓上傳欄位一開始是空的 */
onMounted(() => {
  fetchRagList();
  clearZipFileInput();
});

/** 設為試題用 RAG：PATCH /rag/for-exam/{rag_tab_id}（Set Rag For Exam），Header X-Person-Id */
async function setRagForExam() {
  const rag = currentRagItem.value;
  if (!rag || isNewTabId(activeTabId.value)) return;
  const fileId = rag.rag_tab_id ?? rag.id ?? rag;
  if (fileId == null || fileId === '') return;
  const personId = authStore.user?.person_id;
  if (personId == null) {
    alert('請先登入');
    return;
  }
  const state = getTabState(activeTabId.value);
  state.forExamLoading = true;
  state.forExamError = '';
  try {
    const res = await fetch(`${API_BASE}${API_RAG_FOR_EXAM}/${encodeURIComponent(String(fileId))}`, {
      method: 'PATCH',
      headers: { 'X-Person-Id': String(personId) },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseFetchError(res, text));
    }
    await fetchRagList();
  } catch (err) {
    state.forExamError = err.message || String(err);
  } finally {
    state.forExamLoading = false;
  }
}

/** 刪除 RAG：呼叫 POST /rag/delete/{rag_tab_id}（軟刪 + 刪資料夾），成功後重抓 /rag/rags。Header 必帶 X-Person-Id。 */
async function deleteRag(rag, e) {
  if (e) e.stopPropagation();
  const fileId = rag?.rag_tab_id ?? rag?.id ?? rag;
  if (fileId == null || fileId === '') return;
  const personId = authStore.user?.person_id;
  if (personId == null) {
    alert('請先登入');
    return;
  }
  if (!confirm(`確定要刪除「${getRagTabLabel(rag)}」嗎？`)) return;
  try {
    const res = await fetch(`${API_BASE}/rag/delete/${encodeURIComponent(String(fileId))}`, {
      method: 'POST',
      headers: { 'X-Person-Id': String(personId) },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseFetchError(res, text));
    }
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
  }
}

/** create-rag 回傳的 created_at 與 tab 標籤用 name（key = rag_id） */
const ragCreatedAtMap = ref({});

/** 點「新增」：POST /rag/create-rag 建立一筆 RAG（rag_tab_id、person_id、rag_name 必填），成功後重整列表並切到新 tab。rag_name 預設為 rag_tab_id 底線後的時間。 */
async function addNewTab() {
  const personId = authStore.user?.person_id;
  if (personId == null || String(personId).trim() === '') {
    createRagError.value = '請先登入以取得 person_id';
    return;
  }
  createRagError.value = '';
  createRagLoading.value = true;
  const ragTabId = generateTabId(personId);
  const ragName = deriveRagNameFromTabId(ragTabId) || ragTabId;
  try {
    const res = await fetch(`${API_BASE}${API_CREATE_RAG}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rag_tab_id: ragTabId,
        person_id: String(personId),
        rag_name: ragName,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(parseFetchError(res, text));
    const data = text ? JSON.parse(text) : {};
    if (data?.rag_id != null && data?.created_at != null) {
      ragCreatedAtMap.value = { ...ragCreatedAtMap.value, [String(data.rag_id)]: data.created_at };
    }
    ragListError.value = '';
    await fetchRagList();
    if (data?.rag_tab_id != null) {
      activeTabId.value = String(data.rag_tab_id);
    }
    clearZipFileInput();
    if (ragList.value.length === 0) showFormWhenNoData.value = true;
  } catch (err) {
    createRagError.value = err.message || '建立 RAG 失敗';
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

function onZipChange(e) {
  const state = currentState.value;
  const file = e.target.files?.[0];
  if (file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      state.uploadedZipFile = null;
      state.zipFileName = '';
      state.zipSecondFolders = [];
      state.zipResponseJson = null;
      state.zipTabId = isNewTabId(activeTabId.value) ? '' : activeTabId.value;
      state.zipError = '請選擇 .zip 檔案';
      return;
    }
    state.uploadedZipFile = file;
    state.zipFileName = file.name;
    state.zipSecondFolders = [];
    state.zipResponseJson = null;
    state.zipError = '';
  } else {
    state.uploadedZipFile = null;
    state.zipFileName = '';
    state.zipSecondFolders = [];
    state.zipResponseJson = null;
    state.zipTabId = isNewTabId(activeTabId.value) ? '' : activeTabId.value;
    state.zipError = '';
  }
}

/** 按下確定：POST /rag/upload-zip 僅上傳（需先以 create-rag 建立該 rag_tab_id）。Form: file、rag_tab_id、person_id（必填），可選 llm_api_key。回傳 file_metadata。 */
async function confirmUploadZip() {
  const state = currentState.value;
  if (!state.uploadedZipFile) {
    state.zipError = '請先選擇 ZIP 檔案';
    return;
  }
  const tabId = activeTabId.value;
  if (isNewTabId(tabId) || !tabId) {
    state.zipError = '請先按 + 建立 RAG（此 tab 需先建立後端資料）';
    return;
  }
  const personId = authStore.user?.person_id;
  if (personId == null || String(personId).trim() === '') {
    state.zipError = '請先登入以取得 person_id';
    return;
  }
  state.zipLoading = true;
  state.zipError = '';
  state.zipSecondFolders = [];
  state.zipResponseJson = null;
  try {
    const formData = new FormData();
    formData.append('file', state.uploadedZipFile);
    formData.append('rag_tab_id', String(tabId));
    formData.append('person_id', String(personId));
    const llmKey = userLlmApiKey.value;
    if (llmKey) formData.append('llm_api_key', llmKey);
    const res = await fetch(`${API_BASE}${API_UPLOAD_ZIP}`, {
      method: 'POST',
      body: formData,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${parseFetchError(res, text)}`);
    const data = text ? JSON.parse(text) : {};
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
    const is504 = err.message?.includes('504') || (err.name === 'TypeError' && err.message?.includes('Failed to fetch'));
    state.zipError = is504
      ? '後端正在啟動中（約需 1 分鐘），請稍後再試一次'
      : err.message || '上傳失敗';
    state.zipSecondFolders = [];
    state.zipResponseJson = null;
  } finally {
    state.zipLoading = false;
  }
}

/** 呼叫 /rag/build-rag-zip；body: rag_tab_id, person_id, rag_list, llm_api_key, chunk_size, chunk_overlap, system_prompt_instruction */
async function confirmPack() {
  const state = currentState.value;
  const fileId = String(state.zipTabId ?? '').trim();
  const ragList = state.packTasks?.trim();
  const personId = authStore.user?.person_id;
  const apiKey = userLlmApiKey.value;
  if (!fileId) {
    state.packError = '請先上傳 ZIP 取得 rag_tab_id（見上方 file_metadata）';
    return;
  }
  if (personId == null || String(personId).trim() === '') {
    state.packError = '請先登入以取得 person_id';
    return;
  }
  if (!ragList) {
    state.packError = '請輸入 rag_list（例：220222+220301 或 220222,220301+220302）';
    return;
  }
  if (!apiKey) {
    state.packError = '請確認帳號已設定 llm_api_key（登入後由後端回傳）';
    return;
  }
  state.packLoading = true;
  state.packError = '';
  state.packResponseJson = null;
  try {
    const res = await fetch(`${API_BASE}${API_BUILD_RAG_ZIP}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rag_tab_id: fileId,
        person_id: String(personId),
        rag_list: ragList,
        llm_api_key: apiKey,
        chunk_size: Number(chunkSize.value) || 1000,
        chunk_overlap: Number(chunkOverlap.value) || 200,
        system_prompt_instruction: (state.systemInstruction ?? '').trim() || '',
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(parseFetchError(res, text));
    try {
      state.packResponseJson = text ? JSON.parse(text) : null;
    } catch (_) {
      state.packResponseJson = text;
    }
    state.ragMetadata = typeof state.packResponseJson === 'string' ? state.packResponseJson : JSON.stringify(state.packResponseJson, null, 2);
    // 重新載入列表（build-rag-zip 後端已會更新 Rag 表的 rag_list、rag_metadata、chunk_size、chunk_overlap）
    await fetchRagList();
  } catch (err) {
    state.packError = err.message || '壓縮失敗';
    state.packResponseJson = null;
  } finally {
    state.packLoading = false;
  }
}

/** 難度選項：基礎=0、進階=1（與 API quiz_level 一致） */
const difficultyOptions = ['基礎', '進階'];

/** 取得第 slotIndex 題的產生題目表單狀態（獨立、不連動） */
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
    answer: '',
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

/** 呼叫 /rag/generate-quiz；body: llm_api_key, rag_id, rag_tab_id, quiz_level（皆 number，rag_tab_id 無法解析時送 0） */
async function generateQuiz(slotIndex) {
  const state = currentState.value;
  const slotState = getSlotFormState(slotIndex);
  const sourceTabId = String(state.zipTabId ?? '').trim();
  const selectedUnit = generateQuizUnits.value.find((u) => u.rag_tab_id === slotState.generateQuizTabId);
  const ragName = selectedUnit?.rag_name?.trim();
  const rag = currentRagItem.value;
  const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  if (!sourceTabId) {
    slotState.error = '請先上傳 ZIP 取得 rag_tab_id';
    return;
  }
  if (ragId == null) {
    slotState.error = '無法取得 rag_id（請先上傳 ZIP 或確認已載入 RAG）';
    return;
  }
  if (!ragName) {
    slotState.error = '請先選擇單元（需先執行 Pack 取得 RAG 壓縮檔）';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  const difficultyOpts = ['基礎', '進階'];
  const quizLevel = difficultyOpts.indexOf(filterDifficulty.value);
  try {
    const llmApiKey = userLlmApiKey.value;
    const res = await fetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: llmApiKey,
        rag_id: Number(ragId) || 0,
        rag_tab_id: Number(sourceTabId) || 0,
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
    const targetFilename = data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? '';
    const referenceAnswerText = data.reference_answer ?? data.answer ?? '';
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

/** 評分：POST /rag/quiz-grade；body: llm_api_key, rag_id, rag_tab_id, rag_quiz_id, quiz_content, answer（皆 string）；回傳 202 + job_id；輪詢 GET /rag/quiz-grade-result/{job_id}，ready 時 result 含 answer_id。 */
async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  const state = currentState.value;
  const sourceTabId = String(state.zipTabId ?? '').trim();
  const rag = currentRagItem.value;
  const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  if (!sourceTabId) {
    item.confirmed = true;
    item.gradingResult = '評分需要 rag_tab_id：請先在「上傳 ZIP 檔」區塊上傳 RAG/講義 ZIP 取得 rag_tab_id 後再進行評分。';
    return;
  }
  if (ragId == null) {
    item.confirmed = true;
    item.gradingResult = '評分失敗：無法取得 rag_id，請先上傳 ZIP 或確認已載入 RAG。';
    return;
  }
  await submitGrade(item, { sourceTabId, ragId, llmApiKey: userLlmApiKey.value });
}

</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100">
    <RagTabsBar
      :rag-items="ragItems"
      :new-tab-items="newTabItems"
      :active-tab-id="activeTabId"
      :rag-list-loading="ragListLoading"
      :create-rag-loading="createRagLoading"
      :rag-list-error="ragListError"
      :create-rag-error="createRagError"
      @update:active-tab-id="activeTabId = $event"
      @add-new-tab="addNewTab"
    />

    <!-- 內容區：可上下捲動 -->
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <!-- 無資料時不顯示表單，點「+」後才顯示；有資料時顯示對應 tab 表單 -->
      <template v-if="ragList.length > 0 || showFormWhenNoData">
      <!-- 基本資訊、llm_api_key、ZIP 上傳與 file_metadata 合併為一區塊 -->
      <div class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span>基本資訊、API 與 ZIP 上傳</span>
          <div v-if="!isNewTabId(activeTabId) && currentRagItem && (currentRagItem.rag_tab_id ?? currentRagItem.id)" class="d-flex align-items-center gap-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              @click="deleteRag(currentRagItem, $event)"
            >
              刪除
            </button>
            <button
              type="button"
              class="btn btn-sm btn-success"
              :disabled="currentState.forExamLoading || currentRagItem?.for_exam === true || !hasRagMetadata"
              @click="setRagForExam"
            >
              {{ currentState.forExamLoading ? '設定中...' : '設為試題用 RAG' }}
            </button>
          </div>
        </div>
        <div v-if="currentState.forExamError" class="alert alert-danger py-2 small mb-2">
          {{ currentState.forExamError }}
        </div>
        <div class="small mb-2">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="form-label small text-secondary fw-medium mb-0" style="min-width: 10rem;">rag_id：</span>
            <span class="small">{{ currentRagIdAndTabId.rag_id }}</span>
          </div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="form-label small text-secondary fw-medium mb-0" style="min-width: 10rem;">rag_tab_id：</span>
            <span class="small">{{ currentRagIdAndTabId.rag_tab_id }}</span>
          </div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="form-label small text-secondary fw-medium mb-0" style="min-width: 10rem;">llm_api_key：</span>
            <span class="small"><code>{{ userLlmApiKey || '未設定' }}</code></span>
          </div>
        </div>
        <div v-if="activeTabId" class="mb-3">
          <div class="form-label small text-secondary fw-medium mb-2">上傳 ZIP 檔</div>
          <p class="form-text small text-secondary mb-2">支援 .pdf、.docx、.rmd／.r、.html／.htm</p>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <input
              ref="zipFileInputRef"
              type="file"
              accept=".zip"
              class="form-control form-control-sm"
              style="max-width: 240px;"
              :disabled="hasUploadedFileMetadata"
              @change="onZipChange"
            >
            <span v-if="currentState.zipFileName" class="small">{{ currentState.zipFileName }}</span>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="hasUploadedFileMetadata || currentState.zipLoading"
              @click="confirmUploadZip"
            >
              {{ currentState.zipLoading ? '上傳中...' : '確定' }}
            </button>
          </div>
        </div>
        <div v-if="currentState.zipError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ currentState.zipError }}
        </div>
      </div>
      <!-- 壓縮資料夾 (Pack) 與 RAG：要有 file_metadata 才顯示；未設定帳號 llm_api_key 或未上傳 ZIP 時 disable -->
      <div v-if="fileMetadataToShow != null" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': packAndGenerateDisabled }">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">壓縮資料夾 (Pack) 與 RAG</div>

          <!-- second_folders 標籤區：可拖曳至 rag_list；完整顯示不因拖入 rag_list 而移除 -->
          <div v-if="secondFoldersFull.length" class="mb-3">
            <label class="form-label small text-secondary fw-medium mb-1">課程</label>
            <div class="d-flex flex-wrap gap-2 p-2 rounded border bg-body">
              <span
                v-for="(name, i) in secondFoldersFull"
                :key="'sf-' + i"
                class="badge bg-info text-dark px-2 py-1 user-select-none"
                style="cursor: grab;"
                draggable="true"
                @dragstart="onDragStartTag($event, name, false, -1, -1)"
              >
                {{ name }}
              </span>
            </div>
          </div>

          <!-- rag_list 虛擬資料夾區：可放置 second_folders 標籤 -->
          <div class="mb-2">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <label class="form-label small text-secondary fw-medium mb-0">資料夾</label>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="!secondFoldersFull.length"
                @click="addAllSecondFoldersAsGroups"
              >
                每個 second_folder 各一虛擬資料夾
              </button>
            </div>
            <div class="d-flex flex-wrap align-items-start gap-2">
              <template v-for="(group, gi) in ragListDisplayGroups" :key="'rg-' + gi">
                <div
                  class="border rounded p-2 d-flex align-items-center gap-1 position-relative bg-body-secondary"
                  style="min-width: 120px; min-height: 2.5rem;"
                  @dragover="onDragOver"
                  @dragleave="onDragLeave"
                  @drop="onDropRagList($event, gi)"
                >
                  <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
                    <span
                      v-for="(tag, ti) in group"
                      :key="'t-' + gi + '-' + ti"
                      class="badge bg-primary px-2 py-1 d-inline-flex align-items-center gap-1"
                      style="cursor: grab;"
                      draggable="true"
                      @dragstart="onDragStartTag($event, tag, true, gi, ti)"
                    >
                      {{ tag }}
                      <span
                        class="ms-1 opacity-75"
                        style="cursor: pointer;"
                        aria-label="移除標籤"
                        @click.stop="removeFromRagList(gi, ti)"
                      >×</span>
                    </span>
                    <span v-if="!group.length" class="text-muted small">拖入此處</span>
                  </div>
                  <button
                    v-if="(currentState.packTasksList || []).length > 0"
                    type="button"
                    class="btn btn-link btn-sm p-0 ms-1 text-muted text-decoration-none flex-shrink-0"
                    style="min-width: 1.5rem;"
                    aria-label="刪除此虛擬資料夾"
                    @click.stop="removeRagListGroup(gi)"
                  >
                    ×
                  </button>
                </div>
              </template>
              <div
                class="border border-dashed rounded p-2 d-flex align-items-center justify-content-center"
                style="min-width: 140px; min-height: 2.5rem;"
                :class="{ 'opacity-50': packAndGenerateDisabled }"
                @dragover="onDragOver($event)"
                @dragleave="onDragLeave($event)"
                @drop="onDropRagList($event, (currentState.packTasksList || []).length)"
              >
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  @click="addRagListGroup"
                >
                  + 新增虛擬資料夾
                </button>
              </div>
            </div>
          </div>

          <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
            <div style="width: 100px;">
              <label class="form-label small text-secondary fw-medium mb-1">chunk_size</label>
              <input
                v-model.number="chunkSize"
                type="number"
                min="1"
                class="form-control form-control-sm"
                placeholder="1000"
              >
            </div>
            <div style="width: 100px;">
              <label class="form-label small text-secondary fw-medium mb-1">chunk_overlap</label>
              <input
                v-model.number="chunkOverlap"
                type="number"
                min="0"
                class="form-control form-control-sm"
                placeholder="200"
              >
            </div>
          </div>
          <div class="mt-3">
            <label class="form-label small text-secondary fw-medium mb-1">出題規範</label>
            <textarea
              v-model="currentState.systemInstruction"
              class="form-control form-control-sm font-monospace small"
              rows="5"
              :placeholder="'留空則使用預設：' + DEFAULT_SYSTEM_INSTRUCTION"
              style="max-width: 100%;"
            />
          </div>
          <div class="mt-3">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="packAndGenerateDisabled"
              @click="confirmPack"
            >
              {{ currentState.packLoading ? '處理中...' : '執行 Pack' }}
            </button>
          </div>
          <div v-if="currentState.packError" class="alert alert-danger py-2 small mb-2">
            {{ currentState.packError }}
          </div>
      </div>
      <!-- RAG 產生題目與題目與作答：要有 rag_metadata 才顯示；點「新增題目」後才出現題目生成子區塊 -->
      <div v-if="currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== ''" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': ragGenerateDisabled }">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">RAG 產生題目與題目與作答</div>

        <!-- 題目區塊：每按一次「新增題目」才多一個「第 n 題」；按鈕固定在最下面 -->
        <div class="bg-light rounded mb-3">
          <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
            <!-- 第 slotIndex 題：若已有該題卡片則顯示卡片，否則顯示產生題目表單 -->
            <template v-if="currentState.cardList[slotIndex - 1]">
              <QuizCard
                :card="currentState.cardList[slotIndex - 1]"
                :slot-index="slotIndex"
                @toggle-hint="toggleHint"
                @confirm-answer="confirmAnswer"
                @rewrite-answer="rewriteAnswer"
                @update:answer="(val) => { currentState.cardList[slotIndex - 1].answer = val }"
              />
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
                      <label class="form-label small text-secondary fw-medium mb-1">選擇單元</label>
                      <select v-model="getSlotFormState(slotIndex).generateQuizTabId" class="form-select form-select-sm">
                        <option value="">— 請先執行 Pack —</option>
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
                      :disabled="getSlotFormState(slotIndex).loading || !userLlmApiKey"
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

      </template>
    </div>
  </div>
</template>
