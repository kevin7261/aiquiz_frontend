/**
 * 評分 Composable
 *
 * 職責：送出評分請求、輪詢 job_id 取得結果、將回傳 JSON 格式化為易讀文字。
 *
 * 支援兩種批改模式：
 * - RAG 模式（預設）：POST /rag/tab/unit/quiz/llm-grade；body 以 rag_id、rag_quiz_id、quiz_answer 為核心。
 * - Exam 模式（gradingMode: 'exam'）：POST /exam/tab/quiz/llm-grade；body 以 exam_quiz_id、quiz_content、quiz_answer 為核心。
 *
 * 流程：
 *   1. 組裝 body → 送出 POST
 *   2. 202 → 取 job_id → 每 2 秒 GET 輪詢
 *   3. status: ready → 解析 result → 格式化寫入 item.gradingResult
 *   4. status: error / 逾時 → 寫入錯誤訊息
 *
 * 每次送出時先將 item.confirmed 設為 false，成功後再設為 true；
 * 如此再次批改時答案區可重新編輯，結果區隨 gradingResult 即時更新。
 *
 * 供 CreateExamQuizBankPage（RAG 模式）、ExamPage（Exam 模式）使用。
 */
import {
  API_BASE,
  API_EXAM_QUIZ_GRADE,
  API_RAG_QUIZ_GRADE,
  API_RAG_QUIZ_GRADE_RESULT,
} from '../constants/api.js';
import { formatGradingResult } from '../utils/grading.js';
import { apiExamTabQuizLlmGrade } from '../services/examApi.js';
import { loggedFetch } from '../utils/loggedFetch.js';

// ─── 輪詢設定 ────────────────────────────────────────────────────────────────

/** 最多輪詢次數（60 次 × 2 秒 = 2 分鐘） */
const MAX_POLL_COUNT = 60;
/** 每次輪詢間隔（ms） */
const POLL_INTERVAL_MS = 2000;
/** 輪詢失敗時最多重試次數 */
const POLL_MAX_RETRIES = 3;
/** 重試等待時間（ms） */
const POLL_RETRY_DELAY_MS = 2000;

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/**
 * 組裝 Exam 模式的批改請求 body
 * @param {Object} item - 題目卡片
 * @returns {Object} 含 exam_quiz_id、quiz_content、quiz_answer 的 body
 */
function buildExamGradeBody(item) {
  const rawEq =
    item.exam_quiz_id != null && String(item.exam_quiz_id).trim() !== ''
      ? item.exam_quiz_id
      : item.quiz_id;
  const n = Number(rawEq);
  const examQuizId =
    Number.isFinite(n) && n >= 1 ? n : rawEq != null ? rawEq : '';
  return {
    exam_quiz_id: examQuizId,
    quiz_content: item.quiz != null ? String(item.quiz) : '',
    quiz_answer: String(item.quiz_answer ?? '').trim(),
  };
}

/**
 * 組裝 RAG 模式的批改請求 body
 * @param {Object} item - 題目卡片
 * @param {{ sourceTabId?: string | null, ragId?: string | number }} context
 * @param {Object} [options] - 含 extraGradeBody（可額外合併欄位）
 * @returns {Object} 含 rag_id、rag_quiz_id、quiz_answer 等的 body
 */
function buildRagGradeBody(item, context, options = {}) {
  const { sourceTabId, ragId } = context;

  const ragQuizRaw =
    item.rag_quiz_id != null && String(item.rag_quiz_id).trim() !== ''
      ? item.rag_quiz_id
      : item.quiz_id != null
        ? item.quiz_id
        : '';

  const body = {
    rag_id: String(ragId ?? ''),
    rag_quiz_id: String(ragQuizRaw),
  };

  // rag_tab_id 不為空時才帶入
  const tabId = sourceTabId != null ? String(sourceTabId).trim() : '';
  if (tabId !== '') body.rag_tab_id = tabId;

  // quiz_content 不為空時才帶入（後端可自 Rag_Quiz 讀）
  const quizStr = item.quiz != null ? String(item.quiz) : '';
  if (quizStr.trim() !== '') body.quiz_content = quizStr;

  // 批改規則（answer_user_prompt_text）：非空才送出
  const answerPrompt = String(item.gradingPrompt ?? '').trim();
  if (answerPrompt !== '') body.answer_user_prompt_text = answerPrompt;

  body.quiz_answer = item.quiz_answer.trim();

  // 合併額外欄位（如 unit_type）
  const extra = options.extraGradeBody;
  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) {
      const val = extra[key];
      if (val !== undefined && val !== null) body[key] = val;
    }
  }

  return body;
}

/**
 * 從非 202 成功回應中解析並寫入 item
 * @param {Object} item - 題目卡片（會被 mutate）
 * @param {string} text - 回應 body 字串
 */
function applyDirectGradingResult(item, text) {
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* ignore — formatGradingResult 亦接受非 JSON */
  }
  item.gradingResponseJson = parsed;
  item.gradingResult = formatGradingResult(text) || '（無批改內容）';
  item.confirmed = true;
}

/**
 * 將 HTTP 非成功回應轉為使用者友善的錯誤訊息
 * @param {Response} res
 * @param {string} text
 * @param {boolean} isExam
 * @returns {string}
 */
function buildHttpErrorMessage(res, text, isExam) {
  let msg = res.statusText;
  if (text) {
    try {
      const errBody = JSON.parse(text);
      if (errBody.error != null) {
        msg = errBody.error;
      } else if (errBody.detail != null) {
        msg = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
      } else {
        msg = text;
      }
    } catch {
      msg = text;
    }
  }

  // 依狀態碼補充說明
  const statusHint =
    res.status === 400
      ? isExam
        ? '（請至「系統設定」確認已填寫 AI 服務 API 金鑰）\n\n'
        : '（請至「個人設定」確認已填寫 LLM API 金鑰）\n\n'
      : res.status === 502
        ? '（服務忙碌或暫時無法回應，請稍後再試）\n\n'
        : '';

  return `批改失敗：${statusHint}${msg}`;
}

/**
 * 輪詢批改結果（GET /.../{jobId}）直至 ready / error / 逾時
 *
 * @param {Object} item - 題目卡片（會被 mutate）
 * @param {string} jobId - 後端回傳的非同步工作 id
 * @param {string} gradeResultPath - 輪詢路徑（不含 jobId）
 * @param {string} gradeSubmissionPath - 原始送出路徑（用於判斷 rag_answer_id / exam_answer_id）
 */
async function pollGradeResult(item, jobId, gradeResultPath, gradeSubmissionPath) {
  const friendlyUnavailable = '批改失敗：暫時無法連線，請稍後再試或重新送出。';

  for (let i = 0; i < MAX_POLL_COUNT; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    // 帶重試的單次輪詢
    let pollRes = null;
    let pollText = '';
    for (let r = 0; r <= POLL_MAX_RETRIES; r++) {
      if (r > 0) await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_DELAY_MS));
      try {
        pollRes = await loggedFetch(`${API_BASE}${gradeResultPath}/${encodeURIComponent(jobId)}`);
        pollText = await pollRes.text();
        // 502/504 視為暫時不可用，繼續重試
        if (pollRes.status !== 502 && pollRes.status !== 504) break;
      } catch {
        /* 網路錯誤：繼續重試 */
      }
    }

    if (!pollRes || pollRes.status === 502 || pollRes.status === 504) {
      item.gradingResult = friendlyUnavailable;
      return;
    }

    if (pollRes.status === 404) {
      item.gradingResult = '批改工作已失效或逾時，請重新送出批改。';
      return;
    }

    let pollData;
    try {
      pollData = JSON.parse(pollText);
    } catch {
      item.gradingResult = friendlyUnavailable;
      return;
    }

    if (pollData.status === 'ready') {
      const result = pollData.result;
      item.gradingResponseJson = result;

      // 回寫 answer_id（RAG / Exam 分別對應不同欄位）
      if (result && typeof result === 'object') {
        if (
          gradeSubmissionPath === API_RAG_QUIZ_GRADE &&
          result.rag_answer_id != null &&
          String(result.rag_answer_id).trim() !== ''
        ) {
          const rid = Number(result.rag_answer_id);
          item.answer_id = Number.isFinite(rid) ? rid : result.rag_answer_id;
        }
        if (
          gradeSubmissionPath === API_EXAM_QUIZ_GRADE &&
          result.exam_answer_id != null &&
          String(result.exam_answer_id).trim() !== ''
        ) {
          const eid = Number(result.exam_answer_id);
          item.answer_id = Number.isFinite(eid) ? eid : result.exam_answer_id;
        }
      }

      item.gradingResult = formatGradingResult(JSON.stringify(result)) || '（無批改內容）';
      item.confirmed = true;
      return;
    }

    if (pollData.status === 'error') {
      const errMsg = pollData.error || '';
      item.gradingResult = errMsg.includes('job not found')
        ? '批改工作已失效或逾時，請重新送出批改。'
        : `批改失敗：${pollData.error || '未知錯誤'}`;
      return;
    }

    // status 非 ready/error 時繼續輪詢（pending / processing 等）
  }

  // 超過最大輪詢次數
  item.gradingResult = '批改逾時：請稍後再試或重新送出';
}

// ─── 主要匯出函式 ──────────────────────────────────────────────────────────────

/**
 * 送出評分並輪詢結果
 *
 * 流程：POST 送出 → 若 202 則取 job_id → 每 2 秒 GET 輪詢結果 → 解析 ready/error → 寫入 item
 *
 * @param {Object} item - 題目卡片物件，會被 mutate（confirmed、gradingResult、gradingResponseJson）
 * @param {Object} context
 *   - RAG 模式：`{ sourceTabId, ragId }`
 *   - Exam 模式：body 欄位（exam_quiz_id、quiz_content、quiz_answer）由 item 讀取
 * @param {Object} [options]
 *   - `gradingMode`：'exam' 為測驗批改，其餘為 RAG 批改
 *   - `quizGradeSubmissionPath`：POST 路徑（預設各模式路徑）
 *   - `quizGradeResultPath`：輪詢 GET 路徑（預設各模式路徑）
 *   - `extraGradeBody`：僅 RAG 模式合併的額外 body 欄位（如 unit_type）
 */
export async function submitGrade(item, context, options = {}) {
  const isExam = options.gradingMode === 'exam';

  // 解析路徑設定（支援新舊兩種 option 鍵名以相容）
  const quizGradeSubmissionPath =
    options.quizGradeSubmissionPath ?? options.gradeSubmissionPath ?? API_RAG_QUIZ_GRADE;
  const quizGradeResultPath =
    options.quizGradeResultPath ?? options.gradeResultPath ?? API_RAG_QUIZ_GRADE_RESULT;

  // 組裝批改請求 body
  const gradeBody = isExam
    ? buildExamGradeBody(item)
    : buildRagGradeBody(item, context, options);

  // Exam 模式驗證 exam_quiz_id
  if (isExam) {
    const nid = Number(gradeBody.exam_quiz_id);
    if (!Number.isFinite(nid) || nid < 1) {
      item.gradingResult = '批改失敗：缺少有效的題目編號（exam_quiz_id）。';
      return;
    }
    gradeBody.exam_quiz_id = nid;
  }

  // 每次重新送出時先清空結果，讓 UI 回到「可編輯」狀態
  item.gradingResult = '';
  item.confirmed = false;

  try {
    // 送出 POST 請求
    let res, text;
    if (isExam) {
      ({ res, text } = await apiExamTabQuizLlmGrade(gradeBody, quizGradeSubmissionPath));
    } else {
      res = await loggedFetch(`${API_BASE}${quizGradeSubmissionPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gradeBody),
      });
      text = await res.text();
    }

    // HTTP 錯誤
    if (!res.ok) {
      item.gradingResult = buildHttpErrorMessage(res, text, isExam);
      return;
    }

    // 同步回應（非 202）：後端直接回傳批改結果
    if (res.status !== 202) {
      applyDirectGradingResult(item, text);
      return;
    }

    // 非同步回應（202）：從 body 取 job_id 後開始輪詢
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      item.gradingResult = '批改失敗：無法取得處理編號，請稍後再試';
      return;
    }

    const jobId = data.job_id;
    if (!jobId) {
      item.gradingResult = '批改失敗：系統未回傳處理編號，請稍後再試';
      return;
    }

    await pollGradeResult(item, jobId, quizGradeResultPath, quizGradeSubmissionPath);
  } catch {
    item.gradingResult = '批改失敗：連線逾時或服務忙碌，請稍後再試。';
  }
}
