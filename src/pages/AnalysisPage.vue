<script setup>
/** 分析頁面：讀取 GET /analysis/quizzes-by-person/{person_id}，顯示 Exam_Quiz 與關聯的 Exam_Answer 列表。query 可帶 language（en/zh）、llm_api_key；有 llm_api_key 時回傳 weakness_report（AI 弱點分析報告）。 */
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_QUIZZES_BY_PERSON } from '../constants/api.js';

const authStore = useAuthStore();

const items = ref([]);
const count = ref(0);
const weaknessReport = ref('');
const loading = ref(false);
const error = ref('');

/** 與測驗頁相同：將 answer_metadata / answer_feedback_metadata 轉成易讀的批改結果文字 */
function formatGradingResult(text) {
  if (!text || typeof text !== 'string') return text;
  const t = text.trim();
  if (!t.startsWith('{')) return text;
  try {
    const raw = JSON.parse(text);
    let data = raw;
    if (raw.answer_metadata && typeof raw.answer_metadata === 'object') {
      data = raw.answer_metadata;
    } else if (raw.answer_feedback_metadata) {
      const parsed =
        typeof raw.answer_feedback_metadata === 'string'
          ? (() => {
              try {
                return JSON.parse(raw.answer_feedback_metadata);
              } catch {
                return null;
              }
            })()
          : raw.answer_feedback_metadata;
      if (parsed) data = parsed;
    }
    const lines = [];
    if (data.score != null) lines.push(`總分：${data.score} / 10`);
    if (data.level) lines.push(`等級：${data.level}`);
    if (lines.length) lines.push('');
    const rubric = data.rubric;
    if (Array.isArray(rubric) && rubric.length > 0) {
      lines.push('【評分項目】');
      rubric.forEach((r) => {
        const criteria = r.criteria ?? '';
        const score = r.score != null ? ` (${r.score}分)` : '';
        const comment = r.comment ? `\n  ${r.comment}` : '';
        lines.push(`• ${criteria}${score}${comment}`);
      });
      lines.push('');
    }
    const section = (title, arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return;
      lines.push(`【${title}】`);
      arr.forEach((s) => lines.push(`• ${s}`));
      lines.push('');
    };
    section('優點', data.strengths);
    section('待改進', data.weaknesses);
    section('遺漏項目', data.missing_items);
    section('建議後續', data.action_items);
    return lines.join('\n').trim() || text;
  } catch (_) {
    return text;
  }
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
  const personId = authStore.user?.person_id;
  if (!personId) {
    error.value = '請先登入以查看分析';
    loading.value = false;
    return;
  }
  try {
    const params = new URLSearchParams();
    params.set('language', 'zh');
    const llmKey = (authStore.user?.llm_api_key ?? '').trim();
    if (llmKey) params.set('llm_api_key', llmKey);
    const query = params.toString();
    const url = `${API_BASE}${API_QUIZZES_BY_PERSON}/${encodeURIComponent(personId)}${query ? `?${query}` : ''}`;
    const headers = { 'X-Person-Id': String(personId) };
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(res.statusText || '無法載入答題資料');
    const data = await res.json();
    console.log('/analysis/quizzes-by-person 回傳', data);
    items.value = data?.quizzes ?? [];
    count.value = data?.count ?? items.value.length;
    weaknessReport.value = (data?.weakness_report != null && String(data.weakness_report).trim() !== '') ? String(data.weakness_report).trim() : '';
  } catch (err) {
    error.value = err.message || '無法載入分析';
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
  <div class="d-flex flex-column bg-body-secondary h-100">
    <!-- 固定頂列：標題與錯誤（分析無 tab，僅一頁） -->
    <div class="flex-shrink-0 bg-white border-bottom">
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2">
        <span class="fs-5 fw-semibold">分析</span>
        <span v-if="loading" class="small text-secondary">載入中...</span>
      </div>
      <div v-if="error" class="alert alert-warning py-2 small mx-4 mb-3">
        {{ error }}
      </div>
    </div>

    <!-- 內容區：可上下捲動；基本資訊區塊樣式與建立 RAG、測驗一致 -->
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <!-- 基本資訊（與建立 RAG、測驗頁同一 style） -->
      <div class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">基本資訊</div>
        <div class="small mb-2">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="text-secondary" style="min-width: 10rem;">llm_api_key：</span>
            <code>{{ (authStore.user?.llm_api_key ?? '').trim() || '—' }}</code>
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center py-5 text-muted">載入中...</div>
      <div v-else-if="items.length === 0" class="alert alert-info mt-0">尚無答題紀錄。</div>

      <template v-else>
        <div class="bg-body-tertiary rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">分析</div>
          <div class="small text-secondary">共 {{ count }} 筆試題</div>
        </div>

        <div v-if="weaknessReport" class="bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded text-start p-4 mb-3">
          <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">學習弱點分析報告</div>
          <div class="small lh-base" style="white-space: pre-wrap;">{{ weaknessReport }}</div>
        </div>

        <div
          v-for="(item, idx) in items"
          :key="item.exam_quiz_id ?? idx"
          class="card mb-3"
        >
          <div class="card-header py-2 d-flex justify-content-between align-items-center">
            <span class="fs-6 fw-semibold mb-0">第 {{ idx + 1 }} 題</span>
            <span class="badge bg-secondary">exam_quiz_id: {{ item.exam_quiz_id }}</span>
          </div>
          <div class="card-body text-start">
            <div class="mb-3">
              <div class="form-label small text-secondary fw-medium mb-1">題目</div>
              <div class="bg-body-secondary border rounded p-2 lh-base">
                {{ item.quiz_content ?? '—' }}
              </div>
            </div>
            <div v-if="item.quiz_hint" class="mb-3">
              <div class="form-label small text-secondary fw-medium mb-1">提示</div>
              <div class="rounded bg-body-tertiary small p-2 text-secondary">
                {{ item.quiz_hint }}
              </div>
            </div>
            <div v-if="item.reference_answer" class="mb-3">
              <div class="form-label small text-secondary fw-medium mb-1">參考答案</div>
              <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ item.reference_answer }}</div>
            </div>

            <div class="small fw-semibold text-secondary mb-2">作答紀錄（{{ (item.answers || []).length }} 筆）</div>
            <template v-if="(item.answers || []).length === 0">
              <div class="text-muted small">尚無作答</div>
            </template>
            <template v-else>
              <div
                v-for="(ans, aIdx) in (item.answers || [])"
                :key="ans.exam_answer_id ?? aIdx"
                class="border-top pt-3 mt-2"
              >
                <div class="d-flex justify-content-between align-items-center small mb-2">
                  <span class="text-muted">{{ ans.created_at }}</span>
                  <span v-if="ans.answer_grade != null" class="badge bg-primary">分數 {{ ans.answer_grade }}</span>
                </div>
                <div class="mb-3">
                  <label class="form-label small text-secondary fw-medium mb-1">回答</label>
                  <div class="rounded bg-body-tertiary small p-2">{{ ans.student_answer ?? '—' }}</div>
                </div>
                <div class="border rounded bg-light p-3 mb-3">
                  <div class="form-label small fw-semibold text-secondary mb-1">批改結果</div>
                  <div class="small" style="white-space: pre-wrap;">{{ getGradingResultText(ans) }}</div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
