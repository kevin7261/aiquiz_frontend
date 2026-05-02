<script setup>
/**
 * StudentAnswerAnalysisPage - 學生作答分析頁面
 *
 * 讀取 GET /course-analysis/quizzes；列表格式與 GET /exam/tabs、GET /rag/tabs 每筆一致（mergeQuizzesWithTopLevelAnswers）。
 * 題目區與測驗頁（QuizCard）版面一致、純顯示；另顯示使用者 ID。
 */
import { ref, watch, onMounted } from 'vue';
import { API_BASE, API_COURSE_ANALYSIS_QUIZZES } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import QuizCard from '../components/QuizCard.vue';
import {
  normalizeAnalysisQuizzesListResponse,
  mergeQuizzesWithTopLevelAnswers,
  quizAnswerPresetFromReference,
} from '../utils/rag.js';
import { formatGradingResult } from '../utils/grading.js';
import { loggedFetch } from '../utils/loggedFetch.js';

const items = ref([]);
/** 與 items 同序；供 QuizCard（與測驗頁同一題目區 UI） */
const quizCardUi = ref([]);
const loading = ref(false);
const error = ref('');

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

function studentQuizTypeLabel(quiz) {
  const s = examQuizDisplayNameFromRow(quiz);
  return s || '—';
}

/**
 * 與 ExamPage buildCardFromExamQuiz 相同欄位，供 QuizCard 與測驗頁同一套題目區 UI。
 * @param {object} item
 * @param {number} index
 */
function studentItemToQuizCard(item, index) {
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
    id: `student-analysis-card-${quizId ?? item?.rag_quiz_id ?? index}-${index}`,
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

function toggleStudentHint(card) {
  if (!card || typeof card !== 'object') return;
  card.hintVisible = !card.hintVisible;
}

watch(
  items,
  (list) => {
    quizCardUi.value = list.map((it, i) => studentItemToQuizCard(it, i));
  },
  { immediate: true },
);

function studentSlotQuizBodyTrim(idx) {
  const c = quizCardUi.value[idx];
  return String(c?.quiz ?? '').trim();
}

async function fetchQuizAnswers() {
  loading.value = true;
  error.value = '';
  try {
    const url = `${API_BASE}${API_COURSE_ANALYSIS_QUIZZES}`;
    const res = await loggedFetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(res.statusText || '無法載入作答資料');
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
  } catch (err) {
    error.value = err.message || '無法載入學生作答分析';
    items.value = [];
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
      loading-text="載入作答資料中..."
    />
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">學生作答分析</p>
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
                    v-for="(item, idx) in items"
                    :key="`${item.exam_quiz_id ?? item.rag_quiz_id ?? idx}-${item.person_id ?? ''}`"
                    class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 text-start d-flex flex-column gap-3"
                  >
                    <div class="my-font-lg-600 my-color-black mb-0">第 {{ idx + 1 }} 題</div>
                    <div class="d-flex flex-column gap-3 w-100 min-w-0">
                      <div class="w-100 min-w-0">
                        <div class="my-color-gray-1 my-font-sm-400 mb-0 d-block">使用者 ID</div>
                        <div
                          class="my-font-md-400 my-color-black text-break lh-base mt-1"
                          role="status"
                          :aria-label="`使用者 ID：${item.person_id ?? '—'}`"
                        >
                          {{ item.person_id ?? '—' }}
                        </div>
                      </div>
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
                              :aria-label="`題型：${studentQuizTypeLabel(item)}`"
                            >
                              {{ studentQuizTypeLabel(item) }}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <QuizCard
                      v-if="studentSlotQuizBodyTrim(idx) !== ''"
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
                      @toggle-hint="toggleStudentHint"
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
