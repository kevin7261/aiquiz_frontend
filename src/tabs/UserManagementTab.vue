<script setup>
/** 使用者管理分頁：呼叫 GET /users 取得使用者列表並以表格顯示。 */
import { ref, onMounted } from 'vue';

const API_BASE = 'http://127.0.0.1:8000';

const users = ref([]);
const count = ref(0);
const loading = ref(false);
const error = ref('');

async function fetchUsers() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`${API_BASE}/users`);
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
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <div class="flex-grow-1 overflow-auto my-bgcolor-white p-4">
      <div class="my-bgcolor-gray-100 rounded text-start p-4">
        <h6 class="my-title-sm-black mb-3">使用者管理</h6>
        <p class="text-muted small mb-3">共 {{ count }} 筆使用者</p>

        <div v-if="loading" class="text-muted">載入中...</div>
        <div v-else-if="error" class="alert alert-warning" role="alert">{{ error }}</div>
        <div v-else class="table-responsive">
          <table class="table table-bordered table-hover">
            <thead class="table-light">
              <tr>
                <th>user_id</th>
                <th>created_at</th>
                <th>name</th>
                <th>type</th>
                <th>metadata</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.user_id">
                <td>{{ u.user_id }}</td>
                <td>{{ formatDate(u.created_at) }}</td>
                <td>{{ u.name ?? '—' }}</td>
                <td>{{ u.type }}</td>
                <td class="text-break small">{{ displayMetadata(u.metadata) }}</td>
              </tr>
              <tr v-if="users.length === 0">
                <td colspan="5" class="text-muted text-center">尚無使用者</td>
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
