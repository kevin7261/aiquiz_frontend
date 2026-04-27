/**
 * 建立「英文測驗題庫」專用 fork（與 `useQuizGrading.js` 分離；內容對齊 RAG 批改路徑）
 *
 * 評分 Composable
 *
 * 職責：送出評分請求、輪詢 job_id 取得結果、將回傳 JSON 格式化为易讀文字。
 * 會直接修改題目卡片 item（gradingResult、gradingResponseJson；confirmed 僅在整段流程結束後設為 true，送出與輪詢期間維持 false 以便按鈕顯示「批改中」、結果區待回傳後再顯示）。
 * 供 CreateEnglishExamQuizBankPage（RAG）；ExamPage 仍使用 `useQuizGrading.js`。
 */
import {
  API_BASE,
  API_RAG_QUIZ_GRADE,
  API_RAG_QUIZ_GRADE_RESULT,
} from '../constants/api.js';
import { formatGradingResult } from '../utils/grading.js';
import { loggedFetch } from '../utils/loggedFetch.js';

/**
 * 送出評分並輪詢結果
 *
 * 流程：POST 送出 → 若 202 則取 job_id → 每 2 秒 GET 輪詢結果 → 解析 status ready/error → 寫入 item
 *
 * @param {Object} item - 題目卡片物件，會被 mutate（confirmed、gradingResult、gradingResponseJson）
 * @param {Object} context - RAG：{ sourceTabId, ragId }；Exam：{ examId, examTabId }（並設 options.gradingMode === 'exam'）
 * @param {Object} [options] - quizGradeSubmissionPath、quizGradeResultPath；gradingMode: 'exam' 時 POST body 為 exam_*（對齊 POST /exam/tab/quiz/grade）
 */
export async function submitGrade(item, context, options = {}) {
  const isExam = options.gradingMode === 'exam';
  const { sourceTabId, ragId, examId, examTabId } = context;
  const quizGradeSubmissionPath =
    options.quizGradeSubmissionPath ?? options.gradeSubmissionPath ?? API_RAG_QUIZ_GRADE;
  const quizGradeResultPath =
    options.quizGradeResultPath ?? options.gradeResultPath ?? API_RAG_QUIZ_GRADE_RESULT;

  const gradeBody = isExam
    ? {
        exam_id: String(examId ?? ''),
        exam_tab_id: examTabId != null ? String(examTabId) : '',
        exam_quiz_id:
          item.exam_quiz_id != null && String(item.exam_quiz_id).trim() !== ''
            ? String(item.exam_quiz_id)
            : item.quiz_id != null
              ? String(item.quiz_id)
              : '',
        quiz_content: item.quiz ?? '',
        quiz_answer: item.quiz_answer.trim(),
        quiz_answer_reference: item.referenceAnswer != null ? String(item.referenceAnswer) : '',
      }
    : {
        rag_id: String(ragId),
        rag_tab_id: sourceTabId,
        rag_quiz_id:
          item.rag_quiz_id != null && String(item.rag_quiz_id).trim() !== ''
            ? String(item.rag_quiz_id)
            : item.quiz_id != null
              ? String(item.quiz_id)
              : '',
        quiz_content: item.quiz ?? '',
        quiz_answer: item.quiz_answer.trim(),
        quiz_answer_reference: item.referenceAnswer != null ? String(item.referenceAnswer) : '',
      };

  item.gradingResult = '';

  try {
    const res = await loggedFetch(`${API_BASE}${quizGradeSubmissionPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gradeBody),
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
      const statusHint =
        res.status === 400
          ? '（請至「系統設定」確認已填寫 AI 服務 API 金鑰）\n\n'
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
        if (
          quizGradeSubmissionPath === API_RAG_QUIZ_GRADE &&
          result &&
          typeof result === 'object' &&
          result.rag_answer_id != null &&
          String(result.rag_answer_id).trim() !== ''
        ) {
          const rid = Number(result.rag_answer_id);
          item.answer_id = Number.isFinite(rid) ? rid : result.rag_answer_id;
        }
        item.gradingResult = formatGradingResult(JSON.stringify(result)) || '（無批改內容）';
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
  } finally {
    item.confirmed = true;
  }
}
