/**
 * English System API 回傳正規化（GET /english_system/tabs）
 *
 * @param {unknown} data
 * @returns {object[]}
 */
export function normalizeEnglishSystemTabsResponse(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && Array.isArray(data.english_systems)) {
    return data.english_systems;
  }
  return [];
}

/**
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function getEnglishSystemTabRowId(row) {
  if (row == null || typeof row !== 'object') return '';
  const id = row.english_system_tab_id ?? row.id;
  return id != null ? String(id) : '';
}

/**
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function getEnglishSystemTabLabel(row) {
  if (row == null || typeof row !== 'object') return '英文題庫';
  const n =
    row.tab_name ??
    row.quiz_phase_name ??
    row.name ??
    '';
  const s = String(n).trim();
  return s || '英文題庫';
}
