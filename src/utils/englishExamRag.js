/**
 * 建立「英文測驗題庫」專用 fork（與 `rag.js` 分離；英文題庫頁與其專用 composable／API 僅 import 本檔）
 *
 * RAG 相關純函數與常數
 *
 * 供 CreateEnglishExamQuizBankPage、useEnglishRagTabState、useEnglishExamPackTasks、englishExamRagApi 等使用。
 * 不依賴 Vue 或 API，僅為資料轉換與 ID 產生邏輯。
 */

/** 建 RAG 時預設的系統提示（題目生成指令） */
export const DEFAULT_SYSTEM_INSTRUCTION = '題目字數不超過200字';
/** 題目難度選項與 tab/quiz/create API 的 quiz_level 字串值 */
export const QUIZ_LEVEL_LABELS = ['基礎', '進階'];

/**
 * POST /rag/tab/quiz/create、/exam/tab/quiz/create 的 quiz_level：固定為「基礎」或「進階」
 * @param {unknown} selected - UI 選取值，或舊版 0／1
 * @returns {string}
 */
export function quizLevelStringForApi(selected) {
  if (selected === 0 || selected === 1) return QUIZ_LEVEL_LABELS[selected];
  const s = String(selected ?? '').trim();
  if (s === '0') return QUIZ_LEVEL_LABELS[0];
  if (s === '1') return QUIZ_LEVEL_LABELS[1];
  if (QUIZ_LEVEL_LABELS.includes(s)) return s;
  return QUIZ_LEVEL_LABELS[0];
}

/**
 * 將 API／DB 的 quiz_level 轉成顯示用文字；支援字串「基礎」「進階」與舊版 0／1
 * @param {unknown} level
 * @returns {string | null} 無法辨識時 null
 */
export function normalizeQuizLevelLabel(level) {
  if (level === 0 || level === 1) return QUIZ_LEVEL_LABELS[level];
  const s = String(level ?? '').trim();
  if (s === '0') return QUIZ_LEVEL_LABELS[0];
  if (s === '1') return QUIZ_LEVEL_LABELS[1];
  if (QUIZ_LEVEL_LABELS.includes(s)) return s;
  return null;
}

/**
 * public."Exam_Quiz" 列（或 POST /exam/tab/quiz/create 回傳）：難度可能在 quiz_level 或 quiz_metadata.quiz_level
 * @param {object | null | undefined} quiz
 * @returns {string | null}
 */
export function examQuizLevelFromRow(quiz) {
  if (!quiz || typeof quiz !== 'object') return null;
  const meta = quiz.quiz_metadata;
  const fromMeta =
    meta != null && typeof meta === 'object' && meta.quiz_level != null ? meta.quiz_level : undefined;
  return normalizeQuizLevelLabel(quiz.quiz_level ?? fromMeta);
}

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
 * @param {object} [o] - 含 tab_name / rag_name / rag_tab_id / filename 等欄位的物件
 * @returns {string}
 */
export function deriveRagName(o) {
  if (o && typeof o.tab_name === 'string' && o.tab_name) return o.tab_name;
  if (o && typeof o.rag_name === 'string' && o.rag_name) return o.rag_name;
  const id = o?.rag_tab_id ?? '';
  const s = String(id);
  if (s.endsWith('_rag')) return s.slice(0, -4);
  const fn = o?.filename ?? o?.rag_filename ?? '';
  const f = String(fn).replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '').replace(/_rag$/, '');
  return f || s || '';
}

/**
 * 「產生題目」單元下拉的 v-model：優先 unit_name（與 tab/quiz/create 一致，tab/build-rag-zip 前後較不易因 rag_tab_id 重算而失效）
 * @param {object} [opt]
 * @returns {string}
 */
export function unitSelectValue(opt) {
  if (!opt || typeof opt !== 'object') return '';
  const un = String(opt.unit_name ?? '').trim();
  if (un) return un;
  const tn = String(opt.tab_name ?? '').trim();
  if (tn) return tn;
  const tid = String(opt.rag_tab_id ?? '').trim();
  if (tid) return tid;
  return String(opt.rag_name ?? '').trim();
}

/**
 * outputs 清單更新後，對齊 slot.generateQuizTabId；對不到則清空（避免原生 select 無匹配 value 時誤顯示第一筆）
 * @param {{ generateQuizTabId?: string }} slot
 * @param {object[]} units
 */
export function reconcileQuizUnitSelectSlot(slot, units) {
  if (!slot || !Array.isArray(units)) return;
  const raw = slot.generateQuizTabId;
  if (raw == null || String(raw).trim() === '') return;
  const key = String(raw).trim();
  if (units.some((u) => unitSelectValue(u) === key)) return;
  const legacy = units.find((u) => String(u.rag_tab_id ?? '').trim() === key);
  if (legacy) {
    slot.generateQuizTabId = unitSelectValue(legacy);
    return;
  }
  slot.generateQuizTabId = '';
}

/**
 * 依下拉目前值找出單元（支援舊版只存 rag_tab_id）
 * @param {object[]} units
 * @param {string} [generateQuizTabId]
 * @returns {object | undefined}
 */
export function findQuizUnitBySlotSelection(units, generateQuizTabId) {
  const key = String(generateQuizTabId ?? '').trim();
  if (!key || !Array.isArray(units)) return undefined;
  return units.find((u) => unitSelectValue(u) === key)
    || units.find((u) => String(u.rag_tab_id ?? '').trim() === key);
}

/**
 * 將 GET /rag/tabs 單筆的 rag_metadata 正規化為物件。
 * 後端常將 rag_metadata 存成 JSON 字串，若直接用 rag.rag_metadata.outputs 會讀不到。
 * @param {object} [rag]
 * @returns {object | null}
 */
export function parseRagMetadataObject(rag) {
  const raw = rag?.rag_metadata;
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

/**
 * Rag 表上的單元清單字串（tab/build-rag-zip 的 unit_list；列表 API 可能為 unit_list，相容 rag_list）
 * @param {object} [rag]
 * @returns {string} trim 後字串，無則 ''
 */
export function getRagUnitListString(rag) {
  if (!rag || typeof rag !== 'object') return '';
  const u = rag.unit_list ?? rag.rag_list;
  if (u == null) return '';
  return String(u).trim();
}

/**
 * 將 unit_list 字串解析為虛擬資料夾群組（供建 RAG 時分組）
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
 * 將虛擬資料夾群組序列化為後端 unit_list 字串
 * @param {string[][]} list - 二維陣列，每群組為一組資料夾名稱
 * @returns {string}
 */
export function serializePackTasksList(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map((g) => (Array.isArray(g) ? g.filter(Boolean).join('+') : '')).filter(Boolean).join(',');
}

/**
 * 將 GET /rag/tabs 回傳正規化為 RAG 陣列
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
 * 將 GET /exam/tabs 回傳正規化為 Exam 陣列（對齊 normalizeRagListResponse 思路）
 * 支援：直接陣列、{ exams }、{ tests }、{ items }、{ data }、或單一 Exam 物件
 * @param {unknown} data
 * @returns {object[]}
 */
export function normalizeExamListResponse(data) {
  if (Array.isArray(data)) return data;
  const list = data?.exams ?? data?.tests ?? data?.items ?? data?.data;
  if (Array.isArray(list) && list.length > 0) return list;
  if (
    data != null &&
    typeof data === 'object' &&
    (data.exam_tab_id != null ||
      data.exam_id != null ||
      data.test_tab_id != null ||
      data.test_id != null)
  ) {
    return [data];
  }
  return [];
}

/**
 * GET /person-analysis/quizzes、GET /course-analysis/quizzes 回傳的列表包裝：
 * 與 GET /exam/tabs 一致時為 { exams }；與 GET /rag/tabs 一致時為 { rags }
 * @param {unknown} data
 * @returns {object[]}
 */
export function normalizeAnalysisQuizzesListResponse(data) {
  const fromExams = normalizeExamListResponse(data);
  if (fromExams.length > 0) return fromExams;
  return normalizeRagListResponse(data);
}

/**
 * 合併 answers 時以字串當 key（與後端欄位一致：exam_quiz_id、rag_quiz_id；後備 quiz_id）
 * @param {object | null | undefined} q
 * @returns {string}
 */
export function examOrRagQuizRowKey(q) {
  if (!q || typeof q !== 'object') return '';
  const v = q.exam_quiz_id ?? q.rag_quiz_id ?? q.quiz_id;
  return v != null && String(v).trim() !== '' ? String(v) : '';
}

/**
 * @param {object | null | undefined} a
 * @returns {string}
 */
export function examOrRagAnswerRowKey(a) {
  if (!a || typeof a !== 'object') return '';
  const v = a.exam_quiz_id ?? a.rag_quiz_id ?? a.quiz_id;
  return v != null && String(v).trim() !== '' ? String(v) : '';
}

/**
 * 單筆 Exam／Rag 列（與 GET /exam/tabs、GET /rag/tabs 每筆相同）：quizzes／exam_quizzes 與頂層 answers／exam_answers 合併為每題含 answers（與 ExamPage syncExamItemToTabState 一致）
 * @param {object | null | undefined} item
 * @returns {object[]}
 */
export function mergeQuizzesWithTopLevelAnswers(item) {
  if (!item || typeof item !== 'object') return [];
  const quizzes = item.quizzes ?? item.exam_quizzes ?? [];
  const topAnswers = item.answers ?? item.exam_answers ?? [];
  if (quizzes.length === 0) return [];
  const answersByQuizId = topAnswers.reduce((acc, a) => {
    const id = examOrRagAnswerRowKey(a);
    if (!id) return acc;
    if (!acc[id]) acc[id] = [];
    acc[id].push(a);
    return acc;
  }, {});
  return quizzes.map((q, i) => {
    const qKey = examOrRagQuizRowKey(q);
    const byId = q.answers ?? (qKey ? answersByQuizId[qKey] : undefined);
    const answers = Array.isArray(byId) && byId.length > 0 ? byId : topAnswers[i] != null ? [topAnswers[i]] : [];
    return { ...q, answers };
  });
}

/**
 * 是否為「新增」用的 tab id（尚未寫入後端）
 * @param {string} [id]
 * @returns {boolean}
 */
export function isNewTabId(id) {
  return id === 'new' || (typeof id === 'string' && id.startsWith('new-'));
}
