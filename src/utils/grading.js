/**
 * 評分結果格式化工具
 *
 * 將評分 API 回傳的 JSON 轉成易讀的純文字，供題目卡片與分析頁顯示。
 * 支援後端回傳的完整 answer 物件（含 answer_metadata / answer_feedback_metadata）。
 * 與 CreateUnit、ExamPage、AnalysisPage 顯示格式一致。
 */

/**
 * 將評分 API 回傳的 JSON 字串格式化为易讀文字
 *
 * 會解析 score、level、rubric、strengths、weaknesses、missing_items、action_items 等欄位，
 * 組合成「總分 / 等級 / 評分項目 / 優點 / 待改進 / 遺漏項目 / 建議後續」區塊。
 *
 * @param {string} [text] - API 回傳的 JSON 字串或一般文字
 * @returns {string} 格式化後的文字，非 JSON 或解析失敗時回傳原 text
 */
export function formatGradingResult(text) {
  if (!text || typeof text !== 'string') return text;
  const t = text.trim();
  if (!t.startsWith('{')) return text;
  try {
    const raw = JSON.parse(text);
    let data = raw;
    if (raw.answer_metadata && typeof raw.answer_metadata === 'object') {
      data = raw.answer_metadata;
    } else if (raw.answer_feedback_metadata) {
      const parsed =
        typeof raw.answer_feedback_metadata === 'string'
          ? (() => {
              try {
                return JSON.parse(raw.answer_feedback_metadata);
              } catch {
                return null;
              }
            })()
          : raw.answer_feedback_metadata;
      if (parsed) data = parsed;
    }

    const lines = [];
    if (data.score != null) lines.push(`總分：${data.score} / 10`);
    if (data.level) lines.push(`等級：${data.level}`);
    if (lines.length) lines.push('');

    const rubric = data.rubric;
    if (Array.isArray(rubric) && rubric.length > 0) {
      lines.push('【評分項目】');
      rubric.forEach((r) => {
        const criteria = r.criteria ?? '';
        const score = r.score != null ? ` (${r.score}分)` : '';
        const comment = r.comment ? `\n  ${r.comment}` : '';
        lines.push(`• ${criteria}${score}${comment}`);
      });
      lines.push('');
    }

    const section = (title, arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return;
      lines.push(`【${title}】`);
      arr.forEach((s) => lines.push(`• ${s}`));
      lines.push('');
    };
    section('優點', data.strengths);
    section('待改進', data.weaknesses);
    section('遺漏項目', data.missing_items);
    section('建議後續', data.action_items);

    return lines.join('\n').trim() || text;
  } catch (_) {
    return text;
  }
}
