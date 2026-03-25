<script setup>
/**
 * CourseAnalysisPage - 學生測驗分析頁面
 *
 * 讀取 GET /course-analysis/quizzes，回傳 { exams, count, weakness_report: null }，每筆 exam 含 quizzes、answers。
 * 版面與測驗分析一致：作答紀錄摘要、批改結果、匯出 Excel；無 weakness_report 時不顯示弱點區塊。
 */
import { ref, onMounted } from 'vue';
import { API_BASE, API_COURSE_ANALYSIS_QUIZZES } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import { downloadSummaryExcel } from '../utils/exportExcel.js';
import { normalizeQuizLevelLabel, examQuizLevelFromRow } from '../utils/rag.js';
import { formatGradingResult, formatQuizGradeDisplay } from '../utils/grading.js';
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

/** 每題作答紀錄取第一筆（學生測驗分析可能多筆，顯示第一筆於摘要與卡片） */
function getSingleAnswer(item) {
  const list = item?.answers;
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
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
    if (!res.ok) throw new Error(res.statusText || '無法載入課程答題資料');
    const data = await res.json();
    const exams = data?.exams ?? [];
    items.value = exams.flatMap((exam) =>
      (exam.quizzes ?? []).map((q) => ({ ...q, exam_name: exam.exam_name ?? exam.exam_tab_id ?? '' }))
    );
  } catch (err) {
    error.value = err.message || '無法載入學生測驗分析';
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
    formatQuizGradeDisplay(getSingleAnswer(item)?.quiz_grade ?? getSingleAnswer(item)?.answer_grade),
    getSingleAnswer(item)?.created_at ?? '—'
  ]);
}

async function onDownloadExcel() {
  const headers = ['題號', 'person_id', '單元', '難度', '分數', '時間'];
  await downloadSummaryExcel(headers, getSummaryRows(), '學生測驗分析-作答紀錄摘要.xlsx');
}

onMounted(() => {
  fetchQuizAnswers();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="執行中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand mb-0">學生測驗分析</span>
      </div>
    </div>
    <div v-if="error" class="alert alert-warning py-2 small mx-4 mb-3">
      {{ error }}
    </div>

    <!-- 內容區：不顯示 weakness_report（學生測驗分析固定為 null） -->
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <div v-if="loading" class="text-center py-5 text-muted" />
      <div v-else-if="items.length === 0" class="alert alert-info mt-0">尚無答題紀錄。</div>

      <template v-else>
        <!-- 作答紀錄摘要表：題號 / 單元 / 難度 / 分數 / 時間（每題取第一筆作答） -->
        <div class="text-start page-block-spacing">
          <div class="fs-5 fw-semibold mb-4 pb-2 border-bottom">作答紀錄摘要</div>
          <div class="table-responsive">
            <table class="table table-bordered table-sm mb-0 small">
              <thead class="table-light">
                <tr>
                  <th class="fw-medium">題號</th>
                  <th class="fw-medium">person_id</th>
                  <th class="fw-medium">單元</th>
                  <th class="fw-medium">難度</th>
                  <th class="fw-medium">分數</th>
                  <th class="fw-medium">時間</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in items" :key="item.exam_quiz_id ?? idx">
                  <td>{{ idx + 1 }}</td>
                  <td>{{ item.person_id ?? '—' }}</td>
                  <td>{{ item.rag_name ?? item.exam_name ?? '—' }}</td>
                  <td>{{ getDifficultyLabel(examQuizLevelFromRow(item) ?? item.quiz_level) }}</td>
                  <td>{{ formatQuizGradeDisplay(getSingleAnswer(item)?.quiz_grade ?? getSingleAnswer(item)?.answer_grade) }}</td>
                  <td>{{ getSingleAnswer(item)?.created_at ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-3 d-flex justify-content-end">
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              @click="onDownloadExcel"
            >
              下載 Excel
            </button>
          </div>
        </div>

        <!-- 題目與答案詳情（樣式與測驗分析一致） -->
        <div
          v-for="(item, idx) in items"
          :key="item.exam_quiz_id ?? idx"
          class="card mb-4"
        >
          <div class="card-header py-2">
            <span class="fs-6 fw-semibold mb-0">第 {{ idx + 1 }} 題</span>
          </div>
          <div class="card-body text-start">
            <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
              <div>
                <label class="form-label small text-secondary fw-medium mb-1">person_id</label>
                <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ item.person_id ?? '—' }}</div>
              </div>
              <div>
                <label class="form-label small text-secondary fw-medium mb-1">單元</label>
                <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ item.rag_name ?? item.exam_name ?? '—' }}</div>
              </div>
              <div>
                <label class="form-label small text-secondary fw-medium mb-1">難度</label>
                <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ getDifficultyLabel(examQuizLevelFromRow(item) ?? item.quiz_level) }}</div>
              </div>
            </div>
            <div class="mb-3">
              <div class="form-label small text-secondary fw-medium mb-1">題目</div>
              <div class="bg-body-secondary border rounded p-2 lh-base">
                {{ item.quiz_content ?? '—' }}
              </div>
            </div>
            <div v-if="item.quiz_hint" class="mb-3">
              <div class="form-label small text-secondary fw-medium mb-1">提示</div>
              <div class="rounded bg-body-tertiary small mt-2 p-2 text-secondary">
                {{ item.quiz_hint }}
              </div>
            </div>
            <div v-if="item.quiz_answer_reference || item.quiz_reference_answer" class="mb-3">
              <div class="form-label small text-secondary fw-medium mb-1">參考答案(暫存)</div>
              <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ item.quiz_answer_reference ?? item.quiz_reference_answer }}</div>
            </div>
            <template v-if="getSingleAnswer(item)">
              <div class="mb-3">
                <label class="form-label small text-secondary fw-medium mb-1">回答</label>
                <div class="rounded bg-body-tertiary small mb-2 p-2">{{ getSingleAnswer(item).quiz_answer ?? getSingleAnswer(item).student_answer ?? '—' }}</div>
              </div>
              <div class="border rounded bg-light p-3 mb-3">
                <div class="form-label small fw-semibold text-secondary mb-1">批改結果</div>
                <div class="small" style="white-space: pre-wrap;">{{ getGradingResultText(getSingleAnswer(item)) }}</div>
              </div>
            </template>
            <template v-else>
              <div class="text-muted small">尚無作答</div>
            </template>
          </div>
        </div>
      </template>
        </div>
      </div>
    </div>
  </div>
</template>
