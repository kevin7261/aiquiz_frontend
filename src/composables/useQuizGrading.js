/**
 * 評分 Composable
 *
 * 職責：送出評分請求、輪詢 job_id 取得結果、將回傳 JSON 格式化为易讀文字。
 * 會直接修改題目卡片 item（confirmed、gradingResult、gradingResponseJson）。
 * 供 CreateUnit 頁、ExamPage 等共用；Exam 可透過 options 覆寫 API 路徑為 /exam/quiz-grade。
 */
import { API_BASE, API_RAG_QUIZ_GRADE, API_RAG_QUIZ_GRADE_RESULT } from '../constants/api.js';
import { formatGradingResult } from '../utils/grading.js';
import { loggedFetch } from '../utils/loggedFetch.js';

/**
 * 送出評分並輪詢結果
 *
 * 流程：POST 送出 → 若 202 則取 job_id → 每 2 秒 GET 輪詢結果 → 解析 status ready/error → 寫入 item
 *
 * @param {Object} item - 題目卡片物件，會被 mutate（confirmed、gradingResult、gradingResponseJson）
 * @param {Object} context - { sourceTabId, ragId }（RAG 情境為 rag_tab_id、rag_id；Exam 為 exam_tab_id、exam_id）
 * @param {Object} [options] - { quizGradeSubmissionPath, quizGradeResultPath } 可覆寫 API 路徑（預設為 RAG）
 */
export async function submitGrade(item, context, options = {}) {
  const { sourceTabId, ragId } = context;
  const quizGradeSubmissionPath =
    options.quizGradeSubmissionPath ?? options.gradeSubmissionPath ?? API_RAG_QUIZ_GRADE;
  const quizGradeResultPath =
    options.quizGradeResultPath ?? options.gradeResultPath ?? API_RAG_QUIZ_GRADE_RESULT;

  item.confirmed = true;
  item.gradingResult = '批改中...';

  try {
    const res = await loggedFetch(`${API_BASE}${quizGradeSubmissionPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rag_id: String(ragId),
        rag_tab_id: sourceTabId,
        rag_quiz_id: item.quiz_id != null ? String(item.quiz_id) : '',
        quiz_content: item.quiz ?? '',
        quiz_answer: item.quiz_answer.trim(),
        quiz_answer_reference: item.referenceAnswer != null ? String(item.referenceAnswer) : '',
      }),
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
      item.gradingResult = '評分失敗：無法解析 job_id';
      return;
    }
    const jobId = data.job_id;
    if (!jobId) {
      item.gradingResult = '評分失敗：未取得 job_id';
      return;
    }
    const maxPolls = 60;
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
          ? '評分任務不存在或已過期（伺服器可能曾休眠或重啟），請重新送出評分。'
          : `評分失敗：${pollData.error || '未知錯誤'}`;
        return;
      }
    }
    item.gradingResult = '評分逾時：請稍後再試或重新送出';
  } catch (err) {
    item.gradingResult = '評分失敗：後端逾時或服務喚醒中，請稍後再試。';
  }
}
