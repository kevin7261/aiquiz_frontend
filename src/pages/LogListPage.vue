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
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay :is-visible="loading" loading-text="載入中..." />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center align-items-center gap-2">
        <span class="navbar-brand mb-0">系統紀錄</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="loading" @click="fetchLogs">重新載入</button>
      </div>
    </div>
    <div v-if="error" class="alert alert-warning py-2 my-font-size-sm mx-4 mb-0 mt-2" role="alert">{{ error }}</div>
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-4">
      <div class="row justify-content-center">
        <div class="col-12 col-xl-11">
          <div class="table-responsive">
            <table class="table table-bordered table-hover table-sm">
              <thead class="table-light">
                <tr>
                  <th v-for="col in columns" :key="col" class="my-font-size-sm fw-medium">{{ columnHeaderLabel(col) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in rows" :key="row.log_id ?? idx">
                  <td v-for="col in columns" :key="col" class="my-font-size-sm text-break">{{ cellDisplay(row[col]) }}</td>
                </tr>
                <tr v-if="!loading && rows.length === 0">
                  <td :colspan="Math.max(columns.length, 1)" class="text-muted text-center my-font-size-sm">尚無資料</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
