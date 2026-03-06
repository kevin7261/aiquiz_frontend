/**
 * 評分 composable：POST 送出評分、輪詢 job_id、格式化批改結果。
 * 供 CreateRAG、ExamPage 等使用。
 */
import { API_BASE, API_GRADE_SUBMISSION, API_GRADE_RESULT } from '../constants/api.js';
import { formatGradingResult } from '../utils/grading.js';

/**
 * 送出評分並輪詢結果。會直接修改 item（item.confirmed、item.gradingResult、item.gradingResponseJson）。
 * @param {Object} item - 題目卡片物件，會被 mutate
 * @param {Object} context - { sourceTabId, ragId, llmApiKey }
 * @param {Object} options - { gradeSubmissionPath, gradeResultPath } 可覆寫 API 路徑（預設為 RAG 的 /rag/quiz-grade）
 */
export async function submitGrade(item, context, options = {}) {
  const { sourceTabId, ragId, llmApiKey } = context;
  const gradeSubmissionPath = options.gradeSubmissionPath ?? API_GRADE_SUBMISSION;
  const gradeResultPath = options.gradeResultPath ?? API_GRADE_RESULT;

  item.confirmed = true;
  item.gradingResult = '批改中...';

  try {
    const res = await fetch(`${API_BASE}${gradeSubmissionPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_api_key: llmApiKey,
        rag_id: String(ragId),
        rag_tab_id: sourceTabId,
        rag_quiz_id: item.quiz_id != null ? String(item.quiz_id) : '',
        quiz_content: item.quiz ?? '',
        answer: item.answer.trim(),
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
      const statusHint = res.status === 400 ? '（例如 Rag 表 llm_api_key 未設定）\n\n' : (res.status === 502 ? '（後端逾時或服務喚醒中，請稍後再試）\n\n' : (res.status === 500 ? '（後端 500 錯誤，請檢查伺服器日誌或 API 設定）\n\n' : ''));
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
          pollRes = await fetch(`${API_BASE}${gradeResultPath}/${encodeURIComponent(jobId)}`);
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
        item.gradingResponseJson = pollData.result;
        item.gradingResult = formatGradingResult(JSON.stringify(pollData.result)) || '（無批改內容）';
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

/** 重寫答案：清空回答與批改狀態 */
export function rewriteAnswer(item) {
  item.answer = '';
  item.confirmed = false;
  item.gradingResult = '';
  item.gradingResponseJson = null;
}
