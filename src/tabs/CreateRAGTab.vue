<script setup>
/** 建立 RAG 分頁。每個分頁有唯一 tabId，card 列表含題目、提示、回答與唯一 id。 */
import { ref, computed, watch } from 'vue';

defineProps({
  tabId: { type: String, required: true },
});

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** 預設題目／提示（產生第一題時使用） */
const defaultQuestion = '什麼是空間分析（Spatial Analysis）？請簡述其在地理資訊系統中的應用和重要性。';
const defaultHint = '空間分析是一組技術和方法，用於分析地理數據中的空間模式和關係。它可以幫助解決與位置相關的問題，並在城市規劃、環境管理和資源分配等領域中具有重要應用。';

/** 每個 card：{ id, question, hint, referenceAnswer, answer, hintVisible, confirmed, gradingResult }；預設無題目 */
const cardList = ref([]);

/** 後端網址。同源（localhost / Vercel）時用相對路徑，經 proxy/rewrites 轉發，避免 CORS */
const API_ORIGIN = 'https://aiquiz-backend-z4mo.onrender.com';
const API_BASE =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.origin.includes('vercel.app'))
    ? ''
    : API_ORIGIN;

/** 上傳的 zip 檔案 */
const uploadedZipFile = ref(null);
const zipFileName = ref('');

/** ZIP 上傳 API：第二層資料夾清單、完整回傳 JSON、載入中、錯誤訊息 */
const zipSecondFolders = ref([]);
const zipResponseJson = ref(null);
const zipLoading = ref(false);
const zipError = ref('');

/** Pack Folders：上傳後取得的 file_id、tasks、是否一併產生 RAG、OpenAI API key、完整回傳、載入中、錯誤 */
const zipFileId = ref('');
const packTasks = ref('');
const withRag = ref(true);
const openaiApiKey = ref('');
const packResponseJson = ref(null);
const packLoading = ref(false);
const packError = ref('');

/** Pack 回傳的 outputs 陣列，供表格顯示每個 ZIP 的壓縮檔與 RAG 下載連結 */
const packOutputs = computed(() => {
  const data = packResponseJson.value;
  if (!data || typeof data !== 'object') return [];
  return Array.isArray(data.outputs) ? data.outputs : [];
});

/** 產生題目：選擇單元 = 壓縮檔名下拉（來自 Pack 的 outputs，顯示 filename 如 220222.zip，非 RAG 名） */
const generateQuestionUnits = computed(() => {
  const data = packResponseJson.value;
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
const generateQuestionFileId = ref('');
const generateQuestionLoading = ref(false);
const generateQuestionError = ref('');

watch(generateQuestionUnits, (units) => {
  if (units.length && !generateQuestionFileId.value) {
    generateQuestionFileId.value = units[0].file_id;
  }
}, { immediate: true });

/** 若後端回傳相對路徑，補上 API_BASE 成為可點擊的下載連結 */
function getDownloadUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_BASE.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

function onZipChange(e) {
  const file = e.target.files?.[0];
  if (file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      uploadedZipFile.value = null;
      zipFileName.value = '';
      zipSecondFolders.value = [];
      zipResponseJson.value = null;
      zipFileId.value = '';
      zipError.value = '請選擇 .zip 檔案';
      return;
    }
    uploadedZipFile.value = file;
    zipFileName.value = file.name;
    zipSecondFolders.value = [];
    zipResponseJson.value = null;
    zipError.value = '';
  } else {
    uploadedZipFile.value = null;
    zipFileName.value = '';
    zipSecondFolders.value = [];
    zipResponseJson.value = null;
    zipFileId.value = '';
    zipError.value = '';
  }
}

/** 按下確定：上傳 ZIP 並取得第二層資料夾清單 */
async function confirmUploadZip() {
  if (!uploadedZipFile.value) {
    zipError.value = '請先選擇 ZIP 檔案';
    return;
  }
    zipLoading.value = true;
  zipError.value = '';
  zipSecondFolders.value = [];
  zipResponseJson.value = null;
  zipFileId.value = '';
  try {
    const formData = new FormData();
    formData.append('file', uploadedZipFile.value);
    const res = await fetch(`${API_BASE}/zip/second-folders`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(`${res.status}: ${msg}`);
    }
    const data = await res.json();
    // 後端回傳 { file_id?, filename?, second_folders: [...] }
    zipResponseJson.value = data;
    if (data?.file_id != null) zipFileId.value = String(data.file_id);
    zipSecondFolders.value = Array.isArray(data?.second_folders)
      ? data.second_folders
      : Array.isArray(data)
        ? data
        : [];
  } catch (err) {
    const is504 = err.message?.includes('504') || (err.name === 'TypeError' && err.message?.includes('Failed to fetch'));
    zipError.value = is504
      ? '後端正在啟動中（約需 1 分鐘），請稍後再試一次'
      : err.message || '上傳失敗';
    zipSecondFolders.value = [];
    zipResponseJson.value = null;
  } finally {
    zipLoading.value = false;
  }
}

/** 呼叫 /zip/pack：依 file_id 與 tasks 壓縮指定資料夾，回傳新 file_id、filename 等 */
async function confirmPack() {
  const fileId = zipFileId.value?.trim();
  const tasks = packTasks.value?.trim();
  if (!fileId) {
    packError.value = '請輸入 file_id（或先上傳 ZIP 取得）';
    return;
  }
  if (!tasks) {
    packError.value = '請輸入 tasks（例：220222+220301 或 220222,220301+220302）';
    return;
  }
  packLoading.value = true;
  packError.value = '';
  packResponseJson.value = null;
  try {
    const res = await fetch(`${API_BASE}/zip/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        tasks,
        with_rag: withRag.value,
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
      packResponseJson.value = text ? JSON.parse(text) : null;
    } catch (_) {
      packResponseJson.value = text;
    }
  } catch (err) {
    packError.value = err.message || '壓縮失敗';
    packResponseJson.value = null;
  } finally {
    packLoading.value = false;
  }
}

/** RAG 分塊參數 */
const chunkSize = ref(1000);
const chunkOverlap = ref(200);

/** 難度、題型（用於 RAG 產生題目 API） */
const filterDifficulty = ref('入門');
const filterQuestionType = ref('簡答題');

const difficultyOptions = ['入門', '進階', '困難'];
const questionTypeOptions = ['簡答題', '申論題', '選擇題'];

function addCard(question = null, hint = null, sourceFilename = null, referenceAnswer = null) {
  const q = question ?? (cardList.value.length > 0 ? cardList.value[0].question : defaultQuestion);
  const h = hint ?? (cardList.value.length > 0 ? cardList.value[0].hint : defaultHint);
  const refAns = referenceAnswer ?? (cardList.value.length > 0 ? cardList.value[0].referenceAnswer : '');
  cardList.value = [
    ...cardList.value,
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

/** 呼叫 /zip/generate-question：依 RAG file_id 產生題目，使用同一 OpenAI API Key */
async function generateQuestion() {
  const fileId = generateQuestionFileId.value?.trim();
  const key = openaiApiKey.value?.trim();
  if (!fileId) {
    generateQuestionError.value = '請先選擇單元（需先執行 Pack 取得 RAG 壓縮檔）';
    return;
  }
  if (!key) {
    generateQuestionError.value = '請輸入 OpenAI API Key';
    return;
  }
  generateQuestionLoading.value = true;
  generateQuestionError.value = '';
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
    generateQuestionError.value = err.message || '產生題目失敗';
  } finally {
    generateQuestionLoading.value = false;
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
    item.gradingResult = '請先在「Pack Folders」區塊輸入 OpenAI API Key 後再進行評分。';
    return;
  }
  const gradeZip = uploadedZipFile.value;
  if (!gradeZip) {
    item.confirmed = true;
    item.gradingResult = '評分需要參考講義：請先在「上傳 ZIP 檔」區塊上傳 RAG/講義 ZIP 後再進行評分。（或於伺服器放置 rag_db.zip）';
    return;
  }
  item.confirmed = true;
  item.gradingResult = '批改中...';
  try {
    const form = new FormData();
    form.append('file', gradeZip);
    form.append('question_text', item.question);
    form.append('student_answer', item.answer.trim());
    form.append('qtype', filterQuestionType.value);
    form.append('openai_api_key', key);
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
          item.gradingResult = `評分失敗：${pollData.error || '未知錯誤'}`;
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
      <div class="my-bgcolor-gray-100 rounded text-start p-4 mb-3">
        <div class="my-title-xs-gray mb-2">上傳 ZIP 檔</div>
        <p class="form-text text-muted small mb-2">
          ZIP 內僅可包含以下類型檔案：.pdf、.docx、.rmd／.r、.html／.htm
        </p>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <input
            type="file"
            accept=".zip"
            class="form-control form-control-sm"
            style="max-width: 240px;"
            :disabled="zipLoading"
            @change="onZipChange"
          >
          <span v-if="zipFileName" class="my-content-sm-black">{{ zipFileName }}</span>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="!uploadedZipFile || zipLoading"
            @click="confirmUploadZip"
          >
            {{ zipLoading ? '上傳中...' : '確定' }}
          </button>
        </div>
        <div v-if="zipError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ zipError }}
        </div>
        <div v-if="zipSecondFolders.length > 0" class="mt-3">
          <div class="my-title-xs-gray mb-2">ZIP 內第二層資料夾名稱：</div>
          <ul class="list-group list-group-flush small">
            <li
              v-for="(name, i) in zipSecondFolders"
              :key="i"
              class="list-group-item py-1 px-2 my-bgcolor-gray-50"
            >
              {{ name }}
            </li>
          </ul>
        </div>
        <div v-if="zipResponseJson !== null" class="mt-3">
          <div class="my-title-xs-gray mb-2">API 完整回傳 JSON：</div>
          <pre class="my-bgcolor-gray-50 rounded p-3 small text-start overflow-auto mb-0" style="max-height: 320px;">{{ JSON.stringify(zipResponseJson, null, 2) }}</pre>
        </div>
        <div class="mt-4 pt-3 border-top">
          <div class="my-title-xs-gray mb-2">壓縮資料夾 (Pack) 與 RAG</div>
          <p class="form-text text-muted small mb-2">
            依 file_id 與 tasks 抽出指定資料夾壓成 ZIP；勾選「一併產生 RAG」時，每個 ZIP 會再產生 FAISS 向量庫 ZIP 並提供下載連結。tasks 格式：逗號分隔多個輸出，加號為同一檔內多個資料夾。例：<code>220222+220301</code> → 一個 ZIP；<code>220222,220301+220302</code> → 兩個 ZIP。
          </p>
          <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
            <div style="min-width: 200px;">
              <label class="form-label my-title-xs-gray mb-1">file_id</label>
              <input
                v-model="zipFileId"
                type="text"
                class="form-control form-control-sm"
                placeholder="上傳成功後自動帶入或手動輸入"
              >
            </div>
            <div class="flex-grow-1" style="min-width: 240px;">
              <label class="form-label my-title-xs-gray mb-1">tasks</label>
              <input
                v-model="packTasks"
                type="text"
                class="form-control form-control-sm"
                placeholder="例：220222+220301"
              >
            </div>
            <div class="d-flex align-items-center">
              <input
                id="with-rag-check"
                v-model="withRag"
                type="checkbox"
                class="form-check-input me-2"
              >
              <label for="with-rag-check" class="form-check-label my-title-xs-gray mb-0">一併產生 RAG</label>
            </div>
            <div style="min-width: 280px;">
              <label class="form-label my-title-xs-gray mb-1">OpenAI API Key</label>
              <input
                v-model="openaiApiKey"
                type="password"
                class="form-control form-control-sm"
                placeholder="用於 RAG 嵌入的 OpenAI API Key"
                autocomplete="off"
              >
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
              :disabled="packLoading"
              @click="confirmPack"
            >
              {{ packLoading ? '處理中...' : '執行 Pack' }}
            </button>
          </div>
          <div v-if="packError" class="alert alert-danger py-2 small mb-2">
            {{ packError }}
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
          <div v-if="packResponseJson !== null" class="mt-2">
            <div class="my-title-xs-gray mb-1">Pack API 完整回傳：</div>
            <pre class="my-bgcolor-gray-50 rounded p-3 small text-start overflow-auto mb-0" style="max-height: 240px;">{{ typeof packResponseJson === 'string' ? packResponseJson : JSON.stringify(packResponseJson, null, 2) }}</pre>
          </div>
        </div>
      </div>
      <div class="my-bgcolor-gray-100 rounded text-start p-4 mb-3">
        <div class="my-title-xs-gray mb-2">RAG 產生題目</div>
        <p class="form-text text-muted small mb-2">
          使用上方輸入的 OpenAI API Key。選擇單元 = 壓縮檔名（來自 Pack 結果），選難度與題型後按「產生題目」。
        </p>
        <div class="d-flex flex-wrap align-items-end gap-3">
          <div>
            <label class="form-label my-title-xs-gray mb-1">選擇單元（壓縮檔名）</label>
            <select v-model="generateQuestionFileId" class="form-select form-select-sm">
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
            :disabled="generateQuestionLoading || !generateQuestionFileId"
            @click="generateQuestion"
          >
            {{ generateQuestionLoading ? '產生中...' : '產生題目' }}
          </button>
        </div>
        <div v-if="generateQuestionError" class="alert alert-danger mt-2 mb-0 py-2 small">
          {{ generateQuestionError }}
        </div>
      </div>
      <template v-if="cardList.length === 0">
      </template>
      <template v-else>
        <div
          v-for="(item, idx) in cardList"
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
    </div>
  </div>
</template>
