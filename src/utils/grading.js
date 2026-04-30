/**
 * 評分結果格式化工具
 *
 * 將評分 API 回傳的 JSON 轉成顯示用純文字：不外加標題／項目符號等，依欄位原樣以換行串接。
 * 批改 result 總分欄位為 quiz_score（滿分 5）；相容 quiz_grade、舊版 score。評語陣列欄位為 quiz_comments。
 * GET /exam/tabs、/person-analysis/quizzes 等作答列可能將 quiz_comments 放在 quiz_grade_metadata 內（與頂層 quiz_grade 並存），會一併讀取。其餘為舊制 rubric 等仍相容顯示。
 */

/** @param {Record<string, unknown>} data */
function getQuizCommentsArray(data) {
  if (data == null || typeof data !== 'object') return null;
  const arr = data.quiz_comments;
  return Array.isArray(arr) ? arr : null;
}

/** @param {Record<string, unknown>} data */
function getOverallQuizScore(data) {
  if (data == null || typeof data !== 'object') return null;
  const v = data.quiz_score ?? data.quiz_grade ?? data.score;
  if (v == null || String(v).trim() === '') return null;
  return v;
}

/** @param {unknown} meta */
function unwrapMetadata(meta) {
  if (meta == null) return null;
  if (typeof meta === 'object') return meta;
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 作答列分數原始值（與 API：quiz_score 為主；列表可能仍為 quiz_grade）
 * @param {Record<string, unknown> | null | undefined} answer
 * @returns {unknown}
 */
export function getAnswerScoreValue(answer) {
  if (answer == null || typeof answer !== 'object') return undefined;
  return answer.quiz_score ?? answer.quiz_grade;
}

/**
 * 分析表／摘要「分數」欄：純數字時顯示為「n / 5」；其餘原樣。
 * @param {unknown} value
 * @returns {string}
 */
export function formatQuizGradeDisplay(value) {
  if (value == null || String(value).trim() === '') return '—';
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return `${s} / 5`;
  return s;
}

/**
 * 將評分 API 回傳的 JSON 字串转为顯示用文字（無外加【評語】等標籤）。
 *
 * 新制 RAG／測驗批改：總分 quiz_score（0–5 滿分）、quiz_comments（字串陣列）；列表 API 作答列可將兩者放在 quiz_grade_metadata。RAG 輪詢 result 另含 rag_answer_id（不列入純文字批改區塊）。
 * 舊制：另含 level、rubric、strengths、weaknesses 等。
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
    const metaFromAnswer = unwrapMetadata(raw.answer_metadata);
    if (metaFromAnswer) {
      data = metaFromAnswer;
    } else if (raw.answer_feedback_metadata != null) {
      const fb = raw.answer_feedback_metadata;
      if (typeof fb === 'object') {
        data = fb;
      } else {
        const parsed = unwrapMetadata(fb);
        if (parsed) data = parsed;
      }
    }

    const gradeMeta = unwrapMetadata(raw.quiz_grade_metadata);
    if (gradeMeta && typeof gradeMeta === 'object') {
      data =
        data && typeof data === 'object'
          ? { ...data, ...gradeMeta }
          : gradeMeta;
    }

    // 新制：總分與評語陣列（原樣串接，不加標題或項目符號）
    const quizComments = getQuizCommentsArray(data);
    if (quizComments) {
      const parts = [];
      const overall = getOverallQuizScore(data);
      if (overall != null && String(overall).trim() !== '') {
        parts.push(String(overall).trim());
      }
      const nonEmptyComments = quizComments.filter((c) => c != null && String(c).trim() !== '');
      if (nonEmptyComments.length > 0) {
        parts.push(nonEmptyComments.map((c) => String(c).trim()).join('\n'));
      }
      return parts.join('\n').trim() || text;
    }

    const chunks = [];
    const overallLegacy = getOverallQuizScore(data);
    if (overallLegacy != null && String(overallLegacy).trim() !== '') {
      chunks.push(String(overallLegacy).trim());
    }
    if (data.level != null && String(data.level).trim() !== '') {
      chunks.push(String(data.level).trim());
    }

    const rubric = data.rubric;
    if (Array.isArray(rubric) && rubric.length > 0) {
      const rubricLines = rubric.map((r) => {
        const criteria = r.criteria ?? '';
        const scorePart = r.score != null ? ` (${r.score}分)` : '';
        const comment = r.comment != null && String(r.comment).trim() !== '' ? `\n${String(r.comment).trim()}` : '';
        return `${criteria}${scorePart}${comment}`;
      });
      chunks.push(rubricLines.join('\n'));
    }

    const joinLines = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return;
      chunks.push(arr.map((s) => String(s).trim()).filter((s) => s !== '').join('\n'));
    };
    joinLines(data.strengths);
    joinLines(data.weaknesses);
    joinLines(data.missing_items);
    joinLines(data.action_items);

    return chunks.filter(Boolean).join('\n\n').trim() || text;
  } catch (_) {
    return text;
  }
}
