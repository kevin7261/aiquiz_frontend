<script setup>
/**
 * AnswerWeaknessAnalysisPage - 作答弱點分析頁面
 *
 * 登入後即 GET `person_analysis_user_prompt_text` 供「分析規則」與 Modal 使用（全 user_type）；僅 1／2 顯示編輯區，主按鈕為「儲存並開始分析」（先儲存規則再跑分析）；其餘角色僅見下方大膠囊「開始弱點分析」。
 * 列表與 GET /exam/tabs、GET /rag/tabs 每筆一致；另含 count、weakness_report。題目區（QuizCard）純顯示。
 */
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_QUIZZES_BY_PERSON, API_PERSON_ANALYSIS_USER_PROMPT } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import QuizCard from '../components/QuizCard.vue';
import EnglishExamMarkdownEditor from '../components/EnglishExamMarkdownEditor.vue';
import {
  normalizeAnalysisQuizzesListResponse,
  mergeQuizzesWithTopLevelAnswers,
  quizAnswerPresetFromReference,
} from '../utils/rag.js';
import { formatGradingResult } from '../utils/grading.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js';

const authStore = useAuthStore();

/** 分析報告規則：僅開發者（1）／管理者（2）；與設定頁 LLM API 金鑰可見範圍一致 */
const canEditWeaknessReportRules = computed(() => {
  const t = Number(authStore.user?.user_type);
  return t === 1 || t === 2;
});

function md(s) {
  return renderMarkdownToSafeHtml(s);
}

/** JSON 區塊內非陣列值：字串當 md；其餘以 fenced JSON 顯示 */
function weaknessScalarToMdHtml(val) {
  if (val == null) return '';
  if (typeof val === 'string') return renderMarkdownToSafeHtml(val);
  try {
    return renderMarkdownToSafeHtml('```json\n' + JSON.stringify(val, null, 2) + '\n```');
  } catch {
    return renderMarkdownToSafeHtml(String(val));
  }
}

const items = ref([]);
/** 與 items 同序；供 QuizCard（與測驗頁同一題目區 UI） */
const quizCardUi = ref([]);
const count = ref(0);
const weaknessReport = ref('');
const loading = ref(false);
const error = ref('');
/** 尚未按「開始分析」前不請求 GET /person-analysis/quizzes */
const analysisLoadedOnce = ref(false);

const personAnalysisPromptText = ref('');
/** GET／儲存成功後對齊；重設還原至此 */
const personAnalysisPromptBaseline = ref('');
const promptSectionLoading = ref(false);
/** 編輯區先 PUT 規則時由全螢幕 overlay 顯示進度 */
const promptSaving = ref(false);

/** 全螢幕 LoadingOverlay：答題載入、GET／PUT 分析報告規則 */
const overlayBlocking = computed(
  () => loading.value || promptSectionLoading.value || promptSaving.value,
);
const overlayLoadingText = computed(() => {
  if (loading.value) return '載入作答與弱點分析中...';
  if (promptSaving.value) return '儲存分析報告規則中...';
  if (promptSectionLoading.value) return '載入分析報告規則中...';
  return '載入中...';
});

function parsePersonAnalysisPromptFromBody(data) {
  if (!data || typeof data !== 'object') return '';
  const v =
    data.person_analysis_user_prompt_text ??
    data.personAnalysisUserPromptText ??
    data.value ??
    data.prompt_text;
  return v != null ? String(v) : '';
}

async function fetchPersonAnalysisPromptSetting() {
  const personId = authStore.user?.person_id;
  if (!personId) return;
  promptSectionLoading.value = true;
  try {
    const url = `${API_BASE}${API_PERSON_ANALYSIS_USER_PROMPT}`;
    const res = await loggedFetch(url, { method: 'GET', headers: { 'X-Person-Id': String(personId) } });
    if (res.ok) {
      const data = await res.json();
      const next = parsePersonAnalysisPromptFromBody(data);
      personAnalysisPromptText.value = next;
      personAnalysisPromptBaseline.value = next;
    }
  } catch {
    // 保留編輯框空白
  } finally {
    promptSectionLoading.value = false;
  }
}

/**
 * 僅抓答題與弱點報告；manageLoading 為 false 時由呼叫端負責 loading。
 * generateWeaknessReport 為 true 時 query 帶 generate_weakness_report=true（後端才會呼叫 LLM）。
 */
async function runPersonAnalysisQuizFetch({
  manageLoading = true,
  generateWeaknessReport = false,
} = {}) {
  const personId = authStore.user?.person_id;
  if (!personId) {
    error.value = '請先登入以查看作答弱點分析';
    return;
  }
  if (manageLoading) {
    loading.value = true;
  }
  error.value = '';
  analysisLoadedOnce.value = true;
  try {
    const qs = generateWeaknessReport ? '?generate_weakness_report=true' : '';
    const url = `${API_BASE}${API_QUIZZES_BY_PERSON}/${encodeURIComponent(personId)}${qs}`;
    const headers = { 'X-Person-Id': String(personId) };
    const res = await loggedFetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(res.statusText || '無法載入答題資料');
    const data = await res.json();
    const exams = normalizeAnalysisQuizzesListResponse(data);
    items.value = exams.flatMap((parent) => {
      const quizzes = mergeQuizzesWithTopLevelAnswers(parent);
      const examLabel =
        parent.tab_name ?? parent.exam_name ?? parent.rag_name ?? parent.exam_tab_id ?? '';
      const examTabId = parent.exam_tab_id ?? parent.test_tab_id;
      const examId = parent.exam_id ?? parent.test_id;
      const ragTabId = parent.rag_tab_id;
      const ragId = parent.rag_id ?? parent.id;
      return quizzes.map((q) => ({
        ...q,
        exam_name: q.exam_name ?? examLabel,
        exam_tab_id: q.exam_tab_id ?? examTabId,
        exam_id: q.exam_id ?? examId,
        rag_tab_id: q.rag_tab_id ?? ragTabId,
        rag_id: q.rag_id ?? q.ragId ?? ragId,
      }));
    });
    count.value = data?.count ?? items.value.length;
    weaknessReport.value =
      data?.weakness_report != null && String(data.weakness_report).trim() !== ''
        ? String(data.weakness_report).trim()
        : '';
  } catch (err) {
    error.value = err.message || '無法載入作答弱點分析';
    items.value = [];
    count.value = 0;
    weaknessReport.value = '';
  } finally {
    if (manageLoading) {
      loading.value = false;
    }
  }
}

/** 開發者／管理者：規則有改時先 PUT，再 GET 並觸發弱點報告（與下方大膠囊同一資料流） */
async function startWeaknessAnalysisFromRulesEditor() {
  if (!canEditWeaknessReportRules.value) return;
  const personId = authStore.user?.person_id;
  if (!personId) {
    error.value = '請先登入';
    return;
  }
  error.value = '';
  if (personAnalysisPromptDirty.value) {
    promptSaving.value = true;
    try {
      const url = `${API_BASE}${API_PERSON_ANALYSIS_USER_PROMPT}`;
      const res = await loggedFetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Person-Id': String(personId),
        },
        body: JSON.stringify({ person_analysis_user_prompt_text: personAnalysisPromptText.value ?? '' }),
      });
      if (!res.ok) {
        let msg = '儲存分析報告規則失敗';
        try {
          const body = await res.json();
          if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        } catch {
          /* ignore */
        }
        error.value = msg;
        return;
      }
      personAnalysisPromptBaseline.value = String(personAnalysisPromptText.value ?? '');
    } catch (e) {
      error.value = e?.message ?? '無法連線';
      return;
    } finally {
      promptSaving.value = false;
    }
  }
  await runPersonAnalysisQuizFetch({ manageLoading: true, generateWeaknessReport: true });
}

async function fetchWeaknessAnalysisOnly() {
  await runPersonAnalysisQuizFetch({ manageLoading: true, generateWeaknessReport: true });
}

/** Modal：與測驗頁 QuizCard「出題規則」同源（Bootstrap modal-lg、Markdown、`my-modal-backdrop`） */
const analysisRulesModalOpen = ref(false);
const analysisRulesModalLoading = ref(false);
const analysisRulesModalRaw = ref('');

const analysisRulesModalHtml = computed(() => {
  const raw = String(analysisRulesModalRaw.value ?? '');
  return raw.trim() !== '' ? renderMarkdownToSafeHtml(raw) : '';
});

async function fetchAnalysisRulesForModal() {
  const personId = authStore.user?.person_id;
  if (!personId) {
    analysisRulesModalRaw.value = '';
    return;
  }
  analysisRulesModalLoading.value = true;
  promptSectionLoading.value = true;
  try {
    const url = `${API_BASE}${API_PERSON_ANALYSIS_USER_PROMPT}`;
    const res = await loggedFetch(url, { method: 'GET', headers: { 'X-Person-Id': String(personId) } });
    if (res.ok) {
      const data = await res.json();
      analysisRulesModalRaw.value = parsePersonAnalysisPromptFromBody(data);
    } else {
      analysisRulesModalRaw.value = '';
    }
  } catch {
    analysisRulesModalRaw.value = '';
  } finally {
    analysisRulesModalLoading.value = false;
    promptSectionLoading.value = false;
  }
}

/** 與 QuizCard「出題規則」：僅在非空白提示文字時顯示按鈕（GET 後寫入 personAnalysisPromptText，含全 user_type） */
const analysisRulesSnapshotTrimmed = computed(() =>
  String(personAnalysisPromptText.value ?? '').trim(),
);

const personAnalysisPromptDirty = computed(
  () =>
    String(personAnalysisPromptText.value ?? '')
    !== String(personAnalysisPromptBaseline.value ?? ''),
);

function resetPersonAnalysisPromptToBaseline() {
  personAnalysisPromptText.value = String(personAnalysisPromptBaseline.value ?? '');
}

async function openWeaknessAnalysisRulesModal() {
  analysisRulesModalOpen.value = true;
  const local = analysisRulesSnapshotTrimmed.value;
  if (local !== '') {
    analysisRulesModalRaw.value = personAnalysisPromptText.value;
    analysisRulesModalLoading.value = false;
    return;
  }
  await fetchAnalysisRulesForModal();
}

function closeWeaknessAnalysisRulesModal() {
  analysisRulesModalOpen.value = false;
}

watch(
  () => authStore.user?.person_id,
  (pid) => {
    if (pid) fetchPersonAnalysisPromptSetting();
    else {
      personAnalysisPromptText.value = '';
      personAnalysisPromptBaseline.value = '';
    }
  },
  { immediate: true },
);

/** 學習弱點分析報告：後端可能回傳純 JSON 或 ```json ... ```，key 為區塊標題、value 為字串陣列 */
function extractJsonFromWeaknessReport(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.trim();
  if (t.startsWith('```')) {
    const endFence = t.indexOf('\n```');
    const body = endFence >= 0 ? t.slice(t.indexOf('\n') + 1, endFence) : t.replace(/^```\w*\n?/, '').replace(/\n?```\s*$/, '');
    t = body.trim();
  }
  if (!t.startsWith('{')) return null;
  try {
    const obj = JSON.parse(t);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

const weaknessReportParsed = computed(() => extractJsonFromWeaknessReport(weaknessReport.value));

/** 依 JSON 的 key 順序產生的區塊列表 */
const weaknessReportSections = computed(() => {
  const obj = weaknessReportParsed.value;
  if (!obj) return [];
  return Object.keys(obj);
});

/** 與 ExamPage normalizeExamQuizRate 一致 */
function normalizeExamQuizRate(v) {
  const n = Number(v);
  if (n === 1 || n === -1 || n === 0) return n;
  return 0;
}

/** 與 ExamPage extractQuizUserPromptFromExamRagRow 鍵名對齊 */
function extractQuizUserPromptFromRow(raw) {
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

/** 與 ExamPage extractAnswerUserPromptFromExamRagRow 鍵名對齊 */
function extractAnswerUserPromptFromRow(raw) {
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

/** 與 ExamPage examQuizDisplayNameFromRow 一致（題型欄） */
function examQuizDisplayNameFromRow(quiz) {
  if (!quiz || typeof quiz !== 'object') return '';
  const direct = quiz.quiz_name ?? quiz.quizName ?? quiz.QuizName;
  if (direct != null && String(direct).trim() !== '') return String(direct).trim();
  const meta = quiz.quiz_metadata ?? quiz.quizMetadata;
  if (meta != null && typeof meta === 'object') {
    const mn = meta.quiz_name ?? meta.quizName;
    if (mn != null && String(mn).trim() !== '') return String(mn).trim();
  }
  return '';
}

function weaknessQuizTypeLabel(quiz) {
  const s = examQuizDisplayNameFromRow(quiz);
  return s || '—';
}

/**
 * 與 ExamPage buildCardFromExamQuiz 相同欄位，供 QuizCard 與測驗頁同一套題目區 UI。
 * @param {object} item
 * @param {number} index
 */
function weaknessItemToQuizCard(item, index) {
  const answers = Array.isArray(item?.answers) ? item.answers : [];
  const latestAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const latestSubmitted =
    latestAnswer?.quiz_answer ??
    latestAnswer?.student_answer ??
    latestAnswer?.answer_text ??
    latestAnswer?.content ??
    (item?.answer_content != null && String(item.answer_content).trim() !== ''
      ? String(item.answer_content)
      : null);
  const refA =
    item?.quiz_answer_reference ?? item?.quiz_reference_answer ?? item?.reference_answer ?? '';
  const quiz_answer =
    latestSubmitted != null && String(latestSubmitted).trim() !== ''
      ? String(latestSubmitted)
      : quizAnswerPresetFromReference(refA);
  const gradingResult = latestAnswer
    ? (formatGradingResult(JSON.stringify(latestAnswer)) ||
        (latestSubmitted != null && String(latestSubmitted).trim() !== '' ? '已批改' : ''))
    : '';
  const quizId = item?.exam_quiz_id ?? item?.quiz_id ?? null;
  const answerId = latestAnswer?.exam_answer_id ?? latestAnswer?.answer_id ?? null;
  const rid = item?.rag_id ?? item?.ragId ?? null;
  const ragIdStr = rid != null && String(rid).trim() !== '' ? String(rid) : null;
  const ragName = (item?.rag_name ?? item?.unit_name ?? item?.exam_name ?? '').trim() || null;
  return {
    id: `weakness-card-${quizId ?? item?.rag_quiz_id ?? index}-${index}`,
    quiz: item?.quiz_content ?? item?.quiz ?? item?.question ?? '',
    hint: item?.quiz_hint ?? item?.hint ?? '',
    referenceAnswer:
      item?.quiz_answer_reference ?? item?.quiz_reference_answer ?? item?.reference_answer ?? '',
    sourceFilename: item?.file_name ?? null,
    ragName,
    rag_id: ragIdStr,
    rag_unit_id:
      item?.rag_unit_id != null && item?.rag_unit_id !== ''
        ? Number(item.rag_unit_id)
        : null,
    rag_quiz_id:
      item?.rag_quiz_id != null && item?.rag_quiz_id !== ''
        ? Number(item.rag_quiz_id)
        : null,
    quiz_answer,
    hintVisible: false,
    quiz_rate: normalizeExamQuizRate(item?.quiz_rate),
    rateError: '',
    confirmed: !!latestAnswer,
    gradingResult,
    gradingResponseJson: latestAnswer ?? null,
    generateQuizResponseJson: null,
    exam_quiz_id: quizId,
    answer_id: answerId,
    gradingPrompt: extractAnswerUserPromptFromRow(item).trim(),
    quiz_user_prompt_text: extractQuizUserPromptFromRow(item).trim(),
    examQuizDisplayName: examQuizDisplayNameFromRow(item),
  };
}

function toggleWeaknessHint(card) {
  if (!card || typeof card !== 'object') return;
  card.hintVisible = !card.hintVisible;
}

watch(
  items,
  (list) => {
    quizCardUi.value = list.map((it, i) => weaknessItemToQuizCard(it, i));
  },
  { immediate: true },
);

function weaknessSlotQuizBodyTrim(idx) {
  const c = quizCardUi.value[idx];
  return String(c?.quiz ?? '').trim();
}
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay
      :is-visible="overlayBlocking"
      :loading-text="overlayLoadingText"
    />
    <Teleport to="body">
      <div
        v-if="analysisRulesModalOpen"
        class="modal fade show d-block my-modal-backdrop"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weakness-analysis-rules-modal-title"
      >
        <div
          class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
          @click.stop
        >
          <div class="modal-content border-0 my-bgcolor-gray-3 p-4 d-flex flex-column gap-3">
            <div class="modal-header border-bottom-0 p-0">
              <h5
                id="weakness-analysis-rules-modal-title"
                class="modal-title my-color-black"
              >
                分析報告規則
              </h5>
              <button
                type="button"
                class="btn-close"
                aria-label="關閉"
                @click="closeWeaknessAnalysisRulesModal"
              />
            </div>
            <div class="modal-body p-0 lh-base" style="max-height: 70vh; overflow: auto;">
              <div
                v-if="analysisRulesModalLoading"
                class="my-font-md-400 my-color-gray-4"
              >
                載入中…
              </div>
              <template v-else>
                <div
                  v-if="analysisRulesModalHtml"
                  class="my-markdown-rendered my-font-md-400 my-color-black text-break"
                  v-html="analysisRulesModalHtml"
                />
                <span
                  v-else
                  class="my-font-md-400 my-color-black"
                >—</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">作答弱點分析</p>
      </div>
    </header>
    <div v-if="error" class="flex-shrink-0">
      <div class="my-alert-warning-soft my-font-sm-400 py-2 mx-4 mb-3">
        {{ error }}
      </div>
    </div>

    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
            <div
              v-if="canEditWeaknessReportRules"
              class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 text-start mb-4"
            >
              <label class="form-label my-font-md-600 my-color-black mb-2" for="weakness-analysis-report-rules-md">分析報告規則</label>
              <EnglishExamMarkdownEditor
                v-model="personAnalysisPromptText"
                textarea-id="weakness-analysis-report-rules-md"
                placeholder=""
                class="mb-3"
                :disabled="promptSectionLoading || loading || promptSaving"
              />
              <div class="d-flex justify-content-center flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  class="btn rounded-pill my-font-md-400 my-btn-outline-gray-1 px-4 py-2"
                  title="還原為上次載入或儲存後的內容"
                  aria-label="重設分析報告規則"
                  :disabled="promptSectionLoading || loading || promptSaving || !personAnalysisPromptDirty"
                  @click="resetPersonAnalysisPromptToBaseline"
                >
                  重設
                </button>
                <button
                  type="button"
                  class="btn rounded-pill my-font-md-400 my-button-black px-4 py-2"
                  title="儲存規則（若有修改）並開始分析"
                  aria-label="儲存並開始分析"
                  :disabled="promptSectionLoading || loading || promptSaving || !authStore.user?.person_id"
                  :aria-busy="loading || promptSaving"
                  @click="startWeaknessAnalysisFromRulesEditor"
                >
                  儲存並開始分析
                </button>
              </div>
            </div>

            <!-- 非開發者／管理者：無編輯區時由此啟動分析；user_type 1／2 改用上區「儲存並開始分析」 -->
            <div
              v-if="!canEditWeaknessReportRules"
              class="d-flex justify-content-center align-items-center w-100 py-2 px-2 mb-4"
            >
              <button
                type="button"
                class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-gray-3 px-4 py-3"
                title="開始弱點分析"
                aria-label="開始弱點分析"
                :disabled="promptSectionLoading || loading || promptSaving || !authStore.user?.person_id"
                :aria-busy="loading"
                @click="fetchWeaknessAnalysisOnly"
              >
                <i class="fa-solid fa-play" aria-hidden="true" />
                開始弱點分析
              </button>
            </div>

            <div v-if="loading" class="text-center my-color-gray-4 py-5" />

            <div
              v-else-if="analysisLoadedOnce && !error && items.length === 0 && !weaknessReport"
              class="my-alert-info-soft rounded my-font-sm-400 p-3 mt-0"
            >
              尚無答題紀錄。
            </div>

            <template v-else-if="analysisLoadedOnce && !loading && (items.length > 0 || weaknessReport)">
              <div class="text-start my-page-block-spacing">
                <div class="d-flex flex-column gap-4 w-100 min-w-0">
                  <div
                    v-if="weaknessReport"
                    class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 d-flex flex-column gap-4 text-start"
                  >
                    <div class="my-font-lg-600 my-color-black mb-0">
                      學習弱點分析報告
                    </div>
                    <template v-if="weaknessReportParsed">
                      <div
                        v-for="sectionKey in weaknessReportSections"
                        :key="sectionKey"
                        class="d-flex flex-column gap-2 mb-0"
                      >
                        <div
                          class="my-weakness-report-md my-weakness-report-md--section-title my-font-md-400 text-break mb-0"
                          v-html="md(sectionKey)"
                        />
                        <ul
                          v-if="Array.isArray(weaknessReportParsed[sectionKey]) && weaknessReportParsed[sectionKey].length"
                          class="my-weakness-report-md-list my-font-md-400 lh-base ps-3 mb-0"
                        >
                          <li
                            v-for="(line, i) in weaknessReportParsed[sectionKey]"
                            :key="i"
                            class="my-weakness-report-md my-font-md-400 my-color-black text-break"
                            v-html="md(line)"
                          />
                        </ul>
                        <div
                          v-else-if="Array.isArray(weaknessReportParsed[sectionKey]) && weaknessReportParsed[sectionKey].length === 0"
                          class="my-font-md-400 my-color-gray-4 mb-0"
                        >
                          —
                        </div>
                        <div
                          v-else
                          class="my-weakness-report-md my-font-md-400 lh-base my-color-black text-break mb-0"
                          v-html="weaknessScalarToMdHtml(weaknessReportParsed[sectionKey])"
                        />
                      </div>
                    </template>
                    <div
                      v-else
                      class="my-weakness-report-md my-font-md-400 lh-base my-color-black text-break mb-0"
                      v-html="md(weaknessReport)"
                    />
                    <div
                      v-if="analysisRulesSnapshotTrimmed"
                      class="d-flex justify-content-start align-items-center w-100 pt-3"
                    >
                      <button
                        type="button"
                        class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
                        title="分析報告規則（Markdown）"
                        aria-label="分析報告規則"
                        @click="openWeaknessAnalysisRulesModal"
                      >
                        分析報告規則
                      </button>
                    </div>
                  </div>

                  <div
                    v-for="(item, idx) in items"
                    :key="item.exam_quiz_id ?? item.rag_quiz_id ?? idx"
                    class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 text-start d-flex flex-column gap-3"
                  >
                    <div class="my-font-lg-600 my-color-black mb-0">第 {{ idx + 1 }} 題</div>
                    <div class="d-flex flex-column gap-3 w-100 min-w-0">
                      <div class="d-flex flex-row flex-nowrap w-100 min-w-0 align-items-start gap-3">
                        <div class="min-w-0 flex-grow-1" style="flex-basis: 0">
                          <div class="d-flex flex-column gap-0 w-100 min-w-0">
                            <div class="my-color-gray-1 my-font-sm-400 mb-0 d-block">單元</div>
                            <div
                              class="my-font-md-400 my-color-black text-break lh-base mt-1"
                              role="status"
                              :aria-label="`單元：${item.rag_name ?? item.unit_name ?? item.exam_name ?? '—'}`"
                            >
                              {{ item.rag_name ?? item.unit_name ?? item.exam_name ?? '—' }}
                            </div>
                          </div>
                        </div>
                        <div class="min-w-0 flex-grow-1" style="flex-basis: 0">
                          <div class="d-flex flex-column gap-0 w-100 min-w-0">
                            <div class="my-color-gray-1 my-font-sm-400 mb-0 d-block">題型</div>
                            <div
                              class="my-font-md-400 my-color-black text-break lh-base mt-1"
                              role="status"
                              :aria-label="`題型：${weaknessQuizTypeLabel(item)}`"
                            >
                              {{ weaknessQuizTypeLabel(item) }}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <QuizCard
                      v-if="weaknessSlotQuizBodyTrim(idx) !== ''"
                      :card="quizCardUi[idx]"
                      :slot-index="idx + 1"
                      :current-rag-id="quizCardUi[idx]?.rag_id"
                      show-exam-rating
                      exam-rating-read-only
                      read-only-answer
                      design-ui
                      design-embedded
                      hide-slot-index
                      hide-grading-prompt
                      @toggle-hint="toggleWeaknessHint"
                    />
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
.my-weakness-report-md :deep(p) {
  margin-bottom: 0.5em;
}
.my-weakness-report-md :deep(p:last-child) {
  margin-bottom: 0;
}
.my-weakness-report-md :deep(h1),
.my-weakness-report-md :deep(h2),
.my-weakness-report-md :deep(h3),
.my-weakness-report-md :deep(h4),
.my-weakness-report-md :deep(h5),
.my-weakness-report-md :deep(h6) {
  color: var(--my-color-black);
  font-size: var(--my-font-size-md);
  font-weight: var(--my-font-weight-semibold);
  margin-bottom: 0.35em;
  margin-top: 0.5em;
}
.my-weakness-report-md :deep(h1:first-child),
.my-weakness-report-md :deep(h2:first-child),
.my-weakness-report-md :deep(h3:first-child) {
  margin-top: 0;
}
.my-weakness-report-md--section-title :deep(p),
.my-weakness-report-md--section-title :deep(h1),
.my-weakness-report-md--section-title :deep(h2),
.my-weakness-report-md--section-title :deep(h3),
.my-weakness-report-md--section-title :deep(h4),
.my-weakness-report-md--section-title :deep(h5),
.my-weakness-report-md--section-title :deep(h6),
.my-weakness-report-md--section-title :deep(li),
.my-weakness-report-md--section-title :deep(strong),
.my-weakness-report-md--section-title :deep(em) {
  color: var(--my-color-gray-1);
}
.my-weakness-report-md :deep(ul),
.my-weakness-report-md :deep(ol) {
  margin-bottom: 0.5em;
  padding-left: 1.25rem;
}
.my-weakness-report-md :deep(li) {
  margin-bottom: 0.15em;
}
.my-weakness-report-md :deep(a) {
  color: var(--my-color-blue);
}
.my-weakness-report-md :deep(code) {
  font-size: 0.92em;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background-color: color-mix(in srgb, var(--my-color-black) 6%, var(--my-color-white));
}
.my-weakness-report-md :deep(pre) {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background-color: var(--my-color-gray-3);
  overflow-x: auto;
  margin-bottom: 0.5em;
}
.my-weakness-report-md :deep(pre code) {
  padding: 0;
  background: none;
}
.my-weakness-report-md :deep(blockquote) {
  margin: 0 0 0.5em;
  padding-left: 0.75rem;
  border-left: 3px solid var(--my-color-gray-2);
  color: var(--my-color-gray-1);
}
.my-weakness-report-md :deep(table) {
  width: 100%;
  margin-bottom: 0.5em;
  border-collapse: collapse;
  font-size: inherit;
}
.my-weakness-report-md :deep(th),
.my-weakness-report-md :deep(td) {
  border: 1px solid var(--my-color-gray-2);
  padding: 0.35rem 0.5rem;
  text-align: start;
}
.my-weakness-report-md :deep(hr) {
  margin: 0.75em 0;
  border: 0;
  border-top: 1px solid var(--my-color-gray-2);
}
.my-weakness-report-md-list > li :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
