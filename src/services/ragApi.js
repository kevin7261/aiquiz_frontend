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
  API_RAG_TAB_UNITS,
  API_RAG_TAB_UNIT_QUIZ_CREATE,
  API_RAG_TAB_UNIT_QUIZ_LLM_GENERATE,
  API_GENERATE_QUIZ,
  API_PUT_RAG_FOR_EXAM_DEPLOY,
  API_PUT_RAG_FOR_EXAM_LOCALHOST,
  isFrontendLocalHost,
} from '../constants/api.js';
import { formatBuildRagZipErrorDetail, parseBuildRagZipError, parseFetchError } from '../utils/apiError.js';
import { loggedFetch } from '../utils/loggedFetch.js';

const RETRY_500_DELAY_MS = 2000;

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
 * 建 RAG ZIP：POST /rag/tab/build-rag-zip（application/x-ndjson 串流；勿用 response.json() 讀 200 本文）
 *
 * @param {object} body - 含 rag_tab_id, person_id, unit_list, chunk_size, chunk_overlap, system_prompt_instruction 等（person_id 須與 query 一致）
 * @param {(ev: object) => void} [onStreamEvent] - 每收到一列事件即呼叫（start｜building.filename repack 工作檔｜unit.output 含 filename、repack_filename、rag_filename、file_size、rag_error｜complete）
 * @returns {Promise<object>} 成功時回傳與舊版 JSON 相容之物件（outputs、rag_tab_id、unit_list、built_ok 等）
 */
export async function apiBuildRagZip(body, onStreamEvent) {
  const personId = body?.person_id;
  if (personId == null || String(personId).trim() === '') {
    throw new Error('person_id 為必填');
  }

  const urlString = `${API_BASE}${API_BUILD_RAG_ZIP}`;
  let u;
  try {
    u = new URL(urlString);
  } catch {
    u = new URL(urlString, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  }
  u.searchParams.set('person_id', String(personId).trim());

  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };

  let res;
  try {
    res = await fetch(u.toString(), init);
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (e?.name === 'TypeError' && msg.includes('Failed to fetch')) {
      throw new Error(
        '無法連線至後端。開發預設直連本機 8000；請確認後端已啟動，且 CORS 允許目前頁面 origin。若要改經 dev 代理，請在 .env 設 VUE_APP_API_BASE 與目前頁面 origin 相同（如 http://localhost:8081）並參考 vue.config.js。'
      );
    }
    throw e;
  }

  while (res.status === 500) {
    await new Promise((r) => setTimeout(r, RETRY_500_DELAY_MS));
    res = await fetch(u.toString(), init);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseBuildRagZipError(res, text));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('無法讀取回應內容（此瀏覽器不支援串流）');
  }

  const dec = new TextDecoder();
  let buf = '';
  /** @type {object | null} */
  let lastComplete = null;

  const dispatch = (ev) => {
    // eslint-disable-next-line no-console -- NDJSON 串流除錯（事件順序／目前第幾個 ZIP）
    console.log('[build-rag-zip stream]', ev?.type, ev);
    if (typeof onStreamEvent === 'function') onStreamEvent(ev);
    if (ev && ev.type === 'complete') lastComplete = ev;
  };

  let chunk = await reader.read();
  while (!chunk.done) {
    buf += dec.decode(chunk.value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let ev;
      try {
        ev = JSON.parse(t);
      } catch (e) {
        throw new Error(`建置回應格式錯誤：${e?.message ?? e}`);
      }
      dispatch(ev);
    }
    chunk = await reader.read();
  }

  const tail = buf.trim();
  if (tail) {
    let ev;
    try {
      ev = JSON.parse(tail);
    } catch (e) {
      throw new Error(`建置回應格式錯誤：${e?.message ?? e}`);
    }
    dispatch(ev);
  }

  if (!lastComplete) {
    throw new Error('建置未完成：未收到完成事件');
  }

  if (!lastComplete.success) {
    const msg =
      lastComplete.message != null && String(lastComplete.message).trim() !== ''
        ? String(lastComplete.message).trim()
        : '建置失敗';
    const detail = {
      message: msg,
      outputs: lastComplete.outputs,
      source_rag_tab_id: lastComplete.source_rag_tab_id,
      unit_list: lastComplete.unit_list,
    };
    throw new Error(formatBuildRagZipErrorDetail(detail));
  }

  return {
    outputs: Array.isArray(lastComplete.outputs) ? lastComplete.outputs : [],
    rag_tab_id: lastComplete.source_rag_tab_id,
    unit_list: lastComplete.unit_list,
    total: lastComplete.total,
    built_ok: lastComplete.built_ok,
    built_failed: lastComplete.built_failed,
  };
}

/**
 * 依 rag_tab_id 列出該 tab 下所有未刪除 Rag_Unit（含 quizzes），依 created_at 舊→新。
 * GET /rag/tab/units?rag_tab_id=...&person_id=...
 * @param {string | number} ragTabId
 * @param {string | number} personId
 * @returns {Promise<object[]>}
 */
export async function apiGetRagTabUnits(ragTabId, personId) {
  const tabId = String(ragTabId ?? '').trim();
  const pid = String(personId ?? '').trim();
  if (!tabId) throw new Error('缺少 rag_tab_id');
  if (!pid) throw new Error('缺少 person_id');
  const url = new URL(`${API_BASE}${API_RAG_TAB_UNITS}`);
  url.searchParams.set('rag_tab_id', tabId);
  url.searchParams.set('person_id', pid);
  const res = await loggedFetch(url.toString(), { method: 'GET' });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  const data = parseJson(text);
  return Array.isArray(data) ? data : (Array.isArray(data?.units) ? data.units : []);
}

/**
 * 建立空白 Rag_Quiz（不呼叫 LLM）：POST /rag/tab/unit/quiz/create；query person_id（必填）
 * Body：{ rag_tab_id, rag_unit_id }；回應會帶出 rag_quiz_id。
 * LLM 出題請改呼叫 {@link apiRagUnitQuizLlmGenerate}。
 * @param {{ rag_tab_id: string, rag_unit_id: number }} body
 */
export async function apiCreateRagUnitQuiz(body, personId) {
  const pid = String(personId ?? '').trim();
  if (!pid) throw new Error('person_id 為必填');
  const tid = body?.rag_tab_id != null ? String(body.rag_tab_id).trim() : '';
  const uid =
    body?.rag_unit_id != null && body.rag_unit_id !== ''
      ? Number(body.rag_unit_id)
      : 0;
  if (!tid) throw new Error('缺少 rag_tab_id');
  if (!Number.isFinite(uid) || uid < 0) throw new Error('無效的 rag_unit_id');
  const res = await loggedFetch(`${API_BASE}${API_RAG_TAB_UNIT_QUIZ_CREATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rag_tab_id: tid,
      rag_unit_id: uid,
    }),
  }, { personId: pid });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * RAG + LLM 單元出題（與 POST /rag/tab/unit/quiz/create 分開）。
 * POST /rag/tab/unit/quiz/llm-generate — query：**person_id**（必填）。
 * Body **僅**四欄：rag_quiz_id（必填）、rag_tab_id（可為 ""）、rag_unit_id（≥0）、quiz_user_prompt_text；
 * rag_tab_id／rag_unit_id 可為後端一致性驗證用 optional。
 *
 * LLM Key 來自 Rag 對應 User；成功後更新 Rag_Quiz。
 * @param {{ rag_quiz_id: number, rag_tab_id?: string, rag_unit_id?: number, quiz_user_prompt_text?: string }} body
 * @returns {Promise<object>} 後端 JSON，預期含 quiz_content、quiz_hint、quiz_reference_answer、rag_quiz_id 等。
 */
export async function apiRagUnitQuizLlmGenerate(body, personId) {
  const pid = String(personId ?? '').trim();
  if (!pid) throw new Error('person_id 為必填');
  const rqid = Number(body?.rag_quiz_id);
  if (!Number.isFinite(rqid) || rqid < 1) throw new Error('無效的 rag_quiz_id');
  const tid = body?.rag_tab_id != null ? String(body.rag_tab_id).trim() : '';
  const uid =
    body?.rag_unit_id != null && body.rag_unit_id !== ''
      ? Number(body.rag_unit_id)
      : 0;
  if (!Number.isFinite(uid) || uid < 0) throw new Error('無效的 rag_unit_id');
  const uxt = body?.quiz_user_prompt_text != null ? String(body.quiz_user_prompt_text) : '';
  const res = await loggedFetch(`${API_BASE}${API_RAG_TAB_UNIT_QUIZ_LLM_GENERATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rag_quiz_id: rqid,
      rag_tab_id: tid,
      rag_unit_id: uid,
      quiz_user_prompt_text: uxt,
    }),
  }, { personId: pid });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 產生題目：POST /rag/tab/quiz/create（quiz_level 已取消，不再送出）
 * @param {string | number} ragId - Rag 表主鍵
 * @param {string | number | null | undefined} [ragTabId] - 選填；空則傳 ""
 * @param {string | null | undefined} [unitName] - 選填；空字串則後端依 outputs 用第一筆
 * @returns {Promise<object>} 含 quiz_content、quiz_hint、quiz_answer_reference、rag_quiz_id 等
 */
export async function apiGenerateQuiz(ragId, ragTabId, unitName) {
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
