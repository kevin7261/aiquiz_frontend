/**
 * Exam 相關 API 呼叫模組
 *
 * 集中封裝測驗分頁的建立與管理操作，包含：
 * - 分頁更名：PUT /exam/tab/tab-name
 * - 空白題目建立：POST /exam/tab/quiz/create
 * - LLM 批改（非同步）：POST /exam/tab/quiz/llm-grade（回傳 202 + job_id，需輪詢）
 * - LLM 出題：POST /exam/tab/quiz/llm-generate
 *
 * 使用 loggedFetch；錯誤時以 parseFetchError 解析並 throw Error，供呼叫端 catch 顯示。
 */
import {
  API_BASE,
  API_EXAM_CREATE_QUIZ,
  API_EXAM_QUIZ_GRADE,
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
 * - Body：`exam_tab_id`。
 * LLM 出題請改用 {@link apiExamTabQuizLlmGenerate}
 *
 * @param {{ exam_tab_id: string | number }} body
 * @param {string | number} personId - 同 query person_id（呼叫者）
 * @param {{ signal?: AbortSignal }} [fetchExtra] - `signal`：中止未完成之草稿請求
 */
export async function apiExamTabQuizCreate(body, personId, fetchExtra = undefined) {
  const pid = String(personId ?? '').trim();
  if (!pid) throw new Error('person_id 為必填');
  const examTabId = body?.exam_tab_id != null ? String(body.exam_tab_id).trim() : '';
  if (!examTabId) throw new Error('缺少 exam_tab_id');
  const payload = {
    exam_tab_id: examTabId,
  };
  /** @type {RequestInit} */
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
 * 測驗 LLM 批改（非同步）：POST /exam/tab/quiz/llm-grade（Exam Grade Quiz）。
 * Body：`exam_quiz_id`、`quiz_content`（字串，可空字串）、`quiz_answer`。以 `exam_quiz_id` 定位題目；RAG+LLM 非同步評分；`unit_type` 2／3／4 改 transcription 純 LLM 批改；完成後更新 Exam_Quiz.answer_content／answer_critique。回傳 **202** + `job_id`；輪詢 GET `/exam/tab/quiz/grade-result/{job_id}`。
 * 批改指引由後端讀取，**勿傳**於 body。
 *
 * @param {{
 *   exam_quiz_id: number,
 *   quiz_content: string,
 *   quiz_answer: string,
 * }} gradeBody
 * @param {string} [submissionPath] - 預設 `API_EXAM_QUIZ_GRADE`（`/exam/tab/quiz/llm-grade`）；與 `submitGrade` 之 `quizGradeSubmissionPath` 一致時傳入
 * @returns {Promise<{ res: Response, text: string }>}
 */
export async function apiExamTabQuizLlmGrade(gradeBody, submissionPath) {
  const p =
    typeof submissionPath === 'string' && submissionPath.trim() !== ''
      ? submissionPath.trim()
      : API_EXAM_QUIZ_GRADE;
  const res = await loggedFetch(`${API_BASE}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gradeBody),
  });
  const text = await res.text();
  return { res, text };
}

/**
 * 測驗 LLM 出題：POST /exam/tab/quiz/llm-generate（OpenAPI：Rag LLM Generate Quiz）
 * Query：`person_id`（必填，由 {@link loggedFetch} 第三參數帶入）。
 *
 * Body：**僅** `exam_quiz_id`、`rag_tab_id`、`rag_unit_id`、`rag_quiz_id`（皆必填）。三 RAG 鍵須對應同一 Tab；`rag_tab_id` 供後端載入 ZIP／單元（不依賴 System_Setting）。題列已有有效兩鍵時請求須與列一致否則 400；列尚未寫入則以此請求綁定並寫回。`quiz_user_prompt_text`／`answer_user_prompt_text` 勿傳（後端自 Rag_Quiz 讀，成功後寫入 Exam_Quiz）。`unit_type` 1=RAG／向量；2–4=transcription 純 LLM。成功後更新該列並清空作答欄位。
 *
 * @param {{
 *   exam_quiz_id: number | string,
 *   rag_tab_id: string,
 *   rag_unit_id: number | string,
 *   rag_quiz_id: number | string,
 * }} body
 * @returns {Promise<object>} 預期含 quiz_content、quiz_hint、quiz_answer_reference／quiz_reference_answer、exam_quiz_id、quiz_name、
 *   quiz_user_prompt_text／answer_user_prompt_text（回傳，後端自 Rag_Quiz 寫入之模板快照）、unit_name、rag_unit_id、rag_quiz_id 等
 */
export async function apiExamTabQuizLlmGenerate(body, personId) {
  const pid = String(personId ?? '').trim();
  if (!pid) throw new Error('person_id 為必填');
  const eid = Number(body?.exam_quiz_id);
  if (!Number.isFinite(eid) || eid < 1) throw new Error('無效的 exam_quiz_id');
  const ru = body?.rag_unit_id != null && body.rag_unit_id !== '' ? Number(body.rag_unit_id) : NaN;
  const ragUnitId = Number.isFinite(ru) && ru > 0 ? Math.trunc(ru) : 0;
  const rq = body?.rag_quiz_id != null && body.rag_quiz_id !== '' ? Number(body.rag_quiz_id) : NaN;
  const ragQuizId = Number.isFinite(rq) && rq > 0 ? Math.trunc(rq) : 0;
  if (ragUnitId < 1 || ragQuizId < 1) {
    throw new Error('llm-generate 須提供有效的 rag_unit_id、rag_quiz_id（正整數）');
  }
  const ragTabId = String(body?.rag_tab_id ?? '').trim();
  if (!ragTabId) throw new Error('llm-generate 須提供 rag_tab_id');
  const payload = {
    exam_quiz_id: Math.trunc(eid),
    rag_tab_id: ragTabId,
    rag_unit_id: ragUnitId,
    rag_quiz_id: ragQuizId,
  };
  const res = await loggedFetch(`${API_BASE}${API_EXAM_TAB_QUIZ_LLM_GENERATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, { personId: pid });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}
