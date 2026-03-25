<script setup>
/**
 * UserManagementPage - 使用者管理頁面
 *
 * 呼叫 GET /user/users 取得使用者列表（users、count），以表格顯示 user_id、person_id、name、user_type。
 * 僅讀取與顯示，不提供新增/編輯/刪除（若後端有 API 可再擴充）。
 */
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
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand mb-0">使用者管理</span>
      </div>
    </div>
    <div v-if="error" class="alert alert-warning py-2 small mx-4 mb-3" role="alert">{{ error }}</div>
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <div class="text-start page-block-spacing">
        <p class="small text-secondary mb-4">共 {{ count }} 筆使用者</p>

        <div v-if="loading" class="text-muted small" />
        <div v-else class="table-responsive">
          <table class="table table-bordered table-hover table-sm">
            <thead class="table-light">
              <tr>
                <th class="small fw-medium">user_id</th>
                <th class="small fw-medium">person_id</th>
                <th class="small fw-medium">name</th>
                <th class="small fw-medium">user_type</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.user_id">
                <td class="small">{{ u.user_id }}</td>
                <td class="small">{{ u.person_id ?? '—' }}</td>
                <td class="small">{{ u.name ?? '—' }}</td>
                <td class="small">{{ u.user_type ?? '—' }}</td>
              </tr>
              <tr v-if="!loading && users.length === 0">
                <td colspan="4" class="text-muted text-center small">尚無使用者</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
        </div>
      </div>
    </div>
  </div>
</template>
