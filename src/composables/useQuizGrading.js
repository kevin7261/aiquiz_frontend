/**
 * 評分 Composable
 *
 * 職責：送出評分請求、輪詢 job_id 取得結果、將回傳 JSON 格式化为易讀文字。
 * 會直接修改題目卡片 item（gradingResult、gradingResponseJson；confirmed 僅在整段流程結束後設為 true，送出與輪詢期間維持 false 以便按鈕顯示「批改中」、結果區待回傳後再顯示）。
 * 供 CreateExamQuizBankPage（RAG）、ExamPage（測驗）：RAG 為預設 body；Exam 傳 gradingMode: 'exam' 與 exam 路徑常數。
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

/**
 * 送出評分並輪詢結果
 *
 * 流程：POST 送出 → 若 202 則取 job_id → 每 2 秒 GET 輪詢結果 → 解析 status ready/error → 寫入 item
 *
 * @param {Object} item - 題目卡片物件，會被 mutate（confirmed、gradingResult、gradingResponseJson）
 * @param {Object} context - RAG：{ sourceTabId, ragId }；Exam：`gradingMode: 'exam'` 時 body 為 exam_quiz_id、quiz_content（字串，可 ""）、quiz_answer（對齊 OpenAPI）。
 * @param {Object} [options] - quizGradeSubmissionPath、quizGradeResultPath；gradingMode: 'exam' 時為 POST /exam/tab/quiz/llm-grade；RAG 預設 POST /rag/tab/unit/quiz/llm-grade（body 以 rag_id、rag_quiz_id、quiz_answer 為核心；quiz_content 僅在有非空白內容時才送，否則由後端自 Rag_Quiz 讀）；`item.gradingPrompt` 非空則併入 answer_user_prompt_text；extraGradeBody 僅合併至 **RAG** 請求
 */
export async function submitGrade(item, context, options = {}) {
  const isExam = options.gradingMode === 'exam';
  const { sourceTabId, ragId } = context;
  const quizGradeSubmissionPath =
    options.quizGradeSubmissionPath ?? options.gradeSubmissionPath ?? API_RAG_QUIZ_GRADE;
  const quizGradeResultPath =
    options.quizGradeResultPath ?? options.gradeResultPath ?? API_RAG_QUIZ_GRADE_RESULT;

  const gradeBody = isExam
    ? (() => {
        const rawEq =
          item.exam_quiz_id != null && String(item.exam_quiz_id).trim() !== ''
            ? item.exam_quiz_id
            : item.quiz_id;
        const n = Number(rawEq);
        const examQuizId =
          Number.isFinite(n) && n >= 1 ? n : rawEq != null ? rawEq : '';
        const quizContentStr = item.quiz != null ? String(item.quiz) : '';
        return {
          exam_quiz_id: examQuizId,
          quiz_content: quizContentStr,
          quiz_answer: String(item.quiz_answer ?? '').trim(),
        };
      })()
    : (() => {
        const ragQuizRaw =
          item.rag_quiz_id != null && String(item.rag_quiz_id).trim() !== ''
            ? item.rag_quiz_id
            : item.quiz_id != null
              ? item.quiz_id
              : '';
        const body = {
          rag_id: String(ragId ?? ''),
          rag_quiz_id: String(ragQuizRaw),
          quiz_answer: item.quiz_answer.trim(),
        };
        const tabId = sourceTabId != null ? String(sourceTabId).trim() : '';
        if (tabId !== '') {
          body.rag_tab_id = tabId;
        }
        const quizStr = item.quiz != null ? String(item.quiz) : '';
        if (quizStr.trim() !== '') {
          body.quiz_content = quizStr;
        }
        return body;
      })();

  if (!isExam) {
    const answerPrompt = String(item.gradingPrompt ?? '').trim();
    if (answerPrompt !== '') {
      gradeBody.answer_user_prompt_text = answerPrompt;
    }
  }

  const extra = options.extraGradeBody;
  if (extra && typeof extra === 'object' && !isExam) {
    for (const key of Object.keys(extra)) {
      const val = extra[key];
      if (val !== undefined && val !== null) {
        gradeBody[key] = val;
      }
    }
  }

  if (isExam) {
    const nid = Number(gradeBody.exam_quiz_id);
    if (!Number.isFinite(nid) || nid < 1) {
      item.gradingResult = '批改失敗：缺少有效的題目編號（exam_quiz_id）。';
      return;
    }
    gradeBody.exam_quiz_id = nid;
  }

  item.gradingResult = '';

  try {
    let res;
    let text;
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
      const statusHint =
        res.status === 400
          ? isExam
            ? '（請至「系統設定」確認已填寫 AI 服務 API 金鑰）\n\n'
            : '（請至「個人設定」確認已填寫 LLM API 金鑰）\n\n'
          : res.status === 502
            ? '（服務忙碌或暫時無法回應，請稍後再試）\n\n'
            : '';
      item.gradingResult = `批改失敗：${statusHint}${msg}`;
      return;
    }
    if (res.status !== 202) {
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
      item.gradingResponseJson = parsed;
      item.gradingResult = formatGradingResult(text) || '（無批改內容）';
      item.confirmed = true;
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      item.gradingResult = '批改失敗：無法取得處理編號，請稍後再試';
      return;
    }
    const jobId = data.job_id;
    if (!jobId) {
      item.gradingResult = '批改失敗：系統未回傳處理編號，請稍後再試';
      return;
    }
    const maxPolls = 60;
    const intervalMs = 2000;
    const maxRetries = 3;
    const retryDelayMs = 2000;
    const friendlyUnavailable = '批改失敗：暫時無法連線，請稍後再試或重新送出。';

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      let pollRes = null;
      let pollText = '';
      for (let r = 0; r <= maxRetries; r++) {
        if (r > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
        try {
          pollRes = await loggedFetch(`${API_BASE}${quizGradeResultPath}/${encodeURIComponent(jobId)}`);
          pollText = await pollRes.text();
          if (pollRes.status !== 502 && pollRes.status !== 504) break;
        } catch (_) {
          // 網路錯誤時重試
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
      } catch (_) {
        item.gradingResult = friendlyUnavailable;
        return;
      }
      if (pollData.status === 'ready') {
        const result = pollData.result;
        item.gradingResponseJson = result;
        if (result && typeof result === 'object') {
          if (
            quizGradeSubmissionPath === API_RAG_QUIZ_GRADE &&
            result.rag_answer_id != null &&
            String(result.rag_answer_id).trim() !== ''
          ) {
            const rid = Number(result.rag_answer_id);
            item.answer_id = Number.isFinite(rid) ? rid : result.rag_answer_id;
          }
          if (
            quizGradeSubmissionPath === API_EXAM_QUIZ_GRADE &&
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
        const isJobNotFound = errMsg.includes('job not found');
        item.gradingResult = isJobNotFound
          ? '批改工作已失效或逾時，請重新送出批改。'
          : `批改失敗：${pollData.error || '未知錯誤'}`;
        return;
      }
    }
    item.gradingResult = '批改逾時：請稍後再試或重新送出';
  } catch (err) {
    item.gradingResult = '批改失敗：連線逾時或服務忙碌，請稍後再試。';
  }
}
