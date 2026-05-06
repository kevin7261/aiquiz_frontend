/**
 * RAG 相關純函數與常數
 *
 * 供 CreateExamQuizBankPage、useRagTabState、usePackTasks、ragApi 等使用。
 * 不依賴 Vue 或 API，僅為資料轉換與 ID 產生邏輯。
 */

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
 * 試卷題庫題目下拉的 v-model：Rag_Quiz 主鍵 rag_quiz_id（字串）
 * @param {object} [opt]
 * @returns {string}
 */
export function ragQuizSelectValue(opt) {
  if (!opt || typeof opt !== 'object') return '';
  const id =
    opt.rag_quiz_id
    ?? opt.RagQuizId
    ?? opt.ragQuizId
    ?? opt.quiz_id
    ?? opt.QuizId
    ?? opt.id
    ?? opt.Id;
  if (id == null || id === '') return '';
  return String(id).trim();
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
 * unit_list／packTasks 序列化占位：該列出題單元「資料夾組合為空」。僅前端狀態用；POST build-rag-zip 前有 isPackTasksListReady。
 * （勿與實際資料夾名稱雷同；字面 __PQ_EMPTY_ROW__ unlikely as course folder）
 */
export const PACK_ROW_EMPTY_UNIT_LIST_MARKER = '__PQ_EMPTY_ROW__';

/**
 * 將 unit_list 字串解析為虛擬資料夾群組（供建 RAG 時分組）
 * 格式：'a+b,c' → [['a','b'],['c']]，逗號分隔群組，加號分隔同群組內的資料夾。
 * 占位 {@link PACK_ROW_EMPTY_UNIT_LIST_MARKER} 對應空資料夾列（沿用列數）。
 * @param {string} [str]
 * @returns {string[][]}
 */
export function parsePackTasksList(str) {
  const s = String(str ?? '').trim();
  if (!s) return [];
  const emptyMark = PACK_ROW_EMPTY_UNIT_LIST_MARKER;
  return s.split(',').map((part) => {
    const trimmed = String(part ?? '').trim();
    if (trimmed === emptyMark) return [];
    return trimmed.split('+').map((x) => x.trim()).filter(Boolean);
  });
}

/**
 * 將虛擬資料夾群組序列化為後端 unit_list 字串
 * @param {string[][]} list - 二維陣列，每群組為一組資料夾名稱；[] 對應 {@link PACK_ROW_EMPTY_UNIT_LIST_MARKER}
 * @returns {string}
 */
export function serializePackTasksList(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const emptyMark = PACK_ROW_EMPTY_UNIT_LIST_MARKER;
  return list.map((g) => {
    if (!Array.isArray(g) || g.length === 0) return emptyMark;
    return g.filter(Boolean).join('+');
  }).join(',');
}

/** 出題單元類型（與後端 unit_types／unit_type_list 對齊）：0 未選、1 rag→PDF／Office、2 文字→.md、3 mp3→.mp3、4 youtube→.md（預設 rag） */
export const UNIT_TYPE_RAG = 1;
export const UNIT_TYPE_TEXT = 2;
export const UNIT_TYPE_MP3 = 3;
export const UNIT_TYPE_YOUTUBE = 4;

/** 出題單元預設分段長度／重疊（與 POST build-rag-zip rag_chunk_* 對齊；每群一筆） */
export const DEFAULT_PACK_CHUNK_SIZE = 1000;
export const DEFAULT_PACK_CHUNK_OVERLAP = 200;

/**
 * POST /rag/tab/build-rag-zip 的 body.transcriptions：與 unit_list 逗號分段同序、同數量（每個出題單元一筆）。
 * unit_type 為 2／3／4 時為該單元逐字稿全文（前端 Markdown 編輯區字串，JSON UTF-8 原樣送出，不剝格式）；其餘型別傳空字串。
 * @param {number[]} unitTypes - 與 parsePackUnitTypesFromRag 結果同長度
 * @param {unknown[]} [markdownTexts] - packUnitMarkdownTexts，與群組索引對齊
 * @returns {string[]}
 */
export function transcriptionsForBuildRagZip(unitTypes, markdownTexts) {
  const types = Array.isArray(unitTypes) ? unitTypes : [];
  const texts = Array.isArray(markdownTexts) ? markdownTexts : [];
  const out = [];
  for (let i = 0; i < types.length; i++) {
    const t = Number(types[i]);
    const raw = texts[i] != null ? String(texts[i]) : '';
    if (t === UNIT_TYPE_TEXT || t === UNIT_TYPE_MP3 || t === UNIT_TYPE_YOUTUBE) {
      out.push(raw);
    } else {
      out.push('');
    }
  }
  return out;
}

function isValidUnitType(n) {
  return n === 0 || n === 1 || n === 2 || n === 3 || n === 4;
}

function groupSig(g) {
  if (!Array.isArray(g) || g.length === 0) return '';
  return [...g].map(String).sort().join('\u0001');
}

/**
 * 拖放／刪除標籤後，依群組資料夾集合對齊 unit_types（僅序位可能變動時沿用原類型）
 * @param {string[][]} oldList
 * @param {number[]} oldTypes
 * @param {string[][]} newList
 * @returns {number[]}
 */
export function remapPackUnitTypes(oldList, oldTypes, newList) {
  const ol = oldList || [];
  const nl = newList || [];
  const ot = [...(oldTypes || [])];
  while (ot.length < ol.length) ot.push(UNIT_TYPE_RAG);
  ot.length = ol.length;
  const used = new Set();
  return nl.map((g) => {
    const s = groupSig(g);
    if (!s) return UNIT_TYPE_RAG;
    for (let i = 0; i < ol.length; i++) {
      if (used.has(i)) continue;
      if (groupSig(ol[i]) === s) {
        used.add(i);
        const v = ot[i];
        return isValidUnitType(v) ? v : UNIT_TYPE_RAG;
      }
    }
    return UNIT_TYPE_RAG;
  });
}

/**
 * 拖放／刪除標籤後，依群組資料夾集合對齊與 unit_types 同序之數值陣列（如 rag_chunk_size）
 * @param {string[][]} oldList
 * @param {unknown[]} oldVals
 * @param {string[][]} newList
 * @param {number} defaultVal
 * @returns {number[]}
 */
export function remapPackParallelNumbers(oldList, oldVals, newList, defaultVal) {
  const ol = oldList || [];
  const nl = newList || [];
  const ov = [...(oldVals || [])];
  while (ov.length < ol.length) ov.push(defaultVal);
  ov.length = ol.length;
  const def = Number(defaultVal);
  const d = Number.isFinite(def) ? def : 0;
  const used = new Set();
  return nl.map((g) => {
    const s = groupSig(g);
    if (!s) return d;
    for (let i = 0; i < ol.length; i++) {
      if (used.has(i)) continue;
      if (groupSig(ol[i]) === s) {
        used.add(i);
        const n = Number(ov[i]);
        return Number.isFinite(n) ? n : d;
      }
    }
    return d;
  });
}

/**
 * 與 remapPackParallelNumbers 相同簽章對齊語意，用於 markdown、YouTube URL、錯誤訊息等字串陣列。
 * @param {string[][]} oldList
 * @param {unknown[]} oldVals
 * @param {string[][]} newList
 * @param {string} [emptyVal]
 * @returns {string[]}
 */
export function remapPackParallelStrings(oldList, oldVals, newList, emptyVal = '') {
  const ol = oldList || [];
  const nl = newList || [];
  const ev = emptyVal != null ? String(emptyVal) : '';
  const ov = [...(oldVals || [])].map((x) => (x != null ? String(x) : ev));
  while (ov.length < ol.length) ov.push(ev);
  ov.length = ol.length;
  const used = new Set();
  return nl.map((g) => {
    const s = groupSig(g);
    if (!s) return ev;
    for (let i = 0; i < ol.length; i++) {
      if (used.has(i)) continue;
      if (groupSig(ol[i]) === s) {
        used.add(i);
        const v = ov[i];
        return v != null ? String(v) : ev;
      }
    }
    return ev;
  });
}

/**
 * 同上，用於逐字稿載入中等布林陣列（新群組或無對應舊群組時為 false）。
 * @param {string[][]} oldList
 * @param {unknown[]} oldVals
 * @param {string[][]} newList
 * @returns {boolean[]}
 */
export function remapPackParallelBools(oldList, oldVals, newList) {
  const ol = oldList || [];
  const nl = newList || [];
  const ov = [...(oldVals || [])].map((x) => !!x);
  while (ov.length < ol.length) ov.push(false);
  ov.length = ol.length;
  const used = new Set();
  return nl.map((g) => {
    const s = groupSig(g);
    if (!s) return false;
    for (let i = 0; i < ol.length; i++) {
      if (used.has(i)) continue;
      if (groupSig(ol[i]) === s) {
        used.add(i);
        return !!ov[i];
      }
    }
    return false;
  });
}

/**
 * 自 GET /rag/tabs 等欄位還原 unit_types（逗號分隔數字，序與 unit_list 群組對齊）
 * @param {unknown} raw - 逗號字串或數字陣列
 * @param {number} groupCount
 * @returns {number[]}
 */
export function parsePackUnitTypesFromRag(raw, groupCount) {
  const n = Math.max(0, Math.floor(Number(groupCount)) || 0);
  let arr = [];
  if (raw == null || raw === '') {
    return Array(n).fill(UNIT_TYPE_RAG);
  }
  if (Array.isArray(raw)) {
    arr = raw.map((x) => Number(x));
  } else {
    arr = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => Number(s));
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    out.push(isValidUnitType(v) ? v : UNIT_TYPE_RAG);
  }
  return out;
}

/**
 * POST /rag/tab/build-rag-zip 的 unit_types（與 unit_list 群組序對齊，逗號分隔字串）
 * @param {number[]} types
 * @returns {string}
 */
export function serializePackUnitTypesForApi(types) {
  if (!Array.isArray(types) || types.length === 0) return '';
  return types.map((t) => (isValidUnitType(Number(t)) ? Number(t) : UNIT_TYPE_RAG)).join(',');
}

/**
 * 同上群組序，整數陣列（與 GET /rag/tabs 之 unit_type_list 對齊，供後端依類型掃描檔案）
 * @param {number[]} types
 * @returns {number[]}
 */
export function packUnitTypesIntArrayForApi(types) {
  if (!Array.isArray(types) || types.length === 0) return [];
  return types.map((t) => (isValidUnitType(Number(t)) ? Number(t) : UNIT_TYPE_RAG));
}

/**
 * POST /rag/tab/build-rag-zip 的 rag_chunk_sizes／rag_chunk_overlaps：後端請求體為與 unit_list 群組序對齊的逗號分隔字串（非 JSON 陣列）。
 * unit_type≠1（非 RAG）時為 0，與後端僅對 type 1 做分段／FAISS 一致。
 *
 * @param {number[]} unitTypes - parsePackUnitTypesFromRag 結果
 * @param {unknown[]} [chunkSizes] - 與群組同序 UI 數值
 * @param {unknown[]} [chunkOverlaps] - 同上
 * @returns {{ rag_chunk_sizes: string, rag_chunk_overlaps: string }}
 */
export function chunkSizesOverlapsStringsForBuildRagZip(
  unitTypes,
  chunkSizes,
  chunkOverlaps,
  defaultSize = DEFAULT_PACK_CHUNK_SIZE,
  defaultOverlap = DEFAULT_PACK_CHUNK_OVERLAP
) {
  const types = Array.isArray(unitTypes) ? unitTypes : [];
  const szIn = Array.isArray(chunkSizes) ? chunkSizes : [];
  const ovIn = Array.isArray(chunkOverlaps) ? chunkOverlaps : [];
  const n = types.length;
  const ds = Number(defaultSize);
  const dov = Number(defaultOverlap);
  const defS = Number.isFinite(ds) ? ds : DEFAULT_PACK_CHUNK_SIZE;
  const defO = Number.isFinite(dov) ? dov : DEFAULT_PACK_CHUNK_OVERLAP;
  const sizesNums = [];
  const oversNums = [];
  for (let i = 0; i < n; i++) {
    const ut = Number(types[i]);
    const sNum = Number(szIn[i]);
    const oNum = Number(ovIn[i]);
    if (ut === UNIT_TYPE_RAG) {
      sizesNums.push(Number.isFinite(sNum) ? sNum : defS);
      oversNums.push(Number.isFinite(oNum) ? oNum : defO);
    } else {
      sizesNums.push(0);
      oversNums.push(0);
    }
  }
  return {
    rag_chunk_sizes: sizesNums.join(','),
    rag_chunk_overlaps: oversNums.join(','),
  };
}

/**
 * POST /rag/tab/build-rag-zip 可選 body.unit_names：與 unit_list 群組同序的逗號字串（與 rag_chunk_sizes 語意一致）。
 * 名稱內逗號改為空白，避免與分隔歧義。
 *
 * @param {unknown[]} [names]
 * @param {number} groupCount
 * @returns {string}
 */
export function serializePackUnitNamesForApi(names, groupCount) {
  const n = Math.max(0, Math.floor(Number(groupCount)) || 0);
  const src = Array.isArray(names) ? names : [];
  const parts = [];
  for (let i = 0; i < n; i++) {
    const raw = String(src[i] ?? '')
      .trim()
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    parts.push(raw);
  }
  return parts.join(',');
}

/**
 * 將 GET /rag/tabs 回傳正規化為 RAG 陣列
 * 支援：直接陣列、{ rags, count }、{ items }、{ tabs }／{ data }（為陣列時）、或單一 RAG 物件
 * @param {unknown} data - API 回傳的資料
 * @returns {object[]}
 */
export function normalizeRagListResponse(data) {
  if (Array.isArray(data)) return data;
  const list =
    data?.rags
    ?? data?.items
    ?? (Array.isArray(data?.tabs) ? data.tabs : undefined)
    ?? (Array.isArray(data?.data) ? data.data : undefined);
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
 * GET /exam/tabs 新版：Exam_Quiz 上可內嵌作答 answer_content／quiz_score／answer_critique（無獨立 Exam_Answer 陣列時）
 * @param {object | null | undefined} q
 * @returns {boolean}
 */
function examQuizHasEmbeddedAnswerFields(q) {
  if (!q || typeof q !== 'object') return false;
  const c = q.answer_content;
  const g = q.quiz_score;
  const crit = q.answer_critique;
  return (
    (c != null && String(c).trim() !== '')
    || (g != null && String(g).trim() !== '')
    || (crit != null && String(crit).trim() !== '')
  );
}

/**
 * 將內嵌欄位轉成與頂層 answers[] 相容的一筆物件（供 mergeQuizzesWithTopLevelAnswers／題卡共用）
 * @param {object} q
 * @returns {object[]}
 */
function answersFromEmbeddedExamQuizFields(q) {
  if (!examQuizHasEmbeddedAnswerFields(q)) return [];
  const crit = q.answer_critique;
  const score = q.quiz_score;
  const row = {
    quiz_answer: q.answer_content ?? '',
    student_answer: q.answer_content ?? '',
    quiz_score: score,
    exam_quiz_id: q.exam_quiz_id,
  };
  if (crit != null && String(crit).trim() !== '') {
    row.quiz_comments = [String(crit).trim()];
  }
  return [row];
}

/**
 * 單筆 Exam／Rag 列（與 GET /exam/tabs、GET /rag/tabs 每筆相同）：quizzes／exam_quizzes 與頂層 answers／exam_answers 合併為每題含 answers（與 ExamPage syncExamItemToTabState 一致）
 *
 * GET /exam/tabs 新版：每筆 Exam 可為 units[]（Exam_Unit），每單元 quizzes[]（Exam_Quiz），作答欄位可內嵌於題列。
 *
 * @param {object | null | undefined} item
 * @returns {object[]}
 */
export function mergeQuizzesWithTopLevelAnswers(item) {
  if (!item || typeof item !== 'object') return [];
  const topAnswers = item.answers ?? item.exam_answers ?? [];
  const answersByQuizId = topAnswers.reduce((acc, a) => {
    const id = examOrRagAnswerRowKey(a);
    if (!id) return acc;
    if (!acc[id]) acc[id] = [];
    acc[id].push(a);
    return acc;
  }, {});

  const units = item.units;
  if (Array.isArray(units) && units.length > 0) {
    const out = [];
    let globalIndex = 0;
    for (const u of units) {
      const unitLabel = u.unit_name ?? u.name ?? '';
      const unitQuizzes = u.quizzes ?? u.exam_quizzes ?? [];
      for (const q of unitQuizzes) {
        const qKey = examOrRagQuizRowKey(q);
        const nested = q.answers;
        const byId = nested ?? (qKey ? answersByQuizId[qKey] : undefined);
        const embedded = answersFromEmbeddedExamQuizFields(q);
        let answers = [];
        if (Array.isArray(byId) && byId.length > 0) {
          answers = [...byId];
        } else if (embedded.length > 0) {
          answers = embedded;
        } else if (topAnswers[globalIndex] != null) {
          answers = [topAnswers[globalIndex]];
        }
        out.push({
          ...q,
          unit_name: q.unit_name ?? unitLabel,
          answers,
        });
        globalIndex += 1;
      }
    }
    return out;
  }

  const quizzes = item.quizzes ?? item.exam_quizzes ?? [];
  if (quizzes.length === 0) return [];
  return quizzes.map((q, i) => {
    const qKey = examOrRagQuizRowKey(q);
    const nested = q.answers;
    const byId = nested ?? (qKey ? answersByQuizId[qKey] : undefined);
    const embedded = answersFromEmbeddedExamQuizFields(q);
    let answers = [];
    if (Array.isArray(byId) && byId.length > 0) {
      answers = [...byId];
    } else if (embedded.length > 0) {
      answers = embedded;
    } else if (topAnswers[i] != null) {
      answers = [topAnswers[i]];
    }
    return { ...q, answers };
  });
}

/**
 * 尚無已存作答時：以暫存參考答案預填「答案」輸入（與 QuizCard 拆區後之單一答案欄一致）
 * @param {unknown} referenceAnswer
 * @returns {string}
 */
export function quizAnswerPresetFromReference(referenceAnswer) {
  const r = referenceAnswer != null ? String(referenceAnswer) : '';
  return r.trim() !== '' ? r : '';
}

/**
 * 是否為「新增」用的 tab id（尚未寫入後端）
 * @param {string} [id]
 * @returns {boolean}
 */
export function isNewTabId(id) {
  return id === 'new' || (typeof id === 'string' && id.startsWith('new-'));
}
