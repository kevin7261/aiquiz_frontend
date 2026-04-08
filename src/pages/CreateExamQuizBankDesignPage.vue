<script setup>
/**
 * CreateExamQuizBankDesignPage — 建立測驗題庫（與 CreateExamQuizBankPage 相同區塊與流程）
 * 僅本地模擬、不呼叫 API。DESIGN_SHOW_ALL_UI_BLOCKS 時注入示意資料並同時顯示上傳／解析／建置前後／測試等區塊。
 */
import { ref, computed, watch, onMounted, nextTick, reactive } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_RESPONSE_QUIZ_CONTENT, API_RESPONSE_QUIZ_LEGACY } from '../constants/api.js';
import { formatFileSize } from '../utils/formatFileSize.js';
import {
  generateTabId,
  deriveRagNameFromTabId,
  deriveRagName,
  getRagUnitListString,
  parsePackTasksList,
  parseRagMetadataObject,
  DEFAULT_SYSTEM_INSTRUCTION,
  QUIZ_LEVEL_LABELS,
  normalizeQuizLevelLabel,
  quizLevelStringForApi,
  reconcileQuizUnitSelectSlot,
  findQuizUnitBySlotSelection,
  examOrRagQuizRowKey,
  examOrRagAnswerRowKey,
} from '../utils/rag.js';
import { formatGradingResult } from '../utils/grading.js';
import { useRagTabState } from '../composables/useRagTabState.js';
import { usePackTasks } from '../composables/usePackTasks.js';
import QuizCard from '../components/QuizCard.vue';
import UnitSelectDropdown from '../components/UnitSelectDropdown.vue';
import RagTabsBar from '../components/RagTabsBar.vue';
import TabRenameModal from '../components/TabRenameModal.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';

defineProps({
  tabId: { type: String, required: true },
});

let cardIdSeq = 0;
function nextCardId() {
  return `design-card-${++cardIdSeq}`;
}

/** 介面稿頁（create-test-bank_design）：不按狀態禁用按鈕或鎖定打包區 */
const DESIGN_PROTOTYPE_NO_DISABLE = true;
/** 同時顯示上傳、解析、唯讀、編排、測試等所有區塊（靜態示意，不依流程隱藏） */
const DESIGN_SHOW_ALL_UI_BLOCKS = true;
const DESIGN_MOCK_TAB_ID = 'design_static_tab';

function protoBtnDisabled(condition) {
  return DESIGN_PROTOTYPE_NO_DISABLE ? false : condition;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const UPLOAD_ALLOWED_EXTENSIONS = ['.zip', '.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const UPLOAD_ACCEPT_ATTR = UPLOAD_ALLOWED_EXTENSIONS.join(',');
function fileHasAllowedUploadExtension(file) {
  if (!file?.name) return false;
  const lower = file.name.toLowerCase();
  return UPLOAD_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const authStore = useAuthStore();
const ragList = ref([]);
const ragListLoading = ref(true);
const ragListError = ref('');
const createRagLoading = ref(false);
const createRagError = ref('');
const renameRagTabModalOpen = ref(false);
const renameRagTabDraftRagId = ref(null);
const renameRagTabInitialName = ref('');
const renameRagTabSaving = ref(false);
const renameRagTabError = ref('');
const gradingLoading = ref(false);
const deleteRagLoading = ref(false);
const courseNameForPrompt = ref('AIQuiz');
const activeTabId = ref(null);
const showFormWhenNoData = ref(false);
const newTabIds = ref([]);
const ragForExamSettingRagId = ref(null);

let mockRagIdSeq = 9001;

const { getTabState, currentState, isNewTabId } = useRagTabState(activeTabId, newTabIds, ragList, authStore, {
  defaultSystemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
});

function checkRagHasMetadata(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return rag.rag_metadata != null && (typeof rag.rag_metadata === 'string' ? String(rag.rag_metadata).trim() !== '' : true);
}

function checkRagHasList(rag) {
  if (!rag || typeof rag !== 'object') return false;
  return getRagUnitListString(rag) !== '';
}

function isPackTasksListReady(list) {
  if (!Array.isArray(list) || list.length < 1) return false;
  return list.every((g) => Array.isArray(g) && g.length >= 1);
}

const hasRagMetadata = computed(() => checkRagHasMetadata(currentRagItem.value));
const hasRagListOrMetadata = computed(() => checkRagHasMetadata(currentRagItem.value) || checkRagHasList(currentRagItem.value));

const ragListReadonlyGroups = computed(() => {
  const list = currentState.value.packTasksList;
  if (Array.isArray(list) && list.length > 0) {
    const groups = list.filter((g) => Array.isArray(g) && g.length > 0).map((g) => g.filter(Boolean));
    if (groups.length > 0) return groups;
  }
  const rag = currentRagItem.value;
  const unitStr = getRagUnitListString(rag);
  if (unitStr) return parsePackTasksList(unitStr);
  return [];
});

const ragListReadonlyInlineText = computed(() =>
  ragListReadonlyGroups.value.map((g) => (Array.isArray(g) ? g.join(' + ') : '')).filter(Boolean).join(' · ')
);

const packGroupsEditBlocked = computed(() => {
  if (DESIGN_PROTOTYPE_NO_DISABLE) return false;
  if (hasRagMetadata.value) return true;
  if (hasRagListOrMetadata.value) return false;
  const id = activeTabId.value;
  if (!id) return true;
  if (isNewTabId(id)) return String(currentState.value.zipTabId ?? '').trim() === '';
  return false;
});

const ragGenerateDisabled = computed(() => {
  if (DESIGN_PROTOTYPE_NO_DISABLE) return false;
  if (hasRagMetadata.value) return false;
  return packGroupsEditBlocked.value || currentState.value.packResponseJson == null;
});

const packOutputs = computed(() => {
  const data = currentState.value.packResponseJson;
  if (!data || typeof data !== 'object') return [];
  return Array.isArray(data.outputs) ? data.outputs : [];
});

const generateQuizUnits = computed(() => {
  const data = currentState.value.packResponseJson;
  const out = packOutputs.value;
  const singleTabId = data && typeof data === 'object' && data.rag_tab_id != null ? data.rag_tab_id : null;
  const withId = out.filter((o) => o && o.rag_tab_id != null);
  if (withId.length) {
    return withId.map((o) => {
      const rag_name = deriveRagName(o);
      const unit_name = String(o.unit_name ?? o.rag_name ?? rag_name ?? '').trim().replace(/\+/g, '_') || rag_name;
      return {
        rag_tab_id: String(o.rag_tab_id),
        filename: o.filename || o.rag_filename || 'RAG',
        rag_name,
        unit_name,
      };
    });
  }
  if (singleTabId && out.length) {
    return out.map((o) => {
      const rag_name = deriveRagName(o);
      const unit_name = String(o.unit_name ?? o.rag_name ?? rag_name ?? '').trim().replace(/\+/g, '_') || rag_name;
      return {
        rag_tab_id: String(singleTabId),
        filename: o.filename || o.rag_filename || 'RAG',
        rag_name,
        unit_name,
      };
    });
  }
  return generateQuizUnitsFromRag.value;
});

function ensureNumber(val, defaultVal) {
  if (val === '' || val == null) return defaultVal;
  const n = Number(val);
  return n === n && isFinite(n) ? n : defaultVal;
}

const filterDifficulty = ref('基礎');
const chunkSize = ref(1000);
const chunkOverlap = ref(200);

const currentRagItem = computed(() => {
  const id = activeTabId.value;
  if (!id || isNewTabId(id)) return null;
  return ragList.value.find((rag) => (rag.rag_tab_id ?? rag.id ?? String(rag)) === id) ?? null;
});

const currentRagIdForQuizCards = computed(() => {
  const state = currentState.value;
  const rag = currentRagItem.value;
  const v = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  return v != null && String(v).trim() !== '' ? v : null;
});

function ragMatchesExamSetting(rag, settingRagId) {
  if (!rag || typeof rag !== 'object') return false;
  if (rag.for_exam === true) return true;
  const rid = rag.rag_id ?? rag.id;
  if (rid == null || rid === '') return false;
  if (settingRagId == null) return false;
  return String(settingRagId) === String(rid);
}

const currentRagIsExamRag = computed(() => ragMatchesExamSetting(currentRagItem.value, ragForExamSettingRagId.value));

const fileMetadataToShow = computed(() => {
  const state = currentState.value;
  if (state.zipResponseJson != null) return state.zipResponseJson;
  const rag = currentRagItem.value;
  if (rag == null || typeof rag !== 'object') return null;
  if (rag.file_metadata != null && typeof rag.file_metadata === 'object') return rag.file_metadata;
  return null;
});

const hasUploadedFileMetadata = computed(() => fileMetadataToShow.value != null);

const createRagStepperPhase = computed(() => {
  if (DESIGN_SHOW_ALL_UI_BLOCKS) return 3;
  if (hasUploadedFileMetadata.value && hasRagMetadata.value) return 3;
  if (hasUploadedFileMetadata.value) return 2;
  return 1;
});

const uploadedZipDisplayName = computed(() => {
  if (!hasUploadedFileMetadata.value) return '';
  const meta = fileMetadataToShow.value;
  if (meta && typeof meta === 'object') {
    const name = meta.filename ?? meta.rag_filename ?? meta.original_filename;
    if (name != null && String(name).trim() !== '') return String(name).trim();
  }
  const z = currentState.value.zipFileName;
  if (z != null && String(z).trim() !== '') return String(z).trim();
  return '（已上傳）';
});

const uploadZipFileSizeDisplay = computed(() => {
  const meta = fileMetadataToShow.value;
  const rag = currentRagItem.value;
  let raw;
  if (meta && typeof meta === 'object' && meta.file_size != null) raw = meta.file_size;
  else if (rag && typeof rag === 'object' && rag.file_size != null) raw = rag.file_size;
  return formatFileSize(raw, 'MB');
});

const ragBuildOutputSizeSummary = computed(() => {
  const rag = currentRagItem.value;
  if (!rag || !hasRagMetadata.value) return '';
  const metaObj = parseRagMetadataObject(rag);
  const outputs =
    Array.isArray(rag.outputs) && rag.outputs.length > 0
      ? rag.outputs
      : Array.isArray(metaObj?.outputs) && metaObj.outputs.length > 0
        ? metaObj.outputs
        : null;
  if (!outputs) return '';
  const parts = outputs.map((o) => {
    const sz = formatFileSize(o.file_size, 'MB');
    if (!sz) return null;
    const label = deriveRagName(o) || String(o.unit_name || o.rag_name || '').trim() || '—';
    return `${label} ${sz}`;
  }).filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
});

const {
  secondFoldersFull,
  ragListDisplayGroups,
  onDragStartTag,
  onDragEndTag,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDropRagList,
  removeFromRagList,
  removeRagListGroup,
  addRagListGroup,
  addAllSecondFoldersAsGroups,
  setAllSecondFoldersAsSingleGroup,
} = usePackTasks(currentState, fileMetadataToShow, packGroupsEditBlocked);

const ragItems = computed(() =>
  ragList.value.map((r) => ({
    ...r,
    _tabId: r.rag_tab_id ?? r.id ?? r,
    _label: getRagTabLabel(r),
    _isExamRag: ragMatchesExamSetting(r, ragForExamSettingRagId.value),
  }))
);
const newTabItems = computed(() =>
  newTabIds.value.map((tid) => ({
    id: tid,
    label: '未命名測驗題庫',
  }))
);

const generateQuizUnitsFromRag = computed(() => {
  const rag = currentRagItem.value;
  if (!rag || typeof rag !== 'object') return [];
  const sourceTabId = String(rag.rag_tab_id ?? '');
  const metaObj = parseRagMetadataObject(rag);
  const topOutputs = rag.outputs;
  const nestedOutputs = metaObj?.outputs;
  const outputs =
    Array.isArray(topOutputs) && topOutputs.length > 0
      ? topOutputs
      : Array.isArray(nestedOutputs) && nestedOutputs.length > 0
        ? nestedOutputs
        : null;
  if (outputs) {
    return outputs.map((o) => {
      const derivedName = `${(o.rag_name ?? '').replace(/\+/g, '_')}`;
      const tabId =
        o.rag_tab_id != null && String(o.rag_tab_id).trim() !== ''
          ? String(o.rag_tab_id)
          : derivedName
            ? `${derivedName}_rag`
            : sourceTabId;
      const label = deriveRagName(o);
      const rawUnit =
        o.unit_name != null && String(o.unit_name).trim() !== ''
          ? String(o.unit_name).trim()
          : o.rag_name != null && String(o.rag_name).trim() !== ''
            ? String(o.rag_name).trim()
            : label;
      const unit_name = String(rawUnit || '').replace(/\+/g, '_') || label || sourceTabId;
      return {
        rag_tab_id: tabId,
        filename: o.filename ?? o.rag_filename ?? `${derivedName || label || 'RAG'}.zip`,
        rag_name: label,
        unit_name,
      };
    });
  }
  const ragListStr = getRagUnitListString(rag);
  if (!ragListStr) return [];
  return String(ragListStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((group) => {
      const ragName = group.replace(/\+/g, '_');
      return {
        rag_tab_id: sourceTabId || `${ragName}_rag`,
        filename: `${ragName}_rag.zip`,
        rag_name: ragName,
        unit_name: ragName,
      };
    });
});

function syncRagItemToState(rag, state) {
  if (!rag || typeof rag !== 'object') return;
  const unitListStr = getRagUnitListString(rag);
  if (unitListStr) {
    state.packTasks = unitListStr;
    state.packTasksList = parsePackTasksList(state.packTasks);
  }
  if (rag.rag_metadata != null) {
    state.ragMetadata = typeof rag.rag_metadata === 'string' ? rag.rag_metadata : JSON.stringify(rag.rag_metadata, null, 2);
  }
  if (rag.chunk_size != null) chunkSize.value = ensureNumber(rag.chunk_size, 1000);
  if (rag.chunk_overlap != null) chunkOverlap.value = ensureNumber(rag.chunk_overlap, 200);
  const filename = rag.file_metadata?.filename ?? rag.filename;
  if (filename != null && String(filename).trim() !== '') state.zipFileName = String(filename).trim();
  if (rag.system_prompt_instruction != null && String(rag.system_prompt_instruction).trim() !== '') {
    state.systemInstruction = String(rag.system_prompt_instruction).trim();
  }
  const quizzes = rag.quizzes ?? [];
  const ragAnswers = rag.answers ?? [];
  if (quizzes.length > 0) {
    const answersByQuizId = ragAnswers.reduce((acc, a) => {
      const id = examOrRagAnswerRowKey(a);
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(a);
      return acc;
    }, {});
    const quizzesWithAnswers = quizzes.map((q, i) => {
      const qKey = examOrRagQuizRowKey(q);
      const byId = q.answers ?? (qKey ? answersByQuizId[qKey] : undefined);
      const answers = Array.isArray(byId) && byId.length > 0 ? byId : ragAnswers[i] != null ? [ragAnswers[i]] : [];
      return { ...q, answers };
    });
    const metaParsed = parseRagMetadataObject(rag);
    const out0 = Array.isArray(rag.outputs) && rag.outputs.length > 0 ? rag.outputs[0] : metaParsed?.outputs?.[0];
    const firstRagName = (parsePackTasksList(getRagUnitListString(rag))[0]?.[0] ?? out0?.rag_name ?? quizzes[0]?.rag_name ?? '').trim();
    state.showQuizGeneratorBlock = true;
    state.quizSlotsCount = quizzesWithAnswers.length;
    const ragIdFallback = rag.rag_id ?? rag.id;
    state.cardList = quizzesWithAnswers.map((q) => buildCardFromRagQuiz(q, q.rag_name ?? firstRagName, ragIdFallback));
  } else {
    state.quizSlotsCount = 0;
    state.cardList = [];
  }
}

watch(currentRagItem, (rag) => syncRagItemToState(rag, currentState.value), { immediate: true });

function buildCardFromRagQuiz(quiz, ragName, ragIdFallback) {
  const answers = Array.isArray(quiz.answers) ? quiz.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted = latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? null;
  const gradingResult = latestAnswer
    ? formatGradingResult(JSON.stringify(latestAnswer)) ||
      (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : '')
    : '';
  const generateLevel = normalizeQuizLevelLabel(quiz.quiz_level);
  const rid = quiz.rag_id ?? quiz.ragId ?? ragIdFallback;
  const ragIdStr = rid != null && String(rid).trim() !== '' ? String(rid) : null;
  return {
    id: nextCardId(),
    quiz: quiz.quiz_content ?? '',
    hint: quiz.quiz_hint ?? '',
    referenceAnswer: quiz.quiz_answer_reference ?? quiz.quiz_reference_answer ?? '',
    sourceFilename: quiz.file_name ?? null,
    ragName: (ragName || quiz.rag_name || '').trim() || null,
    rag_id: ragIdStr,
    quiz_answer: latestAnswer?.quiz_answer ?? latestAnswer?.student_answer ?? '',
    hintVisible: false,
    confirmed: !!latestAnswer,
    gradingResult,
    gradingResponseJson: latestAnswer ?? null,
    generateQuizResponseJson: null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: null,
    rag_quiz_id: quiz.rag_quiz_id ?? quiz.quiz_id ?? null,
    answer_id: latestAnswer?.answer_id ?? null,
  };
}

watch(generateQuizUnits, (units) => {
  const state = currentState.value;
  reconcileQuizUnitSelectSlot(state, units);
  const count = state.quizSlotsCount || 0;
  for (let i = 1; i <= count; i++) {
    reconcileQuizUnitSelectSlot(state.slotFormState?.[i], units);
  }
}, { immediate: true });

watch(ragList, (list) => {
  if (list.length > 0 && activeTabId.value == null) {
    activeTabId.value = list[0].rag_tab_id ?? list[0].id ?? list[0];
  }
}, { immediate: true });

function seedDesignShowcase() {
  const tabId = DESIGN_MOCK_TAB_ID;
  const rid = 9001;
  ragList.value = [
    {
      rag_tab_id: tabId,
      rag_id: rid,
      tab_name: '示意：已建置題庫',
      for_exam: false,
      file_metadata: {
        filename: '示意教材.zip',
        file_size: 1_048_576,
        second_folders: ['第一章', '第二章'],
      },
      unit_list: '第一章+第二章',
      rag_metadata: JSON.stringify({
        outputs: [
          {
            rag_tab_id: `${tabId}_u1`,
            rag_name: '第一章_rag',
            unit_name: '第一章',
            filename: '第一章_rag.zip',
            file_size: 524_288,
          },
        ],
      }),
      outputs: [
        {
          rag_tab_id: `${tabId}_u1`,
          rag_name: '第一章_rag',
          unit_name: '第一章',
          filename: '第一章_rag.zip',
          file_size: 524_288,
        },
      ],
      system_prompt_instruction: '（示意）請依課程內容出題，並使用繁體中文。',
      quizzes: [
        {
          quiz_content: '下列何者正確？（示意題目）',
          quiz_hint: '請參考第一節重點',
          quiz_answer_reference: '選項 A',
          quiz_level: '基礎',
          rag_name: '第一章_rag',
          rag_id: rid,
        },
      ],
      answers: [],
    },
  ];
  activeTabId.value = tabId;
  showFormWhenNoData.value = true;
  ragListLoading.value = false;
  mockRagIdSeq = Math.max(mockRagIdSeq, rid + 1);
}

if (DESIGN_SHOW_ALL_UI_BLOCKS) {
  seedDesignShowcase();
  nextTick(() => {
    const s = getTabState(DESIGN_MOCK_TAB_ID);
    if (!s) return;
    s.quizSlotsCount = Math.max(s.quizSlotsCount || 0, 2);
    if (!String(s.ragMetadata ?? '').trim()) s.ragMetadata = '{}';
  });
}

const zipFileInputRef = ref(null);

function clearZipFileInput() {
  if (zipFileInputRef.value) {
    zipFileInputRef.value.value = '';
  }
}

watch(activeTabId, (id) => {
  if (id && isNewTabId(id)) clearZipFileInput();
});

watch(chunkSize, (v) => {
  const n = ensureNumber(v, 1000);
  if (n !== v && (v === '' || v == null || Number.isNaN(Number(v)))) chunkSize.value = n;
}, { flush: 'post' });
watch(chunkOverlap, (v) => {
  const n = ensureNumber(v, 200);
  if (n !== v && (v === '' || v == null || Number.isNaN(Number(v)))) chunkOverlap.value = n;
}, { flush: 'post' });

const anySlotLoading = computed(() => {
  const state = currentState.value;
  const count = state.quizSlotsCount || 0;
  for (let i = 1; i <= count; i++) {
    const slot = state.slotFormState?.[i];
    if (slot?.loading) return true;
  }
  return false;
});

const isAnyLoading = computed(() =>
  DESIGN_SHOW_ALL_UI_BLOCKS
    ? false
    : ragListLoading.value ||
        createRagLoading.value ||
        deleteRagLoading.value ||
        gradingLoading.value ||
        currentState.value.forExamLoading ||
        currentState.value.zipLoading ||
        currentState.value.packLoading ||
        anySlotLoading.value
);

const ragCreatedAtMap = ref({});

function getRagTabLabel(rag) {
  if (rag == null) return '題庫';
  if (typeof rag === 'string') return ragCreatedAtMap.value[rag] ?? String(rag);
  if (typeof rag !== 'object') return String(rag);
  const id = rag.rag_id ?? rag.rag_tab_id ?? rag.id;
  const fromMap = id != null ? ragCreatedAtMap.value[String(id)] : undefined;
  const label =
    rag.tab_name != null && String(rag.tab_name).trim() !== ''
      ? String(rag.tab_name).trim()
      : rag.rag_name != null && String(rag.rag_name).trim() !== ''
        ? String(rag.rag_name).trim()
        : deriveRagNameFromTabId(rag.rag_tab_id ?? rag.id ?? '');
  return label && label !== ''
    ? label
    : (fromMap ?? rag.file_metadata?.filename ?? rag.course_name ?? rag.filename ?? rag.created_at ?? deriveRagNameFromTabId(rag.rag_tab_id ?? '') ?? '題庫');
}

function getRagTabNameForEdit(rag) {
  if (!rag || typeof rag !== 'object') return '';
  const t = rag.tab_name;
  if (t != null && String(t).trim() !== '') return String(t).trim();
  const r = rag.rag_name;
  if (r != null && String(r).trim() !== '') return String(r).trim();
  return '';
}

async function setRagForExam() {
  const rag = currentRagItem.value;
  if (!rag || isNewTabId(activeTabId.value)) return;
  const ragId = rag.rag_id ?? rag.id;
  if (ragId == null || ragId === '') {
    const state = getTabState(activeTabId.value);
    state.forExamError = '無法取得題庫編號，請先建立分頁並上傳教材檔';
    return;
  }
  const state = getTabState(activeTabId.value);
  state.forExamLoading = true;
  state.forExamError = '';
  try {
    await delay(500);
    ragList.value.forEach((r) => {
      r.for_exam = false;
    });
    rag.for_exam = true;
    ragForExamSettingRagId.value = ragId;
  } catch (err) {
    state.forExamError = err.message || String(err);
  } finally {
    state.forExamLoading = false;
  }
}

async function clearRagForExam() {
  if (!currentRagIsExamRag.value || isNewTabId(activeTabId.value)) return;
  const state = getTabState(activeTabId.value);
  state.forExamLoading = true;
  state.forExamError = '';
  try {
    await delay(400);
    ragList.value.forEach((r) => {
      r.for_exam = false;
    });
    ragForExamSettingRagId.value = null;
  } catch (err) {
    state.forExamError = err.message || String(err);
  } finally {
    state.forExamLoading = false;
  }
}

async function deleteRag(rag, e) {
  if (e) e.stopPropagation();
  const fileId = rag?.rag_tab_id ?? rag?.id ?? rag;
  if (fileId == null || fileId === '') return;
  if (!confirm(`確定要刪除「${getRagTabLabel(rag)}」嗎？`)) return;
  deleteRagLoading.value = true;
  try {
    await delay(350);
    const idx = ragList.value.findIndex((r) => String(r.rag_tab_id ?? r.id ?? r) === String(fileId));
    if (idx >= 0) ragList.value.splice(idx, 1);
    if (String(ragForExamSettingRagId.value) === String(rag?.rag_id ?? rag?.id)) {
      ragForExamSettingRagId.value = null;
    }
    if (activeTabId.value === String(rag?.rag_tab_id ?? rag?.id ?? fileId)) {
      if (ragList.value.length > 0) {
        activeTabId.value = ragList.value[0].rag_tab_id ?? ragList.value[0].id ?? ragList.value[0];
      } else {
        activeTabId.value = null;
      }
    }
  } finally {
    deleteRagLoading.value = false;
  }
}

function onDeleteRagTab(tabId) {
  const id = tabId != null ? String(tabId) : '';
  if (!id) return;
  const rag = ragList.value.find((r) => String(r.rag_tab_id ?? r.id ?? r) === id);
  if (rag) deleteRag(rag, null);
}

async function addNewTab() {
  createRagError.value = '';
  createRagLoading.value = true;
  try {
    await delay(550);
    const rag_tab_id = generateTabId(authStore.user?.person_id);
    const rag_id = mockRagIdSeq++;
    ragList.value.push({
      rag_tab_id,
      rag_id,
      tab_name: '未命名測驗題庫',
      for_exam: false,
    });
    ragCreatedAtMap.value = { ...ragCreatedAtMap.value, [String(rag_id)]: new Date().toISOString() };
    activeTabId.value = String(rag_tab_id);
    clearZipFileInput();
    showFormWhenNoData.value = true;
  } catch (err) {
    createRagError.value = err.message || '建立測驗題庫失敗';
  } finally {
    createRagLoading.value = false;
  }
}

function openRenameRagTab(tabId) {
  const rag = ragList.value.find((x) => String(x.rag_tab_id ?? x.id ?? '') === String(tabId));
  const rid = rag?.rag_id;
  renameRagTabDraftRagId.value = rid != null && String(rid).trim() !== '' ? Number(rid) : null;
  renameRagTabInitialName.value = getRagTabNameForEdit(rag) || getRagTabLabel(rag);
  renameRagTabError.value = '';
  renameRagTabModalOpen.value = true;
}

async function onRenameRagTabSave(name) {
  if (!name) {
    renameRagTabError.value = '請輸入名稱';
    return;
  }
  const rid = renameRagTabDraftRagId.value;
  if (rid == null || !Number.isFinite(rid) || rid < 1) {
    renameRagTabError.value = '找不到此測驗題庫，請重新整理頁面後再試';
    return;
  }
  renameRagTabSaving.value = true;
  renameRagTabError.value = '';
  try {
    await delay(400);
    const rag = ragList.value.find((r) => Number(r.rag_id) === rid);
    if (rag) rag.tab_name = name.trim();
    renameRagTabModalOpen.value = false;
  } catch (err) {
    renameRagTabError.value = err.message || '更新失敗';
  } finally {
    renameRagTabSaving.value = false;
  }
}

function resetZipState(state, tabId) {
  state.uploadedZipFile = null;
  state.zipFileName = '';
  state.zipSecondFolders = [];
  state.zipResponseJson = null;
  state.zipTabId = isNewTabId(tabId) ? '' : tabId;
}

function setZipFileFromFile(state, tabId, file) {
  if (!file) {
    resetZipState(state, tabId);
    state.zipError = '';
    return;
  }
  if (!fileHasAllowedUploadExtension(file)) {
    resetZipState(state, tabId);
    state.zipError = '請選擇允許的檔案：.zip、.pdf、.doc、.docx、.ppt、.pptx';
    return;
  }
  resetZipState(state, tabId);
  state.uploadedZipFile = file;
  state.zipFileName = file.name;
  state.zipError = '';
}

function onZipChange(e) {
  const state = currentState.value;
  const file = e.target.files?.[0];
  const tabId = activeTabId.value;
  setZipFileFromFile(state, tabId, file);
}

const isZipDragOver = ref(false);
function onZipDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer.types.includes('Files')) isZipDragOver.value = true;
}
function onZipDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  isZipDragOver.value = false;
}
function onZipDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  isZipDragOver.value = false;
  const file = e.dataTransfer.files?.[0];
  if (!file) return;
  const state = currentState.value;
  const tabId = activeTabId.value;
  setZipFileFromFile(state, tabId, file);
  clearZipFileInput();
}
function openZipFileDialog() {
  if (zipFileInputRef.value) zipFileInputRef.value.click();
}

async function confirmUploadZip() {
  const state = currentState.value;
  if (!state.uploadedZipFile) {
    state.zipError = '請先選擇要上傳的檔案';
    return;
  }
  const tabId = activeTabId.value;
  if (isNewTabId(tabId) || !tabId) {
    state.zipError = '請先按「+ 新增」建立測驗題庫分頁，再上傳檔案';
    return;
  }
  state.zipLoading = true;
  state.zipError = '';
  state.zipSecondFolders = [];
  state.zipResponseJson = null;
  try {
    await delay(700);
    const mockFolders = ['Ch01_緒論', 'Ch02_基礎概念', 'Ch03_進階應用', 'Appendix_習題'];
    const meta = {
      filename: state.zipFileName || '教材範例.zip',
      file_size: 2.35,
      second_folders: mockFolders,
    };
    state.zipResponseJson = meta;
    state.zipTabId = String(tabId);
    state.zipFileName = meta.filename;
    state.zipSecondFolders = mockFolders;
    const rag = ragList.value.find((r) => String(r.rag_tab_id ?? r.id) === String(tabId));
    if (rag) {
      rag.file_metadata = { ...meta };
      rag.file_size = meta.file_size;
    }
  } catch (err) {
    state.zipError = err.message || '上傳失敗';
    state.zipSecondFolders = [];
    state.zipResponseJson = null;
  } finally {
    state.zipLoading = false;
  }
}

async function confirmPack() {
  const state = currentState.value;
  const fileId = String(state.zipTabId ?? '').trim();
  const unitList = state.packTasks?.trim();
  if (!fileId) {
    state.packError = '請先上傳教材檔，完成後再建立題庫';
    return;
  }
  if (!isPackTasksListReady(state.packTasksList ?? [])) {
    state.packError = '請至少建立一個出題單元，且每個出題單元至少包含一個單元';
    return;
  }
  if (!unitList) {
    state.packError = '請輸入單元清單（例：220222+220301 或 220222,220301+220302）';
    return;
  }
  state.packLoading = true;
  state.packError = '';
  state.packResponseJson = null;
  try {
    await delay(900);
    const outputs = (state.packTasksList || []).map((g) => {
      const joined = g.filter(Boolean).join('+');
      const label = joined || '單元';
      return {
        rag_tab_id: fileId,
        rag_name: label,
        unit_name: label.replace(/\+/g, '_'),
        filename: `${(g[0] || 'unit').replace(/\s+/g, '_')}_rag.zip`,
        file_size: 0.85 + Math.random() * 0.4,
      };
    });
    const packJson = {
      rag_tab_id: fileId,
      outputs,
      ok: true,
    };
    state.packResponseJson = packJson;
    state.ragMetadata = JSON.stringify(packJson, null, 2);
    const rag = ragList.value.find((r) => String(r.rag_tab_id ?? r.id) === String(fileId));
    if (rag) {
      rag.unit_list = unitList;
      rag.rag_metadata = state.ragMetadata;
      rag.chunk_size = ensureNumber(chunkSize.value, 1000);
      rag.chunk_overlap = ensureNumber(chunkOverlap.value, 200);
      rag.system_prompt_instruction = (state.systemInstruction ?? '').trim() || '';
      rag.outputs = outputs;
    }
  } catch (err) {
    state.packError = err.message || '壓縮失敗';
    state.packResponseJson = null;
  } finally {
    state.packLoading = false;
  }
}

const difficultyOptions = QUIZ_LEVEL_LABELS;

function getSlotFormState(slotIndex) {
  const state = currentState.value;
  if (!state.slotFormState[slotIndex]) {
    state.slotFormState[slotIndex] = reactive({
      generateQuizTabId: '',
      loading: false,
      error: '',
      responseJson: null,
    });
  }
  return state.slotFormState[slotIndex];
}

function openNextQuizSlot() {
  const state = currentState.value;
  state.showQuizGeneratorBlock = true;
  state.quizSlotsCount = (state.quizSlotsCount || 0) + 1;
  while (state.cardList.length < state.quizSlotsCount) {
    state.cardList.push(null);
  }
}

function setCardAtSlot(slotIndex, quizContent, hint, sourceFilename, referenceAnswer, ragName, generateQuizResponseJson, generateLevel, systemInstructionUsed, ragId, ragQuizId) {
  const state = currentState.value;
  while (state.cardList.length < slotIndex) {
    state.cardList.push(null);
  }
  const ragIdStr = ragId != null && String(ragId).trim() !== '' ? String(ragId) : null;
  const card = {
    id: nextCardId(),
    quiz: quizContent ?? '',
    hint: hint ?? '',
    referenceAnswer: referenceAnswer ?? '',
    sourceFilename: sourceFilename ?? null,
    ragName: ragName ?? null,
    rag_id: ragIdStr,
    quiz_answer: '',
    hintVisible: false,
    confirmed: false,
    gradingResult: '',
    gradingResponseJson: null,
    generateQuizResponseJson: generateQuizResponseJson ?? null,
    generateLevel: generateLevel ?? null,
    systemInstructionUsed: systemInstructionUsed ?? null,
    rag_quiz_id: ragQuizId ?? null,
  };
  state.cardList[slotIndex - 1] = card;
}

async function generateQuiz(slotIndex) {
  const state = currentState.value;
  const slotState = getSlotFormState(slotIndex);
  const rag = currentRagItem.value;
  const selectedUnit = findQuizUnitBySlotSelection(generateQuizUnits.value, slotState.generateQuizTabId);
  if (!selectedUnit) {
    slotState.error = '請先選擇單元';
    return;
  }
  const unitName = String(selectedUnit.unit_name ?? selectedUnit.rag_name ?? '').trim();
  const ragName = selectedUnit.rag_name?.trim() || unitName;
  const ragId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  if (ragId == null) {
    slotState.error = '無法取得題庫編號，請先上傳教材或重新整理頁面';
    return;
  }
  if (!generateQuizUnits.value.length) {
    slotState.error = '請先在「出題單元」區按「確定」完成題庫建立，或重新整理頁面';
    return;
  }
  slotState.loading = true;
  slotState.error = '';
  slotState.responseJson = null;
  try {
    await delay(750);
    const level = quizLevelStringForApi(filterDifficulty.value);
    const data = {
      [API_RESPONSE_QUIZ_CONTENT]: `（原型）請說明「${unitName}」中的核心觀念，並舉一個與課程相關的實例。`,
      quiz_hint: '可從定義與應用場景兩方面作答。',
      quiz_answer_reference: '應包含名詞解釋與簡短範例，並使用繁體中文。',
      unit_filename: selectedUnit.filename,
      rag_quiz_id: 88000 + slotIndex,
    };
    slotState.responseJson = data;
    setCardAtSlot(
      slotIndex,
      data[API_RESPONSE_QUIZ_CONTENT] ?? data[API_RESPONSE_QUIZ_LEGACY] ?? data.quiz_content ?? '',
      data.quiz_hint ?? data.hint ?? '',
      data.unit_filename ?? data.target_filename ?? selectedUnit?.filename ?? '',
      data.quiz_answer_reference ?? data.quiz_reference_answer ?? data.quiz_answer ?? data.answer ?? '',
      ragName,
      data,
      level,
      (state.systemInstruction ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION,
      ragId,
      data.rag_quiz_id
    );
  } catch (err) {
    slotState.error = err.message || '產生題目失敗';
  } finally {
    slotState.loading = false;
  }
}

function toggleHint(item) {
  item.hintVisible = !item.hintVisible;
}

async function confirmAnswer(item) {
  if (!item.quiz_answer.trim()) return;
  const state = currentState.value;
  const rag = currentRagItem.value;
  const activeRagId = rag?.rag_id ?? rag?.id ?? state?.zipResponseJson?.rag_id ?? state?.zipResponseJson?.id;
  const cardRag = item?.rag_id;
  if (
    activeRagId != null &&
    cardRag != null &&
    String(activeRagId).trim() !== '' &&
    String(cardRag).trim() !== '' &&
    String(activeRagId).trim() !== String(cardRag).trim()
  ) {
    return;
  }
  const sourceTabId = String(state.zipTabId ?? '').trim();
  const ragId = activeRagId;
  if (!sourceTabId) {
    item.confirmed = true;
    item.gradingResult = '請先上傳教材並完成題庫建立，再進行批改。';
    return;
  }
  if (ragId == null) {
    item.confirmed = true;
    item.gradingResult = '無法批改：請先上傳教材或重新整理頁面後再試。';
    return;
  }
  gradingLoading.value = true;
  item.confirmed = true;
  item.gradingResult = '批改中...';
  try {
    await delay(900);
    const mockPayload = {
      quiz_score: 8,
      quiz_comments: '（原型）作答涵蓋主要概念；若再補上一句因果說明會更完整。',
      rag_answer_id: 77000 + Math.floor(Math.random() * 1000),
    };
    item.gradingResponseJson = mockPayload;
    item.gradingResult = formatGradingResult(JSON.stringify(mockPayload)) || `分數：${mockPayload.quiz_score}/10\n${mockPayload.quiz_comments}`;
  } finally {
    gradingLoading.value = false;
  }
}

onMounted(() => {
  clearZipFileInput();
  if (!DESIGN_SHOW_ALL_UI_BLOCKS) {
    delay(480).then(() => {
      ragListLoading.value = false;
    });
  }
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="isAnyLoading"
      loading-text="請稍候，正在載入或處理..."
    />
    <TabRenameModal
      v-model="renameRagTabModalOpen"
      :initial-name="renameRagTabInitialName"
      :saving="renameRagTabSaving"
      :error="renameRagTabError"
      title="修改測驗題庫分頁名稱"
      @save="onRenameRagTabSave"
    />

    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
        <div class="text-center text-md-start flex-grow-1">
          <span class="navbar-brand mb-0">建立測驗題庫</span>
        </div>
        <span class="badge rounded-pill bg-secondary">Prototype</span>
      </div>
    </div>

    <RagTabsBar
      :rag-items="ragItems"
      :new-tab-items="newTabItems"
      :active-tab-id="activeTabId"
      :rag-list-loading="DESIGN_SHOW_ALL_UI_BLOCKS ? false : ragListLoading"
      :create-rag-loading="createRagLoading"
      :rag-list-error="ragListError"
      :create-rag-error="createRagError"
      :delete-rag-loading="deleteRagLoading"
      :rename-tab-loading="renameRagTabSaving"
      :relax-button-disables="DESIGN_PROTOTYPE_NO_DISABLE"
      @update:active-tab-id="activeTabId = $event"
      @add-new-tab="addNewTab"
      @delete-rag="onDeleteRagTab"
      @rename-tab="openRenameRagTab"
    />

    <div class="flex-grow-1 overflow-auto bg-white min-height-0">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
            <template v-if="DESIGN_SHOW_ALL_UI_BLOCKS || ragList.length > 0 || showFormWhenNoData">
              <div
                v-if="DESIGN_SHOW_ALL_UI_BLOCKS || activeTabId"
                class="create-rag-stepper text-start page-block-spacing mb-4"
                aria-label="建立流程"
              >
                <div class="d-flex align-items-start justify-content-between gap-2 gap-sm-3 w-100">
                  <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
                    <span
                      class="create-rag-stepper-num rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold my-font-size-sm"
                      :class="createRagStepperPhase >= 1 ? 'create-rag-stepper-num--on' : 'create-rag-stepper-num--off'"
                    >1</span>
                    <span class="mt-2 my-font-size-sm" :class="createRagStepperPhase >= 1 ? 'text-dark fw-medium' : 'text-muted'">上傳檔案</span>
                  </div>
                  <div
                    class="create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
                    :class="createRagStepperPhase >= 2 ? 'create-rag-stepper-line--on' : ''"
                    aria-hidden="true"
                  />
                  <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
                    <span
                      class="create-rag-stepper-num rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold my-font-size-sm"
                      :class="createRagStepperPhase >= 2 ? 'create-rag-stepper-num--on' : 'create-rag-stepper-num--off'"
                    >2</span>
                    <span class="mt-2 my-font-size-sm" :class="createRagStepperPhase >= 2 ? 'text-dark fw-medium' : 'text-muted'">建立測驗題庫</span>
                  </div>
                  <div
                    class="create-rag-stepper-line align-self-center flex-grow-1 mx-n1 mx-sm-0"
                    :class="createRagStepperPhase >= 3 ? 'create-rag-stepper-line--on' : ''"
                    aria-hidden="true"
                  />
                  <div class="flex-grow-1 d-flex flex-column align-items-center text-center px-1">
                    <span
                      class="create-rag-stepper-num rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-semibold my-font-size-sm"
                      :class="createRagStepperPhase >= 3 ? 'create-rag-stepper-num--on' : 'create-rag-stepper-num--off'"
                    >3</span>
                    <span class="mt-2 my-font-size-sm" :class="createRagStepperPhase >= 3 ? 'text-dark fw-medium' : 'text-muted'">測試問題</span>
                  </div>
                </div>
              </div>

              <div
                v-if="DESIGN_SHOW_ALL_UI_BLOCKS || (activeTabId && !hasUploadedFileMetadata)"
                class="text-start page-block-spacing border rounded p-3 mb-4 bg-body-tertiary bg-opacity-25"
              >
                <p class="my-font-size-sm text-secondary mb-3">支援與正式版相同的副檔名；此處僅更新畫面狀態。</p>
                <input
                  ref="zipFileInputRef"
                  type="file"
                  :accept="UPLOAD_ACCEPT_ATTR"
                  class="d-none"
                  @change="onZipChange"
                >
                <div
                  class="zip-drop-zone rounded border border-dashed border-2 p-5 text-center position-relative"
                  :class="{ 'zip-drop-zone-over': isZipDragOver }"
                  @dragover="onZipDragOver"
                  @dragenter="onZipDragOver"
                  @dragleave="onZipDragLeave"
                  @drop="onZipDrop"
                  @click="openZipFileDialog()"
                >
                  <template v-if="currentState.zipLoading">
                    <span class="text-secondary my-font-size-sm">上傳中...</span>
                  </template>
                  <template v-else>
                    <template v-if="currentState.zipFileName">
                      <span class="my-font-size-sm text-body fw-medium">{{ currentState.zipFileName }}</span>
                      <div class="mt-1 my-font-size-sm text-muted">點擊可重新選擇檔案</div>
                    </template>
                    <span v-else class="my-font-size-sm text-secondary">拖曳檔案到這裡，或點擊選擇檔案</span>
                    <div class="mt-2 my-font-size-sm text-muted">
                      可解析的檔案副檔名：.zip、.pdf、.doc、.docx、.ppt、.pptx
                    </div>
                  </template>
                </div>
                <div v-if="currentState.zipError" class="alert alert-danger mt-2 mb-0 py-2 my-font-size-sm">
                  {{ currentState.zipError }}
                </div>
                <div class="d-flex justify-content-end mt-2">
                  <button
                    type="button"
                    class="btn btn-sm btn-primary rounded-pill px-3"
                    :disabled="protoBtnDisabled(currentState.zipLoading || !currentState.zipFileName)"
                    @click.stop="confirmUploadZip"
                  >
                    確定上傳
                  </button>
                </div>
              </div>

              <div
                v-if="DESIGN_SHOW_ALL_UI_BLOCKS || fileMetadataToShow != null"
                class="text-start page-block-spacing border rounded p-3 mb-4"
                :class="{ 'opacity-75 pe-none': !hasRagMetadata && packGroupsEditBlocked }"
              >
                <div class="mb-3">
                  <div class="my-font-size-sm text-secondary fw-medium mb-1">上傳檔案名稱</div>
                  <div class="my-font-size-sm text-break">{{ uploadedZipDisplayName || '（示意）教材.zip' }}</div>
                  <div
                    v-if="DESIGN_SHOW_ALL_UI_BLOCKS || uploadZipFileSizeDisplay"
                    class="my-font-size-sm text-muted mt-1"
                  >
                    檔案大小：{{ uploadZipFileSizeDisplay || '（示意）約 1.0 MB' }}
                  </div>
                </div>

                <template v-if="hasRagMetadata">
                  <div class="mb-3">
                    <div class="my-font-size-sm text-secondary fw-medium mb-1">出題單元</div>
                    <div v-if="ragListReadonlyGroups.length" class="my-font-size-sm text-break">{{ ragListReadonlyInlineText }}</div>
                    <div v-else class="my-font-size-sm text-muted">—</div>
                  </div>
                  <div v-if="DESIGN_SHOW_ALL_UI_BLOCKS || ragBuildOutputSizeSummary" class="mb-3">
                    <div class="my-font-size-sm text-secondary fw-medium mb-1">建置輸出檔大小</div>
                    <div class="my-font-size-sm text-break">{{ ragBuildOutputSizeSummary || '（示意）單元 A 0.5 MB' }}</div>
                  </div>
                  <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
                    <div>
                      <div class="my-font-size-sm text-secondary fw-medium mb-1">分段長度（字元）</div>
                      <div class="my-font-size-sm">{{ chunkSize }}</div>
                    </div>
                    <div>
                      <div class="my-font-size-sm text-secondary fw-medium mb-1">分段重疊（字元）</div>
                      <div class="my-font-size-sm">{{ chunkOverlap }}</div>
                    </div>
                  </div>
                  <div class="mb-3">
                    <div class="my-font-size-sm mb-1">出題說明（給 AI）</div>
                    <div class="my-font-size-sm border rounded p-3 bg-body-tertiary">
                      你是一個「{{ courseNameForPrompt }}」課程的教授，請給學生設計試卷題目：<br>
                      【出題規範】<br>
                      請根據輸入的「參考內容」設計試卷題目。<br>
                      **請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。**<br>
                      題目難度：{quiz_level}。<br>
                      <span class="lh-base text-break text-danger">{{ (currentState.systemInstruction ?? '').trim() || '—' }}</span><br>
                      【回傳格式】<br>
                      請以 JSON 格式回傳：<br>
                      { "quiz_content": "問題內容", <br>
                      "quiz_hint": "答案提示內容", <br>
                      "quiz_answer_reference": "參考答案內容" }<br>
                    </div>
                  </div>
                  <div
                    v-if="DESIGN_SHOW_ALL_UI_BLOCKS || (!isNewTabId(activeTabId) && currentRagItem && (currentRagItem.rag_tab_id ?? currentRagItem.id))"
                    class="d-flex flex-wrap justify-content-end align-items-center gap-2"
                  >
                    <button
                      type="button"
                      :class="currentRagIsExamRag ? 'btn btn-sm btn-outline-secondary rounded-pill px-3' : 'btn btn-sm btn-success rounded-pill px-3'"
                      :disabled="protoBtnDisabled(currentState.forExamLoading)"
                      @click="currentRagIsExamRag ? clearRagForExam() : setRagForExam()"
                    >
                      {{ currentRagIsExamRag ? '取消設為測驗用' : '設為測驗用' }}
                    </button>
                  </div>
                  <div v-if="currentState.forExamError" class="alert alert-danger py-2 my-font-size-sm mb-0 mt-2">
                    {{ currentState.forExamError }}
                  </div>

                  <div
                    v-if="DESIGN_SHOW_ALL_UI_BLOCKS"
                    class="border-top border-secondary-subtle pt-4 mt-4"
                  >
                    <div class="my-font-size-sm text-secondary fw-medium mb-3">
                      （介面示意）建置題庫「前」：出題單元編排與打包（與上方已建置唯讀區並列供參考）
                    </div>
                    <div class="mb-3">
                      <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">資料夾</label>
                      <div class="d-flex flex-wrap gap-2 p-2 rounded border bg-body-secondary">
                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-2 rounded-pill">第一章</span>
                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-2 rounded-pill">第二章</span>
                      </div>
                    </div>
                    <div class="mb-2">
                      <label class="form-label my-font-size-sm text-secondary fw-medium mb-0">出題單元</label>
                      <div class="d-flex flex-wrap align-items-start gap-2">
                        <div
                          class="border rounded p-2 d-flex align-items-center gap-1 bg-body-secondary"
                          style="min-width: 120px; min-height: 2.5rem;"
                        >
                          <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
                            <span class="badge bg-primary px-2 py-2 rounded-pill">第一章</span>
                            <span class="text-muted my-font-size-sm">+</span>
                            <span class="badge bg-primary px-2 py-2 rounded-pill">第二章</span>
                          </div>
                        </div>
                        <div
                          class="d-flex align-items-center justify-content-center btn btn-sm btn-outline-primary rounded-pill"
                          style="min-width: 140px; min-height: 2.5rem;"
                        >
                          + 新增出題單元
                        </div>
                      </div>
                      <div class="mt-2 d-flex flex-wrap gap-2 align-items-center">
                        <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill">每個資料夾各新增一組出題單元</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill">新增一組出題單元（合併全部資料夾）</button>
                      </div>
                    </div>
                    <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
                      <div class="flex-grow-1" style="min-width: 180px; flex: 1 1 180px; max-width: 280px;">
                        <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">分段長度（字元）</label>
                        <div class="form-control form-control-sm bg-body-secondary">1000</div>
                      </div>
                      <div class="flex-grow-1" style="min-width: 180px; flex: 1 1 180px; max-width: 280px;">
                        <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">分段重疊（字元）</label>
                        <div class="form-control form-control-sm bg-body-secondary">200</div>
                      </div>
                    </div>
                    <div class="mt-3 mb-2">
                      <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">出題說明（給 AI）</label>
                      <div class="my-font-size-sm border rounded p-3 bg-body-tertiary text-secondary">（示意）建立題庫前可在此編輯提示詞…</div>
                    </div>
                    <div class="mt-3 d-flex justify-content-end">
                      <button type="button" class="btn btn-sm btn-primary rounded-pill px-3">確定</button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div v-if="secondFoldersFull.length" class="mb-3">
                    <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">資料夾</label>
                    <div class="d-flex flex-wrap gap-2 p-2 rounded border bg-body-secondary">
                      <div
                        v-for="(name, i) in secondFoldersFull"
                        :key="'sf-' + i"
                        class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-2 rounded-pill user-select-none"
                        style="cursor: grab;"
                        draggable="true"
                        role="button"
                        tabindex="0"
                        @dragstart="onDragStartTag($event, name, false, -1, -1)"
                        @dragend="onDragEndTag"
                      >
                        {{ name }}
                      </div>
                    </div>
                  </div>

                  <div class="mb-2">
                    <label class="form-label my-font-size-sm text-secondary fw-medium mb-0">出題單元</label>
                    <div class="d-flex flex-wrap align-items-start gap-2">
                      <template v-for="(group, gi) in ragListDisplayGroups" :key="'rg-' + gi">
                        <div
                          class="pack-drop-target border rounded p-2 d-flex align-items-center gap-1 position-relative bg-body-secondary"
                          style="min-width: 120px; min-height: 2.5rem;"
                          @dragover.prevent="onDragOver($event)"
                          @dragenter.prevent="onDragEnter($event)"
                          @dragleave="onDragLeave($event)"
                          @drop.prevent="onDropRagList($event, gi)"
                        >
                          <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
                            <div
                              v-for="(tag, ti) in group"
                              :key="'t-' + gi + '-' + ti"
                              class="badge bg-primary px-2 py-2 rounded-pill d-inline-flex align-items-center gap-1"
                              style="cursor: grab;"
                              draggable="true"
                              role="button"
                              @dragstart="onDragStartTag($event, tag, true, gi, ti)"
                              @dragend="onDragEndTag"
                            >
                              {{ tag }}
                              <span
                                class="ms-1 opacity-75"
                                style="cursor: pointer;"
                                aria-label="移除標籤"
                                @click.stop="removeFromRagList(gi, ti)"
                              >×</span>
                            </div>
                            <span v-if="!group.length" class="text-muted my-font-size-sm">拖入此處</span>
                          </div>
                          <button
                            v-if="(currentState.packTasksList || []).length > 0"
                            type="button"
                            class="btn btn-link btn-sm p-0 ms-1 text-muted text-decoration-none flex-shrink-0"
                            style="min-width: 1.5rem;"
                            aria-label="刪除此出題單元"
                            @click.stop="removeRagListGroup(gi)"
                          >
                            ×
                          </button>
                        </div>
                      </template>
                      <div
                        class="d-flex align-items-center justify-content-center pack-drop-target btn btn-sm btn-outline-primary rounded-pill"
                        style="min-width: 140px; min-height: 2.5rem; cursor: pointer;"
                        role="button"
                        tabindex="0"
                        @dragover.prevent="onDragOver($event)"
                        @dragenter.prevent="onDragEnter($event)"
                        @dragleave="onDragLeave($event)"
                        @drop.prevent="onDropRagList($event, (currentState.packTasksList || []).length)"
                        @click="addRagListGroup"
                        @keydown.enter.prevent="addRagListGroup"
                        @keydown.space.prevent="addRagListGroup"
                      >
                        + 新增出題單元
                      </div>
                    </div>
                    <div class="mt-2 d-flex flex-wrap gap-2 align-items-center">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary rounded-pill"
                        :disabled="protoBtnDisabled(!secondFoldersFull.length)"
                        @click="addAllSecondFoldersAsGroups"
                      >
                        每個資料夾各新增一組出題單元
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary rounded-pill"
                        :disabled="protoBtnDisabled(!secondFoldersFull.length)"
                        title="在現有出題單元之後再追加一組；該組包含全部資料夾，打包時以 + 連成同一題庫"
                        @click="setAllSecondFoldersAsSingleGroup"
                      >
                        新增一組出題單元（合併全部資料夾）
                      </button>
                    </div>
                  </div>

                  <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
                    <div class="flex-grow-1" style="min-width: 180px; flex: 1 1 180px; max-width: 280px;">
                      <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">分段長度（字元）</label>
                      <input
                        v-model.number="chunkSize"
                        type="number"
                        min="1"
                        step="1"
                        class="form-control form-control-sm"
                        placeholder="1000"
                      >
                    </div>
                    <div class="flex-grow-1" style="min-width: 180px; flex: 1 1 180px; max-width: 280px;">
                      <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">分段重疊（字元）</label>
                      <input
                        v-model.number="chunkOverlap"
                        type="number"
                        min="0"
                        step="1"
                        class="form-control form-control-sm"
                        placeholder="200"
                      >
                    </div>
                  </div>
                  <div class="mt-3">
                    <label class="form-label my-font-size-sm text-secondary fw-medium mb-1">出題說明（給 AI）</label>
                    <div class="my-font-size-sm border rounded p-3 bg-body-tertiary">
                      【出題規範】<br>
                      請根據輸入的「參考內容」設計試卷題目。<br>
                      請使用繁體中文 (Traditional Chinese) 出題與撰寫提示及參考答案。<br>
                      題目難度：{quiz_level}。<br>
                      <textarea
                        v-model="currentState.systemInstruction"
                        class="form-control form-control-sm font-monospace my-font-size-sm my-3"
                        rows="5"
                        :placeholder="'留空則使用預設：' + DEFAULT_SYSTEM_INSTRUCTION"
                        style="max-width: 100%;"
                      />
                      【回傳格式】<br>
                      請以 JSON 格式回傳：<br>
                      { "quiz_content": "問題內容", <br>
                      "quiz_hint": "答案提示內容", <br>
                      "quiz_answer_reference": "參考答案內容" }<br>
                    </div>
                  </div>
                  <div class="mt-3 d-flex justify-content-end">
                    <button
                      type="button"
                      class="btn btn-sm btn-primary rounded-pill px-3"
                      :disabled="protoBtnDisabled(packGroupsEditBlocked || !isPackTasksListReady(currentState.packTasksList ?? []))"
                      @click="confirmPack"
                    >
                      確定
                    </button>
                  </div>
                  <div v-if="currentState.packError" class="alert alert-danger py-2 my-font-size-sm mb-2">
                    {{ currentState.packError }}
                  </div>
                </template>
              </div>

              <div
                v-if="DESIGN_SHOW_ALL_UI_BLOCKS || (currentState.ragMetadata != null && String(currentState.ragMetadata).trim() !== '')"
                class="text-start page-block-spacing mb-5"
                :class="{ 'opacity-75': ragGenerateDisabled }"
              >
                <div class="fs-5 fw-semibold mb-4 pb-2 border-bottom">測試問題</div>

                <div class="mb-4">
                  <template v-for="slotIndex in currentState.quizSlotsCount" :key="slotIndex">
                    <template v-if="currentState.cardList[slotIndex - 1]">
                      <QuizCard
                        :card="currentState.cardList[slotIndex - 1]"
                        :slot-index="slotIndex"
                        :course-name="courseNameForPrompt"
                        :current-rag-id="currentRagIdForQuizCards"
                        :skip-rag-mismatch-guard="DESIGN_PROTOTYPE_NO_DISABLE"
                        @toggle-hint="toggleHint"
                        @confirm-answer="confirmAnswer"
                        @update:quiz_answer="(val) => { currentState.cardList[slotIndex - 1].quiz_answer = val }"
                      />
                    </template>
                    <template v-else>
                      <div class="card mb-4" :class="{ 'mt-4': slotIndex > 1 }">
                        <div class="card-header py-2 bg-body-tertiary">
                          <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
                        </div>
                        <div class="card-body text-start pt-3">
                          <div class="d-flex flex-wrap align-items-end gap-3">
                            <div class="flex-grow-1 min-w-0" style="min-width: 10rem">
                              <label class="form-label my-font-size-sm text-secondary fw-medium mb-1" :for="`rag-quiz-unit-${slotIndex}-toggle`">單元</label>
                              <UnitSelectDropdown
                                v-model="getSlotFormState(slotIndex).generateQuizTabId"
                                :options="generateQuizUnits"
                                :menu-id="`rag-quiz-unit-design-${slotIndex}`"
                              />
                            </div>
                            <div>
                              <label class="form-label my-font-size-sm text-secondary fw-medium mb-1 d-block">難度</label>
                              <div class="d-flex flex-wrap gap-2" role="group" aria-label="難度">
                                <template v-for="(opt, di) in difficultyOptions" :key="opt">
                                  <input
                                    :id="'rag-quiz-diff-d-' + slotIndex + '-' + di"
                                    v-model="filterDifficulty"
                                    type="radio"
                                    class="btn-check"
                                    :name="'rag-quiz-difficulty-d-' + slotIndex"
                                    :value="opt"
                                    autocomplete="off"
                                  >
                                  <label
                                    class="btn btn-sm btn-outline-primary rounded-pill"
                                    :for="'rag-quiz-diff-d-' + slotIndex + '-' + di"
                                  >{{ opt }}</label>
                                </template>
                              </div>
                            </div>
                            <button
                              type="button"
                              class="btn btn-sm btn-primary rounded-pill px-3"
                              :disabled="protoBtnDisabled(getSlotFormState(slotIndex).loading || !String(getSlotFormState(slotIndex).generateQuizTabId || '').trim())"
                              @click="generateQuiz(slotIndex)"
                            >
                              產生題目
                            </button>
                          </div>
                          <div v-if="getSlotFormState(slotIndex).error" class="alert alert-danger mt-2 mb-0 py-2 my-font-size-sm">
                            {{ getSlotFormState(slotIndex).error }}
                          </div>
                        </div>
                      </div>
                    </template>
                  </template>

                  <div class="mb-0 pt-2 d-flex justify-content-center">
                    <button type="button" class="btn btn-sm btn-primary rounded-pill px-3" @click="openNextQuizSlot">
                      新增題目
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.min-height-0 {
  min-height: 0;
}
.zip-drop-zone {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  border-color: rgba(0, 0, 0, 0.2) !important;
  background: rgba(0, 0, 0, 0.02);
}
.zip-drop-zone:hover {
  border-color: var(--bs-primary) !important;
  background: rgba(13, 110, 253, 0.04);
}
.zip-drop-zone-over {
  border-color: var(--bs-primary) !important;
  background: rgba(13, 110, 253, 0.08) !important;
}
.pack-drop-target.pack-drop-active {
  background-color: rgba(13, 202, 240, 0.15) !important;
  border-color: var(--bs-info) !important;
}
.create-rag-stepper-num {
  width: 2.25rem;
  height: 2.25rem;
  line-height: 1;
}
.create-rag-stepper-num--on {
  background-color: var(--bs-primary);
  color: var(--bs-white);
}
.create-rag-stepper-num--off {
  background-color: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
  border: 1px solid var(--bs-border-color);
}
.create-rag-stepper-line {
  flex: 1 1 1rem;
  min-width: 0.35rem;
  height: 2px;
  margin-top: 1.125rem;
  align-self: flex-start;
  background-color: var(--bs-border-color);
  border-radius: 1px;
}
.create-rag-stepper-line--on {
  background-color: var(--bs-primary);
}
</style>
