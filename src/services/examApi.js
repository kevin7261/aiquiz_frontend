/**
 * Exam 相關 API（測驗分頁更名：PUT /exam/tab/tab-name 等）
 */
import {
  API_BASE,
  API_EXAM_CREATE_QUIZ,
  API_EXAM_TAB_QUIZ_LLM_GENERATE,
  API_EXAM_UNIT_NAME,
} from '../constants/api.js';
import { parseFetchError } from '../utils/apiError.js';
import { loggedFetch } from '../utils/loggedFetch.js';

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * 更新測驗分頁名稱：PUT /exam/tab/tab-name（以 exam_id 比對，僅 deleted=false）
 * @param {string | number} examId - Exam 主鍵
 * @param {string} tabName
 * @returns {Promise<object>} exam_id、exam_tab_id、person_id、tab_name、updated_at
 */
export async function apiUpdateExamTabName(examId, tabName) {
  const eid = Number(examId);
  if (!Number.isInteger(eid) || eid < 1) {
    throw new Error('無效的 exam_id（須為正整數）');
  }
  const res = await loggedFetch(`${API_BASE}${API_EXAM_UNIT_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_id: eid,
      tab_name: String(tabName).trim(),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 空白 Exam_Quiz（不呼叫 LLM）：{@link API_EXAM_CREATE_QUIZ}（OpenAPI: Exam Create Quiz）。
 * - Query（必填）：`person_id`（由 {@link loggedFetch} 第三參數 `personId` 附加於 URL）
 * - Body（application/json，僅兩鍵）：`exam_tab_id`（string）、`rag_unit_id`（number，對齊試卷題庫單元）
 * LLM 出題請改用 {@link apiExamTabQuizLlmGenerate}
 *
 * @param {{ exam_tab_id: string | number, rag_unit_id: number }} body
 * @param {string | number} personId - 同 query person_id（呼叫者）
 * @param {{ signal?: AbortSignal }} [fetchExtra] - `signal`：中止未完成之草稿請求
 */
export async function apiExamTabQuizCreate(body, personId, fetchExtra = undefined) {
  const pid = String(personId ?? '').trim();
  if (!pid) throw new Error('person_id 為必填');
  const examTabId = body?.exam_tab_id != null ? String(body.exam_tab_id).trim() : '';
  const uid =
    body?.rag_unit_id != null && body.rag_unit_id !== ''
      ? Number(body.rag_unit_id)
      : 0;
  if (!examTabId) throw new Error('缺少 exam_tab_id');
  if (!Number.isFinite(uid) || uid < 1) throw new Error('無效的 rag_unit_id');
  /** @type {RequestInit} */
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_tab_id: examTabId,
      rag_unit_id: uid,
    }),
  };
  if (fetchExtra?.signal != null) {
    init.signal = fetchExtra.signal;
  }
  const res = await loggedFetch(`${API_BASE}${API_EXAM_CREATE_QUIZ}`, init, { personId: pid });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * 測驗 LLM 出題：POST /exam/tab/quiz/llm-generate（與 POST /exam/tab/quiz/create 分開）
 * Body：`exam_quiz_id`、`quiz_name`、`quiz_user_prompt_text`（後兩者可空字串）
 * @returns {Promise<object>} 預期含 quiz_content、quiz_hint、quiz_reference_answer、exam_quiz_id、quiz_name 等
 */
export async function apiExamTabQuizLlmGenerate(body, personId) {
  const pid = String(personId ?? '').trim();
  if (!pid) throw new Error('person_id 為必填');
  const eid = Number(body?.exam_quiz_id);
  if (!Number.isFinite(eid) || eid < 1) throw new Error('無效的 exam_quiz_id');
  const quizName = body?.quiz_name != null ? String(body.quiz_name) : '';
  const uxt = body?.quiz_user_prompt_text != null ? String(body.quiz_user_prompt_text) : '';
  const res = await loggedFetch(`${API_BASE}${API_EXAM_TAB_QUIZ_LLM_GENERATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_quiz_id: eid,
      quiz_name: quizName,
      quiz_user_prompt_text: uxt,
    }),
  }, { personId: pid });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}
