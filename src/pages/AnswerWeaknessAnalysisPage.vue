<script setup>
/**
 * AnswerWeaknessAnalysisPage - 作答弱點分析頁面
 *
 * 讀取 GET /person-analysis/quizzes/{person_id}；列表與 GET /exam/tabs、GET /rag/tabs 每筆一致（含 units→quizzes；頂層 answers 或題列內嵌 answer_*；mergeQuizzesWithTopLevelAnswers 合併）。
 * 另含 count、weakness_report；可顯示弱點報告。題目區（QuizCard）純顯示，無開始批改。
 */
import { ref, computed, watch, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_QUIZZES_BY_PERSON } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import QuizCard from '../components/QuizCard.vue';
import {
  normalizeAnalysisQuizzesListResponse,
  mergeQuizzesWithTopLevelAnswers,
  quizAnswerPresetFromReference,
} from '../utils/rag.js';
import { formatGradingResult } from '../utils/grading.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js';

const authStore = useAuthStore();

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

async function fetchQuizAnswers() {
  loading.value = true;
  error.value = '';
  const personId = authStore.user?.person_id;
  if (!personId) {
    error.value = '請先登入以查看作答弱點分析';
    loading.value = false;
    return;
  }
  try {
    const url = `${API_BASE}${API_QUIZZES_BY_PERSON}/${encodeURIComponent(personId)}`;
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
    weaknessReport.value = (data?.weakness_report != null && String(data.weakness_report).trim() !== '') ? String(data.weakness_report).trim() : '';
  } catch (err) {
    error.value = err.message || '無法載入作答弱點分析';
    items.value = [];
    count.value = 0;
    weaknessReport.value = '';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchQuizAnswers();
});
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="載入作答與弱點分析中..."
    />
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
            <div v-if="loading" class="text-center my-color-gray-4 py-5" />
            <div v-else-if="items.length === 0" class="my-alert-info-soft rounded my-font-sm-400 p-3 mt-0">尚無答題紀錄。</div>

            <template v-else>
              <div class="text-start my-page-block-spacing">
                <div class="d-flex flex-column gap-4 w-100 min-w-0">
                  <div
                    v-if="weaknessReport"
                    class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 d-flex flex-column gap-4 text-start"
                  >
                    <div class="my-font-lg-600 my-color-black mb-0">學習弱點分析報告</div>
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
