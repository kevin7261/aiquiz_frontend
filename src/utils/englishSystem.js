/**
 * English System API 回傳正規化（GET /english_system/tabs；每筆可含 phases、quizzes、answers）
 *
 * @param {unknown} data
 * @returns {object[]}
 */
export function normalizeEnglishSystemTabsResponse(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (Array.isArray(data.english_systems)) return data.english_systems;
    if (Array.isArray(data.systems)) return data.systems;
  }
  return [];
}

/**
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function getEnglishSystemTabRowId(row) {
  if (row == null || typeof row !== 'object') return '';
  const id = row.system_tab_id ?? row.english_system_tab_id ?? row.id;
  return id != null ? String(id).trim() : '';
}

/**
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function getEnglishSystemTabLabel(row) {
  if (row == null || typeof row !== 'object') return '英文題庫';
  const n =
    row.tab_name ??
    row.system_name ??
    row.quiz_phase_name ??
    row.name ??
    '';
  const s = String(n).trim();
  return s || '英文題庫';
}

/**
 * English_System 列與同 rag_tab_id 的 RAG 列合併（建立英文測驗題庫頁以 GET /english_system/tabs 為清單來源）。
 *
 * @param {object} esRow
 * @param {object | null | undefined} ragRow
 * @returns {object | null}
 */
export function mergeEnglishSystemTabWithRag(esRow, ragRow) {
  if (esRow == null || typeof esRow !== 'object') return null;
  const tid = getEnglishSystemTabRowId(esRow);
  if (!tid) return null;
  const base = ragRow && typeof ragRow === 'object' ? { ...ragRow } : {};
  const tabName = String(
    esRow.tab_name ?? esRow.system_name ?? base.tab_name ?? ''
  ).trim();
  /** 先 RAG 再 English_System，最後覆寫 tab id／名稱，讓 quiz_text、quiz_type 等留在列上供頁面同步 */
  return {
    ...base,
    ...esRow,
    rag_tab_id: tid,
    id: tid,
    tab_name: tabName || base.tab_name || tid,
    rag_name: base.rag_name ?? (tabName || base.tab_name),
  };
}

/** English_System.quiz_type → 建立英文測驗題庫頁 englishSourceKind */
export function mapEnglishQuizTypeToSourceKind(quizType) {
  const n = Number(quizType);
  if (n === 2) return 'mp3';
  if (n === 3) return 'youtube';
  return 'text';
}

/**
 * 是否已有可供測試的英文教材（與 build-system 寫入欄位一致）
 * @param {object | null | undefined} row
 */
export function englishSystemRowHasBuiltQuizBank(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.quiz_text ?? '').trim() !== '') return true;
  const n = Number(row.quiz_type);
  if (n === 2 && String(row.quiz_mp3_filename ?? '').trim() !== '') return true;
  if (n === 3 && String(row.quiz_youtube_url ?? '').trim() !== '') return true;
  return false;
}
