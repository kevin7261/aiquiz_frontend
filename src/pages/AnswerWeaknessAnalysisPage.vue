<script setup>
/**
 * AnswerWeaknessAnalysisPage - 作答弱點分析頁面
 *
 * 讀取 GET /person-analysis/quizzes/{person_id}；列表與 GET /exam/tabs、GET /rag/tabs 每筆一致（含 units→quizzes；頂層 answers 或題列內嵌 answer_*；mergeQuizzesWithTopLevelAnswers 合併）。
 * 另含 count、weakness_report；可顯示作答摘要、弱點報告、匯出 Excel。
 */
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_QUIZZES_BY_PERSON } from '../constants/api.js';
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

/** 難度顯示：API 字串「基礎」「進階」或舊版 0／1 */
function getDifficultyLabel(quizLevel) {
  const label = normalizeQuizLevelLabel(quizLevel);
  if (label) return label;
  return quizLevel != null && String(quizLevel).trim() !== '' ? String(quizLevel) : '—';
}

/** 每題可能多筆作答，與測驗頁一致取最後一筆（最新提交） */
function getSingleAnswer(item) {
  const list = item?.answers;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[list.length - 1];
}

/** 依 JSON 的 key 順序產生的區塊列表 */
const weaknessReportSections = computed(() => {
  const obj = weaknessReportParsed.value;
  if (!obj) return [];
  return Object.keys(obj);
});

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
    items.value = exams.flatMap((exam) => {
      const quizzes = mergeQuizzesWithTopLevelAnswers(exam);
      const examLabel = exam.tab_name ?? exam.exam_name ?? exam.exam_tab_id ?? '';
      return quizzes.map((q) => ({ ...q, exam_name: examLabel }));
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

function getSummaryRows() {
  return items.value.map((item, idx) => [
    idx + 1,
    item.rag_name ?? item.exam_name ?? '—',
    getDifficultyLabel(examQuizLevelFromRow(item) ?? item.quiz_level),
    formatQuizGradeDisplay(getAnswerScoreValue(getSingleAnswer(item))),
    getSingleAnswer(item)?.created_at ?? '—'
  ]);
}

async function onDownloadExcel() {
  const headers = ['題號', '單元', '難度', '分數', '時間'];
  await downloadSummaryExcel(headers, getSummaryRows(), '作答弱點分析-作答紀錄摘要.xlsx');
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

                  <div class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0">
                    <div class="my-font-lg-600 my-color-black mb-4">作答紀錄摘要</div>
                    <div class="table-responsive">
                      <table class="table table-bordered table-sm my-font-md-400 mb-0">
                        <thead class="my-table-thead">
                          <tr>
                            <th class="my-font-md-600">題號</th>
                            <th class="my-font-md-600">單元</th>
                            <th class="my-font-md-600">難度</th>
                            <th class="my-font-md-600">分數</th>
                            <th class="my-font-md-600">時間</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(item, idx) in items" :key="item.exam_quiz_id ?? item.rag_quiz_id ?? idx">
                            <td>{{ idx + 1 }}</td>
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
                      <div class="d-flex flex-row align-items-end gap-3 w-100 min-w-0 flex-nowrap">
                        <div class="d-flex flex-column min-w-0 flex-grow-1 gap-1">
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
                              :key="'weakness-diff-' + idx + '-' + opt"
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
