/**
 * RAG 相關 API 呼叫模組
 *
 * 集中封裝 create-rag、upload-zip、build-rag-zip、generate-quiz、for-exam、delete 等
 * 使用 fetch，錯誤時以 parseFetchError 解析並 throw Error，供呼叫端 catch 顯示。
 */
import { API_BASE, API_CREATE_RAG, API_UPLOAD_ZIP, API_BUILD_RAG_ZIP, API_GENERATE_QUIZ, API_RAG_FOR_EXAM } from '../constants/api.js';
import { parseFetchError } from '../utils/apiError.js';

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
 * 建立 RAG：POST /rag/create-rag
 * @param {string} personId
 * @param {string} ragTabId
 * @param {string} ragName
 * @returns {Promise<object>} 後端回傳的 RAG 資料（rag_id、rag_tab_id 等）
 */
export async function apiCreateRag(personId, ragTabId, ragName) {
  const res = await fetch(`${API_BASE}${API_CREATE_RAG}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rag_tab_id: ragTabId, person_id: personId, rag_name: ragName }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 上傳 ZIP：POST /rag/upload-zip（需先 create-rag）
 * @param {File} file - ZIP 檔案
 * @param {string} ragTabId
 * @param {string} personId
 * @returns {Promise<object>} 後端回傳的 file_metadata
 */
export async function apiUploadZip(file, ragTabId, personId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('rag_tab_id', String(ragTabId));
  formData.append('person_id', String(personId));
  const res = await fetch(`${API_BASE}${API_UPLOAD_ZIP}`, {
    method: 'POST',
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${parseFetchError(res, text)}`);
  return parseJson(text);
}

/**
 * 刪除 RAG：POST /rag/delete/{rag_tab_id}
 * @param {string} ragTabId
 * @param {string} personId - 以 X-Person-Id header 傳送
 */
export async function apiDeleteRag(ragTabId, personId) {
  const res = await fetch(`${API_BASE}/rag/delete/${encodeURIComponent(String(ragTabId))}`, {
    method: 'POST',
    headers: { 'X-Person-Id': String(personId) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseFetchError(res, text));
  }
}

/**
 * 設為試題用 RAG：PATCH /rag/for-exam/{rag_tab_id}
 * @param {string} ragTabId
 * @param {string} personId - 以 X-Person-Id header 傳送
 */
export async function apiSetRagForExam(ragTabId, personId) {
  const res = await fetch(`${API_BASE}${API_RAG_FOR_EXAM}/${encodeURIComponent(String(ragTabId))}`, {
    method: 'PATCH',
    headers: { 'X-Person-Id': String(personId) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseFetchError(res, text));
  }
}

/**
 * 建 RAG ZIP：POST /rag/build-rag-zip
 * @param {object} body - 含 rag_tab_id, person_id, rag_list, chunk_size, chunk_overlap, system_prompt_instruction 等
 * @returns {Promise<object | string>} 後端回傳的 JSON 或原始文字
 */
export async function apiBuildRagZip(body) {
  const res = await fetch(`${API_BASE}${API_BUILD_RAG_ZIP}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/**
 * 產生題目：POST /rag/generate-quiz
 * @param {string | number} ragId
 * @param {string | number} ragTabId
 * @param {number} quizLevel - 0 基礎 / 1 進階
 * @returns {Promise<object>} 含 quiz_content、quiz_hint、reference_answer 等
 */
export async function apiGenerateQuiz(ragId, ragTabId, quizLevel) {
  const res = await fetch(`${API_BASE}${API_GENERATE_QUIZ}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rag_id: Number(ragId) || 0,
      rag_tab_id: Number(ragTabId) || 0,
      quiz_level: quizLevel >= 0 ? quizLevel : 0,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const errBody = JSON.parse(text);
      msg = errBody.detail ? JSON.stringify(errBody.detail) : msg;
    } catch {
      if (text) msg = text;
    }
    throw new Error(msg);
  }
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
