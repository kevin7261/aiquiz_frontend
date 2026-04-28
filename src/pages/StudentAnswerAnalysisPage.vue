<script setup>
/**
 * StudentAnswerAnalysisPage - 學生作答分析頁面
 *
 * 讀取 GET /course-analysis/quizzes；列表格式與 GET /exam/tabs、GET /rag/tabs 每筆一致（頂層 answers 與 quizzes 合併）；weakness_report 固定 null。
 * 版面與作答弱點分析一致：摘要、批改結果、匯出 Excel。
 */
import { ref, onMounted } from 'vue';
import { API_BASE, API_COURSE_ANALYSIS_QUIZZES } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import { downloadSummaryExcel } from '../utils/exportExcel.js';
import {
  normalizeQuizLevelLabel,
  examQuizLevelFromRow,
  normalizeAnalysisQuizzesListResponse,
  mergeQuizzesWithTopLevelAnswers,
  QUIZ_LEVEL_LABELS,
} from '../utils/rag.js';
import { formatGradingResult, formatQuizGradeDisplay, getAnswerScoreValue } from '../utils/grading.js';
import { loggedFetch } from '../utils/loggedFetch.js';

const items = ref([]);
const loading = ref(false);
const error = ref('');

/** 難度顯示：API 字串「基礎」「進階」或舊版 0／1 */
function getDifficultyLabel(quizLevel) {
  const label = normalizeQuizLevelLabel(quizLevel);
  if (label) return label;
  return quizLevel != null && String(quizLevel).trim() !== '' ? String(quizLevel) : '—';
}

/** 每題可能多筆作答，與測驗頁一致取最後一筆 */
function getSingleAnswer(item) {
  const list = item?.answers;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[list.length - 1];
}

/** 從單筆 answer 取得批改結果文字（與測驗頁顯示一致） */
function getGradingResultText(ans) {
  if (!ans) return '尚未批改';
  let data = ans.answer_metadata;
  if (!data && ans.answer_feedback_metadata != null) {
    const fm = ans.answer_feedback_metadata;
    data = typeof fm === 'string' ? (() => { try { return JSON.parse(fm); } catch { return null; } })() : fm;
  }
  const str = data != null ? JSON.stringify(data) : (typeof ans.answer_feedback_metadata === 'string' ? ans.answer_feedback_metadata : '');
  return formatGradingResult(str || '') || '尚未批改';
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
    items.value = exams.flatMap((exam) => {
      const quizzes = mergeQuizzesWithTopLevelAnswers(exam);
      const examLabel = exam.tab_name ?? exam.exam_name ?? exam.exam_tab_id ?? '';
      return quizzes.map((q) => ({ ...q, exam_name: examLabel }));
    });
  } catch (err) {
    error.value = err.message || '無法載入學生作答分析';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function getSummaryRows() {
  return items.value.map((item, idx) => [
    idx + 1,
    item.person_id ?? '—',
    item.rag_name ?? item.exam_name ?? '—',
    getDifficultyLabel(examQuizLevelFromRow(item) ?? item.quiz_level),
    formatQuizGradeDisplay(getAnswerScoreValue(getSingleAnswer(item))),
    getSingleAnswer(item)?.created_at ?? '—'
  ]);
}

async function onDownloadExcel() {
  const headers = ['題號', '使用者 ID', '單元', '難度', '分數', '時間'];
  await downloadSummaryExcel(headers, getSummaryRows(), '學生作答分析-作答紀錄摘要.xlsx');
}

onMounted(() => {
  fetchQuizAnswers();
});

const difficultyOptions = QUIZ_LEVEL_LABELS;

function isDifficultyPillActiveForItem(item, opt) {
  const label = normalizeQuizLevelLabel(examQuizLevelFromRow(item) ?? item.quiz_level);
  return label != null && label === opt;
}
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
                  <div class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0">
                    <div class="my-font-lg-600 my-color-black mb-4">作答紀錄摘要</div>
                    <div class="table-responsive">
                      <table class="table table-bordered table-sm my-font-md-400 mb-0">
                        <thead class="my-table-thead">
                          <tr>
                            <th class="my-font-md-600">題號</th>
                            <th class="my-font-md-600">使用者 ID</th>
                            <th class="my-font-md-600">單元</th>
                            <th class="my-font-md-600">難度</th>
                            <th class="my-font-md-600">分數</th>
                            <th class="my-font-md-600">時間</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(item, idx) in items" :key="item.exam_quiz_id ?? item.rag_quiz_id ?? idx">
                            <td>{{ idx + 1 }}</td>
                            <td>{{ item.person_id ?? '—' }}</td>
                            <td>{{ item.rag_name ?? item.exam_name ?? '—' }}</td>
                            <td>{{ getDifficultyLabel(examQuizLevelFromRow(item) ?? item.quiz_level) }}</td>
                            <td>{{ formatQuizGradeDisplay(getAnswerScoreValue(getSingleAnswer(item))) }}</td>
                            <td>{{ getSingleAnswer(item)?.created_at ?? '—' }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div class="d-flex justify-content-center mt-3">
                      <button
                        type="button"
                        class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                        @click="onDownloadExcel"
                      >
                        下載 Excel
                      </button>
                    </div>
                  </div>

                  <div
                    v-for="(item, idx) in items"
                    :key="item.exam_quiz_id ?? item.rag_quiz_id ?? idx"
                    class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0 d-flex flex-column gap-4"
                  >
                    <div class="text-start w-100 min-w-0 d-flex flex-column gap-4">
                      <div class="my-font-lg-600 my-color-black mb-0">第 {{ idx + 1 }} 題</div>
                      <div class="d-flex flex-row align-items-end gap-3 w-100 min-w-0 flex-wrap">
                        <div class="d-flex flex-column flex-shrink-0 gap-1" style="min-width: 7rem">
                          <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">使用者 ID</div>
                          <div
                            class="d-flex justify-content-between align-items-center my-font-md-400 my-color-black w-100 min-w-0 px-3 py-2 rounded-2 my-bgcolor-white my-border-gray-2"
                            role="presentation"
                          >
                            <span class="text-truncate text-start pe-2">{{ item.person_id ?? '—' }}</span>
                            <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0 opacity-50" aria-hidden="true" />
                          </div>
                        </div>
                        <div class="d-flex flex-column min-w-0 flex-grow-1 gap-1" style="min-width: 8rem">
                          <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">單元</div>
                          <div
                            class="d-flex justify-content-between align-items-center my-font-md-400 my-color-black w-100 min-w-0 px-3 py-2 rounded-2 my-bgcolor-white my-border-gray-2"
                            role="presentation"
                          >
                            <span class="text-truncate text-start pe-2">{{ item.rag_name ?? item.exam_name ?? '—' }}</span>
                            <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0 opacity-50" aria-hidden="true" />
                          </div>
                        </div>
                        <div class="d-flex flex-column flex-shrink-0 gap-1">
                          <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">難度</div>
                          <div
                            class="btn-group my-btn-group-pill flex-shrink-0 pe-none"
                            role="group"
                            aria-label="難度（唯讀）"
                          >
                            <button
                              v-for="opt in difficultyOptions"
                              :key="'student-diff-' + idx + '-' + opt"
                              type="button"
                              class="btn d-flex justify-content-center align-items-center my-font-md-400 px-3 py-2"
                              :class="isDifficultyPillActiveForItem(item, opt) ? 'my-button-white' : 'my-button-gray-3'"
                              tabindex="-1"
                            >
                              {{ opt }}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="w-100 min-w-0 d-flex flex-column gap-1 mb-0">
                        <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">題目</div>
                        <div class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 lh-base">
                          {{ item.quiz_content ?? '—' }}
                        </div>
                      </div>
                      <div v-if="item.quiz_hint" class="w-100 min-w-0 d-flex flex-column gap-1 mb-0">
                        <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">提示</div>
                        <div class="my-font-sm-400 form-control my-input-md my-input-md--on-dark my-bgcolor-light-gray rounded-2 w-100 min-w-0 px-3 py-2 my-color-gray-4">
                          {{ item.quiz_hint }}
                        </div>
                      </div>
                      <div
                        v-if="item.quiz_answer_reference || item.quiz_reference_answer"
                        class="w-100 min-w-0 d-flex flex-column gap-1 mb-0"
                      >
                        <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">參考答案(暫存)</div>
                        <div
                          class="my-font-sm-400 form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                          style="white-space: pre-wrap;"
                        >{{ item.quiz_answer_reference ?? item.quiz_reference_answer }}</div>
                      </div>
                      <template v-if="getSingleAnswer(item)">
                        <div class="w-100 min-w-0 d-flex flex-column gap-1 mb-0">
                          <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">答案</div>
                          <div class="my-font-sm-400 form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2 mb-0">
                            {{ getSingleAnswer(item).quiz_answer ?? getSingleAnswer(item).student_answer ?? '—' }}
                          </div>
                        </div>
                        <div class="w-100 min-w-0 d-flex flex-column gap-1 mb-0">
                          <div class="my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0">批改結果</div>
                          <div
                            class="my-font-sm-400 form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
                            style="white-space: pre-wrap;"
                          >{{ getGradingResultText(getSingleAnswer(item)) }}</div>
                        </div>
                      </template>
                      <template v-else>
                        <div class="my-color-gray-4 my-font-sm-400 mb-0">尚無作答</div>
                      </template>
                    </div>
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
