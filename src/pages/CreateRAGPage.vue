<script setup>
/** 建立 RAG 頁面。使用 tab 對應每筆 RAG 資料（GET /zip/rag），每個 tab 獨立狀態。 */
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';

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

/** 預設題目／提示（產生第一題時使用） */
const defaultQuestion = '什麼是空間分析（Spatial Analysis）？請簡述其在地理資訊系統中的應用和重要性。';
const defaultHint = '空間分析是一組技術和方法，用於分析地理數據中的空間模式和關係。它可以幫助解決與位置相關的問題，並在城市規劃、環境管理和資源分配等領域中具有重要應用。';

/** 後端網址 */
const API_BASE = 'http://127.0.0.1:8000';
const authStore = useAuthStore();

/** RAG 列表（GET /zip/rag）、載入中、錯誤 */
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
      zipSecondFolders: [],
      zipResponseJson: null,
      zipLoading: false,
      zipError: '',
      zipFileId: isNew ? '' : id,
      packTasks: '',
      withRag: true,
      packResponseJson: null,
      packLoading: false,
      packError: '',
      llmKeyLoading: false,
      llmKeyError: '',
      llmKeySuccess: '',
      generateQuestionFileId: '',
      generateQuestionLoading: false,
      generateQuestionError: '',
      cardList: [],
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
const openaiApiKey = ref('');

/** Pack 回傳的 outputs 陣列（依當前 tab 的 packResponseJson） */
const packOutputs = computed(() => {
  const data = currentState.value.packResponseJson;
  if (!data || typeof data !== 'object') return [];
  return Array.isArray(data.outputs) ? data.outputs : [];
});

/** 產生題目：選擇單元 = 壓縮檔名下拉 */
const generateQuestionUnits = computed(() => {
  const data = currentState.value.packResponseJson;
  const out = packOutputs.value;
  const singleFileId = data && typeof data === 'object' && data.file_id != null ? data.file_id : null;
  const withId = out.filter((o) => o && (o.file_id != null || o.rag_file_id != null));
  if (withId.length) {
    return withId.map((o) => ({
      file_id: String(o.rag_file_id ?? o.file_id),
      filename: o.filename || o.rag_filename || 'RAG',
    }));
  }
  if (singleFileId && out.length) {
    return out.map((o) => ({
      file_id: String(singleFileId),
      filename: o.filename || o.rag_filename || 'RAG',
    }));
  }
  return [];
});

/** 難度、題型、chunk 參數（共用） */
const filterDifficulty = ref('入門');
const filterQuestionType = ref('簡答題');
const chunkSize = ref(1000);
const chunkOverlap = ref(200);

watch(generateQuestionUnits, (units) => {
  const state = currentState.value;
  if (units.length && !state.generateQuestionFileId) {
    state.generateQuestionFileId = units[0].file_id;
  }
}, { immediate: true });

/** 有 RAG 資料時預設選第一個 tab */
watch(ragList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = list[0].file_id ?? list[0].id ?? list[0];
  }
}, { immediate: true });

/** 若後端回傳相對路徑，補上 API_BASE 成為可點擊的下載連結 */
function getDownloadUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_BASE.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

/** 載入 RAG 列表：GET /zip/rag 列出 Rag 表全部內容（與 GET /users 一樣回傳全部資料），每一筆一個 tab。 */
async function fetchRagList() {
  ragListLoading.value = true;
  ragListError.value = '';
  try {
    const res = await fetch(`${API_BASE}/zip/rag`, { method: 'GET' });
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

/** 畫面一打開就抓 GET /zip/rag，每一筆 RAG 一個 tab */
onMounted(() => {
  fetchRagList();
});

/** 呼叫 POST /zip/create-rag：僅傳入 person_id（Form 或 Header X-Person-Id），後端生成 file_id 並 insert 一筆到 Rag 表。回傳 rag_id、file_id、created_at。 */
const createRagLoading = ref(false);
const createRagError = ref('');
/** create-rag 成功回傳的 created_at，用於 tab 標籤（key = rag_id） */
const ragCreatedAtMap = ref({});
/** @returns {{ rag_id, file_id, created_at } | null} */
async function callCreateRagApi() {
  createRagLoading.value = true;
  createRagError.value = '';
  try {
    const personId = authStore.user?.person_id;
    const form = new URLSearchParams();
    if (personId != null) form.append('person_id', String(personId));
    const headers = {};
    if (personId != null) headers['X-Person-Id'] = String(personId);
    const res = await fetch(`${API_BASE}/zip/create-rag`, {
      method: 'POST',
      headers,
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const errBody = JSON.parse(text);
        msg = errBody.detail ?? errBody.message ?? msg;
        if (typeof msg !== 'string') msg = JSON.stringify(msg);
      } catch (_) {
        if (text) msg = text;
      }
      throw new Error(msg);
    }
    await fetchRagList();
    let result = null;
    if (text) {
      try {
        const data = JSON.parse(text);
        const ragId = data?.rag_id ?? data?.id ?? null;
        const fileId = data?.file_id ?? null;
        const createdAt = data?.created_at ?? null;
        if (ragId != null && createdAt != null) {
          ragCreatedAtMap.value = { ...ragCreatedAtMap.value, [String(ragId)]: createdAt };
        }
        result = { rag_id: ragId, file_id: fileId, created_at: createdAt };
      } catch {
        // 回傳非 JSON 時忽略
      }
    }
    return result;
  } catch (err) {
    createRagError.value = err.message || '請求失敗';
    return null;
  } finally {
    createRagLoading.value = false;
  }
}

/** 點「新增」：只加一個新 tab（不 call API），在該 tab 內點「建立RAG」才呼叫 create-rag */
function addNewTab() {
  const id = 'new-' + generateTabFileId();
  newTabIds.value = [...newTabIds.value, id];
  activeTabId.value = id;
  if (ragList.value.length === 0) showFormWhenNoData.value = true;
}

/** 建立 RAG：僅傳 person_id，由 API 回傳 file_id，成功後切到新 RAG tab 並移除「新增」tab */
async function onCreateRag() {
  const currentTabId = activeTabId.value;
  const result = await callCreateRagApi();
  if (result != null && result.file_id != null) {
    if (isNewTabId(currentTabId)) {
      newTabIds.value = newTabIds.value.filter((id) => id !== currentTabId);
    }
    activeTabId.value = result.file_id;
  }
}

/** 取得 RAG 顯示名稱（用於 tab 標籤）；create-rag 成功後優先顯示 created_at */
function getRagTabLabel(rag) {
  if (rag == null) return 'RAG';
  if (typeof rag === 'string') return ragCreatedAtMap.value[rag] ?? String(rag);
  if (typeof rag !== 'object') return String(rag);
  const id = rag.rag_id ?? rag.file_id ?? rag.id;
  const fromMap = id != null ? ragCreatedAtMap.value[String(id)] : undefined;
  return fromMap ?? rag.created_at ?? rag.filename ?? rag.name ?? rag.file_id ?? 'RAG';
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

/** 按下確定：上傳 ZIP（/zip/upload-zip）並取得 file_id、第二層資料夾清單 */
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
  try {
    const formData = new FormData();
    formData.append('file', state.uploadedZipFile);
    const personId = authStore.user?.person_id;
    if (personId != null) formData.append('person_id', String(personId));
    const headers = {};
    if (personId != null) headers['X-Person-Id'] = String(personId);
    const res = await fetch(`${API_BASE}/zip/upload-zip`, {
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
    state.zipSecondFolders = Array.isArray(data?.second_folders)
      ? data.second_folders
      : Array.isArray(data)
        ? data
        : [];
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

/** 按下確定：將 OpenAI API Key 上傳到資料庫（PUT /zip/llm-api-key） */
async function confirmSetLlmApiKey() {
  const state = currentState.value;
  const fileId = String(state.zipFileId ?? '').trim();
  const key = openaiApiKey.value?.trim();
  if (!fileId) {
    state.llmKeyError = '請先上傳 ZIP 檔取得 file_id';
    state.llmKeySuccess = '';
    return;
  }
  if (!key) {
    state.llmKeyError = '請輸入 OpenAI API Key';
    state.llmKeySuccess = '';
    return;
  }
  state.llmKeyLoading = true;
  state.llmKeyError = '';
  state.llmKeySuccess = '';
  try {
    const res = await fetch(`${API_BASE}/zip/llm-api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, openai_api_key: key }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 404) {
        state.llmKeyError = '該 file_id 在 RAG 表尚無紀錄，請先執行 Pack 產生 RAG 後再儲存 API Key。';
      } else {
        let msg = res.statusText;
        try {
          const errBody = JSON.parse(text);
          msg = errBody.detail ? JSON.stringify(errBody.detail) : msg;
        } catch (_) {
          if (text) msg = text;
        }
        state.llmKeyError = msg;
      }
      return;
    }
    state.llmKeySuccess = 'API Key 已成功寫入資料庫。';
  } catch (err) {
    state.llmKeyError = err.message || '上傳失敗';
  } finally {
    state.llmKeyLoading = false;
  }
}

/** 呼叫 /zip/pack */
async function confirmPack() {
  const state = currentState.value;
  const fileId = String(state.zipFileId ?? '').trim();
  const tasks = state.packTasks?.trim();
  if (!fileId) {
    state.packError = '請輸入 file_id（或先上傳 ZIP 取得）';
    return;
  }
  if (!tasks) {
    state.packError = '請輸入 tasks（例：220222+220301 或 220222,220301+220302）';
    return;
  }
  state.packLoading = true;
  state.packError = '';
  state.packResponseJson = null;
  try {
    const res = await fetch(`${API_BASE}/zip/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        tasks,
        with_rag: state.withRag,
        openai_api_key: openaiApiKey.value?.trim() || undefined,
        chunk_size: Number(chunkSize.value) || 1000,
        chunk_overlap: Number(chunkOverlap.value) || 200,
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
  } catch (err) {
    state.packError = err.message || '壓縮失敗';
    state.packResponseJson = null;
  } finally {
    state.packLoading = false;
  }
}

const difficultyOptions = ['入門', '進階', '困難'];
const questionTypeOptions = ['簡答題', '申論題', '選擇題'];

function addCard(question = null, hint = null, sourceFilename = null, referenceAnswer = null) {
  const state = currentState.value;
  const list = state.cardList;
  const q = question ?? (list.length > 0 ? list[0].question : defaultQuestion);
  const h = hint ?? (list.length > 0 ? list[0].hint : defaultHint);
  const refAns = referenceAnswer ?? (list.length > 0 ? list[0].referenceAnswer : '');
  state.cardList = [
    ...list,
    {
      id: nextCardId(),
      question: q,
      hint: h,
      referenceAnswer: refAns,
      sourceFilename: sourceFilename ?? null,
      answer: '',
      hintVisible: false,
      confirmed: false,
      gradingResult: '',
    },
  ];
}

/** 呼叫 /zip/generate-question */
async function generateQuestion() {
  const state = currentState.value;
  const fileId = state.generateQuestionFileId?.trim();
  const key = openaiApiKey.value?.trim();
  if (!fileId) {
    state.generateQuestionError = '請先選擇單元（需先執行 Pack 取得 RAG 壓縮檔）';
    return;
  }
  if (!key) {
    state.generateQuestionError = '請輸入 OpenAI API Key';
    return;
  }
  state.generateQuestionLoading = true;
  state.generateQuestionError = '';
  try {
    const res = await fetch(`${API_BASE}/zip/generate-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        openai_api_key: key,
        qtype: filterQuestionType.value,
        level: filterDifficulty.value,
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
    const questionContent = data.question_content ?? data.question ?? '';
    const hintText = data.hint ?? '';
    const answerText = data.answer ?? '';
    const selectedUnit = generateQuestionUnits.value.find((u) => u.file_id === fileId);
    const zipName = selectedUnit?.filename ?? '';
    if (questionContent) addCard(questionContent, hintText, zipName, answerText);
    else addCard(null, null, zipName, answerText);
  } catch (err) {
    state.generateQuestionError = err.message || '產生題目失敗';
  } finally {
    state.generateQuestionLoading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

async function confirmAnswer(item) {
  if (!item.answer.trim()) return;
  const key = openaiApiKey.value?.trim();
  if (!key) {
    item.confirmed = true;
    item.gradingResult = '請先在畫面上方輸入 OpenAI API Key 後再進行評分。';
    return;
  }
  const gradeZip = currentState.value.uploadedZipFile;
  if (!gradeZip) {
    item.confirmed = true;
    item.gradingResult = '評分需要參考講義：請先在「上傳 ZIP 檔」區塊上傳 RAG/講義 ZIP 後再進行評分。（或於伺服器放置 rag_db.zip）';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  try {
    const authStore = useAuthStore();
    const userId = authStore.user?.user_id ?? authStore.user?.id;
    const form = new FormData();
    form.append('file', gradeZip);
    form.append('question_text', item.question);
    form.append('student_answer', item.answer.trim());
    form.append('qtype', filterQuestionType.value);
    form.append('openai_api_key', key);
    if (userId != null && userId !== '') form.append('user_id', String(userId));
    const res = await fetch(`${API_BASE}/api/grade_submission`, {
      method: 'POST',
      body: form,
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
            pollRes = await fetch(`${API_BASE}/api/grade_result/${jobId}`);
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
}
</script>

<template>
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <div class="flex-grow-1 overflow-auto my-bgcolor-white p-4">
      <!-- 每個 tab = 一筆 /zip/rag 資料；「新增」= 只加新 tab，在該 tab 內點「建立RAG」才 call API -->
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
            新增
          </button>
        </template>
        <template v-else>
          <ul class="nav nav-tabs mb-0">
            <li v-for="rag in ragList" :key="'rag-' + (rag.file_id ?? rag.id ?? rag)" class="nav-item">
              <button
                type="button"
                class="nav-link"
                :class="{ active: activeTabId === (rag.file_id ?? rag.id ?? rag) }"
                @click="activeTabId = (rag.file_id ?? rag.id ?? String(rag))"
              >
                {{ getRagTabLabel(rag) }}
              </button>
            </li>
            <li v-for="(tid, idx) in newTabIds" :key="'new-' + tid" class="nav-item">
              <button
                type="button"
                class="nav-link"
                :class="{ active: activeTabId === tid }"
                @click="activeTabId = tid"
              >
                新增{{ newTabIds.length > 1 ? ' ' + (idx + 1) : '' }}
              </button>
            </li>
            <li class="nav-item ms-2 align-self-center">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                @click="addNewTab"
              >
                新增
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
      <div v-if="createRagError" class="alert alert-danger py-2 small mb-3">
        {{ createRagError }}
      </div>
      <!-- 僅在「新增」tab 顯示：建立 RAG 按鈕（僅傳 person_id，API 回傳 file_id 後切到該 RAG tab） -->
      <div v-if="isNewTabId(activeTabId)" class="my-bgcolor-gray-100 rounded text-start p-3 mb-3 d-flex align-items-center gap-2 flex-wrap">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="createRagLoading"
          @click="onCreateRag"
        >
          {{ createRagLoading ? '處理中...' : '建立RAG' }}
        </button>
      </div>
      <!-- 上傳 ZIP 檔：置頂 -->
      <div class="my-bgcolor-gray-100 rounded text-start p-4 mb-3">
        <div class="my-title-xs-gray mb-2">上傳 ZIP 檔</div>
        <p class="form-text text-muted small mb-2">支援 .pdf、.docx、.rmd／.r、.html／.htm</p>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <input
            type="file"
            accept=".zip"
            class="form-control form-control-sm"
            style="max-width: 240px;"
            :disabled="currentState.zipLoading"
            @change="onZipChange"
          >
          <span v-if="currentState.zipFileName" class="my-content-sm-black">{{ currentState.zipFileName }}</span>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="!currentState.uploadedZipFile || currentState.zipLoading"
            @click="confirmUploadZip"
          >
            {{ currentState.zipLoading ? '上傳中...' : '確定' }}
          </button>
        </div>
        <div v-if="currentState.zipError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ currentState.zipError }}
        </div>
        <div v-if="currentState.zipFileId" class="mt-2">
          <span class="my-title-xs-gray">file_id：</span>
          <code class="my-content-sm-black">{{ currentState.zipFileId }}</code>
        </div>
        <div v-if="currentState.zipSecondFolders.length > 0" class="mt-3">
          <div class="my-title-xs-gray mb-2">ZIP 內第二層資料夾名稱：</div>
          <ul class="list-group list-group-flush small">
            <li
              v-for="(name, i) in currentState.zipSecondFolders"
              :key="i"
              class="list-group-item py-1 px-2 my-bgcolor-gray-50"
            >
              {{ name }}
            </li>
          </ul>
        </div>
        <div v-if="currentState.zipResponseJson !== null" class="mt-3">
          <div class="my-title-xs-gray mb-2">API 完整回傳 JSON：</div>
          <pre class="my-bgcolor-gray-50 rounded p-3 small text-start overflow-auto mb-0" style="max-height: 320px;">{{ JSON.stringify(currentState.zipResponseJson, null, 2) }}</pre>
        </div>
      </div>
      <!-- 全畫面共用的 OpenAI API Key（放在上傳 ZIP 檔下面） -->
      <div class="my-bgcolor-gray-100 rounded text-start p-4 mb-3">
        <div class="my-title-xs-gray mb-2">OpenAI API Key</div>
        <p class="form-text text-muted small mb-2">本頁共用（Pack、產生題目、評分）。依上傳 ZIP 取得的 file_id 可將 API Key 寫入 RAG 表。</p>
        <div v-if="currentState.zipFileId" class="mb-2">
          <span class="my-title-xs-gray">file_id：</span>
          <code class="my-content-sm-black">{{ currentState.zipFileId }}</code>
        </div>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <div style="max-width: 400px;">
            <input
              v-model="openaiApiKey"
              type="password"
              class="form-control form-control-sm"
              placeholder="請輸入 OpenAI API Key"
              autocomplete="off"
            >
          </div>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="currentState.llmKeyLoading || !String(currentState.zipFileId ?? '').trim() || !openaiApiKey?.trim()"
            @click="confirmSetLlmApiKey"
          >
            {{ currentState.llmKeyLoading ? '上傳中...' : '確定' }}
          </button>
        </div>
        <div v-if="currentState.llmKeyError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ currentState.llmKeyError }}
        </div>
        <div v-if="currentState.llmKeySuccess" class="alert alert-success mt-2 mb-0 py-2 small">
          {{ currentState.llmKeySuccess }}
        </div>
      </div>
      <!-- 壓縮資料夾 (Pack) 與 RAG -->
      <div class="my-bgcolor-gray-100 rounded text-start p-4 mb-3">
        <div class="my-title-xs-gray mb-2">壓縮資料夾 (Pack) 與 RAG</div>
          <p class="form-text text-muted small mb-2">依 file_id、tasks 壓縮指定資料夾，可一併產生 RAG。tasks：逗號=多個 ZIP，加號=同檔內多資料夾，例 <code>220222+220301</code>、<code>220222,220301+220302</code>。</p>
          <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
            <div style="min-width: 200px;">
              <label class="form-label my-title-xs-gray mb-1">file_id</label>
              <input
                v-model="currentState.zipFileId"
                type="text"
                class="form-control form-control-sm"
                placeholder="上傳成功後自動帶入或手動輸入"
              >
            </div>
            <div class="flex-grow-1" style="min-width: 240px;">
              <label class="form-label my-title-xs-gray mb-1">tasks</label>
              <input
                v-model="currentState.packTasks"
                type="text"
                class="form-control form-control-sm"
                placeholder="例：220222+220301"
              >
            </div>
            <div class="d-flex align-items-center">
              <input
                :id="`with-rag-check-${activeTabId}`"
                v-model="currentState.withRag"
                type="checkbox"
                class="form-check-input me-2"
              >
              <label :for="`with-rag-check-${activeTabId}`" class="form-check-label my-title-xs-gray mb-0">一併產生 RAG</label>
            </div>
            <div style="width: 100px;">
              <label class="form-label my-title-xs-gray mb-1">chunk_size</label>
              <input
                v-model.number="chunkSize"
                type="number"
                min="1"
                class="form-control form-control-sm"
                placeholder="1000"
              >
            </div>
            <div style="width: 100px;">
              <label class="form-label my-title-xs-gray mb-1">chunk_overlap</label>
              <input
                v-model.number="chunkOverlap"
                type="number"
                min="0"
                class="form-control form-control-sm"
                placeholder="200"
              >
            </div>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="currentState.packLoading"
              @click="confirmPack"
            >
              {{ currentState.packLoading ? '處理中...' : '執行 Pack' }}
            </button>
          </div>
          <div v-if="currentState.packError" class="alert alert-danger py-2 small mb-2">
            {{ currentState.packError }}
          </div>
          <!-- 每個 output：壓縮檔下載 + RAG 下載連結 -->
          <div v-if="packOutputs.length > 0" class="mt-3">
            <div class="my-title-xs-gray mb-2">下載連結（每個 ZIP 對應一組壓縮檔 + RAG 檔）</div>
            <div class="table-responsive">
              <table class="table table-sm table-bordered small">
                <thead class="table-light">
                  <tr>
                    <th>壓縮檔</th>
                    <th>壓縮檔下載</th>
                    <th>RAG 檔</th>
                    <th>RAG 下載</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(out, idx) in packOutputs" :key="idx">
                    <td>{{ out.filename }}</td>
                    <td>
                      <a v-if="out.download_url" :href="getDownloadUrl(out.download_url)" target="_blank" rel="noopener">下載</a>
                      <span v-else class="text-muted">—</span>
                    </td>
                    <td>{{ out.rag_filename || '—' }}</td>
                    <td>
                      <a v-if="out.rag_download_url" :href="getDownloadUrl(out.rag_download_url)" target="_blank" rel="noopener">下載</a>
                      <span v-else-if="out.rag_error" class="text-danger" :title="out.rag_error">失敗</span>
                      <span v-else class="text-muted">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-if="currentState.packResponseJson !== null" class="mt-2">
            <div class="my-title-xs-gray mb-1">Pack API 完整回傳：</div>
            <pre class="my-bgcolor-gray-50 rounded p-3 small text-start overflow-auto mb-0" style="max-height: 240px;">{{ typeof currentState.packResponseJson === 'string' ? currentState.packResponseJson : JSON.stringify(currentState.packResponseJson, null, 2) }}</pre>
          </div>
      </div>
      <div class="my-bgcolor-gray-100 rounded text-start p-4 mb-3">
        <div class="my-title-xs-gray mb-2">RAG 產生題目</div>
        <p class="form-text text-muted small mb-2">選單元（Pack 結果）、難度、題型後按「產生題目」。</p>
        <div class="d-flex flex-wrap align-items-end gap-3">
          <div>
            <label class="form-label my-title-xs-gray mb-1">選擇單元（壓縮檔名）</label>
            <select v-model="currentState.generateQuestionFileId" class="form-select form-select-sm">
              <option value="">— 請先執行 Pack —</option>
              <option
                v-for="(opt, idx) in generateQuestionUnits"
                :key="idx"
                :value="opt.file_id"
              >
                {{ opt.filename }}
              </option>
            </select>
          </div>
          <div>
            <label class="form-label my-title-xs-gray mb-1">難度</label>
            <select v-model="filterDifficulty" class="form-select form-select-sm">
              <option v-for="opt in difficultyOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="form-label my-title-xs-gray mb-1">題型</label>
            <select v-model="filterQuestionType" class="form-select form-select-sm">
              <option v-for="opt in questionTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="currentState.generateQuestionLoading || !currentState.generateQuestionFileId"
            @click="generateQuestion"
          >
            {{ currentState.generateQuestionLoading ? '產生中...' : '產生題目' }}
          </button>
        </div>
        <div v-if="currentState.generateQuestionError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ currentState.generateQuestionError }}
        </div>
      </div>
      <template v-if="currentState.cardList.length === 0">
      </template>
      <template v-else>
        <div
          v-for="(item, idx) in currentState.cardList"
          :key="item.id"
          class="card mb-3"
        >
          <div class="card-header py-2">
            <span class="my-title-sm-black mb-0">第 {{ idx + 1 }} 題</span>
          </div>
          <div class="card-body text-start">
            <div class="mb-3">
              <div class="my-title-xs-gray mb-1">題目</div>
              <div class="my-content-sm-black">
                <span v-if="item.sourceFilename" class="text-muted">[{{ item.sourceFilename }}] </span>{{ item.question }}
              </div>
            </div>
            <div class="mb-3">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary py-0"
                @click="toggleHint(item)"
              >
                {{ item.hintVisible ? '隱藏提示' : '顯示提示' }}
              </button>
              <div v-show="item.hintVisible" class="rounded my-bgcolor-gray-100 my-title-xs-gray mt-2 p-2">
                {{ item.hint }}
              </div>
            </div>
            <div v-if="item.referenceAnswer" class="mb-3">
              <div class="my-title-xs-gray mb-1">參考答案</div>
              <div class="rounded my-bgcolor-gray-100 my-content-sm-black p-2">
                {{ item.referenceAnswer }}
              </div>
            </div>
            <div class="mb-3">
              <label :for="`answer-${item.id}`" class="form-label my-title-xs-gray mb-1">回答</label>
              <template v-if="!item.confirmed">
                <textarea
                  :id="`answer-${item.id}`"
                  v-model="item.answer"
                  class="form-control"
                  rows="4"
                  placeholder="請輸入您的回答..."
                  maxlength="2000"
                />
                <div class="form-text">{{ item.answer.length }} / 2000</div>
                <div class="d-flex gap-2 mt-2">
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="rewriteAnswer(item)">
                    重寫
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    :disabled="!item.answer.trim()"
                    @click="confirmAnswer(item)"
                  >
                    確定
                  </button>
                </div>
              </template>
              <template v-else>
                <div class="rounded my-bgcolor-gray-100 my-content-sm-black mb-2 p-2">{{ item.answer }}</div>
                <div class="d-flex gap-2 mb-3">
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="rewriteAnswer(item)">
                    重寫
                  </button>
                </div>
              </template>
            </div>
            <div class="border rounded my-bgcolor-gray-50 p-3">
              <div class="my-title-xs-gray mb-1">批改結果</div>
              <div class="my-content-sm-black" style="white-space: pre-wrap;">{{ item.gradingResult || '尚未批改' }}</div>
            </div>
          </div>
        </div>
      </template>
      <div class="button" role="button" tabindex="0" @click="addCard">產生題目</div>
      </template>
    </div>
  </div>
</template>
