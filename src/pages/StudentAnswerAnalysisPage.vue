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
</script>

<template>
  <div class="d-flex flex-column my-bgcolor-gray-4 h-100 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="載入作答資料中..."
    />
    <div class="navbar navbar-expand-lg my-bgcolor-surface flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand my-font-xl-400 mb-0">學生作答分析</span>
      </div>
    </div>
    <div v-if="error" class="my-alert-warning-soft rounded my-font-sm-400 py-2 mx-4 mb-3">
      {{ error }}
    </div>

    <!-- 內容區：不顯示 weakness_report（學生作答分析固定為 null） -->
    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <div v-if="loading" class="text-center my-color-gray-4 py-5" />
      <div v-else-if="items.length === 0" class="my-alert-info-soft rounded my-font-sm-400 p-3 mt-0">尚無答題紀錄。</div>

      <template v-else>
        <!-- 作答紀錄摘要表：題號 / 單元 / 難度 / 分數 / 時間（每題取最新一筆作答） -->
        <div class="text-start my-page-block-spacing">
          <div class="my-bgcolor-page-block rounded-3 p-3 p-lg-4 mb-4">
          <div class="my-font-lg-600 my-color-black mb-4">作答紀錄摘要</div>
          <div class="table-responsive">
            <table class="table table-bordered table-sm my-font-sm-400 mb-0">
              <thead class="my-table-thead">
                <tr>
                  <th class="fw-medium">題號</th>
                  <th class="fw-medium">使用者 ID</th>
                  <th class="fw-medium">單元</th>
                  <th class="fw-medium">難度</th>
                  <th class="fw-medium">分數</th>
                  <th class="fw-medium">時間</th>
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
          <div class="d-flex justify-content-end mt-3">
            <button
              type="button"
              class="btn my-btn-outline-blue-hollow"
              @click="onDownloadExcel"
            >
              下載 Excel
            </button>
          </div>
          </div>
        </div>

        <!-- 題目與答案詳情（樣式與作答弱點分析一致） -->
        <div
          v-for="(item, idx) in items"
          :key="item.exam_quiz_id ?? item.rag_quiz_id ?? idx"
          class="my-bgcolor-page-block rounded-3 p-3 p-lg-4 mb-4"
        >
          <div class="my-font-lg-600 my-color-black mb-3">第 {{ idx + 1 }} 題</div>
          <div class="text-start">
            <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
              <div>
                <label class="form-label my-font-sm-600 my-color-gray-1 mb-0">使用者 ID</label>
                <div class="form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 px-3 py-2" style="min-height: 31px;">{{ item.person_id ?? '—' }}</div>
              </div>
              <div>
                <label class="form-label my-font-sm-600 my-color-gray-1 mb-0">單元</label>
                <div class="form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 px-3 py-2" style="min-height: 31px;">{{ item.rag_name ?? item.exam_name ?? '—' }}</div>
              </div>
              <div>
                <label class="form-label my-font-sm-600 my-color-gray-1 mb-0">難度</label>
                <div class="form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 px-3 py-2" style="min-height: 31px;">{{ getDifficultyLabel(examQuizLevelFromRow(item) ?? item.quiz_level) }}</div>
              </div>
            </div>
            <div class="mb-3">
              <div class="form-label my-font-sm-600 my-color-gray-1 mb-0">題目</div>
              <div class="my-bgcolor-light-gray my-border-gray-2 rounded lh-base p-2">
                {{ item.quiz_content ?? '—' }}
              </div>
            </div>
            <div v-if="item.quiz_hint" class="mb-3">
              <div class="form-label my-font-sm-600 my-color-gray-1 mb-0">提示</div>
              <div class="rounded my-bgcolor-gray-3 my-font-sm-400 my-color-gray-4 p-2 mt-2">
                {{ item.quiz_hint }}
              </div>
            </div>
            <div v-if="item.quiz_answer_reference || item.quiz_reference_answer" class="mb-3">
              <div class="form-label my-font-sm-600 my-color-gray-1 mb-0">參考答案(暫存)</div>
              <div class="rounded my-bgcolor-gray-3 my-border-gray-2 my-font-sm-400 p-2" style="white-space: pre-wrap;">{{ item.quiz_answer_reference ?? item.quiz_reference_answer }}</div>
            </div>
            <template v-if="getSingleAnswer(item)">
              <div class="mb-3">
                <label class="form-label my-font-sm-600 my-color-gray-1 mb-0">答案</label>
                <div class="rounded my-bgcolor-gray-3 my-font-sm-400 p-2 mb-2">{{ getSingleAnswer(item).quiz_answer ?? getSingleAnswer(item).student_answer ?? '—' }}</div>
              </div>
              <div class="mb-3">
                <div class="form-label my-font-sm-600 my-color-gray-1 mb-0">批改結果</div>
                <div class="rounded my-bgcolor-gray-3 my-border-gray-2 my-font-sm-400 p-2" style="white-space: pre-wrap;">{{ getGradingResultText(getSingleAnswer(item)) }}</div>
              </div>
            </template>
            <template v-else>
              <div class="my-color-gray-4 my-font-sm-400">尚無作答</div>
            </template>
          </div>
        </div>
      </template>
        </div>
      </div>
    </div>
  </div>
</template>
