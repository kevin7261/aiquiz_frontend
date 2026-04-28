<script setup>
/**
 * LogListPage - 系統 Log 列表（GET /log/logs）
 *
 * 僅 user_type=1 可進入（路由與選單由 permissions 限制）。
 */
import { ref, computed, onMounted } from 'vue';
import { API_BASE, API_LIST_LOGS } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import { loggedFetch } from '../utils/loggedFetch.js';

const rows = ref([]);
const loading = ref(false);
const error = ref('');

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.logs)) return data.logs;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

const COLUMN_LABELS = {
  log_id: '紀錄編號',
  person_id: '使用者 ID',
  created_at: '建立時間',
  updated_at: '更新時間',
};

const columns = computed(() => {
  const r = rows.value[0];
  if (!r || typeof r !== 'object') return [];
  const keys = Object.keys(r);
  const priority = ['log_id', 'person_id', 'created_at', 'updated_at'];
  const rest = keys.filter((k) => !priority.includes(k)).sort();
  return [...priority.filter((k) => keys.includes(k)), ...rest];
});

function columnHeaderLabel(key) {
  return COLUMN_LABELS[key] ?? key;
}

function cellDisplay(val) {
  if (val == null) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

async function fetchLogs() {
  loading.value = true;
  error.value = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_LIST_LOGS}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) {
      let msg = `服務暫時無法回應（${res.status}）`;
      try {
        const body = JSON.parse(text);
        if (body.detail) msg += ` — ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}`;
      } catch {
        if (text && text.length < 200) msg += ` — ${text}`;
      }
      throw new Error(msg);
    }
    const data = text ? JSON.parse(text) : {};
    rows.value = normalizeRows(data);
  } catch (e) {
    error.value = e.message || '無法載入紀錄，請稍後再試';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchLogs();
});
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay :is-visible="loading" loading-text="載入中..." />
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">系統紀錄</p>
      </div>
    </header>
    <div v-if="error" class="flex-shrink-0">
      <div class="my-alert-warning-soft my-font-sm-400 py-2 mx-4 mb-3" role="alert">{{ error }}</div>
    </div>
    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row">
          <div class="col-12">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0">
              <div class="d-flex flex-wrap justify-content-end mb-3">
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-white px-3 py-2"
                  :disabled="loading"
                  @click="fetchLogs"
                >
                  重新載入
                </button>
              </div>
              <div class="table-responsive">
            <table class="table table-bordered table-hover table-sm my-font-md-400 mb-0">
              <thead class="my-table-thead">
                <tr>
                  <th v-for="col in columns" :key="col" class="my-font-md-600">{{ columnHeaderLabel(col) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in rows" :key="row.log_id ?? idx">
                  <td v-for="col in columns" :key="col" class="my-font-md-400 text-break">{{ cellDisplay(row[col]) }}</td>
                </tr>
                <tr v-if="!loading && rows.length === 0">
                  <td :colspan="Math.max(columns.length, 1)" class="my-color-gray-4 text-center my-font-md-400">尚無資料</td>
                </tr>
              </tbody>
            </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
