/**
 * RAG 相關純函數與常數，供 CreateRAG、composables 使用。
 */

export const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過50字';
export const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

/** rag_tab_id 規則：generateTabId(person_id) → {person_id}_yymmddhhmmss；無 person_id 時 fallback 為 UUID */
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

/** 從 rag_tab_id 取得 rag_name：預設為底線之後的部分（時間），無底線則用整段 */
export function deriveRagNameFromTabId(ragTabId) {
  if (!ragTabId || typeof ragTabId !== 'string') return '';
  const idx = String(ragTabId).indexOf('_');
  return idx >= 0 ? String(ragTabId).slice(idx + 1) : String(ragTabId);
}

/** 從 output 推得 rag_name（後端 rag_tab_id = {rag_name}_rag） */
export function deriveRagName(o) {
  if (o && typeof o.rag_name === 'string' && o.rag_name) return o.rag_name;
  const id = o?.rag_tab_id ?? o?.rag_tab_id ?? '';
  const s = String(id);
  if (s.endsWith('_rag')) return s.slice(0, -4);
  const fn = o?.filename ?? o?.rag_filename ?? '';
  const f = String(fn).replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '').replace(/_rag$/, '');
  return f || s || '';
}

/** 將 rag_list 字串解析為虛擬資料夾結構：'a+b,c' -> [['a','b'],['c']] */
export function parsePackTasksList(str) {
  const s = String(str ?? '').trim();
  if (!s) return [];
  return s.split(',').map((part) => part.split('+').map((x) => x.trim()).filter(Boolean)).filter((g) => g.length > 0);
}

/** 將虛擬資料夾結構序列化為 rag_list 字串 */
export function serializePackTasksList(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map((g) => (Array.isArray(g) ? g.filter(Boolean).join('+') : '')).filter(Boolean).join(',');
}

/** 將 GET /rag/rags 回傳正規化為 RAG 陣列（支援 array、{ rags }、{ items }、或單一 RAG 物件） */
export function normalizeRagListResponse(data) {
  if (Array.isArray(data)) return data;
  const list = data?.rags ?? data?.items;
  if (Array.isArray(list) && list.length > 0) return list;
  if (data != null && typeof data === 'object' && (data.rag_tab_id != null || data.rag_id != null)) return [data];
  return [];
}

/** 是否為「新增」用的 tab id（未存在於 DB） */
export function isNewTabId(id) {
  return id === 'new' || (typeof id === 'string' && id.startsWith('new-'));
}
