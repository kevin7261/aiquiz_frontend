<script setup>
/**
 * 建立 RAG 頁面。
 * 資料對應：一個 RAG 頁面（一個 tab）= 後端 public."Rag" 表的一筆（主鍵 rag_id + rag_tab_id）。
 * 列表 GET /rag/rags；建立 tab（按 +）POST /rag/create-rag（rag_tab_id、person_id、rag_name 必填）；上傳 ZIP POST /rag/upload-zip（Form: file、rag_tab_id、person_id，可選 llm_api_key）；build-rag-zip 傳入 system_prompt_instruction 等，會更新同筆的 rag_list、rag_metadata、chunk_size、chunk_overlap。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_GENERATE_QUIZ, API_RESPONSE_QUIZ_CONTENT, API_RESPONSE_QUIZ_LEGACY, API_GRADE_SUBMISSION, API_GRADE_RESULT, API_RAG_APPLIED, API_CREATE_RAG, API_UPLOAD_ZIP, API_BUILD_RAG_ZIP } from '../constants/api.js';

defineProps({
  tabId: { type: String, required: true },
});

/** rag_tab_id 規則：generateTabId(person_id) → {person_id}_yymmddhhmmss；無 person_id 時 fallback 為 UUID */
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

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** 預設題目／提示（產生第一題時使用） */
const authStore = useAuthStore();

/** generate-quiz API 的 system_instruction 預設內容（由 Rag 表取得，此處僅為 UI 預設） */
const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過50字';

/** RAG 列表（GET /rag/rags）、載入中、錯誤 */
const ragList = ref([]);
const ragListLoading = ref(false);
const ragListError = ref('');
/** 建立 RAG（按 +）時的載入與錯誤 */
const createRagLoading = ref(false);
const createRagError = ref('');
/** 當前 tab：為 RAG 的 rag_tab_id 或「新增」tab 的 id（new-xxx） */
const activeTabId = ref(null);
/** 無資料時，點「新增」(+) 後才顯示建立 RAG 表單 */
const showFormWhenNoData = ref(false);
/** 每次點「新增」產生一個新 tab，存這些 tab 的 id（new-xxx） */
const newTabIds = ref([]);

/** 是否為「新增」用的 tab id（未存在於 DB） */
function isNewTabId(id) {
  return id === 'new' || (typeof id === 'string' && id.startsWith('new-'));
}

/** 每個 tab 的狀態（key = rag_tab_id 或 new-xxx） */
const tabStateMap = reactive({});

function getTabState(id) {
  if (!id) return getTabState(newTabIds.value[0] || ragList.value[0]?.rag_tab_id || 'new');
  if (!tabStateMap[id]) {
    const isNew = isNewTabId(id);
    tabStateMap[id] = reactive({
      tabId: isNew ? generateTabId(authStore.user?.person_id) : id,
      /** 每個 tab 各自儲存 API key；新增 tab 為空，既有 tab 由 watch 從 Rag 填入 */
      openaiApiKey: '',
      uploadedZipFile: null,
      zipFileName: '',
      zipSecondFolders: [],
      zipResponseJson: null,
      zipLoading: false,
      zipError: '',
      zipTabId: isNew ? '' : id,
      packTasks: '',
      /** 虛擬資料夾：[[a,b],[c]] 對應 rag_list "a+b,c" */
      packTasksList: [],
      ragMetadata: '',
      withRag: true,
      packResponseJson: null,
      packLoading: false,
      packError: '',
      generateQuizTabId: '',
      generateQuizLoading: false,
      generateQuizError: '',
      generateQuizResponseJson: null,
      cardList: [],
      /** 每一題產生題目表單獨立狀態（key = slotIndex 1,2,3...） */
      slotFormState: {},
      /** 是否已點「新增題目」而顯示題目生成子區塊 */
      showQuizGeneratorBlock: false,
      /** 已展開的題目區塊數（每按一次「新增題目」+1，每個區塊對應一題） */
      quizSlotsCount: 0,
      appliedLoading: false,
      appliedError: '',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
  }
  return tabStateMap[id];
}

/** 當前 tab 的狀態（template 與方法內使用） */
const currentState = computed(() => {
  const id = activeTabId.value;
  if (id) return getTabState(id);
  const firstNew = newTabIds.value[0];
  const firstRag = ragList.value[0];
  return getTabState(firstNew || (firstRag && (firstRag.rag_tab_id ?? firstRag.id ?? firstRag)) || 'new');
});

/** OpenAI API Key 已改為每個 tab 各自儲存於 tabStateMap[id].openaiApiKey，新增 tab 為空 */

/** 當前 RAG（來自 /rag/rags）是否有 rag_list 或 rag_metadata；有則壓縮資料夾 (Pack) 與 RAG 不 disable */
const hasRagListOrMetadata = computed(() => {
  const r = currentRagItem.value;
  if (!r || typeof r !== 'object') return false;
  const hasList = r.rag_list != null && String(r.rag_list).trim() !== '';
  const hasMeta = r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
  return hasList || hasMeta;
});

/** 未輸入 API key 或當前 tab 未上傳 ZIP 時，Pack、RAG 產生題目、產生題目按鈕皆 disable；若有 rag_list 或 rag_metadata 則不 disable */
const packAndGenerateDisabled = computed(() => {
  if (hasRagListOrMetadata.value) return false;
  if (!currentState.value.openaiApiKey?.trim()) return true;
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

/** 從 output 推得 rag_name（後端 rag_tab_id = {rag_name}_rag） */
function deriveRagName(o) {
  if (o && typeof o.rag_name === 'string' && o.rag_name) return o.rag_name;
  const id = o?.rag_tab_id ?? o?.rag_tab_id ?? '';
  const s = String(id);
  if (s.endsWith('_rag')) return s.slice(0, -4);
  const fn = o?.filename ?? o?.rag_filename ?? '';
  const f = String(fn).replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '').replace(/_rag$/, '');
  return f || s || '';
}

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

/** 當前 tab 的 rag_id、rag_tab_id（供 OpenAI API Key 上方顯示；未上傳則為「未上傳」） */
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

/** 從 file_metadata 或 RAG 頂層取得 course_name（供產生題目、評分 API 使用；新格式頂層有 course_name） */
const courseNameFromFileMetadata = computed(() => {
  const meta = fileMetadataToShow.value;
  const rag = currentRagItem.value;
  const fromMeta = meta != null && typeof meta === 'object' && meta.course_name != null ? String(meta.course_name).trim() : '';
  const fromRag = rag?.course_name != null ? String(rag.course_name).trim() : '';
  return fromMeta || fromRag || '';
});

/** 將 rag_list 字串解析為虛擬資料夾結構：'a+b,c' -> [['a','b'],['c']] */
function parsePackTasksList(str) {
  const s = String(str ?? '').trim();
  if (!s) return [];
  return s.split(',').map((part) => part.split('+').map((x) => x.trim()).filter(Boolean)).filter((g) => g.length > 0);
}

/** 將虛擬資料夾結構序列化為 rag_list 字串 */
function serializePackTasksList(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map((g) => (Array.isArray(g) ? g.filter(Boolean).join('+') : '')).filter(Boolean).join(',');
}

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
  const llmKey = rag.llm_api_key ?? rag.apikey;
  if (llmKey != null && String(llmKey).trim() !== '') {
    state.openaiApiKey = String(llmKey).trim();
  }
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

const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

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

/** packTasks 與 packTasksList 雙向同步（輸入框與拖曳 UI） */
watch(
  () => currentState.value.packTasks,
  (val) => {
    const parsed = parsePackTasksList(val);
    const current = currentState.value.packTasksList;
    if (JSON.stringify(parsed) !== JSON.stringify(current)) {
      currentState.value.packTasksList = parsed;
    }
  }
);
watch(
  () => currentState.value.packTasksList,
  (list) => {
    const serialized = serializePackTasksList(list);
    const current = currentState.value.packTasks;
    if (serialized !== current) {
      currentState.value.packTasks = serialized;
    }
  },
  { deep: true }
);

/** second_folders 完整列表（來自 file_metadata / upload），顯示用不因拖入 rag_list 而減少 */
const secondFoldersFull = computed(() => {
  const folders = fileMetadataToShow.value?.second_folders ?? currentState.value.zipSecondFolders ?? [];
  return Array.isArray(folders) ? folders : [];
});

/** 顯示用的虛擬資料夾群組：若為空且有 second_folders 可拖，則顯示一空群組供放置 */
const ragListDisplayGroups = computed(() => {
  const list = currentState.value.packTasksList ?? [];
  if (list.length > 0) return list;
  if (secondFoldersFull.value.length > 0) return [[]];
  return [];
});

/** 選擇單元（rag_name）預設一定要第一筆 */
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

/** 將 GET /rag/rags 回傳正規化為 RAG 陣列（支援 array、{ rags }、{ items }、或單一 RAG 物件） */
function normalizeRagListResponse(data) {
  if (Array.isArray(data)) return data;
  const list = data?.rags ?? data?.items;
  if (Array.isArray(list) && list.length > 0) return list;
  if (data != null && typeof data === 'object' && (data.rag_tab_id != null || data.rag_id != null)) return [data];
  return [];
}

/** 載入 RAG 列表：GET /rag/rags 列出 Rag 表全部內容，每一筆一個 tab。回傳格式：陣列或 { rags } 或單一 RAG 物件。 */
async function fetchRagList() {
  ragListLoading.value = true;
  ragListError.value = '';
  try {
    const res = await fetch(`${API_BASE}/rag/rags`, { method: 'GET' });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    ragList.value = normalizeRagListResponse(data);
  } catch (err) {
    ragListError.value = err.message || '無法載入 RAG 列表';
    ragList.value = [];
  } finally {
    ragListLoading.value = false;
  }
}

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

/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
async function setRagApplied() {
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
  state.appliedLoading = true;
  state.appliedError = '';
  try {
    const res = await fetch(`${API_BASE}${API_RAG_APPLIED}/${encodeURIComponent(String(fileId))}`, {
      method: 'PATCH',
      headers: { 'X-Person-Id': String(personId) },
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
    await fetchRagList();
  } catch (err) {
    state.appliedError = err.message || String(err);
  } finally {
    state.appliedLoading = false;
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
      let msg = res.statusText;
      try {
        const err = JSON.parse(text);
        msg = err.detail ?? err.error ?? msg;
      } catch (_) {
        if (text) msg = text;
      }
      throw new Error(msg);
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
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(msg);
    }
    const data = await res.json();
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

/** 從 rag_tab_id 取得 rag_name：預設為底線之後的部分（時間），無底線則用整段 */
function deriveRagNameFromTabId(ragTabId) {
  if (!ragTabId || typeof ragTabId !== 'string') return '';
  const idx = String(ragTabId).indexOf('_');
  return idx >= 0 ? String(ragTabId).slice(idx + 1) : String(ragTabId);
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
    const llmKey = (state.openaiApiKey ?? '').trim();
    if (llmKey) formData.append('llm_api_key', llmKey);
    const res = await fetch(`${API_BASE}${API_UPLOAD_ZIP}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(`${res.status}: ${msg}`);
    }
    const data = await res.json();
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

/** 呼叫 /rag/build-rag-zip；body: rag_tab_id, person_id, rag_list, openai_api_key, chunk_size, chunk_overlap, system_prompt_instruction */
async function confirmPack() {
  const state = currentState.value;
  const fileId = String(state.zipTabId ?? '').trim();
  const ragList = state.packTasks?.trim();
  const personId = authStore.user?.person_id;
  const apiKey = state.openaiApiKey?.trim() ?? '';
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
    state.packError = '請輸入 OpenAI API Key';
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
        openai_api_key: apiKey,
        chunk_size: Number(chunkSize.value) || 1000,
        chunk_overlap: Number(chunkOverlap.value) || 200,
        system_prompt_instruction: (state.systemInstruction ?? '').trim() || '',
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

/** 呼叫 /rag/generate-quiz；每題獨立，傳入 slotIndex 使用該題的表單狀態。API 從 Rag 表取得 OpenAI key 與 system_prompt_instruction */
async function generateQuiz(slotIndex) {
  const state = currentState.value;
  const slotState = getSlotFormState(slotIndex);
  const sourceTabId = String(state.zipTabId ?? '').trim();
  const selectedUnit = generateQuizUnits.value.find((u) => u.rag_tab_id === slotState.generateQuizTabId);
  const ragName = selectedUnit?.rag_name?.trim();
  if (!sourceTabId) {
    slotState.error = '請先上傳 ZIP 取得 rag_tab_id';
    return;
  }
  if (!ragName) {
    slotState.error = '請先選擇單元（需先執行 Pack 取得 RAG 壓縮檔）';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  const courseName = courseNameFromFileMetadata.value;
  const difficultyOpts = ['基礎', '進階'];
  const quizLevel = difficultyOpts.indexOf(filterDifficulty.value);
  try {
    const llmApiKey = (state.openaiApiKey ?? '').trim();
    const res = await fetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: llmApiKey,
        rag_tab_id: sourceTabId,
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

/** 評分：POST /rag/quiz-grade 傳 llm_api_key、rag_tab_id、rag_name、題目與學生回答等，回傳 202 + job_id；輪詢 GET /rag/quiz-grade-result/{job_id}，ready 時 result 含 answer_id。llm_api_key 由請求 body 傳入（僅能從 GET /rag/rags 或 /rag/upload-zip 取得）。 */
async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  const state = currentState.value;
  const sourceTabId = String(state.zipTabId ?? '').trim();
  if (!sourceTabId) {
    item.confirmed = true;
    item.gradingResult = '評分需要 rag_tab_id：請先在「上傳 ZIP 檔」區塊上傳 RAG/講義 ZIP 取得 rag_tab_id 後再進行評分。';
    return;
  }
  const ragName = item.ragName?.trim() ?? generateQuizUnits.value[0]?.rag_name?.trim();
  if (!ragName) {
    item.confirmed = true;
    item.gradingResult = '評分失敗：此題目未關聯 RAG 單元（rag_name），請由「產生題目」產生題目後再評分。';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  const courseName = courseNameFromFileMetadata.value ?? '';
  const llmApiKey = (state.openaiApiKey ?? '').trim();
  try {
    const res = await fetch(`${API_BASE}${API_GRADE_SUBMISSION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: llmApiKey,
        rag_tab_id: sourceTabId,
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
      const statusHint = res.status === 400 ? '（例如 Rag 表 llm_api_key 未設定）\n\n' : (res.status === 502 ? '（後端逾時或服務喚醒中，請稍後再試）\n\n' : (res.status === 500 ? '（後端 500 錯誤，請檢查伺服器日誌或 API 設定）\n\n' : ''));
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
    const friendlyUnavailable = '評分失敗：後端暫時無法連線，可能是服務喚醒中，請稍後再試或重新送出。';

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
        } catch (_) {
          // 網路錯誤時重試，由下方判斷 pollRes 為 null
        }
      }
      if (!pollRes || pollRes.status === 502 || pollRes.status === 504) {
        item.gradingResult = friendlyUnavailable;
        return;
      }
      if (pollRes.status === 404) {
        item.gradingResult = '評分任務不存在或已過期（伺服器可能曾休眠或重啟），請重新送出評分。';
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
        const isJobNotFound = errMsg.includes('job not found');
        item.gradingResult = isJobNotFound
          ? '評分任務不存在或已過期（伺服器可能曾休眠或重啟），請重新送出評分。'
          : `評分失敗：${pollData.error || '未知錯誤'}`;
        return;
      }
    }
    item.gradingResult = '評分逾時：請稍後再試或重新送出';
  } catch (err) {
    item.gradingResult = '評分失敗：後端逾時或服務喚醒中，請稍後再試。';
  }
}

/** 將評分 API 回傳的 JSON 轉成易讀文字；支援完整 answer 物件（含 student_answer、answer_metadata / answer_feedback_metadata） */
function formatGradingResult(text) {
  if (!text || typeof text !== 'string') return text;
  const t = text.trim();
  if (!t.startsWith('{')) return text;
  try {
    const raw = JSON.parse(text);
    // 完整 answer 物件時：從 answer_metadata 或 answer_feedback_metadata 取批改內容
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

/** 拖曳：設定被拖曳的資料 */
function onDragStartTag(e, folderName, fromRagList, groupIdx, tagIdx) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/json', JSON.stringify({
    folderName,
    fromRagList: !!fromRagList,
    groupIdx: fromRagList ? groupIdx : -1,
    tagIdx: fromRagList ? tagIdx : -1,
  }));
  e.dataTransfer.setData('text/plain', folderName);
}

/** 拖曳經過 drop zone */
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget?.classList?.add('bg-info-subtle', 'border-info');
}

function onDragLeave(e) {
  e.currentTarget?.classList?.remove('bg-info-subtle', 'border-info');
}

/** 放置到 rag_list 虛擬資料夾 */
function onDropRagList(e, targetGroupIdx) {
  e.preventDefault();
  e.currentTarget?.classList?.remove('bg-info-subtle', 'border-info');
  if (packAndGenerateDisabled.value) return;
  let data;
  try {
    data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
  } catch (_) {
    data = { folderName: e.dataTransfer.getData('text/plain') || '', fromRagList: false };
  }
  const folderName = (data.folderName || '').trim();
  if (!folderName) return;
  const state = currentState.value;
  let list = [...(state.packTasksList || [])];
  if (data.fromRagList && data.groupIdx >= 0) {
    const g = list[data.groupIdx];
    if (Array.isArray(g)) {
      const next = g.filter((_, i) => i !== data.tagIdx);
      list[data.groupIdx] = next.length ? next : null;
    }
  }
  if (targetGroupIdx >= list.length) {
    for (let i = list.length; i <= targetGroupIdx; i++) list.push([]);
  }
  const target = list[targetGroupIdx];
  const arr = Array.isArray(target) ? [...target] : [];
  if (!arr.includes(folderName)) arr.push(folderName);
  list[targetGroupIdx] = arr;
  list = list.filter((g) => g != null && (Array.isArray(g) ? g.length > 0 : g));
  state.packTasksList = list;
}

/** 從 rag_list 移除標籤 */
function removeFromRagList(groupIdx, tagIdx) {
  const state = currentState.value;
  const list = [...(state.packTasksList || [])];
  const g = list[groupIdx];
  if (!Array.isArray(g)) return;
  const next = g.filter((_, i) => i !== tagIdx);
  list[groupIdx] = next.length ? next : null;
  state.packTasksList = list.filter((x) => x != null && (Array.isArray(x) ? x.length > 0 : x));
}

/** 刪除整個虛擬資料夾群組 */
function removeRagListGroup(groupIdx) {
  const state = currentState.value;
  const list = [...(state.packTasksList || [])];
  list.splice(groupIdx, 1);
  state.packTasksList = list.filter((x) => x != null && (Array.isArray(x) ? x.length > 0 : x));
}

/** 新增一個空的虛擬資料夾群組 */
function addRagListGroup() {
  const state = currentState.value;
  state.packTasksList = [...(state.packTasksList || []), []];
}

/** 將每個 second_folder 各新增為一個虛擬資料夾（不影響既有虛擬資料夾） */
function addAllSecondFoldersAsGroups() {
  const names = secondFoldersFull.value;
  if (!names.length) return;
  const state = currentState.value;
  const existing = state.packTasksList ?? [];
  const newGroups = names.map((name) => [name]);
  state.packTasksList = [...existing, ...newGroups];
}
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100">
    <!-- 固定 tab 頁籤列（與試題頁一致，僅內容區可上下滑） -->
    <div class="flex-shrink-0 bg-white border-bottom">
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2">
        <template v-if="ragListLoading">
          <span class="small text-secondary">載入中...</span>
        </template>
        <template v-else-if="ragList.length === 0 && newTabIds.length === 0">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="createRagLoading"
            @click="addNewTab"
          >
            {{ createRagLoading ? '建立中...' : '+' }}
          </button>
        </template>
        <template v-else>
          <ul class="nav nav-tabs mb-0">
            <li v-for="rag in ragList" :key="'rag-' + (rag.rag_tab_id ?? rag.id ?? rag)" class="nav-item">
              <button
                type="button"
                class="nav-link border-0 rounded-0"
                :class="{ active: activeTabId === (rag.rag_tab_id ?? rag.id ?? rag) }"
                @click="activeTabId = (rag.rag_tab_id ?? rag.id ?? String(rag))"
              >
                {{ getRagTabLabel(rag) }}
              </button>
            </li>
            <li v-for="tid in newTabIds" :key="'new-' + tid" class="nav-item">
              <button
                type="button"
                class="nav-link"
                :class="{ active: activeTabId === tid }"
                @click="activeTabId = tid"
              >
                {{ deriveRagNameFromTabId(getTabState(tid).tabId) || 'RAG' }}
              </button>
            </li>
            <li class="nav-item ms-2 align-self-center">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                :disabled="createRagLoading"
                @click="addNewTab"
              >
                {{ createRagLoading ? '建立中...' : '+' }}
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="ragListError" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ ragListError }}
      </div>
      <div v-if="createRagError" class="alert alert-danger py-2 small mx-4 mb-3">
        {{ createRagError }}
      </div>
    </div>

    <!-- 內容區：可上下捲動 -->
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <!-- 無資料時不顯示表單，點「+」後才顯示；有資料時顯示對應 tab 表單 -->
      <template v-if="ragList.length > 0 || showFormWhenNoData">
      <!-- 基本資訊、OpenAI API Key、ZIP 上傳與 file_metadata 合併為一區塊 -->
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
              :disabled="currentState.appliedLoading || currentRagItem?.applied === true || !hasRagMetadata"
              @click="setRagApplied"
            >
              {{ currentState.appliedLoading ? '設定中...' : '使用此 RAG' }}
            </button>
          </div>
        </div>
        <div v-if="currentState.appliedError" class="alert alert-danger py-2 small mb-2">
          {{ currentState.appliedError }}
        </div>
        <div class="d-flex flex-wrap align-items-center gap-3 small mb-2">
          <span class="form-label small text-secondary fw-medium">rag_id：</span>
          <span class="small">{{ currentRagIdAndTabId.rag_id }}</span>
          <span class="form-label small text-secondary fw-medium">rag_tab_id：</span>
          <span class="small">{{ currentRagIdAndTabId.rag_tab_id }}</span>
        </div>
        <div class="form-label small text-secondary fw-medium mb-2 mt-4">OpenAI API Key</div>
        <p class="form-text small text-secondary mb-2">每個 tab 各自輸入；新增 RAG 時請在此 tab 輸入，上傳後會寫入該筆 RAG。</p>
        <div style="max-width: 400px;" class="mb-3">
          <input
            v-model="currentState.openaiApiKey"
            type="text"
            class="form-control form-control-sm"
            placeholder="請輸入 OpenAI API Key"
            autocomplete="off"
          >
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
        <div v-if="fileMetadataToShow != null" class="mt-3">
          <div class="form-label small text-secondary fw-medium mb-2">file_metadata</div>
          <pre class="bg-body-secondary border rounded p-2 mb-0 font-monospace small overflow-auto" style="max-height: 20rem;"><code>{{ JSON.stringify(fileMetadataToShow, null, 2) }}</code></pre>
        </div>
      </div>
      <!-- 壓縮資料夾 (Pack) 與 RAG：要有 file_metadata 才顯示；未輸入 API key 或未上傳 ZIP 時 disable -->
      <div v-if="fileMetadataToShow != null" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': packAndGenerateDisabled }">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">壓縮資料夾 (Pack) 與 RAG</div>
          <p class="small text-secondary mb-2">依上方 file_metadata 的當前 RAG 與 rag_list 壓縮指定資料夾，可一併產生 RAG。rag_list：逗號=多個 ZIP，加號=同檔內多資料夾，例 <code>220222+220301</code>、<code>220222,220301+220302</code>。</p>

          <!-- second_folders 標籤區：可拖曳至 rag_list；完整顯示不因拖入 rag_list 而移除 -->
          <div v-if="secondFoldersFull.length" class="mb-3">
            <label class="form-label small text-secondary fw-medium mb-1">second_folders（可拖曳至下方 rag_list）</label>
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
              <label class="form-label small text-secondary fw-medium mb-0">rag_list（虛擬資料夾，將上方標籤拖入）</label>
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
            <label class="form-label small text-secondary fw-medium mb-1">system_prompt_instruction（出題規範，傳給 GPT）</label>
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
          <div class="mt-3">
            <label class="form-label small text-secondary fw-medium mb-1">rag_metadata（Pack API 回傳）</label>
            <textarea
              v-model="currentState.ragMetadata"
              class="form-control form-control-sm font-monospace small bg-body-secondary border"
              rows="6"
              placeholder="執行 Pack 後由 API 回傳顯示"
              readonly
              style="resize: vertical; max-height: 280px;"
            />
          </div>
          <div v-if="currentState.packError" class="alert alert-danger py-2 small mb-2">
            {{ currentState.packError }}
          </div>
      </div>
      <!-- RAG 產生題目與題目與作答：要有 rag_metadata 才顯示；點「新增題目」後才出現題目生成子區塊 -->
      <div v-if="currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== ''" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': ragGenerateDisabled }">
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
                      :disabled="getSlotFormState(slotIndex).loading || !currentState.openaiApiKey?.trim()"
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

      <!-- 該 RAG 的資料（GET /rag/rags 回傳） -->
      <div v-if="currentRagItem != null && !isNewTabId(activeTabId)" class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">該 RAG 的資料（GET /rag/rags 回傳）</div>
        <pre class="bg-body-secondary border rounded p-3 font-monospace small mb-0 overflow-auto" style="max-height: 24rem;">{{ JSON.stringify(currentRagItem, null, 2) }}</pre>
      </div>
      </template>
    </div>
  </div>
</template>
