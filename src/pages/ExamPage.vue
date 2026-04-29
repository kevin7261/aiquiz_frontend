<script setup>
/**
 * ExamPage - 測驗頁面
 *
 * 與 CreateExamQuizBankPage 版面類似（分頁、題目卡片、出題/評分），但無 RAG 建立/上傳/Pack；題目來源為 GET /exam/rag-for-exams／測驗分頁。POST /exam/tab/quiz/create 僅 body.exam_tab_id 建立空白 Exam_Quiz（不呼叫 LLM、不需上傳 rag_unit_id）；有試卷題庫單元時可選單元／題名。LLM 出題 POST /exam/tab/quiz/llm-generate。
 *
 * 資料來源：
 * - 試卷題庫／單元選項：GET /exam/rag-for-exams（內嵌 quizzes 時出題／批改 prompt 欄位為預覽；query person_id 必填但不用於篩選）；不呼叫 GET /rag/tab/for-exam
 * - GET /exam/tabs?local=&person_id=：person_id 為必填 query；local 與 GET /rag/tabs 相同；每筆 Exam 含 units[]（Exam_Unit），每單元 quizzes[]（Exam_Quiz）；作答可為頂層 answers[] 或題列內嵌 answer_content／quiz_score（或 quiz_grade）／answer_critique；mergeQuizzesWithTopLevelAnswers 展平後 syncExamItemToTabState 灌入卡片
 * 出題：空白列 POST /exam/tab/quiz/create（僅 exam_tab_id）；LLM 出題 POST /exam/tab/quiz/llm-generate（body：exam_quiz_id 必填；選填 rag_unit_id、rag_quiz_id、unit_name、quiz_name、quiz_user_prompt_text；題名／出題指令／題庫鍵來自 GET /exam/rag-for-exams `units[].quizzes[]`）；評分：POST /exam/tab/quiz/llm-grade、GET /exam/tab/quiz/grade-result/{job_id}；題目讚／差：POST /exam/tab/quiz/rate；分頁更名：PUT /exam/tab/tab-name；刪除：POST /exam/tab/delete/{exam_tab_id}
 *
 * 試題資料表 public."Exam_Quiz"（與 GET/POST 題目 payload 對齊）：exam_quiz_id、exam_id、exam_tab_id、person_id、rag_id、unit_name、file_name、quiz_content、quiz_hint、quiz_answer_reference、quiz_rate（-1／0／1）、quiz_metadata、updated_at、created_at。畫面「單元」優先 unit_name；難度優先 quiz_level，否則 quiz_metadata.quiz_level。
 */
import { ref, computed, watch, onActivated, reactive, nextTick } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_RESPONSE_QUIZ_CONTENT,
  API_RESPONSE_QUIZ_LEGACY,
  API_RAG_FOR_EXAMS,
  API_EXAM_TESTS,
  API_CREATE_EXAM,
  API_EXAM_DELETE,
  API_EXAM_QUIZ_GRADE,
  API_EXAM_QUIZ_GRADE_RESULT,
  API_EXAM_RATE_QUIZ,
  isFrontendLocalHost,
} from '../constants/api.js';
import {
  parseRagMetadataObject,
  getRagUnitListString,
  normalizeQuizLevelLabel,
  examQuizLevelFromRow,
  normalizeExamListResponse,
  mergeQuizzesWithTopLevelAnswers,
  quizAnswerPresetFromReference,
  ragQuizSelectValue,
  DEFAULT_SYSTEM_INSTRUCTION as RAG_DEFAULT_SYSTEM_INSTRUCTION,
} from '../utils/rag.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import QuizCard from '../components/QuizCard.vue';
import UnitSelectDropdown from '../components/UnitSelectDropdown.vue';
import TabRenameModal from '../components/TabRenameModal.vue';
import {
  apiUpdateExamTabName,
  apiExamTabQuizCreate,
  apiExamTabQuizLlmGenerate,
} from '../services/examApi.js';
import { formatGradingResult } from '../utils/grading.js';
import { submitGrade } from '../composables/useQuizGrading.js';
import { loggedFetch } from '../utils/loggedFetch.js';

defineProps({
  tabId: { type: String, required: true },
});

const authStore = useAuthStore();

/** 與 CreateExamQuizBankPage 相同命名，供標題／載入文案／空狀態按鈕共用 */
const pageTitle = computed(() => '測驗');
const quizBankNoun = computed(() => '試卷');

/** 與後端／出題 API 預設系統提示一致（見 rag.js） */
const DEFAULT_SYSTEM_INSTRUCTION = RAG_DEFAULT_SYSTEM_INSTRUCTION;

/** test_tab_id 規則：與 RAG 頁一致 → {person_id}_yymmddhhmmss；無 person_id 時 fallback 為 UUID */
function generateTabId(personId) {
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

/** 從 test_tab_id 取得 test_name：與 RAG 頁一致，底線後的部份（時間），無底線則用整段 */
function deriveNameFromTabId(tabId) {
  if (!tabId || typeof tabId !== 'string') return '';
  const idx = String(tabId).indexOf('_');
  return idx >= 0 ? String(tabId).slice(idx + 1) : String(tabId);
}

/** API 若回傳「找不到資料」（404/Not Found），在空畫面視為無資料而非錯誤。 */
function isNotFoundLike(status, message) {
  if (Number(status) === 404) return true;
  const msg = String(message ?? '').toLowerCase();
  return msg.includes('not found') || msg.includes('查無');
}

/**
 * GET /exam/rag-for-exams 回傳包裝不一；整理成與題面既有邏輯相容的 rag 形狀（rag_id、rag_tab_id、outputs[]／rag_metadata 等）。
 * 若內嵌 Rag_Quiz：出題 prompt／批改 prompt 後端僅給預覽，前端勿當完整字串送去 LLM。
 *
 * 注意：此端點通常只回傳「測驗用」單元／題目（for_exam=true 等後端規則）。若全為 for_exam=false，回傳的 units 可能為 []，與其他 API（例如完整單元列表）長相不同。
 * @param {unknown} data
 * @returns {object | null}
 */
function normalizeExamRagForExamsPayload(data) {
  if (data == null) return null;

  function parseArrayMaybeJson(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function normalizeUnitRows(rawUnits) {
    const rows = parseArrayMaybeJson(rawUnits);
    return rows.map((u) => {
      if (!u || typeof u !== 'object') return u;
      const parsedQuizzes = parseArrayMaybeJson(u.quizzes);
      if (Array.isArray(u.quizzes) || parsedQuizzes.length > 0) {
        return { ...u, quizzes: parsedQuizzes };
      }
      return u;
    });
  }

  function unitToOutput(u) {
    if (!u || typeof u !== 'object') return {};
    const unitName = u.unit_name ?? u.name ?? '';
    const ragName = u.rag_name ?? unitName;
    return {
      rag_tab_id: u.rag_tab_id ?? u.RagTabId,
      rag_unit_id: u.rag_unit_id ?? u.RagUnitId,
      unit_name: unitName,
      rag_name: ragName,
      filename:
        u.filename ??
        u.file_name ??
        u.repack_file_name ??
        u.rag_file_name ??
        '',
      quizzes: u.quizzes,
    };
  }

  if (Array.isArray(data)) {
    const units = normalizeUnitRows(data);
    if (!units.length) return null;
    const u0 = units[0];
    return {
      rag_id: u0.rag_id ?? u0.RagId,
      rag_tab_id: u0.rag_tab_id ?? u0.RagTabId,
      rag_name: u0.rag_name ?? u0.unit_name,
      units,
      outputs: units.map(unitToOutput),
      transcription: u0.transcription ?? u0.quiz_system_prompt_text ?? undefined,
    };
  }

  if (typeof data !== 'object') return null;

  /** @param {object} obj */
  function extractRawUnitsList(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const keys = [
      'units',
      'rag_units',
      'Units',
      'RagUnits',
      'exam_units',
      'examUnits',
      'unit_list',
      'unitList',
    ];
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      const rows = parseArrayMaybeJson(obj[k]);
      if (rows.length > 0) return rows;
    }
    return null;
  }

  /** @param {object} container */
  function deepExtractUnits(container) {
    const direct = extractRawUnitsList(container);
    if (direct) return direct;
    if (!container || typeof container !== 'object' || Array.isArray(container)) return null;
    for (const nk of ['result', 'payload', 'body', 'content', 'records']) {
      const inner = container[nk];
      if (!inner || typeof inner !== 'object') continue;
      if (Array.isArray(inner)) {
        const rows = normalizeUnitRows(inner);
        if (rows.length > 0) return inner;
        continue;
      }
      const nested = extractRawUnitsList(inner);
      if (nested) return nested;
    }
    return null;
  }

  let unwrap = data;
  if (data.data != null && typeof data.data === 'object') {
    unwrap = data.data;
  } else if (data.Data != null && typeof data.Data === 'object') {
    unwrap = data.Data;
  }

  // 某些 API 將單元陣列放在 data 本體：{ data: [ { unit... }, ... ] }
  if (Array.isArray(unwrap)) {
    const units = normalizeUnitRows(unwrap);
    if (units.length > 0) {
      const u0 = units[0];
      const ragId = u0.rag_id ?? u0.RagId;
      const ragTabId = u0.rag_tab_id ?? u0.RagTabId;
      return {
        rag_id: ragId,
        rag_tab_id: ragTabId,
        rag_name: u0.rag_name ?? u0.unit_name,
        units,
        outputs: units.map(unitToOutput),
        transcription: u0.transcription ?? u0.quiz_system_prompt_text ?? undefined,
      };
    }
  }

  const unwrapHasUnitsKey =
    Object.prototype.hasOwnProperty.call(unwrap, 'units')
    || Object.prototype.hasOwnProperty.call(unwrap, 'rag_units');

  function countNestedQuizzes(unitRows) {
    if (!Array.isArray(unitRows)) return 0;
    let total = 0;
    for (const u of unitRows) {
      const quizzes = parseArrayMaybeJson(u?.quizzes);
      total += quizzes.length;
    }
    return total;
  }

  function pickRicherUnitRows(a, b) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    if (!aa.length) return bb;
    if (!bb.length) return aa;
    const aq = countNestedQuizzes(aa);
    const bq = countNestedQuizzes(bb);
    if (bq > aq) return bb;
    if (aq > bq) return aa;
    return bb.length > aa.length ? bb : aa;
  }

  const pickRag =
    unwrap.rag
    ?? (Array.isArray(unwrap.rags) && unwrap.rags.length ? unwrap.rags[0] : null);

  const unitsFromRag = normalizeUnitRows(pickRag && (pickRag.units ?? pickRag.rag_units));
  const rawRootUnits =
    deepExtractUnits(unwrap)
    ?? extractRawUnitsList(unwrap)
    ?? unwrap.units
    ?? unwrap.rag_units;
  const unitsFromRoot = normalizeUnitRows(rawRootUnits);
  let units = unitsFromRag.length > 0 ? unitsFromRag : unitsFromRoot;

  if (!Array.isArray(units)) {
    const alt = unwrap.items ?? unwrap.results ?? unwrap.rows;
    units = normalizeUnitRows(alt);
  }
  if (!units.length) {
    const alt = unwrap.items ?? unwrap.results ?? unwrap.rows;
    units = normalizeUnitRows(alt);
  }

  const sys =
    unwrap.transcription
    ?? pickRag?.transcription
    ?? null;
  const rootQuizzes = parseArrayMaybeJson(unwrap.quizzes);

  if (pickRag != null && typeof pickRag === 'object') {
    const base = { ...pickRag };
    if (sys != null && base.transcription == null) base.transcription = sys;
    const baseUnits = normalizeUnitRows(base.units ?? base.rag_units);
    const mergedUnits = pickRicherUnitRows(baseUnits, units);
    if (mergedUnits.length > 0) {
      if (!Array.isArray(base.outputs) || base.outputs.length === 0) base.outputs = mergedUnits.map(unitToOutput);
      base.units = mergedUnits;
    }
    const baseQuizzes = parseArrayMaybeJson(base.quizzes);
    if (baseQuizzes.length > 0 || rootQuizzes.length > 0) {
      base.quizzes = baseQuizzes.length > 0 ? baseQuizzes : rootQuizzes;
    }
    if (base.rag_tab_id != null || base.rag_id != null) return base;
  }

  if (Array.isArray(units) && units.length > 0) {
    const u0 = units[0];
    const ragId = unwrap.rag_id ?? u0.rag_id ?? u0.RagId;
    const ragTabId = unwrap.rag_tab_id ?? u0.rag_tab_id ?? u0.RagTabId;
    return {
      rag_id: ragId,
      rag_tab_id: ragTabId,
      rag_name: unwrap.rag_name,
      units,
      outputs: units.map(unitToOutput),
      quizzes: rootQuizzes.length > 0 ? rootQuizzes : undefined,
      transcription: sys ?? undefined,
      rag_metadata: unwrap.rag_metadata,
      unit_list: unwrap.unit_list,
      file_metadata: unwrap.file_metadata,
      file_size: unwrap.file_size,
    };
  }

  /** 後端明確回傳 units: [] 時仍回物件，避免與 JSON 解析失敗（null）混淆，測驗頁才能顯示「題庫為空」 */
  if (Array.isArray(units) && units.length === 0 && unwrapHasUnitsKey) {
    return {
      rag_id: unwrap.rag_id,
      rag_tab_id: unwrap.rag_tab_id ?? null,
      rag_name: unwrap.rag_name,
      units: [],
      outputs: [],
      quizzes: rootQuizzes.length > 0 ? rootQuizzes : undefined,
      transcription: sys ?? undefined,
      rag_metadata: unwrap.rag_metadata,
      unit_list: unwrap.unit_list,
      file_metadata: unwrap.file_metadata,
      file_size: unwrap.file_size,
    };
  }

  return null;
}

let cardIdSeq = 0;
function nextCardId() {
  return `card-${++cardIdSeq}`;
}

/** 與後端 Exam_Quiz.quiz_rate 一致：僅 -1、0、1 */
function normalizeExamQuizRate(v) {
  const n = Number(v);
  if (n === 1 || n === -1 || n === 0) return n;
  return 0;
}

/** GET /exam/rag-for-exams 正規化後的試卷題庫摘要（供 generateQuizUnits／題卡 rag_id 比對）；非 GET /rag/tab/for-exam */
const forExamRag = ref(null);
const forExamLoading = ref(false);
const forExamError = ref('');

function examNormalizeUnitRow(unit, fallbackTabId) {
  if (!unit || typeof unit !== 'object') return null;
  const rawName = unit.unit_name ?? unit.rag_name ?? unit.name ?? '';
  const name = String(rawName ?? '').trim();
  if (!name) return null;
  const tabId = String(unit.rag_tab_id ?? fallbackTabId ?? '').trim();
  const safeName = name.replace(/\+/g, '_');
  const src =
    unit.filename ??
    unit.file_name ??
    unit.repack_file_name ??
    unit.rag_file_name ??
    '';
  return {
    rag_tab_id: tabId || safeName,
    filename: src || `${safeName}_rag.zip`,
    rag_name: String(unit.rag_name ?? name).trim() || safeName,
    unit_name: safeName,
  };
}

function parseExamUnitQuizzesMaybe(unit) {
  if (!unit || typeof unit !== 'object') return [];
  const raw = unit.quizzes;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 試卷題庫該單元之 quizzes[]（優先用建列時保存之來源列，避免 rag.units 為空僅有 outputs 時題目下拉升空）
 * @param {object | null | undefined} unitItem - examUnitTabItems 其中一筆
 */
function examQuizzesForUnitTabItem(unitItem) {
  if (!unitItem || unitItem.sourceUnitIndex == null) return [];
  const src = unitItem.examRagUnitSource;
  if (src && typeof src === 'object') {
    return parseExamUnitQuizzesMaybe(src);
  }
  const rag = forExamRag.value;
  const rawUnits = rag?.units ?? rag?.rag_units;
  if (!Array.isArray(rawUnits) || rawUnits.length === 0) return [];
  const idx = Number(unitItem.sourceUnitIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= rawUnits.length) return [];
  return parseExamUnitQuizzesMaybe(rawUnits[idx]);
}

function examBuildUnitTabItem(unit, index, fallbackTabId) {
  const n = examNormalizeUnitRow(unit, fallbackTabId);
  if (!n) return null;
  const label = String(n.unit_name || n.rag_name || `單元 ${index + 1}`);
  const ragTabId = String(n.rag_tab_id ?? '').trim();
  const keyBase = label;
  const rawRagUnitId = unit?.rag_unit_id ?? unit?.RagUnitId;
  const ragUnitIdNum = Number(rawRagUnitId);
  const ragUnitId = Number.isFinite(ragUnitIdNum) ? ragUnitIdNum : null;
  return {
    id: `${ragTabId || 'tab'}::${keyBase}::${index}`,
    label,
    unitName: label,
    ragName: n.rag_name,
    filename: n.filename,
    ragTabId,
    ragUnitId,
    /** 正規化前原始列（quizzes／prompt；outputs 路徑下 rag.units 可能為空） */
    examRagUnitSource: unit,
    /** 對應 `GET /exam/rag-for-exams` 之 `units[index]`，供讀取 `quizzes[]` */
    sourceUnitIndex: index,
  };
}

const examUnitTabItems = computed(() => {
  const rag = forExamRag.value;
  if (!rag || typeof rag !== 'object') return [];
  const fallbackTabId = String(rag.rag_tab_id ?? '');
  const rawUnits = rag.units ?? rag.rag_units;
  let rows = [];
  if (Array.isArray(rawUnits) && rawUnits.length > 0) {
    rows = rawUnits;
  } else if (Array.isArray(rag.outputs) && rag.outputs.length > 0) {
    rows = rag.outputs.map((o) => (o && typeof o === 'object' ? { ...o } : o)).filter(Boolean);
  }
  return rows.map((u, i) => examBuildUnitTabItem(u, i, fallbackTabId)).filter(Boolean);
});

/** 出題區「單元」下拉 value（與 examUnitTabItems[].id 一致） */
function examUnitSelectValue(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.id ?? '').trim();
}

/**
 * Rag_Quiz／預覽列上的題名（對齊後端 quiz_name）
 * @param {object | null | undefined} qz
 */
function examQuizNameFromPreviewRow(qz) {
  if (!qz || typeof qz !== 'object') return '';
  return String(qz.quiz_name ?? qz.title ?? '').trim();
}

/**
 * 目前選定單元在試卷題庫中的 quiz_name 下拉選項。
 * @param {object | null | undefined} unitItem - examUnitTabItems 其中一筆
 */
function examQuizDropdownItems(unitItem) {
  if (!unitItem || unitItem.sourceUnitIndex == null) return [];
  const quizzes = examQuizzesForUnitTabItem(unitItem);
  const seen = new Set();
  const out = [];
  for (const qz of quizzes) {
    const name = examQuizNameFromPreviewRow(qz);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ quiz_name: name });
  }
  return out;
}

function examQuizPickSelectValue(opt) {
  return String(opt?.quiz_name ?? '').trim();
}

/**
 * 與 CreateExamQuizBankPage `extractQuizUserPromptText` 鍵名對齊（GET /exam/rag-for-exams `units[].quizzes[]`）。
 * @param {object | null | undefined} raw
 * @returns {string}
 */
function extractQuizUserPromptFromExamRagRow(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = [
    'quiz_user_prompt_text',
    'quizUserPromptText',
    'user_prompt_text',
    'userPromptText',
    'prompt_text',
    'promptText',
  ];
  for (const key of keys) {
    const val = raw[key];
    if (val == null) continue;
    const text = String(val);
    if (text.trim()) return text;
  }
  return '';
}

/**
 * 批改指引：與 Rag_Quiz／題庫頁對齊（`answer_user_prompt_text`）。
 * @param {object | null | undefined} raw
 * @returns {string}
 */
function extractAnswerUserPromptFromExamRagRow(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = [
    'answer_user_prompt_text',
    'answerUserPromptText',
    'critique_user_prompt_instruction',
  ];
  for (const key of keys) {
    const val = raw[key];
    if (val == null) continue;
    const text = String(val);
    if (text.trim()) return text;
  }
  return '';
}

/**
 * 依選定單元＋quiz_name 在試卷題庫中找對應 `quizzes[]` 列（與下拉選項之 `examQuizNameFromPreviewRow` 一致）。
 * @param {object | null | undefined} unitItem
 * @param {string} quizNameTrimmed
 * @returns {object | null}
 */
function findExamRagQuizRowBySelectedPick(unitItem, quizNameTrimmed) {
  if (!unitItem || unitItem.sourceUnitIndex == null) return null;
  const name = String(quizNameTrimmed ?? '').trim();
  if (!name) return null;
  const quizzes = examQuizzesForUnitTabItem(unitItem);
  for (const qz of quizzes) {
    if (examQuizNameFromPreviewRow(qz) === name) return qz;
  }
  return null;
}

/**
 * 目前槽位選定單元＋題名對應之出題／批改指引（供 POST llm-generate 與題卡 gradingPrompt）。
 * @param {number} slotIndex
 * @param {string} [quizNameFallback] - 無下拉選值時用以對齊試卷題庫列（例如題列已有 examQuizDisplayName）
 * @returns {{ quiz_user_prompt_text: string, answer_user_prompt_text: string }}
 */
function examQuizPromptBundleForSlot(slotIndex, quizNameFallback = '') {
  const slotState = getSlotFormState(slotIndex);
  const uid = String(slotState.examUnitSelectId ?? '').trim();
  const quizName =
    String(slotState.examQuizNamePick ?? '').trim()
    || String(quizNameFallback ?? '').trim();
  const unitItem = examUnitTabItems.value.find((it) => examUnitSelectValue(it) === uid);
  const row = findExamRagQuizRowBySelectedPick(unitItem, quizName);
  if (!row) {
    return { quiz_user_prompt_text: '', answer_user_prompt_text: '' };
  }
  return {
    quiz_user_prompt_text: extractQuizUserPromptFromExamRagRow(row).trim(),
    answer_user_prompt_text: extractAnswerUserPromptFromExamRagRow(row).trim(),
  };
}

/** @param {number} slotIndex */
function examQuizDropdownItemsForSlot(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const uid = String(slotState.examUnitSelectId ?? '').trim();
  const unitItem = examUnitTabItems.value.find((it) => examUnitSelectValue(it) === uid);
  return examQuizDropdownItems(unitItem);
}

/**
 * 草稿 POST（同槽位連打時中止上一個請求；鍵須含 exam_tab_id 以免切換測驗分頁時誤.abort 他頁）
 * @type {Map<string, AbortController>}
 */
const examQuizDraftAbortBySlotIndex = new Map();

/** @param {number} slotIndex */
function examQuizDraftAbortKey(slotIndex) {
  const tid = activeTabId.value != null ? String(activeTabId.value).trim() : '';
  return `${tid || '__no_tab__'}::${slotIndex}`;
}

/** 試卷題庫（GET /exam/rag-for-exams）帶來的 system instruction（由 watch forExamRag 填入） */
const forExamState = reactive({
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
});

/** 測驗列表（GET /exam/tabs 載入；按 + 呼叫 POST /exam/tab/create 新增） */
const examList = ref([]);
const examListLoading = ref(false);
const examListError = ref('');
const createExamLoading = ref(false);
const createExamError = ref('');
/** 當前選中的 tab = 該測驗的 test_tab_id / exam_tab_id */
const activeTabId = ref(null);
const examRenameModalOpen = ref(false);
/** PUT /exam/tab/tab-name 用 Exam 主鍵 */
const examRenameDraftExamId = ref(null);
const examRenameInitialName = ref('');
const examRenameSaving = ref(false);
const examRenameError = ref('');

/** 每個 tab（test_tab_id）的狀態 */
const tabStateMap = reactive({});

function getTabState(id) {
  const resolvedId = id || (examList.value[0] ? getExamTabId(examList.value[0]) : '') || '';
  if (!resolvedId) {
    return {
      cardList: [],
      slotFormState: {},
      showQuizGeneratorBlock: false,
      quizSlotsCount: 0,
    };
  }
  if (!tabStateMap[resolvedId]) {
    tabStateMap[resolvedId] = reactive({
      cardList: [],
      slotFormState: {},
      showQuizGeneratorBlock: false,
      quizSlotsCount: 0,
      _synced: false,
    });
  }
  return tabStateMap[resolvedId];
}

/** 當前 tab 的狀態（template 與方法內使用） */
const currentState = computed(() => {
  const id = activeTabId.value;
  if (id) return getTabState(id);
  return getTabState(examList.value[0] ? getExamTabId(examList.value[0]) : '');
});

/** 當前選中 tab 對應的 Exam（來自 GET /exam/tabs 列表）；可為 units→quizzes 或扁平 quizzes／answers */
const currentExamItem = computed(() => {
  const id = activeTabId.value;
  if (!id) return null;
  return examList.value.find((exam) => getExamTabId(exam) === id) ?? null;
});

/** 從 GET /exam/rag-for-exams 正規化結果推導 generateQuizUnits（格式同 build-rag-zip outputs） */
const generateQuizUnits = computed(() => {
  const rag = forExamRag.value;
  if (!rag || typeof rag !== 'object') return [];
  const sourceTabId = String(rag.rag_tab_id ?? '');
  const outputBaseName = (o) => String((o.rag_name ?? o.unit_name ?? '').trim()).replace(/\+/g, '_');
  const mapOutput = (o) => {
    const base = outputBaseName(o);
    const fromFile = (o.filename || o.rag_filename || '').replace(/_rag\.zip?$/i, '').replace(/\.zip$/i, '');
    const label = base || fromFile;
    const rawUnit =
      (o.unit_name != null && String(o.unit_name).trim() !== '')
        ? String(o.unit_name).trim()
        : (o.rag_name != null && String(o.rag_name).trim() !== '')
          ? String(o.rag_name).trim()
          : label;
    const unit_name = String(rawUnit || '').replace(/\+/g, '_') || label || sourceTabId;
    return {
      rag_tab_id: o.rag_tab_id || (base ? `${base}_rag` : '') || sourceTabId,
      filename: o.filename ?? o.rag_filename ?? (label ? `${label.replace(/\+/g, '_')}.zip` : `${sourceTabId}.zip`),
      rag_name: label || sourceTabId,
      unit_name,
    };
  };
  // 與 /rag/tab/build-rag-zip 相同：頂層 outputs
  const topOutputs = rag.outputs;
  if (Array.isArray(topOutputs) && topOutputs.length > 0) {
    return topOutputs.map(mapOutput);
  }
  const nestedOutputs = parseRagMetadataObject(rag)?.outputs;
  if (Array.isArray(nestedOutputs) && nestedOutputs.length > 0) {
    return nestedOutputs.map(mapOutput);
  }
  const ragListStr = getRagUnitListString(rag);
  if (ragListStr) {
    return String(ragListStr)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((group) => {
        const ragName = group.replace(/\+/g, '_');
        return {
          rag_tab_id: `${ragName}_rag` || sourceTabId,
          filename: `${ragName}_rag.zip`,
          rag_name: ragName,
          unit_name: ragName,
        };
      });
  }
  // 僅有 rag_tab_id、尚無 outputs／unit_list（後端精簡回傳）時仍要能選單元並出題
  if (sourceTabId) {
    const nm = String(rag.rag_name ?? rag.unit_name ?? '').replace(/\+/g, '_').trim() || sourceTabId;
    return [{
      rag_tab_id: sourceTabId,
      filename: `${nm}_rag.zip`,
      rag_name: nm,
      unit_name: nm,
    }];
  }
  return [];
});

/** 與題卡 rag_id 比對：試題用 RAG 的 rag_id（與 CreateExamQuizBankPage currentRagIdForQuizCards 對齊） */
const currentRagIdForQuizCards = computed(() => {
  const rag = forExamRag.value;
  const v = rag?.rag_id ?? rag?.id;
  return v != null && String(v).trim() !== '' ? v : null;
});

/** 試題用 rag_id、rag_tab_id（除錯／console） */
const forExamRagIdAndTabId = computed(() => {
  const rag = forExamRag.value;
  if (!rag) return { rag_id: '未載入', rag_tab_id: '未載入' };
  const rid = rag.rag_id ?? rag.id;
  const tid = rag.rag_tab_id ?? rag.id ?? '';
  return { rag_id: rid != null ? String(rid) : '—', rag_tab_id: tid ? String(tid) : '—' };
});

/** 當前測驗顯示用（exam_tab_id、名稱；列表可能為 tab_name 或舊欄位 exam_name） */
const currentExamDisplay = computed(() => {
  const exam = currentExamItem.value;
  const id = activeTabId.value;
  if (!id) return { exam_tab_id: '—', exam_name: '—' };
  if (!exam) return { exam_tab_id: id, exam_name: getExamTabLabel({ exam_tab_id: id, test_tab_id: id }) || id };
  return {
    exam_tab_id: getExamTabId(exam) || id,
    exam_name: getExamTabLabel(exam) || id,
  };
});

/** 原「基本資訊」區塊改為載入完成後於 console 輸出（切換測驗 tab、for-exam／列表載入就緒時） */
watch(
  [
    () => activeTabId.value,
    () => examList.value.length,
    () => examListLoading.value,
    () => forExamLoading.value,
    () => `${currentExamDisplay.value.exam_tab_id}|${currentExamDisplay.value.exam_name}`,
    () => `${forExamRagIdAndTabId.value.rag_id}|${forExamRagIdAndTabId.value.rag_tab_id}`,
    () => String(forExamRag.value?.transcription ?? ''),
  ],
  () => {
    if (examList.value.length === 0 || !activeTabId.value) return;
    if (examListLoading.value || forExamLoading.value) return;
    // eslint-disable-next-line no-console -- 除錯：目前選中測驗與試題用 RAG 摘要
    console.log('[測驗] 基本資訊', {
      當前測驗: { ...currentExamDisplay.value },
      試卷題庫: { ...forExamRagIdAndTabId.value },
      file_size:
        forExamRag.value?.file_metadata?.file_size ?? forExamRag.value?.file_size ?? '—',
      transcription:
        forExamRag.value != null && forExamRag.value.transcription != null
          ? forExamRag.value.transcription
          : '—',
    });
  }
);

/** 「產生題目」「新增題目」：試卷題庫清單載入中則暫停（建立空白列僅需 exam_tab_id，不依賴 rag_unit_id） */
const generateQuizBlocked = computed(() => forExamLoading.value);

/** 當試卷題庫摘要（forExamRag）載入後，填入 system instruction */
watch(forExamRag, (rag) => {
  if (!rag || typeof rag !== 'object') return;
  const tx = rag.transcription;
  if (tx != null && String(tx).trim() !== '') {
    forExamState.systemInstruction = String(tx).trim();
  }
}, { immediate: true });

/**
 * 載入 GET /exam/tabs：watch(person_id) immediate；並載入 GET /exam/rag-for-exams。
 * KeepAlive onActivated：再抓兩者；首次 onActivated 僅補抓試卷題庫，避免與 immediate 雙重 GET /exam/tabs。
 */
watch(
  () => getCurrentPersonId(),
  () => {
    fetchExamTests();
    fetchExamRagSource();
  },
  { immediate: true }
);

/** 有測驗列表時預設選第一個 tab */
watch(examList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = getExamTabId(list[0]) || list[0];
  }
}, { immediate: true });

/** 試卷單元列變動時，清除已不存在的單元選取，並重置該槽未完成的草稿請求 */
watch(examUnitTabItems, (tabs) => {
  const state = currentState.value;
  const count = state.quizSlotsCount || 0;
  const validIds = new Set(tabs.map((t) => t.id));
  for (let i = 1; i <= count; i++) {
    const slot = state.slotFormState?.[i];
    if (!slot) continue;
    const uid = String(slot.examUnitSelectId ?? '').trim();
    if (uid && !validIds.has(uid)) {
      slot.examUnitSelectId = '';
      slot.examQuizNamePick = '';
      slot.draftExamQuizId = null;
      const k = examQuizDraftAbortKey(i);
      examQuizDraftAbortBySlotIndex.get(k)?.abort();
      examQuizDraftAbortBySlotIndex.delete(k);
    }
  }
}, { deep: true });

/** 試卷／Exam_Quiz 列上顯示用題名（rag-for-exams、GET /exam/tabs 與 llm-generate 回傳之 quiz_name） */
function examQuizDisplayNameFromRow(quiz) {
  if (!quiz || typeof quiz !== 'object') return '';
  if (quiz.quiz_name != null && String(quiz.quiz_name).trim() !== '') {
    return String(quiz.quiz_name).trim();
  }
  const meta = quiz.quiz_metadata;
  if (meta != null && typeof meta === 'object' && meta.quiz_name != null && String(meta.quiz_name).trim() !== '') {
    return String(meta.quiz_name).trim();
  }
  return '';
}

/** 由 GET /exam/tabs 回傳的 quiz（Exam_Quiz 列 + answers）組成一張題目卡片（欄位後備與 CreateExamQuizBankPage buildCardFromRagQuiz 對齊） */
function buildCardFromExamQuiz(quiz, ragName, fallbackRagId) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ??
    latestAnswer?.student_answer ??
    latestAnswer?.answer_text ??
    latestAnswer?.content ??
    (quiz.answer_content != null && String(quiz.answer_content).trim() !== ''
      ? String(quiz.answer_content)
      : null);
  const refA =
    quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? quiz.reference_answer ?? '';
  const quiz_answer =
    latestSubmitted != null && String(latestSubmitted).trim() !== ''
      ? String(latestSubmitted)
      : quizAnswerPresetFromReference(refA);
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) || (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : ''))
    : '';
  const generateLevel = examQuizLevelFromRow(quiz);
  const quizId = quiz.exam_quiz_id ?? quiz.quiz_id ?? null;
  const answerId = latestAnswer?.exam_answer_id ?? latestAnswer?.answer_id ?? null;
  const rid = quiz.rag_id ?? quiz.ragId ?? fallbackRagId;
  const ragIdStr = rid != null && String(rid).trim() !== '' ? String(rid) : null;
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? quiz.quiz ?? quiz.question ?? '',
    hint: quiz.quiz_hint ?? quiz.hint ?? '',
    referenceAnswer: quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? quiz.reference_answer ?? '',
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.unit_name || quiz.rag_name || '').trim() || null,
    rag_id: ragIdStr,
    rag_unit_id:
      quiz.rag_unit_id != null && quiz.rag_unit_id !== ''
        ? Number(quiz.rag_unit_id)
        : null,
    rag_quiz_id:
      quiz.rag_quiz_id != null && quiz.rag_quiz_id !== ''
        ? Number(quiz.rag_quiz_id)
        : null,
    quiz_answer,
    hintVisible: false,
    quiz_rate: normalizeExamQuizRate(quiz.quiz_rate),
    rateError: '',
    confirmed: !!latestAnswer,
    gradingResult,
    gradingResponseJson: latestAnswer ?? null,
    generateQuizResponseJson: null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: null,
    exam_quiz_id: quizId,
    answer_id: answerId,
    gradingPrompt: '',
    examQuizDisplayName: examQuizDisplayNameFromRow(quiz),
  };
}

/** 將 GET /exam/tabs 題卡上的 unit／題名對到試卷題庫下拉（需已載入 GET /exam/rag-for-exams） */
function hydrateExamSlotFromRagCard(slotState, card) {
  if (!slotState || !card) return;
  const items = examUnitTabItems.value;
  const uidNum = Number(card.rag_unit_id);
  let match =
    Number.isFinite(uidNum) && uidNum >= 1
      ? items.find((it) => it.ragUnitId != null && Number(it.ragUnitId) === uidNum)
      : null;
  if (!match) {
    const ragName = String(card.ragName ?? '').trim();
    match = items.find(
      (it) =>
        String(it.label ?? '').trim() === ragName
        || String(it.unitName ?? '').trim() === ragName
    );
  }
  if (match) slotState.examUnitSelectId = examUnitSelectValue(match);
  const rqNum = Number(card.rag_quiz_id);
  if (match && Number.isFinite(rqNum) && rqNum >= 1) {
    const quizzes = examQuizzesForUnitTabItem(match);
    const row = quizzes.find((q) => Number(ragQuizSelectValue(q)) === rqNum);
    if (row) {
      slotState.examQuizNamePick = examQuizNameFromPreviewRow(row);
      return;
    }
  }
  const qn = String(card.examQuizDisplayName ?? '').trim();
  if (qn) slotState.examQuizNamePick = qn;
}

/**
 * 從 GET /exam/tabs 單筆 Exam 填入該 tab 的題目卡片（units→quizzes 或扁平 quizzes；見 mergeQuizzesWithTopLevelAnswers）。
 */
function syncExamItemToTabState(exam) {
  if (!exam || typeof exam !== 'object') return;
  const tabId = getExamTabId(exam);
  if (!tabId) return;
  const state = getTabState(tabId);
  const quizzesWithAnswers = mergeQuizzesWithTopLevelAnswers(exam);
  const units = generateQuizUnits.value;
  const rag = forExamRag.value;
  const out0 = rag?.outputs?.[0];
  const meta0 = rag?.rag_metadata?.outputs?.[0];
  const firstQuiz = quizzesWithAnswers[0];
  const firstRagName = (
    units[0]?.rag_name
    ?? out0?.rag_name ?? out0?.unit_name
    ?? meta0?.rag_name ?? meta0?.unit_name
    ?? firstQuiz?.unit_name ?? firstQuiz?.rag_name
    ?? ''
  ).trim();
  if (quizzesWithAnswers.length > 0) {
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    const fallbackRid = rag?.rag_id ?? rag?.id;
    state.cardList = quizzesWithAnswers.map((q) =>
      buildCardFromExamQuiz(q, q.unit_name ?? q.rag_name ?? firstRagName, fallbackRid));
    for (let i = 1; i <= state.quizSlotsCount; i++) {
      const card = state.cardList[i - 1];
      if (!card) continue;
      if (!state.slotFormState[i]) state.slotFormState[i] = reactive(getDefaultExamSlotForm());
      hydrateExamSlotFromRagCard(state.slotFormState[i], card);
    }
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
  state._synced = true;
}

/** 僅在首次切換到該測驗分頁時自 GET /exam/tabs 灌入卡片；已同步過的 tab 不再覆寫，保留使用者輸入 */
watch(
  activeTabId,
  (id) => {
    if (id == null || id === '') return;
    const idStr = String(id);
    const state = getTabState(idStr);
    if (state._synced) return;
    const exam = examList.value.find((e) => getExamTabId(e) === idStr);
    if (exam) syncExamItemToTabState(exam);
  },
  { immediate: true }
);

/** 取得當前使用者的 person_id（與 RAG 頁一致；後端若只回傳 user_id 則用 user_id 當 person_id） */
function getCurrentPersonId() {
  const u = authStore.user;
  if (!u) return null;
  const pid = u.person_id;
  if (pid != null && String(pid).trim() !== '') return String(pid).trim();
  const uid = u.user_id ?? u.id;
  if (uid != null && String(uid).trim() !== '') return String(uid).trim();
  return null;
}

/** 載入測驗列表：GET /exam/tabs；query 需帶 person_id（必填）與 local（與 /rag/tabs?local= 一致） */
async function fetchExamTests() {
  examListLoading.value = true;
  examListError.value = '';
  try {
    const personId = getCurrentPersonId();
    if (!personId) {
      examList.value = [];
      examListError.value = '請先登入以載入測驗列表';
      return;
    }
    const params = new URLSearchParams();
    params.set('person_id', personId);
    params.set('local', String(isFrontendLocalHost()));
    const url = `${API_BASE}${API_EXAM_TESTS}?${params}`;
    const headers = {};
    headers['X-Person-Id'] = personId;
    const res = await loggedFetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const err = JSON.parse(text);
        msg = err.detail ?? err.error ?? msg;
      } catch (_) {
        if (text) msg = text;
      }
      if (isNotFoundLike(res.status, msg)) {
        examList.value = [];
        examListError.value = '';
        return;
      }
      throw new Error(msg);
    }
    const data = await res.json();
    const list = normalizeExamListResponse(data);
    // 保留完整欄位與 quizzes、answers（供 watch(currentExamItem) 預填題目卡片）
    examList.value = list.map((row) => {
      const label = row.tab_name ?? row.exam_name ?? row.test_name;
      return {
        ...row,
        exam_id: row.exam_id ?? row.test_id,
        exam_tab_id: row.exam_tab_id ?? row.test_tab_id,
        exam_name: label,
        test_id: row.exam_id ?? row.test_id,
        test_tab_id: row.exam_tab_id ?? row.test_tab_id,
        test_name: label,
      };
    });
  } catch (err) {
    examListError.value = err.message || '無法載入測驗列表';
    examList.value = [];
  } finally {
    examListLoading.value = false;
  }
}

/** 試卷題庫：GET /exam/rag-for-exams；query 僅帶 person_id（不呼叫 GET /rag/tab/for-exam） */
async function fetchExamRagSource() {
  forExamLoading.value = true;
  forExamError.value = '';
  try {
    const personId = getCurrentPersonId();
    if (!personId) {
      forExamRag.value = null;
      return;
    }
    const params = new URLSearchParams({ person_id: personId });
    const res = await loggedFetch(`${API_BASE}${API_RAG_FOR_EXAMS}?${params.toString()}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const err = JSON.parse(text);
        msg = err.detail ?? err.error ?? msg;
      } catch (_) {
        if (text) msg = text;
      }
      if (isNotFoundLike(res.status, msg)) {
        forExamRag.value = null;
        forExamError.value = '';
        return;
      }
      throw new Error(msg);
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error('無法解析試卷題庫回應');
    }
    forExamRag.value = normalizeExamRagForExamsPayload(data);
  } catch (err) {
    forExamError.value = err.message || '無法載入試卷題庫，請稍後再試或聯絡管理員';
    forExamRag.value = null;
  } finally {
    forExamLoading.value = false;
  }
}


/** 測驗 tab 顯示名稱：優先 tab_name，其次 exam_name／test_name／exam_tab_id */
function getExamTabLabel(exam) {
  if (exam == null) return '測驗';
  if (typeof exam === 'string') return exam;
  const tabId = exam.exam_tab_id ?? exam.test_tab_id ?? exam.id ?? '';
  const raw = exam.tab_name ?? exam.exam_name ?? exam.test_name;
  const name = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
  const fromTabId = deriveNameFromTabId(tabId);
  const created = exam.created_at ?? '';
  return name || fromTabId || tabId || created || '測驗';
}

/** 取得測驗的 tab id（exam_tab_id 或 test_tab_id） */
function getExamTabId(exam) {
  if (exam == null || typeof exam !== 'object') return '';
  return String(exam.exam_tab_id ?? exam.test_tab_id ?? exam.id ?? '');
}

function getExamTabNameForEdit(exam) {
  if (!exam || typeof exam !== 'object') return '';
  const t = exam.tab_name ?? exam.exam_name ?? exam.test_name;
  if (t != null && String(t).trim() !== '') return String(t).trim();
  return '';
}

function openExamRenameModal(examTabId) {
  const exam = examList.value.find((e) => getExamTabId(e) === String(examTabId));
  const eid = exam?.exam_id ?? exam?.test_id;
  examRenameDraftExamId.value =
    eid != null && String(eid).trim() !== '' ? Number(eid) : null;
  examRenameInitialName.value = getExamTabNameForEdit(exam) || getExamTabLabel(exam);
  examRenameError.value = '';
  examRenameModalOpen.value = true;
}

async function onExamRenameSave(name) {
  if (!name) {
    examRenameError.value = '請輸入名稱';
    return;
  }
  const eid = examRenameDraftExamId.value;
  if (eid == null || !Number.isFinite(eid) || eid < 1) {
    examRenameError.value = '找不到此測驗，請重新整理頁面後再試';
    return;
  }
  examRenameSaving.value = true;
  examRenameError.value = '';
  try {
    await apiUpdateExamTabName(eid, name);
    await fetchExamTests();
    examRenameModalOpen.value = false;
  } catch (err) {
    examRenameError.value = err.message || '更新失敗';
  } finally {
    examRenameSaving.value = false;
  }
}

/** 按「＋」新增試卷分頁：POST /exam/tab/create，query 需帶 person_id；body 含 exam_tab_id、person_id、tab_name、local（與 RAG tab/create 一致） */
async function addNewTab() {
  const personId = getCurrentPersonId();
  if (!personId) {
    createExamError.value = '請先登入以建立測驗';
    return;
  }
  createExamError.value = '';
  createExamLoading.value = true;
  const examTabId = generateTabId(personId);
  const tabName = '未命名試卷';
  const local = isFrontendLocalHost();
  const params = new URLSearchParams({ person_id: personId });
  try {
    const res = await loggedFetch(`${API_BASE}${API_CREATE_EXAM}?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_tab_id: examTabId,
        person_id: personId,
        tab_name: tabName,
        local,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.detail ? JSON.stringify(errBody.detail) : res.statusText;
      throw new Error(msg);
    }
    const data = await res.json();
    const tabIdVal = data?.exam_tab_id != null ? String(data.exam_tab_id) : (data?.test_tab_id != null ? String(data.test_tab_id) : examTabId);
    const resolvedName = data.tab_name ?? data.exam_name ?? data.test_name ?? tabName;
    const item = {
      exam_id: data.exam_id ?? data.test_id,
      exam_tab_id: tabIdVal,
      tab_name: resolvedName,
      exam_name: resolvedName,
      test_id: data.exam_id ?? data.test_id,
      test_tab_id: tabIdVal,
      test_name: resolvedName,
      person_id: data.person_id,
      local: data.local ?? local,
      created_at: data.created_at,
    };
    examList.value = [...examList.value, item];
    activeTabId.value = tabIdVal;
    await fetchExamRagSource();
  } catch (err) {
    createExamError.value = err.message || '建立測驗失敗';
  } finally {
    createExamLoading.value = false;
  }
}

/** 刪除測驗：POST /exam/tab/delete/{exam_tab_id}（不需 X-Person-Id），成功後從列表移除並切到其他 tab */
const deleteExamLoading = ref(false);
/** 正在送出批改的題卡 id（全螢幕 LoadingOverlay「批改中...」；結果區待回傳） */
const gradingSubmittingCardId = ref(null);

function examCardGradeSubmitting(card) {
  if (!card) return false;
  return (
    gradingSubmittingCardId.value != null &&
    String(gradingSubmittingCardId.value) === String(card.id)
  );
}

/** 該槽題卡題幹文字（trim） */
function examSlotQuizBodyTrim(slotIndex) {
  const c = currentState.value.cardList[slotIndex - 1];
  return c ? String(c.quiz ?? '').trim() : '';
}

/**
 * 題幹仍空白但後端已有 Exam_Quiz 列：POST llm-generate 以 exam_quiz_id 為主；前端可一併帶入 rag_unit_id、rag_quiz_id、unit_name、quiz_name、quiz_user_prompt_text（試卷題庫有選項時）。
 */
function examSlotHasAnchoredExamQuizId(slotIndex) {
  const c = currentState.value.cardList[slotIndex - 1];
  if (!c || examSlotQuizBodyTrim(slotIndex) !== '') return false;
  const id = Number(c.exam_quiz_id ?? c.quiz_id);
  return Number.isFinite(id) && id >= 1;
}

/** 題目下拉：須先選單元；LLM 產生中停用（勿在 draftCreating 時鎖住，否則建立空白列期間像無法選） */
function examQuizNameDropdownDisabled(slotIndex) {
  const s = getSlotFormState(slotIndex);
  if (s.loading) return true;
  if (examUnitTabItems.value.length === 0) return true;
  return !String(getSlotFormState(slotIndex).examUnitSelectId ?? '').trim();
}

/** 「產生題目」：須選單元；該單元有 quizzes[] 時須選 quiz_name */
function examGenerateQuizButtonDisabled(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const base =
    slotState.loading || slotState.draftCreating || generateQuizBlocked.value;
  if (examUnitTabItems.value.length > 0 && !String(slotState.examUnitSelectId ?? '').trim()) {
    return true;
  }
  const quizOpts = examQuizDropdownItemsForSlot(slotIndex);
  if (quizOpts.length > 0 && !String(slotState.examQuizNamePick ?? '').trim()) {
    return true;
  }
  return base;
}

const isGradingSubmitting = computed(() => gradingSubmittingCardId.value != null);

/** 任一題列「產生題目」流程中（含建立空白列與 llm-generate） */
const examGenerateQuizOverlayVisible = computed(() => {
  const state = currentState.value;
  const n = Number(state.quizSlotsCount) || 0;
  for (let i = 1; i <= n; i++) {
    const s = state.slotFormState?.[i];
    if (s?.loading) return true;
  }
  return false;
});

/**
 * 全螢幕遮罩：首次載入測驗列表、建立／刪除分頁、更名、批改中、產生題目（LLM）。
 */
const loadingOverlayVisible = computed(
  () =>
    (examListLoading.value && examList.value.length === 0) ||
    createExamLoading.value ||
    deleteExamLoading.value ||
    examRenameSaving.value ||
    isGradingSubmitting.value ||
    examGenerateQuizOverlayVisible.value
);

const loadingOverlayText = computed(() => {
  if (isGradingSubmitting.value) return '批改中...';
  if (examGenerateQuizOverlayVisible.value) return '產生題目中...';
  if (deleteExamLoading.value) return '刪除中...';
  if (examRenameSaving.value) return '儲存中...';
  if (createExamLoading.value) return '建立中...';
  if (examListLoading.value && examList.value.length === 0) return `載入${quizBankNoun.value}中`;
  return '處理中...';
});

/** 預留與題庫頁相同的 subText API（測驗頁無 Pack 串流進度） */
const loadingOverlaySubText = computed(() => '');

const deleteExamError = ref('');
async function deleteExam(examTabId) {
  if (!examTabId) return;
  if (!confirm('確定要刪除此測驗嗎？')) return;
  deleteExamError.value = '';
  deleteExamLoading.value = true;
  try {
    const res = await loggedFetch(`${API_BASE}${API_EXAM_DELETE}/${encodeURIComponent(examTabId)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const err = JSON.parse(text);
        msg = err.detail ?? err.error ?? msg;
      } catch (_) {
        if (text) msg = text;
      }
      throw new Error(msg);
    }
    examList.value = examList.value.filter((t) => getExamTabId(t) !== examTabId);
    if (activeTabId.value === examTabId) {
      activeTabId.value = examList.value.length > 0 ? getExamTabId(examList.value[0]) : null;
    }
  } catch (err) {
    deleteExamError.value = err.message || '刪除測驗失敗';
  } finally {
    deleteExamLoading.value = false;
  }
}

function getDefaultExamSlotForm() {
  return {
    examUnitSelectId: '',
    /** 對應試卷 quizzes[].quiz_name，送 POST llm-generate */
    examQuizNamePick: '',
    /** POST /exam/tab/quiz/create 成功後之 exam_quiz_id；產生題目時送 llm-generate */
    draftExamQuizId: null,
    /** 正在送出空白列 create */
    draftCreating: false,
    loading: false,
    error: '',
    responseJson: null,
  };
}

function getSlotFormState(slotIndex) {
  const state = currentState.value;
  if (!state.slotFormState[slotIndex]) {
    state.slotFormState[slotIndex] = reactive(getDefaultExamSlotForm());
  }
  const slot = state.slotFormState[slotIndex];
  if (slot.draftExamQuizId === undefined) slot.draftExamQuizId = null;
  if (slot.draftCreating === undefined) slot.draftCreating = false;
  if (slot.examQuizNamePick === undefined) {
    slot.examQuizNamePick = String(slot.quizNameDraft ?? '').trim();
  }
  return slot;
}

watch(examUnitTabItems, () => {
  const state = currentState.value;
  const n = Number(state.quizSlotsCount) || 0;
  for (let i = 1; i <= n; i++) {
    const card = state.cardList[i - 1];
    if (card) {
      hydrateExamSlotFromRagCard(getSlotFormState(i), card);
    }
  }
});

/**
 * POST /exam/tab/quiz/create（不呼叫 LLM、body 僅 exam_tab_id）；寫出空白 Exam_Quiz 列後供 llm-generate。
 */
async function tryCreateDraftExamQuizForSlot(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  if (slotState.draftExamQuizId != null && Number(slotState.draftExamQuizId) >= 1) return;
  if (slotState.draftCreating) return;

  const examTabStr = activeTabId.value != null && activeTabId.value !== '' ? String(activeTabId.value).trim() : '';
  const personId = getCurrentPersonId();
  if (!examTabStr || !personId) return;

  const abortKey = examQuizDraftAbortKey(slotIndex);
  examQuizDraftAbortBySlotIndex.get(abortKey)?.abort();
  const ac = new AbortController();
  examQuizDraftAbortBySlotIndex.set(abortKey, ac);

  slotState.draftCreating = true;
  slotState.error = '';
  try {
    const createJson = await apiExamTabQuizCreate(
      { exam_tab_id: examTabStr },
      personId,
      { signal: ac.signal }
    );
    const draftEq =
      createJson?.exam_quiz_id != null
        ? Number(createJson.exam_quiz_id)
        : createJson?.quiz_id != null
          ? Number(createJson.quiz_id)
          : null;
    if (!Number.isFinite(draftEq) || draftEq < 1) {
      throw new Error('建立空白題目失敗：後端未回傳有效的 exam_quiz_id');
    }
    slotState.draftExamQuizId = draftEq;
  } catch (err) {
    const isAbort =
      err?.name === 'AbortError'
      || String(err?.name ?? '').includes('Abort')
      || String(err?.message ?? '').includes('aborted');
    if (isAbort) return;
    slotState.error = err.message || '建立空白題目失敗';
    slotState.draftExamQuizId = null;
  } finally {
    if (examQuizDraftAbortBySlotIndex.get(abortKey) === ac) examQuizDraftAbortBySlotIndex.delete(abortKey);
    slotState.draftCreating = false;
  }
}

async function onExamSlotUnitChange(slotIndex) {
  const slot = getSlotFormState(slotIndex);
  slot.examQuizNamePick = '';
  slot.error = '';
  const abortKeyCh = examQuizDraftAbortKey(slotIndex);
  examQuizDraftAbortBySlotIndex.get(abortKeyCh)?.abort();
  examQuizDraftAbortBySlotIndex.delete(abortKeyCh);
  slot.draftExamQuizId = null;
  /** v-model 與 @update 同一輪時，examUnitSelectId 可能尚未寫入；下一個 tick 再讀才能 POST /exam/tab/quiz/create */
  await nextTick();
  if (examSlotQuizBodyTrim(slotIndex) !== '') return;
  void tryCreateDraftExamQuizForSlot(slotIndex);
}
async function openNextQuizSlot() {
  const state = currentState.value;
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  const idx = state.quizSlotsCount;
  while (state.cardList.length < idx) {
    state.cardList.push(null);
  }
  const slot = getSlotFormState(idx);
  slot.examQuizNamePick = '';
  slot.draftExamQuizId = null;
  slot.error = '';
  slot.examUnitSelectId = '';
  await nextTick();
  await tryCreateDraftExamQuizForSlot(idx);
}

function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed, quizId, ragId) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const ragIdStr = ragId != null && String(ragId).trim() !== '' ? String(ragId) : null;
  state.cardList[slotIndex - 1] = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    hint: hint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    rag_id: ragIdStr,
    quiz_answer: quizAnswerPresetFromReference(referenceAnswer),
    hintVisible: false,
    quiz_rate: 0,
    rateError: '',
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
    exam_quiz_id: quizId ?? null,
    gradingPrompt: '',
    examQuizDisplayName: '',
  };
}

/**
 * 「產生題目」：POST /exam/tab/quiz/llm-generate（exam_quiz_id 必填；選填 rag_unit_id、rag_quiz_id、unit_name、quiz_name、quiz_user_prompt_text）。
 * - 尚無題列：先 POST /exam/tab/quiz/create（僅 exam_tab_id）取得 exam_quiz_id。
 * - 已有 Exam_Quiz 列但題幹仍空白：以該列 exam_quiz_id 呼叫 LLM；有試卷題庫時盡量帶入 rag／題名。
 */
async function generateQuiz(slotIndex) {
  const slotState = getSlotFormState(slotIndex);
  const examTabStr = activeTabId.value != null && activeTabId.value !== '' ? String(activeTabId.value).trim() : '';
  const personId = getCurrentPersonId();
  const existingCard = currentState.value.cardList[slotIndex - 1];
  const prevExamQuizDisplayName = String(existingCard?.examQuizDisplayName ?? '').trim();
  const anchoredId = examSlotHasAnchoredExamQuizId(slotIndex)
    ? Number(existingCard.exam_quiz_id ?? existingCard.quiz_id)
    : null;

  if (!examTabStr) {
    slotState.error = '請先選擇測驗分頁，或按「＋」建立測驗';
    return;
  }
  if (!personId) {
    slotState.error = '請先登入';
    return;
  }

  let draftEq = anchoredId;

  if (draftEq == null) {
    if (examUnitTabItems.value.length > 0 && !String(slotState.examUnitSelectId ?? '').trim()) {
      slotState.error = '請先選擇單元';
      return;
    }
  }

  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  try {
    if (draftEq == null) {
      await tryCreateDraftExamQuizForSlot(slotIndex);
      draftEq =
        slotState.draftExamQuizId != null && Number(slotState.draftExamQuizId) >= 1
          ? Number(slotState.draftExamQuizId)
          : null;
      if (draftEq == null) {
        if (!String(slotState.error ?? '').trim()) {
          slotState.error = '無法建立空白題目，請稍候後再試';
        }
        return;
      }
    }

    const quizPickOpts = examQuizDropdownItemsForSlot(slotIndex);
    if (quizPickOpts.length > 0 && !String(slotState.examQuizNamePick ?? '').trim()) {
      slotState.error = '請選擇題目（quiz_name）';
      return;
    }

    const resolvedQuizName =
      String(slotState.examQuizNamePick ?? '').trim()
      || prevExamQuizDisplayName;
    const promptBundle = examQuizPromptBundleForSlot(slotIndex, prevExamQuizDisplayName);

    const uidSel = String(slotState.examUnitSelectId ?? '').trim();
    const unitItemForLlm =
      examUnitTabItems.value.length > 0
        ? examUnitTabItems.value.find((it) => examUnitSelectValue(it) === uidSel)
        : null;
    const ragRowForLlm = findExamRagQuizRowBySelectedPick(unitItemForLlm, resolvedQuizName);
    const ragUnitIdForLlm =
      unitItemForLlm?.ragUnitId != null && Number.isFinite(Number(unitItemForLlm.ragUnitId)) && Number(unitItemForLlm.ragUnitId) >= 1
        ? Number(unitItemForLlm.ragUnitId)
        : 0;
    let ragQuizIdForLlm = 0;
    if (ragRowForLlm) {
      const idStr = ragQuizSelectValue(ragRowForLlm);
      const n = Number(idStr);
      if (Number.isFinite(n) && n >= 1) ragQuizIdForLlm = Math.trunc(n);
    }
    const unitNameForLlm = String(unitItemForLlm?.label ?? unitItemForLlm?.unitName ?? '').trim();

    const data = await apiExamTabQuizLlmGenerate(
      {
        exam_quiz_id: draftEq,
        rag_unit_id: ragUnitIdForLlm,
        rag_quiz_id: ragQuizIdForLlm,
        unit_name: unitNameForLlm,
        quiz_name: resolvedQuizName,
        quiz_user_prompt_text: promptBundle.quiz_user_prompt_text,
      },
      personId
    );

    slotState.responseJson = data;
    const quizContent = data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? data.quiz_content ?? '';
    const hintText = data.quiz_hint ?? data.hint ?? '';
    const unitTab =
      examUnitTabItems.value.length > 0
        ? examUnitTabItems.value.find((t) => t.id === String(slotState.examUnitSelectId ?? '').trim())
        : null;
    const targetFilename =
      data.file_name ?? data.unit_filename ?? data.target_filename ?? unitTab?.filename ?? null;
    const referenceAnswerText =
      data.quiz_reference_answer ?? data.quiz_answer_reference ?? data.quiz_answer ?? data.answer ?? '';
    const nameFromUnit = String(unitTab?.label ?? unitTab?.unitName ?? '').trim();
    const nameFromQuiz = String(data.quiz_name ?? '').trim();
    const ragFallback = existingCard?.ragName != null ? String(existingCard.ragName).trim() : '';
    const displayRagName = (
      data.unit_name
      ?? data.rag_name
      ?? nameFromQuiz
      ?? nameFromUnit
      ?? ragFallback
      ?? ''
    ).trim() || nameFromUnit || nameFromQuiz || ragFallback;
    const quizId =
      data.exam_quiz_id != null
        ? Number(data.exam_quiz_id)
        : (data.quiz_id != null ? Number(data.quiz_id) : draftEq);
    const resolvedLevel =
      examQuizLevelFromRow(data)
      ?? normalizeQuizLevelLabel(data?.quiz_level);
    const fr = forExamRag.value;
    const cardRagId = data.rag_id ?? data.ragId ?? fr?.rag_id ?? fr?.id;
    setCardAtSlot(
      slotIndex,
      quizContent,
      hintText,
      targetFilename,
      referenceAnswerText,
      displayRagName,
      data,
      resolvedLevel,
      (forExamState.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
      quizId,
      cardRagId
    );
    const newCard = currentState.value.cardList[slotIndex - 1];
    if (newCard) {
      newCard.quiz_rate = normalizeExamQuizRate(data.quiz_rate);
      const fromApi = String(data.quiz_name ?? '').trim();
      const fromDraft = String(slotState.examQuizNamePick ?? '').trim();
      newCard.examQuizDisplayName = fromApi || fromDraft || prevExamQuizDisplayName || '';
      const ap = promptBundle.answer_user_prompt_text;
      if (ap) newCard.gradingPrompt = ap;
    }
    slotState.draftExamQuizId = null;
  } catch (err) {
    slotState.error = err.message || '產生題目失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

/** 題目讚(1)／差(-1)；再點同一顆送 quiz_rate=0 取消。POST /exam/tab/quiz/rate；畫面立即變化，背景送出成功時可與回傳之 quiz_rate 同步 */
function rateExamQuiz(item, direction) {
  if (!item || typeof item !== 'object') return;
  const examQuizId = item.exam_quiz_id ?? item.quiz_id;
  const idNum = Number(examQuizId);
  if (!Number.isFinite(idNum) || idNum < 1) {
    item.rateError = '無法評分：缺少題目編號（exam_quiz_id）。';
    return;
  }
  const target = direction === 'up' ? 1 : -1;
  const previousRate = normalizeExamQuizRate(item.quiz_rate);
  const nextRate = previousRate === target ? 0 : target;
  item.quiz_rate = nextRate;
  item.rateError = '';
  void (async () => {
    try {
      const res = await loggedFetch(`${API_BASE}${API_EXAM_RATE_QUIZ}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_quiz_id: idNum, quiz_rate: nextRate }),
      });
      const text = await res.text();
      if (!res.ok) return;
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        return;
      }
      if (data.quiz_rate != null) {
        item.quiz_rate = normalizeExamQuizRate(data.quiz_rate);
      }
    } catch {
      /* 樂觀 UI 已更新，不還原、不提示 */
    }
  })();
}

/** 試題用 RAG 的 rag_id（與題卡 card.rag_id 比對；皆有值且不同則不可作答） */
function forExamRagIdForCards() {
  const rag = forExamRag.value;
  const v = rag?.rag_id ?? rag?.id;
  return v != null && String(v).trim() !== '' ? v : null;
}

/** 評分：POST /exam/tab/quiz/llm-grade（body 見 useQuizGrading Exam 分支）、GET /exam/tab/quiz/grade-result/{job_id} */
async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
  const curR = forExamRagIdForCards();
  const cardR = item?.rag_id;
  if (
    curR != null &&
    cardR != null &&
    String(curR).trim() !== '' &&
    String(cardR).trim() !== '' &&
    String(curR).trim() !== String(cardR).trim()
  ) {
    return;
  }
  if (!activeTabId.value) {
    item.confirmed = true;
    item.gradingResult = '請先選擇一個測驗分頁，或按「＋」建立測驗。';
    return;
  }
  const exam = currentExamItem.value;
  const examId = exam?.exam_id ?? exam?.test_id;
  if (examId == null) {
    item.confirmed = true;
    item.gradingResult = '無法送出批改，請重新整理頁面或切換測驗後再試。';
    return;
  }
  gradingSubmittingCardId.value = item.id;
  try {
    await submitGrade(
      item,
      { examId, examTabId: String(activeTabId.value) },
      {
        gradingMode: 'exam',
        quizGradeSubmissionPath: API_EXAM_QUIZ_GRADE,
        quizGradeResultPath: API_EXAM_QUIZ_GRADE_RESULT,
      }
    );
  } finally {
    gradingSubmittingCardId.value = null;
  }
}

/** 與使用者管理頁相同：每次「打開」測驗頁（含從快取恢復）拉 GET /exam/tabs、GET /exam/rag-for-exams */
const examPageActivatedOnce = ref(false);
onActivated(() => {
  if (!examPageActivatedOnce.value) {
    examPageActivatedOnce.value = true;
    fetchExamRagSource();
    return;
  }
  fetchExamTests();
  fetchExamRagSource();
});
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay
      :is-visible="loadingOverlayVisible"
      :loading-text="loadingOverlayText"
      :sub-text="loadingOverlaySubText"
    />
    <TabRenameModal
      v-model="examRenameModalOpen"
      :initial-name="examRenameInitialName"
      :saving="examRenameSaving"
      :error="examRenameError"
      title="修改名稱"
      @save="onExamRenameSave"
    />
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">{{ pageTitle }}</p>
      </div>
    </header>
    <div class="flex-shrink-0 my-rag-tabs-bar my-bgcolor-gray-4">
      <div class="d-flex justify-content-center align-items-center w-100">
        <template v-if="examListLoading && examList.length === 0">
          <div class="w-100 py-2" aria-busy="true" />
        </template>
        <template v-else-if="examList.length === 0">
          <div class="w-100 py-2" aria-hidden="true" />
        </template>
        <template v-else>
          <ul class="nav nav-tabs w-100">
            <li v-for="exam in examList" :key="'exam-' + getExamTabId(exam)" class="nav-item">
              <div
                role="tab"
                class="nav-link d-flex align-items-center gap-1"
                :class="{ active: activeTabId === getExamTabId(exam) }"
                :aria-current="activeTabId === getExamTabId(exam) ? 'page' : undefined"
              >
                <span
                  class="flex-grow-1 text-start pe-2"
                  style="cursor: pointer"
                  @click="activeTabId = getExamTabId(exam)"
                >
                  {{ getExamTabLabel(exam) }}
                </span>
                <button
                  v-if="activeTabId === getExamTabId(exam)"
                  type="button"
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4 pe-2"
                  title="重新命名分頁"
                  :disabled="deleteExamLoading || examRenameSaving"
                  @click.stop="openExamRenameModal(getExamTabId(exam))"
                >
                  <i class="fa-solid fa-pen" aria-hidden="true" />
                </button>
                <button
                  v-if="activeTabId === getExamTabId(exam)"
                  type="button"
                  class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4"
                  title="刪除此測驗"
                  :disabled="deleteExamLoading || examRenameSaving"
                  @click.stop="deleteExam(getExamTabId(exam))"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            </li>
            <li class="nav-item d-flex align-items-center ms-2">
              <button
                type="button"
                class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle mb-2"
                title="新增分頁"
                aria-label="新增分頁"
                :aria-busy="createExamLoading"
                :disabled="createExamLoading"
                @click="addNewTab"
              >
                <i class="fa-solid fa-plus" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="forExamError" class="my-alert-warning-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ forExamError }}
      </div>
      <div v-if="examListError" class="my-alert-warning-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ examListError }}
      </div>
      <div v-if="createExamError" class="my-alert-danger-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ createExamError }}
      </div>
      <div v-if="deleteExamError" class="my-alert-danger-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ deleteExamError }}
      </div>
    </div>

    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div
        v-if="examList.length === 0"
        class="flex-grow-1 d-flex align-items-center justify-content-center px-3 py-5 min-h-0"
      >
        <button
          v-if="!examListLoading"
          type="button"
          class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
          :title="`新增${quizBankNoun}`"
          :aria-label="`新增${quizBankNoun}`"
          :disabled="createExamLoading"
          :aria-busy="createExamLoading"
          @click="addNewTab"
        >
          <i class="fa-solid fa-plus" aria-hidden="true" />
          新增{{ quizBankNoun }}
        </button>
      </div>
      <div v-else class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
            <div
              v-if="activeTabId"
              class="text-start my-page-block-spacing"
            >
              <div
                class="d-flex flex-column gap-4 w-100 min-w-0"
              >
                <div
                  v-if="
                    activeTabId &&
                      !forExamLoading &&
                      !forExamError &&
                      getCurrentPersonId() &&
                      examUnitTabItems.length === 0
                  "
                  class="my-alert-warning-soft my-font-sm-400 py-2 px-3 mb-0"
                  role="status"
                >
                  試卷題庫目前沒有可用的測驗單元。常見原因：GET /exam/rag-for-exams 只回傳已標為測驗用（for_exam）的教材／題目；請至「建立測驗題庫」完成標記，並在開發者工具 Network 確認該 API 的 units 是否非空。
                </div>
                <template v-for="(slotIndex) in currentState.quizSlotsCount" :key="slotIndex">
                  <template v-if="currentState.cardList[slotIndex - 1]">
                    <div
                      class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 text-start d-flex flex-column gap-3"
                    >
                      <div class="my-font-md-600 my-color-black">
                        第 {{ slotIndex }} 題
                      </div>
                      <div
                        v-if="examUnitTabItems.length > 0"
                        class="d-flex flex-column gap-3 w-100 min-w-0"
                      >
                        <div class="d-flex flex-column gap-0 w-100 min-w-0">
                          <label
                            class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                            :for="`exam-slot-${slotIndex}-unit-toggle-filled`"
                          >單元</label>
                          <UnitSelectDropdown
                            v-model="getSlotFormState(slotIndex).examUnitSelectId"
                            :options="examUnitTabItems"
                            :option-value="examUnitSelectValue"
                            :option-label="(u) => String(u.label ?? '').trim() || '—'"
                            placeholder="— 請選擇單元 —"
                            :menu-id="`exam-slot-${slotIndex}-unit-filled`"
                            @update:model-value="onExamSlotUnitChange(slotIndex)"
                          />
                        </div>
                        <div class="d-flex flex-column gap-0 w-100 min-w-0">
                          <label
                            class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                            :for="`exam-slot-${slotIndex}-quiz-dd-filled`"
                          >題目</label>
                          <UnitSelectDropdown
                            v-model="getSlotFormState(slotIndex).examQuizNamePick"
                            :options="examQuizDropdownItemsForSlot(slotIndex)"
                            :option-value="examQuizPickSelectValue"
                            :option-label="(q) => String(q.quiz_name ?? '').trim() || '—'"
                            placeholder="— 請選擇題目 —"
                            :menu-id="`exam-slot-${slotIndex}-quiz-dd-filled`"
                            :disabled="examQuizNameDropdownDisabled(slotIndex)"
                            hint-when-disabled="請先選擇單元"
                          />
                        </div>
                      </div>
                      <QuizCard
                        v-if="examSlotQuizBodyTrim(slotIndex) !== ''"
                        :card="currentState.cardList[slotIndex - 1]"
                        :slot-index="slotIndex"
                        :current-rag-id="currentRagIdForQuizCards"
                        show-exam-rating
                        design-ui
                        design-embedded
                        hide-unit-difficulty
                        hide-slot-index
                        hide-grading-prompt
                        :grade-submitting="examCardGradeSubmitting(currentState.cardList[slotIndex - 1])"
                        @toggle-hint="toggleHint"
                        @confirm-answer="confirmAnswer"
                        @rate-quiz="(dir) => rateExamQuiz(currentState.cardList[slotIndex - 1], dir)"
                        @update:quiz_answer="(val) => { currentState.cardList[slotIndex - 1].quiz_answer = val }"
                        @update:grading_prompt="(val) => { currentState.cardList[slotIndex - 1].gradingPrompt = val }"
                      />
                      <template v-if="examSlotQuizBodyTrim(slotIndex) === ''">
                        <div class="d-flex justify-content-center mt-1">
                          <button
                            type="button"
                            class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                            :disabled="examGenerateQuizButtonDisabled(slotIndex)"
                            :aria-busy="getSlotFormState(slotIndex).loading || getSlotFormState(slotIndex).draftCreating"
                            aria-label="產生題目"
                            @click="generateQuiz(slotIndex)"
                          >
                            產生題目
                          </button>
                        </div>
                        <div
                          v-if="getSlotFormState(slotIndex).error"
                          class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0"
                        >
                          {{ getSlotFormState(slotIndex).error }}
                        </div>
                      </template>
                    </div>
                  </template>
                  <template v-else>
                    <div
                      class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 d-flex flex-column gap-3"
                    >
                      <div class="my-font-lg-600 my-color-black mb-0">第 {{ slotIndex }} 題</div>
                      <div class="text-start w-100 min-w-0">
                        <div
                          class="d-flex flex-column gap-3 w-100 min-w-0"
                        >
                          <div
                            v-if="examUnitTabItems.length > 0"
                            class="d-flex flex-column gap-0 w-100 min-w-0"
                          >
                            <label
                              class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                              :for="`exam-slot-${slotIndex}-unit-toggle`"
                            >單元</label>
                            <UnitSelectDropdown
                              v-model="getSlotFormState(slotIndex).examUnitSelectId"
                              :options="examUnitTabItems"
                              :option-value="examUnitSelectValue"
                              :option-label="(u) => String(u.label ?? '').trim() || '—'"
                              placeholder="— 請選擇單元 —"
                              :menu-id="`exam-slot-${slotIndex}-unit`"
                              @update:model-value="onExamSlotUnitChange(slotIndex)"
                            />
                          </div>
                          <div
                            v-if="examUnitTabItems.length > 0"
                            class="d-flex flex-column gap-0 w-100 min-w-0"
                          >
                            <label
                              class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0"
                              :for="`exam-slot-${slotIndex}-quiz-dd-new`"
                            >題目</label>
                            <UnitSelectDropdown
                              v-model="getSlotFormState(slotIndex).examQuizNamePick"
                              :options="examQuizDropdownItemsForSlot(slotIndex)"
                              :option-value="examQuizPickSelectValue"
                              :option-label="(q) => String(q.quiz_name ?? '').trim() || '—'"
                              placeholder="— 請選擇題目 —"
                              :menu-id="`exam-slot-${slotIndex}-quiz-dd-new`"
                              :disabled="examQuizNameDropdownDisabled(slotIndex)"
                              hint-when-disabled="請先選擇單元"
                            />
                          </div>
                        </div>
                        <div class="d-flex justify-content-center mt-3">
                          <button
                            type="button"
                            class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                            :disabled="examGenerateQuizButtonDisabled(slotIndex)"
                            :aria-busy="getSlotFormState(slotIndex).loading || getSlotFormState(slotIndex).draftCreating"
                            aria-label="產生題目"
                            @click="generateQuiz(slotIndex)"
                          >
                            產生題目
                          </button>
                        </div>
                        <div
                          v-if="getSlotFormState(slotIndex).error"
                          class="my-alert-danger-soft my-font-sm-400 py-2 mt-2 mb-0"
                        >
                          {{ getSlotFormState(slotIndex).error }}
                        </div>
                      </div>
                    </div>
                  </template>
                </template>

                <div class="d-flex flex-column align-items-center justify-content-center pt-2 mb-0 gap-2 w-100">
                  <button
                    type="button"
                    class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
                    title="新增題目"
                    aria-label="新增題目"
                    :disabled="generateQuizBlocked"
                    @click="openNextQuizSlot"
                  >
                    <i class="fa-solid fa-plus" aria-hidden="true" />
                    新增題目
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

