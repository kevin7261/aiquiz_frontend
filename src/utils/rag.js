/**
 * RAG 相關純函數與常數
 *
 * 供 CreateRAG 頁、useRagTabState、usePackTasks、ragApi 等使用。
 * 不依賴 Vue 或 API，僅為資料轉換與 ID 產生邏輯。
 */

/** 建 RAG 時預設的系統提示（題目生成指令） */
export const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過50字';
/** 題目難度選項的顯示文字（對應 quiz_level 0、1） */
export const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

/**
 * 產生 RAG tab 用唯一 id
 * 規則：有 person_id 時為 {person_id}_yymmddhhmmss；無則 fallback 為 UUID
 * @param {string | undefined | null} personId - 目前使用者的 person_id
 * @returns {string}
 */
export function generateTabId(personId) {
  if (personId != null && String(personId).trim() !== '') {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${String(personId).trim()}_${yy}${mm}${dd}${hh}${min}${ss}`;
  }
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    (c === 'x' ? hex() : (parseInt(hex(), 16) & 0x3) | 0x8).toString(16)
  );
}

/**
 * 從 rag_tab_id 推得顯示用 rag_name
 * 規則：取第一個底線之後的部分（通常為時間）；無底線則用整段
 * @param {string} [ragTabId]
 * @returns {string}
 */
export function deriveRagNameFromTabId(ragTabId) {
  if (!ragTabId || typeof ragTabId !== 'string') return '';
  const idx = String(ragTabId).indexOf('_');
  return idx >= 0 ? String(ragTabId).slice(idx + 1) : String(ragTabId);
}

/**
 * 從 API 回傳的單一 RAG 物件推得 rag_name
 * 後端可能用 rag_tab_id = {rag_name}_rag 或 filename；此函數統一取出顯示名稱
 * @param {object} [o] - 含 rag_name / rag_tab_id / filename 等欄位的物件
 * @returns {string}
 */
export function deriveRagName(o) {
  if (o && typeof o.rag_name === 'string' && o.rag_name) return o.rag_name;
  const id = o?.rag_tab_id ?? '';
  const s = String(id);
  if (s.endsWith('_rag')) return s.slice(0, -4);
  const fn = o?.filename ?? o?.rag_filename ?? '';
  const f = String(fn).replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '').replace(/_rag$/, '');
  return f || s || '';
}

/**
 * 將 rag_list 字串解析為虛擬資料夾群組（供建 RAG 時分組上傳）
 * 格式：'a+b,c' → [['a','b'],['c']]，逗號分隔群組，加號分隔同群組內的資料夾
 * @param {string} [str]
 * @returns {string[][]}
 */
export function parsePackTasksList(str) {
  const s = String(str ?? '').trim();
  if (!s) return [];
  return s.split(',').map((part) => part.split('+').map((x) => x.trim()).filter(Boolean)).filter((g) => g.length > 0);
}

/**
 * 將虛擬資料夾群組序列化為後端 rag_list 字串
 * @param {string[][]} list - 二維陣列，每群組為一組資料夾名稱
 * @returns {string}
 */
export function serializePackTasksList(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map((g) => (Array.isArray(g) ? g.filter(Boolean).join('+') : '')).filter(Boolean).join(',');
}

/**
 * 將 GET /rag/rags 回傳正規化為 RAG 陣列
 * 支援：直接陣列、{ rags }、{ items }、或單一 RAG 物件
 * @param {unknown} data - API 回傳的資料
 * @returns {object[]}
 */
export function normalizeRagListResponse(data) {
  if (Array.isArray(data)) return data;
  const list = data?.rags ?? data?.items;
  if (Array.isArray(list) && list.length > 0) return list;
  if (data != null && typeof data === 'object' && (data.rag_tab_id != null || data.rag_id != null)) return [data];
  return [];
}

/**
 * 是否為「新增」用的 tab id（尚未寫入後端）
 * @param {string} [id]
 * @returns {boolean}
 */
export function isNewTabId(id) {
  return id === 'new' || (typeof id === 'string' && id.startsWith('new-'));
}
