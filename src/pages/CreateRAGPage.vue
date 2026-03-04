<script setup>
/**
 * 建立 RAG 頁面。
 * 資料對應：一個 RAG 頁面（一個 tab）= 後端 public."Rag" 表的一筆（主鍵 rag_id + file_id）。
 * 列表 GET /rag/rags、上傳新增一筆 POST /rag/upload-zip；create-rag-zip 會更新同筆的 rag_list、rag_metadata、chunk_size、chunk_overlap。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_GENERATE_QUIZ, API_GRADE_SUBMISSION, API_RESPONSE_QUIZ_CONTENT, API_RESPONSE_QUIZ_LEGACY } from '../constants/api.js';

defineProps({
  tabId: { type: String, required: true },
});

/** 本頁建立時生成唯一 file_id，規格與後端一致：str(uuid.uuid4()) */
function generateTabFileId() {
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

/** 預設 quiz／提示（產生第一個 quiz 時使用） */
const authStore = useAuthStore();

/** 產生 quiz 的 API 的 system_instruction 預設內容 */
const DEFAULT_SYSTEM_INSTRUCTION = 'quiz 字數不超過50字';

/** RAG 列表（GET /rag/rags）、載入中、錯誤 */
const ragList = ref([]);
const ragListLoading = ref(false);
const ragListError = ref('');
/** 當前 tab：為 RAG 的 file_id 或「新增」tab 的 id（new-xxx） */
const activeTabId = ref(null);
/** 無資料時，點「新增」後才顯示建立 RAG 表單 */
const showFormWhenNoData = ref(false);
/** 每次點「新增」產生一個新 tab，存這些 tab 的 id（new-xxx） */
const newTabIds = ref([]);

/** 是否為「新增」用的 tab id（未存在於 DB） */
function isNewTabId(id) {
  return id === 'new' || (typeof id === 'string' && id.startsWith('new-'));
}

/** 每個 tab 的狀態（key = file_id 或 new-xxx） */
const tabStateMap = reactive({});

function getTabState(id) {
  if (!id) return getTabState(newTabIds.value[0] || ragList.value[0]?.file_id || 'new');
  if (!tabStateMap[id]) {
    const isNew = isNewTabId(id);
    tabStateMap[id] = reactive({
      tabFileId: isNew ? generateTabFileId() : id,
      uploadedZipFile: null,
      zipFileName: '',
      zipUploadName: '',
      zipSecondFolders: [],
      zipResponseJson: null,
      zipLoading: false,
      zipError: '',
      zipFileId: isNew ? '' : id,
      packTasks: '',
      /** 虛擬資料夾：[[a,b],[c]] 對應 rag_list "a+b,c" */
      packTasksList: [],
      ragMetadata: '',
      withRag: true,
      packResponseJson: null,
      packLoading: false,
      packError: '',
      generateQuizFileId: '',
      generateQuizLoading: false,
      generateQuizError: '',
      generateQuizResponseJson: null,
      cardList: [],
      /** 每個 quiz 表單獨立狀態（key = slotIndex 1,2,3...） */
      slotFormState: {},
      /** 是否已點「新增 quiz」而顯示 quiz 生成子區塊 */
      showQuizGeneratorBlock: false,
      /** 已展開的 quiz 區塊數（每按一次「新增 quiz」+1） */
      quizSlotsCount: 0,
      updateNameLoading: false,
      updateNameError: '',
      updateLlmKeyLoading: false,
      updateLlmKeyError: '',
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
  return getTabState(firstNew || (firstRag && (firstRag.file_id ?? firstRag.id ?? firstRag)) || 'new');
});

/** 全畫面共用 */
/** 僅由使用者於頁面輸入，不從環境變數或任何儲存讀取 */
const openaiApiKey = ref('');

/** 當前 RAG（來自 /rag/rags）是否有 rag_list 或 rag_metadata；有則壓縮資料夾 (Pack) 與 RAG 不 disable */
const hasRagListOrMetadata = computed(() => {
  const r = currentRagItem.value;
  if (!r || typeof r !== 'object') return false;
  const hasList = r.rag_list != null && String(r.rag_list).trim() !== '';
  const hasMeta = r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
  return hasList || hasMeta;
});

/** 當前 tab 未上傳 ZIP 時，Pack、RAG 產生 quiz、產生 quiz 按鈕 disable；若有 rag_list 或 rag_metadata 則不 disable。Pack 仍會在送出時檢查 API key。 */
const packAndGenerateDisabled = computed(() => {
  if (hasRagListOrMetadata.value) return false;
  const id = activeTabId.value;
  if (!id) return true;
  if (isNewTabId(id)) {
    const fid = String(currentState.value.zipFileId ?? '').trim();
    return fid === '';
  }
  return false;
});

/** 當前 RAG 是否有 rag_metadata；有則 RAG 產生 quiz 區塊 enable */
const hasRagMetadata = computed(() => {
  const r = currentRagItem.value;
  if (!r || typeof r !== 'object') return false;
  return r.rag_metadata != null && (typeof r.rag_metadata === 'string' ? String(r.rag_metadata).trim() !== '' : true);
});

/** 未執行 Pack 時，RAG 產生 quiz 區塊與產生 quiz 按鈕 disable（需有 packResponseJson）；若有 rag_metadata 則 enable */
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

/** 從 output 推得 rag_name（後端 rag_file_id = {rag_name}_rag） */
function deriveRagName(o) {
  if (o && typeof o.rag_name === 'string' && o.rag_name) return o.rag_name;
  const id = o?.rag_file_id ?? o?.file_id ?? '';
  const s = String(id);
  if (s.endsWith('_rag')) return s.slice(0, -4);
  const fn = o?.filename ?? o?.rag_filename ?? '';
  const f = String(fn).replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '').replace(/_rag$/, '');
  return f || s || '';
}

/** 產生 quiz：選擇單元 = rag_name 下拉（供 API；Pack 無資料時從 /rags 推導） */
const generateQuizUnits = computed(() => {
  const data = currentState.value.packResponseJson;
  const out = packOutputs.value;
  const singleFileId = data && typeof data === 'object' && data.file_id != null ? data.file_id : null;
  const withId = out.filter((o) => o && (o.file_id != null || o.rag_file_id != null));
  if (withId.length) {
    return withId.map((o) => ({
      file_id: String(o.rag_file_id ?? o.file_id),
      filename: o.filename || o.rag_filename || 'RAG',
      rag_name: deriveRagName(o),
    }));
  }
  if (singleFileId && out.length) {
    return out.map((o) => ({
      file_id: String(singleFileId),
      filename: o.filename || o.rag_filename || 'RAG',
      rag_name: deriveRagName(o),
    }));
  }
  // fallback：Pack 尚未執行，從 /rags 的 rag_list 推導
  return generateQuizUnitsFromRag.value;
});

/** 難度、chunk 參數（共用） */
const filterDifficulty = ref('入門');
const chunkSize = ref(1000);
const chunkOverlap = ref(200);

/** 當前 tab 對應的 RAG 項目（來自 GET /rag/rags），僅在非「新增」tab 時有值 */
const currentRagItem = computed(() => {
  const id = activeTabId.value;
  if (!id || isNewTabId(id)) return null;
  return ragList.value.find(
    (rag) => (rag.file_id ?? rag.id ?? String(rag)) === id
  ) ?? null;
});

/** 當前 tab 的 rag_id、file_id（供 OpenAI API Key 上方顯示；未上傳則為「未上傳」） */
const currentRagIdAndFileId = computed(() => {
  const state = currentState.value;
  const rag = currentRagItem.value;
  if (state.zipResponseJson != null) {
    const rid = state.zipResponseJson.rag_id ?? state.zipResponseJson.id;
    const fid = state.zipFileId || state.zipResponseJson.file_id;
    return { rag_id: rid != null ? String(rid) : '未上傳', file_id: fid ? String(fid) : '未上傳' };
  }
  if (rag != null && typeof rag === 'object') {
    const rid = rag.rag_id ?? rag.id;
    const fid = rag.file_id ?? rag.id ?? activeTabId.value;
    return { rag_id: rid != null ? String(rid) : '未上傳', file_id: fid ? String(fid) : '未上傳' };
  }
  return { rag_id: '未上傳', file_id: '未上傳' };
});

/** 用於顯示 file_metadata 的來源：上傳回傳的 zipResponseJson，或從 GET /rag/rags 讀到的該筆的 file_metadata／整筆資料 */
const fileMetadataToShow = computed(() => {
  const state = currentState.value;
  if (state.zipResponseJson != null) return state.zipResponseJson;
  const rag = currentRagItem.value;
  if (rag == null || typeof rag !== 'object') return null;
  if (rag.file_metadata != null && typeof rag.file_metadata === 'object') return rag.file_metadata;
  return rag;
});

/** 從 file_metadata 取得 course_name（供產生 quiz、評分 API 使用） */
const courseNameFromFileMetadata = computed(() => {
  const meta = fileMetadataToShow.value;
  if (meta == null || typeof meta !== 'object') return '';
  const name = meta.course_name;
  return name != null ? String(name).trim() : '';
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

/** 從 /rags 的 rag_list 字串推導出 generateQuizUnits（Pack 尚未執行時的 fallback） */
const generateQuizUnitsFromRag = computed(() => {
  const rag = currentRagItem.value;
  if (!rag || typeof rag !== 'object') return [];
  const ragListStr = rag.rag_list ?? '';
  if (!ragListStr) return [];
  const sourceFileId = String(rag.file_id ?? '');
  return String(ragListStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((group) => {
      const ragName = group.replace(/\+/g, '_');
      return {
        file_id: sourceFileId || `${ragName}_rag`,
        filename: `${ragName}_rag.zip`,
        rag_name: ragName,
      };
    });
});

/** 當切換到既有 tab 時，從同一筆 Rag 資料填入：llm_api_key（OpenAI API Key 欄位）、rag_list、rag_metadata、chunk_size、chunk_overlap、name、system_prompt_instruction */
watch(currentRagItem, (rag) => {
  if (!rag || typeof rag !== 'object') return;
  const state = currentState.value;
  if (rag.llm_api_key != null && String(rag.llm_api_key).trim() !== '') {
    openaiApiKey.value = String(rag.llm_api_key).trim();
  } else {
    openaiApiKey.value = '';
  }
  if (rag.rag_list != null && String(rag.rag_list).trim() !== '') {
    state.packTasks = String(rag.rag_list).trim();
    state.packTasksList = parsePackTasksList(state.packTasks);
  }
  if (rag.rag_metadata != null) {
    state.ragMetadata = typeof rag.rag_metadata === 'string' ? rag.rag_metadata : JSON.stringify(rag.rag_metadata, null, 2);
  }
  if (rag.chunk_size != null) chunkSize.value = Number(rag.chunk_size);
  if (rag.chunk_overlap != null) chunkOverlap.value = Number(rag.chunk_overlap);
  if (rag.name != null && String(rag.name).trim() !== '') state.zipUploadName = String(rag.name).trim();
  if (rag.filename != null && String(rag.filename).trim() !== '') state.zipFileName = String(rag.filename).trim();
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    state.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
}, { immediate: true });

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
  const firstFileId = units[0].file_id;
  const currentInList = units.some((u) => u.file_id === state.generateQuizFileId);
  if (!state.generateQuizFileId || !currentInList) {
    state.generateQuizFileId = firstFileId;
  }
}, { immediate: true });

/** 有 RAG 資料時預設選第一個 tab */
watch(ragList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = list[0].file_id ?? list[0].id ?? list[0];
  }
}, { immediate: true });

/** 載入 RAG 列表：GET /rag/rags 列出 Rag 表全部內容（與 GET /user/users 一樣回傳全部資料），每一筆一個 tab。可選帶 Header X-API-Key。 */
async function fetchRagList() {
  ragListLoading.value = true;
  ragListError.value = '';
  try {
    const headers = {};
    const llmKey = openaiApiKey.value?.trim();
    if (llmKey) headers['X-LLM-Api-Key'] = llmKey;
    const res = await fetch(`${API_BASE}/rag/rags`, { method: 'GET', headers });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    ragList.value = Array.isArray(data) ? data : (data?.rags ?? data?.items ?? []);
  } catch (err) {
    ragListError.value = err.message || '無法載入 RAG 列表';
    ragList.value = [];
  } finally {
    ragListLoading.value = false;
  }
}

/** 畫面一打開就抓 GET /rag/rags，每一筆 RAG 一個 tab */
onMounted(() => {
  fetchRagList();
});

/** 更新 RAG 名稱：PATCH /rag/name/{file_id}，body { name }，Header X-Person-Id。成功後更新 ragList 該筆的 name，tab 標籤會自動更新。 */
async function updateRagName() {
  const rag = currentRagItem.value;
  if (!rag || isNewTabId(activeTabId.value)) return;
  const fileId = rag.file_id ?? rag.id ?? rag;
  if (fileId == null || fileId === '') return;
  const personId = authStore.user?.person_id;
  if (personId == null) {
    alert('請先登入');
    return;
  }
  const newName = (currentState.value.zipUploadName ?? '').trim();
  const state = getTabState(activeTabId.value);
  state.updateNameLoading = true;
  state.updateNameError = '';
  try {
    const res = await fetch(`${API_BASE}/rag/name/${encodeURIComponent(String(fileId))}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Person-Id': String(personId),
      },
      body: JSON.stringify({ name: newName }),
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
    const idx = ragList.value.findIndex((r) => (r.file_id ?? r.id ?? r) === fileId);
    if (idx >= 0) ragList.value[idx].name = newName;
    state.updateNameError = '';
  } catch (err) {
    state.updateNameError = err.message || String(err);
  } finally {
    state.updateNameLoading = false;
  }
}

/** 更新 RAG 的 LLM API Key：PATCH /rag/llm_api_key/{file_id}，body { llm_api_key }，Header X-Person-Id。 */
async function updateRagLlmApiKey() {
  const rag = currentRagItem.value;
  if (!rag || isNewTabId(activeTabId.value)) return;
  const fileId = rag.file_id ?? rag.id ?? rag;
  if (fileId == null || fileId === '') return;
  const personId = authStore.user?.person_id;
  if (personId == null) {
    alert('請先登入');
    return;
  }
  const llmKey = (openaiApiKey.value ?? '').trim();
  const state = getTabState(activeTabId.value);
  state.updateLlmKeyLoading = true;
  state.updateLlmKeyError = '';
  try {
    const res = await fetch(`${API_BASE}/rag/llm_api_key/${encodeURIComponent(String(fileId))}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Person-Id': String(personId),
      },
      body: JSON.stringify({ llm_api_key: llmKey || null }),
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
    state.updateLlmKeyError = '';
  } catch (err) {
    state.updateLlmKeyError = err.message || String(err);
  } finally {
    state.updateLlmKeyLoading = false;
  }
}

/** 刪除 RAG：呼叫 POST /rag/delete/{file_id}（軟刪 + 刪資料夾），成功後重抓 /rag/rags。Header 必帶 X-Person-Id。 */
async function deleteRag(rag, e) {
  if (e) e.stopPropagation();
  const fileId = rag?.file_id ?? rag?.id ?? rag;
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
    if (activeTabId.value === (rag?.file_id ?? rag?.id ?? String(fileId))) {
      if (ragList.value.length > 0) {
        activeTabId.value = ragList.value[0].file_id ?? ragList.value[0].id ?? ragList.value[0];
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

/** upload-zip 成功回傳的 created_at，用於 tab 標籤（key = rag_id） */
const ragCreatedAtMap = ref({});

/** 點「新增」：只加一個新 tab（不 call API），name 預設為 yymmddhhmmss；在該 tab 內上傳 ZIP 時會呼叫 upload-zip */
function addNewTab() {
  const id = 'new-' + generateTabFileId();
  newTabIds.value = [...newTabIds.value, id];
  activeTabId.value = id;
  getTabState(id).zipUploadName = getDefaultUploadName();
  if (ragList.value.length === 0) showFormWhenNoData.value = true;
}

/** 取得 RAG 顯示名稱（用於 tab 標籤）；只顯示 name（按 + 時設定的），上傳後不改成時間 */
function getRagTabLabel(rag) {
  if (rag == null) return 'RAG';
  if (typeof rag === 'string') return ragCreatedAtMap.value[rag] ?? String(rag);
  if (typeof rag !== 'object') return String(rag);
  const id = rag.rag_id ?? rag.file_id ?? rag.id;
  const fromMap = id != null ? ragCreatedAtMap.value[String(id)] : undefined;
  return (rag.name != null && String(rag.name).trim() !== '') ? String(rag.name).trim() : (fromMap ?? rag.created_at ?? rag.filename ?? rag.file_id ?? 'RAG');
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
      state.zipFileId = isNewTabId(activeTabId.value) ? '' : activeTabId.value;
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
    state.zipFileId = isNewTabId(activeTabId.value) ? '' : activeTabId.value;
    state.zipError = '';
  }
}

/** 產生 name 預設值：yymmddhhmmss（與後端 generate_file_id 的時間部分一致） */
function getDefaultUploadName() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${min}${ss}`;
}

/** 按下確定：呼叫 POST /rag/upload-zip（傳入 person_id、ZIP 檔案；name 可選，未傳則以檔名去 .zip 寫入 Rag.name；llm_api_key 可選，寫入 Rag 表），後端回傳 rag_id、file_id、created_at、filename、second_folders、file_metadata */
async function confirmUploadZip() {
  const state = currentState.value;
  if (!state.uploadedZipFile) {
    state.zipError = '請先選擇 ZIP 檔案';
    return;
  }
  state.zipLoading = true;
  state.zipError = '';
  state.zipSecondFolders = [];
  state.zipResponseJson = null;
  state.zipFileId = isNewTabId(activeTabId.value) ? '' : activeTabId.value;
  const currentTabId = activeTabId.value;
  try {
    const formData = new FormData();
    formData.append('file', state.uploadedZipFile);
    const personId = authStore.user?.person_id;
    if (personId != null) formData.append('person_id', String(personId));
    const name = (state.zipUploadName || '').trim() || getDefaultUploadName();
    formData.append('name', name);
    const llmKey = (openaiApiKey.value ?? '').trim();
    if (llmKey) formData.append('llm_api_key', llmKey);
    const headers = {};
    if (personId != null) headers['X-Person-Id'] = String(personId);
    const res = await fetch(`${API_BASE}/rag/upload-zip`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(`${res.status}: ${msg}`);
    }
    const data = await res.json();
    state.zipResponseJson = data;
    if (data?.file_id != null) state.zipFileId = String(data.file_id);
    if (data?.filename != null) state.zipFileName = data.filename;
    state.zipSecondFolders = Array.isArray(data?.second_folders)
      ? data.second_folders
      : Array.isArray(data)
        ? data
        : [];
    const ragId = data?.rag_id ?? data?.id ?? null;
    const createdAt = data?.created_at ?? null;
    if (ragId != null && createdAt != null) {
      ragCreatedAtMap.value = { ...ragCreatedAtMap.value, [String(ragId)]: createdAt };
    }
    await fetchRagList();
    if (data?.file_id != null && isNewTabId(currentTabId)) {
      const newFileId = String(data.file_id);
      const newState = getTabState(newFileId);
      newState.zipResponseJson = data;
      newState.zipFileId = newFileId;
      newState.zipFileName = data.filename ?? state.zipFileName;
      newState.zipSecondFolders = Array.isArray(data?.second_folders) ? data.second_folders : [];
      newState.uploadedZipFile = state.uploadedZipFile;
      newTabIds.value = newTabIds.value.filter((id) => id !== currentTabId);
      activeTabId.value = newFileId;
    }
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

/** 呼叫 /rag/create-rag-zip；body: file_id, person_id, rag_list, openai_api_key, chunk_size, chunk_overlap, system_prompt_instruction（後端寫入資料庫） */
async function confirmPack() {
  const state = currentState.value;
  const fileId = String(state.zipFileId ?? '').trim();
  const ragList = state.packTasks?.trim();
  const personId = authStore.user?.person_id;
  const apiKey = openaiApiKey.value?.trim() ?? '';
  if (!fileId) {
    state.packError = '請先上傳 ZIP 取得 file_id（見上方 file_metadata）';
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
  const systemPromptInstruction = (state.systemInstruction ?? '').trim() || null;
  try {
    const res = await fetch(`${API_BASE}/rag/create-rag-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        person_id: String(personId),
        rag_list: ragList,
        openai_api_key: apiKey,
        chunk_size: Number(chunkSize.value) || 1000,
        chunk_overlap: Number(chunkOverlap.value) || 200,
        ...(systemPromptInstruction != null ? { system_prompt_instruction: systemPromptInstruction } : {}),
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
    // 重新載入列表（create-rag-zip 後端已會更新 Rag 表的 rag_list、rag_metadata、chunk_size、chunk_overlap、system_prompt_instruction）
    await fetchRagList();
  } catch (err) {
    state.packError = err.message || '壓縮失敗';
    state.packResponseJson = null;
  } finally {
    state.packLoading = false;
  }
}

const difficultyOptions = ['入門', '進階', '困難'];

/** 取得第 slotIndex 個 quiz 的表單狀態（獨立、不連動） */
function getSlotFormState(slotIndex) {
  const state = currentState.value;
  if (!state.slotFormState[slotIndex]) {
    const units = generateQuizUnits.value;
    const first = units.length ? units[0].file_id : '';
    state.slotFormState[slotIndex] = reactive({
      generateQuizFileId: first,
      loading: false,
      error: '',
      responseJson: null,
    });
  }
  return state.slotFormState[slotIndex];
}

/** 點「新增 quiz」：展開一個新的 quiz 區塊；cardList 與 slot 對齊 */
function openNextQuizSlot() {
  const state = currentState.value;
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  while (state.cardList.length < state.quizSlotsCount) {
    state.cardList.push(null);
  }
}

/** 將第 slotIndex 個 quiz 設為指定卡片（每個獨立，不連動） */
function setCardAtSlot(slotIndex, quizContent, quizHint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, quizLevel, systemInstructionUsed) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const card = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    quiz_hint: quizHint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    answer: '',
    quizHintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    quiz_id: generateQuizResponseJson?.quiz_id ?? null,
    quiz_level: quizLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
  };
  state.cardList[slotIndex - 1] = card;
}

/** 呼叫產生 quiz API；傳入 slotIndex 使用該 slot 的表單狀態（不傳 openai_api_key、system_prompt_instruction，後端依 file_id/rag 從資料庫讀取） */
async function generateQuiz(slotIndex) {
  const state = currentState.value;
  const slotState = getSlotFormState(slotIndex);
  const sourceFileId = String(state.zipFileId ?? '').trim();
  const selectedUnit = generateQuizUnits.value.find((u) => u.file_id === slotState.generateQuizFileId);
  const ragName = selectedUnit?.rag_name?.trim();
  if (!sourceFileId) {
    slotState.error = '請先上傳 ZIP 取得 file_id';
    return;
  }
  if (!ragName) {
    slotState.error = '請先選擇單元（需先執行 Pack 取得 RAG 壓縮檔）';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  const systemInstructionForDisplay = (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION;
  const courseName = courseNameFromFileMetadata.value;
  try {
    const res = await fetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: sourceFileId,
        rag_name: ragName,
        quiz_level: filterDifficulty.value,
        course_name: courseName || '未命名課程',
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
    const quizContent = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? '';
    const quizHintText = data.quiz_hint ?? data.hint ?? '';
    const targetFilename = data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? '';
    const referenceAnswerText = data.reference_answer ?? data.answer ?? '';
    setCardAtSlot(slotIndex, quizContent, quizHintText, targetFilename, referenceAnswerText, ragName, data, filterDifficulty.value, systemInstructionForDisplay);
  } catch (err) {
    slotState.error = err.message || '產生 quiz 失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.quizHintVisible = !item.quizHintVisible;
}

async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  const sourceFileId = String(currentState.value.zipFileId ?? '').trim();
  if (!sourceFileId) {
    item.confirmed = true;
    item.gradingResult = '評分需要 file_id：請先在「上傳 ZIP 檔」區塊上傳 RAG/講義 ZIP 取得 file_id 後再進行評分。';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  try {
    const ragName = item.ragName?.trim() ?? generateQuizUnits.value[0]?.rag_name?.trim();
    if (!ragName) {
      item.gradingResult = '評分失敗：此 quiz 未關聯 RAG 單元（rag_name），請由「產生 quiz」產生後再評分。';
      return;
    }
    const courseName = courseNameFromFileMetadata.value || '';
    const quizId = item.quiz_id != null ? String(item.quiz_id) : '0';
    const params = new URLSearchParams({
      file_id: sourceFileId,
      rag_name: ragName,
      question_text: item.quiz ?? '',
      student_answer: item.answer.trim(),
      qtype: 'short_answer',
      course_name: courseName,
      quiz_id: quizId,
    });
    const res = await fetch(`${API_BASE}${API_GRADE_SUBMISSION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
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
      const statusHint = res.status === 502 ? '（後端逾時或服務喚醒中，請稍後再試）\n\n' : (res.status === 500 ? '（後端 500 錯誤，請檢查伺服器日誌或 API 設定）\n\n' : '');
      item.gradingResult = `評分失敗：${statusHint}${msg}`;
      return;
    }
    // 後端改為非同步：202 + job_id，需輪詢取得結果（避免 Render 逾時 502）
    if (res.status === 202) {
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
      const maxPolls = 60; // 約 2 分鐘
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
            pollRes = await fetch(`${API_BASE}/rag/grade_result/${jobId}`);
            pollText = await pollRes.text();
            if (pollRes.status !== 502 && pollRes.status !== 504) break;
          } catch (_) {
            // 網路錯誤也重試，最後一輪會由下方判斷 pollRes 為 null
          }
        }
        if (!pollRes || pollRes.status === 502 || pollRes.status === 504) {
          item.gradingResult = friendlyUnavailable;
          return;
        }
        // 404：job 不存在（例如服務重啟／冷啟動），顯示友善說明
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
          // 404 有時被代理轉成 200，body 仍為 status/error；統一顯示友善說明
          const errMsg = pollData.error || '';
          const isJobNotFound = errMsg.includes('job not found');
          item.gradingResult = isJobNotFound
            ? '評分任務不存在或已過期（伺服器可能曾休眠或重啟），請重新送出評分。'
            : `評分失敗：${pollData.error || '未知錯誤'}`;
          return;
        }
        // pending：繼續輪詢
      }
      item.gradingResult = '評分逾時：請稍後再試或重新送出';
      return;
    }
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore parse error */ }
    item.gradingResponseJson = parsed;
    item.gradingResult = formatGradingResult(text) || '（無批改內容）';
  } catch (err) {
    item.gradingResult = '評分失敗：後端逾時或服務喚醒中，請稍後再試。';
  }
}

/** 將評分 API 回傳的 JSON 轉成易讀文字 */
function formatGradingResult(text) {
  if (!text || typeof text !== 'string') return text;
  const t = text.trim();
  if (!t.startsWith('{')) return text;
  try {
    const data = JSON.parse(text);
    const lines = [];
    if (data.score != null) lines.push(`總分：${data.score} / 10`);
    if (data.quiz_level != null || data.level != null) lines.push(`等級：${data.quiz_level ?? data.level}`);
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
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <!-- 每個 tab = 一筆 /rag/rags 資料；「新增」= 只加新 tab，在該 tab 內上傳 ZIP 時呼叫 /rag/upload-zip 產生 RAG -->
      <div class="d-flex align-items-center gap-2 mb-3">
        <template v-if="ragListLoading">
          <span class="small text-muted">載入中...</span>
        </template>
        <template v-else-if="ragList.length === 0 && newTabIds.length === 0">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            @click="addNewTab"
          >
            +
          </button>
        </template>
        <template v-else>
          <ul class="nav nav-tabs mb-0">
            <li v-for="rag in ragList" :key="'rag-' + (rag.file_id ?? rag.id ?? rag)" class="nav-item d-flex align-items-center">
              <button
                type="button"
                class="nav-link border-0 rounded-0"
                :class="{ active: activeTabId === (rag.file_id ?? rag.id ?? rag) }"
                @click="activeTabId = (rag.file_id ?? rag.id ?? String(rag))"
              >
                {{ getRagTabLabel(rag) }}
              </button>
              <button
                type="button"
                class="btn btn-link btn-sm p-0 ms-1 text-muted text-decoration-none"
                style="min-width: 1.5rem;"
                aria-label="刪除此 RAG"
                @click="deleteRag(rag, $event)"
              >
                ×
              </button>
            </li>
            <li v-for="tid in newTabIds" :key="'new-' + tid" class="nav-item">
              <button
                type="button"
                class="nav-link"
                :class="{ active: activeTabId === tid }"
                @click="activeTabId = tid"
              >
                {{ getTabState(tid).zipUploadName || 'name' }}
              </button>
            </li>
            <li class="nav-item ms-2 align-self-center">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                @click="addNewTab"
              >
                +
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="ragListError" class="alert alert-warning py-2 small mb-3">
        {{ ragListError }}
      </div>

      <!-- 無資料時不顯示表單，點「新增」後才顯示；有資料時一律顯示 -->
      <template v-if="ragList.length > 0 || showFormWhenNoData">
      <!-- 基本資訊、OpenAI API Key、ZIP 上傳與 file_metadata 合併為一區塊 -->
      <div class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="h6 fw-semibold text-muted mb-3 pb-2 border-bottom">基本資訊、API 與 ZIP 上傳</div>
        <div class="d-flex flex-wrap align-items-center gap-3 small mb-2">
          <span class="text-muted">rag_id：</span>
          <span class="small">{{ currentRagIdAndFileId.rag_id }}</span>
          <span class="text-muted">file_id：</span>
          <span class="small">{{ currentRagIdAndFileId.file_id }}</span>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="text-muted">name</span>
          <input
            v-model="currentState.zipUploadName"
            type="text"
            class="form-control form-control-sm"
            style="max-width: 200px;"
          >
          <button
            v-if="!isNewTabId(activeTabId) && currentRagItem"
            type="button"
            class="btn btn-sm btn-primary"
            @click="updateRagName"
          >
            {{ currentState.updateNameLoading ? '修改中...' : '確定修改' }}
          </button>
        </div>
        <div v-if="currentState.updateNameError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ currentState.updateNameError }}
        </div>
        <div class="mb-3">
          <div class="form-label text-muted small mb-2 mt-4">OpenAI API Key</div>
          <p class="form-text text-muted small mb-2">本頁共用，Pack、產生 quiz 等會自動使用；上傳 ZIP 時可寫入 Rag 表，亦可在此修改已儲存的 key。</p>
          <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
            <input
              v-model="openaiApiKey"
              type="password"
              class="form-control form-control-sm"
              style="max-width: 400px;"
              placeholder="請輸入 OpenAI API Key"
              autocomplete="off"
            >
            <button
              v-if="!isNewTabId(activeTabId) && currentRagItem"
              type="button"
              class="btn btn-sm btn-primary"
              @click="updateRagLlmApiKey"
            >
              {{ currentState.updateLlmKeyLoading ? '修改中...' : '確定修改' }}
            </button>
          </div>
          <div v-if="currentState.updateLlmKeyError" class="alert alert-danger mb-0 py-2 small">
            {{ currentState.updateLlmKeyError }}
          </div>
        </div>
        <div v-if="isNewTabId(activeTabId) || fileMetadataToShow != null" class="mb-3">
          <div class="form-label text-muted small mb-2">上傳 ZIP 檔</div>
          <p class="form-text text-muted small mb-2">支援 .pdf、.docx、.rmd／.r、.html／.htm。上傳時會將上方 OpenAI API Key 一併寫入 Rag 表（可選）。</p>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <input
              type="file"
              accept=".zip"
              class="form-control form-control-sm"
              style="max-width: 240px;"
              :disabled="fileMetadataToShow != null"
              @change="onZipChange"
            >
            <span v-if="currentState.zipFileName" class="small">{{ currentState.zipFileName }}</span>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="fileMetadataToShow != null || currentState.zipLoading"
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
          <div class="form-label text-muted small mb-2">file_metadata</div>
          <pre class="bg-body-secondary border rounded p-2 mb-0 font-monospace small overflow-auto" style="max-height: 20rem;"><code>{{ JSON.stringify(fileMetadataToShow, null, 2) }}</code></pre>
        </div>
      </div>
      <!-- 壓縮資料夾 (Pack) 與 RAG：要有 file_metadata 才顯示；未輸入 API key 或未上傳 ZIP 時 disable -->
      <div v-if="fileMetadataToShow != null" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': packAndGenerateDisabled }">
        <div class="h6 fw-semibold text-muted mb-3 pb-2 border-bottom">壓縮資料夾 (Pack) 與 RAG</div>
          <p class="form-text text-muted small mb-2">依上方 file_metadata 的當前 RAG 與 rag_list 壓縮指定資料夾，可一併產生 RAG。rag_list：逗號=多個 ZIP，加號=同檔內多資料夾，例 <code>220222+220301</code>、<code>220222,220301+220302</code>。</p>

          <!-- second_folders 標籤區：可拖曳至 rag_list；完整顯示不因拖入 rag_list 而移除 -->
          <div v-if="secondFoldersFull.length" class="mb-3">
            <label class="form-label text-muted small mb-1">second_folders（可拖曳至下方 rag_list）</label>
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
              <label class="form-label text-muted small mb-0">rag_list（虛擬資料夾，將上方標籤拖入）</label>
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
              <label class="form-label text-muted small mb-1">chunk_size</label>
              <input
                v-model.number="chunkSize"
                type="number"
                min="1"
                class="form-control form-control-sm"
                placeholder="1000"
              >
            </div>
            <div style="width: 100px;">
              <label class="form-label text-muted small mb-1">chunk_overlap</label>
              <input
                v-model.number="chunkOverlap"
                type="number"
                min="0"
                class="form-control form-control-sm"
                placeholder="200"
              >
            </div>
          </div>
          <div class="mt-3 mb-3">
            <label class="form-label text-muted small mb-1">system_prompt_instruction（quiz 規範，傳給 GPT）</label>
            <textarea
              v-model="currentState.systemInstruction"
              class="form-control form-control-sm font-monospace small"
              rows="4"
              :placeholder="'留空則使用預設：' + DEFAULT_SYSTEM_INSTRUCTION"
              style="max-width: 100%;"
            />
          </div>
          <div class="mb-3">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              @click="confirmPack"
            >
              {{ currentState.packLoading ? '處理中...' : '執行 Pack' }}
            </button>
          </div>
          <div class="mt-3">
            <label class="form-label text-muted small mb-1">rag_metadata（Pack API 回傳）</label>
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
      <!-- RAG 產生 quiz 與作答：要有 rag_metadata 才顯示；點「新增 quiz」後才出現 quiz 生成子區塊 -->
      <div v-if="currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== ''" class="bg-body-tertiary rounded text-start p-4 mb-3" :class="{ 'opacity-75': ragGenerateDisabled }">
        <div class="h6 fw-semibold text-muted mb-3 pb-2 border-bottom">RAG 產生 quiz 與作答</div>
        <p class="form-text text-muted small mb-3">點「新增 quiz」後會出現一個 quiz 區塊（選擇單元、難度、產生 quiz 等）；每按一次「新增 quiz」才會多一個 quiz 區塊。「新增 quiz」按鈕固定在最下面。</p>

        <!-- quiz 區塊：每按一次「新增 quiz」才多一個「第 n 個 quiz」；按鈕固定在最下面 -->
        <div class="bg-light rounded mb-3">
          <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
            <!-- 第 slotIndex 個 quiz：若已有該卡片則顯示卡片，否則顯示產生 quiz 表單 -->
            <template v-if="currentState.cardList[slotIndex - 1]">
              <!-- 已有卡片：顯示完整 quiz 區塊 -->
              <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                <div class="card-header py-2">
                  <span class="fw-semibold mb-0">第 {{ slotIndex }} 個 quiz</span>
                </div>
                <div class="card-body text-start">
                  <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
                    <div>
                      <label class="form-label text-muted small mb-1">選擇單元（rag_name）</label>
                      <div class="form-control form-control-sm bg-body-secondary border" style="min-height: 31px;">{{ currentState.cardList[slotIndex - 1].ragName || '—' }}</div>
                    </div>
                    <div>
                      <label class="form-label text-muted small mb-1">難度</label>
                      <div class="form-control form-control-sm bg-body-secondary border" style="min-height: 31px;">{{ currentState.cardList[slotIndex - 1].quiz_level || '—' }}</div>
                    </div>
                  </div>
                  <div class="mb-3">
                    <div class="form-label text-muted small mb-1">quiz</div>
                    <div class="bg-body-secondary border rounded p-2">
                      {{ currentState.cardList[slotIndex - 1].quiz }}
                    </div>
                  </div>
                  <div class="mb-3">
                    <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="toggleHint(currentState.cardList[slotIndex - 1])">
                      {{ currentState.cardList[slotIndex - 1].quizHintVisible ? '隱藏提示' : '顯示提示' }}
                    </button>
                    <div v-show="currentState.cardList[slotIndex - 1].quizHintVisible" class="rounded bg-body-tertiary text-muted mt-2 p-2">
                      {{ currentState.cardList[slotIndex - 1].quiz_hint }}
                    </div>
                  </div>
                  <div v-if="currentState.cardList[slotIndex - 1].referenceAnswer" class="mb-3">
                    <div class="form-label text-muted small mb-1">參考答案</div>
                    <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].referenceAnswer }}</div>
                  </div>
                  <div class="mb-3">
                    <label :for="`answer-${currentState.cardList[slotIndex - 1].id}`" class="form-label text-muted small mb-1">回答</label>
                    <template v-if="!currentState.cardList[slotIndex - 1].confirmed">
                      <textarea
                        :id="`answer-${currentState.cardList[slotIndex - 1].id}`"
                        v-model="currentState.cardList[slotIndex - 1].answer"
                        class="form-control"
                        rows="4"
                        placeholder="請輸入您的回答..."
                        maxlength="2000"
                      />
                      <div class="form-text">{{ currentState.cardList[slotIndex - 1].answer.length }} / 2000</div>
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
                    <div class="form-label text-muted small mb-1">批改結果</div>
                    <div class="small" style="white-space: pre-wrap;">{{ currentState.cardList[slotIndex - 1].gradingResult || '尚未批改' }}</div>
                  </div>
                  <div v-if="currentState.cardList[slotIndex - 1].generateQuizResponseJson != null" class="mb-3">
                    <div class="form-label text-muted small mb-1">產生 quiz API 回傳 JSON：</div>
                    <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(currentState.cardList[slotIndex - 1].generateQuizResponseJson, null, 2) }}</pre>
                  </div>
                  <div v-if="currentState.cardList[slotIndex - 1].gradingResponseJson != null">
                    <div class="form-label text-muted small mb-1">批改結果 API 回傳 JSON：</div>
                    <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(currentState.cardList[slotIndex - 1].gradingResponseJson, null, 2) }}</pre>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <!-- 尚未產生：顯示產生 quiz 表單（第 slotIndex 個 quiz，每個獨立不連動） -->
              <div class="card mb-3" :class="{ 'mt-4': slotIndex > 1 }">
                <div class="card-header py-2">
                  <span class="fw-semibold mb-0">第 {{ slotIndex }} 個 quiz</span>
                </div>
                <div class="card-body text-start pt-3">
                  <div class="d-flex flex-wrap align-items-end gap-3">
                    <div>
                      <label class="form-label text-muted small mb-1">選擇單元（rag_name）</label>
                      <select v-model="getSlotFormState(slotIndex).generateQuizFileId" class="form-select form-select-sm">
                        <option value="">— 請先執行 Pack —</option>
                        <option v-for="(opt, i) in generateQuizUnits" :key="i" :value="opt.file_id">{{ opt.rag_name }}</option>
                      </select>
                    </div>
                    <div>
                      <label class="form-label text-muted small mb-1">難度</label>
                      <select v-model="filterDifficulty" class="form-select form-select-sm">
                        <option v-for="opt in difficultyOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm btn-primary"
                      :disabled="getSlotFormState(slotIndex).loading || !openaiApiKey?.trim()"
                      @click="generateQuiz(slotIndex)"
                    >
                      {{ getSlotFormState(slotIndex).loading ? '產生中...' : '產生 quiz' }}
                    </button>
                  </div>
                  <div v-if="getSlotFormState(slotIndex).error" class="alert alert-danger mt-2 mb-0 py-2 small">
                    {{ getSlotFormState(slotIndex).error }}
                  </div>
                  <div v-if="getSlotFormState(slotIndex).responseJson !== null" class="mt-2">
                    <div class="form-label text-muted small mb-1">產生 quiz API 回傳 JSON：</div>
                    <pre class="bg-body-secondary border rounded p-2 font-monospace small mb-0 overflow-auto" style="max-height: 20rem;">{{ JSON.stringify(getSlotFormState(slotIndex).responseJson, null, 2) }}</pre>
                  </div>
                </div>
              </div>
            </template>
          </template>

          <!-- 新增 quiz 按鈕：固定在最下面，每按一次多一個「第 n 個 quiz」區塊 -->
          <div class="mb-0 pt-2">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              @click="openNextQuizSlot"
            >
              新增 quiz
            </button>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

