/**
 * 英文測驗題庫與一般測驗題庫的前端隔離名單。
 *
 * 後端目前同用 /rag/tabs，因此以前端 registry 記錄「哪些 rag_tab_id 屬於英文頁」，
 * 讓英文頁只顯示英文題庫、一般頁排除英文題庫。
 */

const ENGLISH_RAG_TAB_IDS_STORAGE_KEY = 'myquiz_english_rag_tab_ids_v1';

function canUseLocalStorage() {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function getRagTabId(row) {
  if (!row || typeof row !== 'object') return '';
  const id = row.rag_tab_id ?? row.id;
  return id == null ? '' : String(id).trim();
}

/**
 * 啟發式辨識英文題庫（無 registry 時的 fallback）：
 * - 新版英文頁建立的 rag_tab_id 以 eng_ 開頭
 * - 或 tab_name / rag_name 含「英文」
 *
 * @param {object | null | undefined} row
 * @returns {boolean}
 */
export function hasEnglishRagMarker(row) {
  if (!row || typeof row !== 'object') return false;
  const tid = getRagTabId(row);
  if (tid.startsWith('eng_')) return true;
  const tabName = String(row.tab_name ?? '').trim();
  const ragName = String(row.rag_name ?? '').trim();
  return tabName.includes('英文') || ragName.includes('英文');
}

/**
 * @returns {Set<string>}
 */
export function readEnglishRagTabIdSet() {
  if (!canUseLocalStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(ENGLISH_RAG_TAB_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/**
 * @param {Set<string>} idSet
 */
export function writeEnglishRagTabIdSet(idSet) {
  if (!canUseLocalStorage()) return;
  const arr = Array.from(idSet)
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
  arr.sort();
  try {
    window.localStorage.setItem(ENGLISH_RAG_TAB_IDS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore quota/storage errors
  }
}

/**
 * 以目前列表同步 registry：凡符合英文 marker 的 tab id 都會寫入名單。
 *
 * @param {object[]} rows
 * @returns {Set<string>} 同步後 registry
 */
/**
 * 將 GET /english_system/tabs 回傳的列註冊為英文題庫分頁（供一般建立題庫頁排除）。
 *
 * @param {object[]} englishRows
 */
export function registerEnglishSystemTabIds(englishRows) {
  if (!Array.isArray(englishRows) || englishRows.length === 0) return;
  const registry = readEnglishRagTabIdSet();
  let changed = false;
  for (const row of englishRows) {
    if (!row || typeof row !== 'object') continue;
    const tid = String(row.system_tab_id ?? row.english_system_tab_id ?? row.id ?? '').trim();
    if (!tid || registry.has(tid)) continue;
    registry.add(tid);
    changed = true;
  }
  if (changed) writeEnglishRagTabIdSet(registry);
}

export function syncEnglishRagTabRegistryFromList(rows) {
  const registry = readEnglishRagTabIdSet();
  let changed = false;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!hasEnglishRagMarker(row)) continue;
      const tid = getRagTabId(row);
      if (!tid || registry.has(tid)) continue;
      registry.add(tid);
      changed = true;
    }
  }
  if (changed) writeEnglishRagTabIdSet(registry);
  return registry;
}

/**
 * @param {object | null | undefined} row
 * @param {Set<string>} [registry]
 * @returns {boolean}
 */
export function isEnglishRagByRegistry(row, registry = undefined) {
  const tid = getRagTabId(row);
  if (!tid) return false;
  const idSet = registry ?? readEnglishRagTabIdSet();
  return idSet.has(tid) || hasEnglishRagMarker(row);
}
