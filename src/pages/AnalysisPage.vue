<script setup>
/** 分析頁面：讀取 GET /analysis/quizzes-by-person/{person_id}，顯示 Exam_Quiz 與關聯的 Exam_Answer 列表。樣式與測驗、建立 RAG 一致。 */
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_QUIZZES_BY_PERSON } from '../constants/api.js';

const authStore = useAuthStore();

const items = ref([]);
const count = ref(0);
const loading = ref(false);
const error = ref('');

function parseFeedbackMeta(str) {
  if (str == null || str === '') return null;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

async function fetchQuizAnswers() {
  loading.value = true;
  error.value = '';
  const personId = authStore.user?.person_id;
  if (!personId) {
    error.value = '請先登入以查看分析';
    loading.value = false;
    return;
  }
  try {
    const url = `${API_BASE}${API_QUIZZES_BY_PERSON}/${encodeURIComponent(personId)}`;
    const headers = { 'X-Person-Id': String(personId) };
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(res.statusText || '無法載入答題資料');
    const data = await res.json();
    console.log('/analysis/quizzes-by-person 回傳', data);
    items.value = data?.quizzes ?? [];
    count.value = data?.count ?? items.value.length;
  } catch (err) {
    error.value = err.message || '無法載入分析';
    items.value = [];
    count.value = 0;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchQuizAnswers();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100">
    <!-- 固定頂列：標題與錯誤（與測驗、建立 RAG 一致） -->
    <div class="flex-shrink-0 bg-white border-bottom">
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2">
        <span class="fs-5 fw-semibold">分析</span>
        <span v-if="loading" class="small text-secondary">載入中...</span>
      </div>
      <div v-if="error" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ error }}
      </div>
    </div>

    <!-- 內容區：可上下捲動 -->
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <div v-if="loading" class="text-center py-5 text-muted">載入中...</div>
      <div v-else-if="items.length === 0" class="alert alert-info mt-0">尚無答題紀錄。</div>

      <template v-else>
        <div class="bg-body-tertiary rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">分析</div>
          <div class="small text-secondary">共 {{ count }} 筆試題</div>
        </div>

        <div
          v-for="(item, idx) in items"
          :key="item.exam_quiz_id ?? idx"
          class="bg-body-tertiary rounded text-start p-4 mb-3"
        >
          <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
            <span class="fw-semibold">exam_id: {{ item.exam_id ?? '—' }}</span>
            <span class="badge bg-secondary">exam_quiz_id: {{ item.exam_quiz_id }}</span>
          </div>
          <div class="mb-2">
            <span class="form-label small text-secondary fw-medium mb-1">題目</span>
            <div class="small">{{ item.quiz_content ?? '—' }}</div>
          </div>
          <div v-if="item.quiz_hint" class="mb-2">
            <span class="form-label small text-secondary fw-medium mb-1">提示</span>
            <div class="small">{{ item.quiz_hint }}</div>
          </div>
          <div v-if="item.reference_answer" class="mb-3">
            <span class="form-label small text-secondary fw-medium mb-1">參考答案</span>
            <div class="small">{{ item.reference_answer }}</div>
          </div>

          <div class="border-top pt-3 mt-2">
            <div class="small fw-semibold text-secondary mb-2">作答紀錄（{{ (item.answers || []).length }} 筆）</div>
            <div
              v-for="(ans, aIdx) in (item.answers || [])"
              :key="ans.exam_answer_id ?? aIdx"
              class="border rounded p-3 mb-2 bg-white"
            >
              <div class="d-flex justify-content-between align-items-start small mb-1">
                <span class="text-muted">{{ ans.created_at }}</span>
                <span v-if="ans.answer_grade != null" class="badge bg-primary">分數 {{ ans.answer_grade }}</span>
              </div>
              <div class="mb-1"><strong>學生答案：</strong>{{ ans.student_answer ?? '—' }}</div>
              <div v-if="ans.answer_feedback_metadata" class="small text-muted mt-1">
                <strong>回饋：</strong>
                <span>{{ typeof ans.answer_feedback_metadata === 'string' ? ans.answer_feedback_metadata : JSON.stringify(parseFeedbackMeta(ans.answer_feedback_metadata)) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
