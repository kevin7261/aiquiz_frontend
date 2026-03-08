<script setup>
/** 使用者管理頁面：呼叫 GET /user/users 取得使用者列表並以表格顯示。 */
import { ref, onMounted } from 'vue';
import { API_BASE } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';

const users = ref([]);
const count = ref(0);
const loading = ref(false);
const error = ref('');

async function fetchUsers() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`${API_BASE}/user/users`);
    const text = await res.text();
    if (!res.ok) {
      let msg = `伺服器錯誤 (${res.status})`;
      try {
        const body = JSON.parse(text);
        if (body.detail) msg += ` — ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}`;
      } catch {
        if (text && text.length < 200) msg += ` — ${text}`;
      }
      throw new Error(msg);
    }
    const data = JSON.parse(text);
    users.value = Array.isArray(data.users) ? data.users : [];
    count.value = typeof data.count === 'number' ? data.count : users.value.length;
  } catch (e) {
    error.value = e.message || '無法載入使用者列表';
    users.value = [];
    count.value = 0;
  } finally {
    loading.value = false;
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-TW');
  } catch {
    return iso;
  }
}

function displayMetadata(meta) {
  if (meta == null) return '—';
  if (typeof meta === 'object') return JSON.stringify(meta);
  return String(meta);
}

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="執行中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid">
        <span class="navbar-brand mb-0">使用者管理</span>
      </div>
    </div>
    <div v-if="error" class="alert alert-warning py-2 small mx-4 mb-3" role="alert">{{ error }}</div>
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <div class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">使用者列表</div>
        <p class="small text-secondary mb-3">共 {{ count }} 筆使用者</p>

        <div v-if="loading" class="text-muted small" />
        <div v-else class="table-responsive">
          <table class="table table-bordered table-hover table-sm">
            <thead class="table-light">
              <tr>
                <th class="small fw-medium">user_id</th>
                <th class="small fw-medium">person_id</th>
                <th class="small fw-medium">name</th>
                <th class="small fw-medium">user_type</th>
                <th class="small fw-medium">llm_api_key</th>
                <th class="small fw-medium">user_metadata</th>
                <th class="small fw-medium">updated_at</th>
                <th class="small fw-medium">created_at</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.user_id">
                <td class="small">{{ u.user_id }}</td>
                <td class="small">{{ u.person_id ?? '—' }}</td>
                <td class="small">{{ u.name ?? '—' }}</td>
                <td class="small">{{ u.user_type ?? '—' }}</td>
                <td class="small text-break">{{ (u.llm_api_key ?? '').trim() || '—' }}</td>
                <td class="text-break small">{{ displayMetadata(u.user_metadata) }}</td>
                <td class="small">{{ formatDate(u.updated_at) }}</td>
                <td class="small">{{ formatDate(u.created_at) }}</td>
              </tr>
              <tr v-if="!loading && users.length === 0">
                <td colspan="8" class="text-muted text-center small">尚無使用者</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn-outline-primary btn-sm mt-2" :disabled="loading" @click="fetchUsers">
          重新載入
        </button>
      </div>
    </div>
  </div>
</template>
