/**
 * RAG 相關 API 呼叫模組
 *
 * 集中封裝 tab/create、tab/upload-zip、tab/build-rag-zip、tab/quiz/create、PUT tab/tab-name（分頁更名）、設為試題用（system-settings）、tab/delete 等
 * 使用 loggedFetch（會輸出回應內容），錯誤時以 parseFetchError 解析並 throw Error，供呼叫端 catch 顯示。
 */
import {
  API_BASE,
  API_CREATE_UNIT,
  API_UPLOAD_ZIP,
  API_RAG_DELETE,
  API_RAG_UNIT_NAME,
  API_BUILD_RAG_ZIP,
  API_GENERATE_QUIZ,
  API_PUT_RAG_FOR_EXAM_DEPLOY,
  API_PUT_RAG_FOR_EXAM_LOCALHOST,
  isFrontendLocalHost,
} from '../constants/api.js';
import { parseBuildRagZipError, parseFetchError } from '../utils/apiError.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { quizLevelStringForApi } from '../utils/rag.js';

/**
 * 從 authStore 取得目前使用者的 person_id
 * @param {object} authStore - Pinia auth store 實例
 * @returns {string | null} 未登入或無 person_id 時為 null
 */
export function getPersonId(authStore) {
  const id = authStore.user?.person_id;
  if (id == null || String(id).trim() === '') return null;
  return String(id);
}

/** 解析 JSON，失敗時回傳空物件（內部用） */
function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * Create Tab：POST /rag/tab/create（僅建立一筆 Rag；system_prompt_instruction 請於 tab/build-rag-zip 傳入）
 * @param {string} personId
 * @param {string} ragTabId
 * @param {string} tabName
 * @returns {Promise<object>} rag_id、rag_tab_id、person_id、tab_name、local、created_at
 */
export async function apiCreateUnit(personId, ragTabId, tabName) {
  const res = await loggedFetch(`${API_BASE}${API_CREATE_UNIT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rag_tab_id: ragTabId,
      person_id: personId,
      tab_name: tabName,
      local: isFrontendLocalHost(),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 上傳教材檔：POST /rag/tab/upload-zip（需先 tab/create）
 * @param {File} file - .pdf、.doc、.docx、.ppt、.pptx 等後端可解析格式
 * @param {string} ragTabId
 * @param {string} personId
 * @returns {Promise<object>} 後端回傳的 file_metadata
 */
export async function apiUploadZip(file, ragTabId, personId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('rag_tab_id', String(ragTabId));
  formData.append('person_id', String(personId));
  const res = await loggedFetch(`${API_BASE}${API_UPLOAD_ZIP}`, {
    method: 'POST',
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 刪除 RAG：POST /rag/tab/delete/{rag_tab_id}（後端依連線／session 識別 person，不需 X-Person-Id）
 * @param {string} ragTabId
 */
export async function apiDeleteRag(ragTabId) {
  const res = await loggedFetch(`${API_BASE}${API_RAG_DELETE}/${encodeURIComponent(String(ragTabId))}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseFetchError(res, text));
  }
}

/**
 * 更新 RAG 分頁名稱：PUT /rag/tab/tab-name（以 rag_id 比對，僅 deleted=false）
 * @param {string | number} ragId - Rag 主鍵
 * @param {string} tabName
 * @returns {Promise<object>} rag_id、rag_tab_id、person_id、tab_name、updated_at
 */
export async function apiUpdateRagTabName(ragId, tabName) {
  const rid = Number(ragId);
  if (!Number.isInteger(rid) || rid < 1) {
    throw new Error('無效的 rag_id（須為正整數）');
  }
  const res = await loggedFetch(`${API_BASE}${API_RAG_UNIT_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rag_id: rid,
      tab_name: String(tabName).trim(),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

function ragForExamSettingPath() {
  return isFrontendLocalHost() ? API_PUT_RAG_FOR_EXAM_LOCALHOST : API_PUT_RAG_FOR_EXAM_DEPLOY;
}

/**
 * 從 GET /system-settings/rag-for-exam-* 回傳解析試題用 rag_id（支援 rag_id、value）
 * @param {object | null} data
 * @returns {number | null}
 */
export function parseRagIdFromRagForExamSettingPayload(data) {
  if (data == null || typeof data !== 'object') return null;
  const raw = data.rag_id ?? data.value;
  if (raw === '' || raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /system-settings/rag-for-exam-localhost 或 rag-for-exam-deploy（依前端網址）
 * @returns {Promise<object>}
 */
export async function apiGetRagForExamSetting() {
  const res = await loggedFetch(`${API_BASE}${ragForExamSettingPath()}`, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 設為試題用或清空：PUT 同上。body.rag_id 為正整數；清空傳 rag_id 空字串。
 * @param {string | number | null | undefined} ragId - 傳 null／undefined／'' 表示取消試題用設定
 */
export async function apiSetRagForExam(ragId) {
  const clear = ragId == null || ragId === '';
  let body;
  if (clear) {
    body = { rag_id: '' };
  } else {
    const n = Number(ragId);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('無效的 rag_id（須為正整數）');
    }
    body = { rag_id: n };
  }
  const res = await loggedFetch(`${API_BASE}${ragForExamSettingPath()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseFetchError(res, text));
  }
}

/**
 * 建 RAG ZIP：POST /rag/tab/build-rag-zip
 * @param {object} body - 含 rag_tab_id, person_id, unit_list, chunk_size, chunk_overlap, system_prompt_instruction 等
 * @returns {Promise<object | string>} 後端回傳的 JSON 或原始文字
 */
export async function apiBuildRagZip(body) {
  const res = await loggedFetch(`${API_BASE}${API_BUILD_RAG_ZIP}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseBuildRagZipError(res, text));
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/**
 * 產生題目：POST /rag/tab/quiz/create（與 OpenAPI 範例一致：四欄皆送出，選填欄可為 ""）
 * @param {string | number} ragId - Rag 表主鍵
 * @param {string | number | null | undefined} [ragTabId] - 選填；空則傳 ""
 * @param {string | number} quizLevel - 「基礎」／「進階」，或舊版 0／1
 * @param {string | null | undefined} [unitName] - 選填；空字串則後端依 outputs 用第一筆
 * @returns {Promise<object>} 含 quiz_content、quiz_hint、quiz_answer_reference、rag_quiz_id 等
 */
export async function apiGenerateQuiz(ragId, ragTabId, quizLevel, unitName) {
  const rid = Number(ragId);
  if (!Number.isFinite(rid) || rid < 1) {
    throw new Error('無效的 rag_id（須為 Rag 表主鍵正整數）');
  }
  const tid =
    ragTabId != null && String(ragTabId).trim() !== '' ? String(ragTabId).trim() : '';
  const un = unitName != null ? String(unitName).trim() : '';
  const body = {
    rag_id: rid,
    rag_tab_id: tid,
    quiz_level: quizLevelStringForApi(quizLevel),
    unit_name: un,
  };
  const res = await loggedFetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 判斷是否為 504 或網路錯誤（Failed to fetch）
 * 用於 UI 顯示「逾時或服務喚醒中」等友善訊息
 * @param {Error} [err]
 * @returns {boolean}
 */
export function is504OrNetworkError(err) {
  return err?.message?.includes('504') || (err?.name === 'TypeError' && err?.message?.includes('Failed to fetch'));
}
