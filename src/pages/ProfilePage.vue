<script setup>
/**
 * ProfilePage - 個資修改頁面
 *
 * 以 PATCH /user/profile 更新 name、user_type、llm_api_key（以 person_id 識別，Header X-Person-Id）。
 * user_type=3（學生）時 llm_api_key 欄位為唯讀。會從 authStore 初始化表單，並可選從 GET /system-settings/llm-api-key 取得系統 LLM Key 顯示。
 */
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_UPDATE_PROFILE, API_GET_LLM_API_KEY } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';

const authStore = useAuthStore();

const USER_TYPE_OPTIONS = [
  { value: 1, label: '系統開發者' },
  { value: 2, label: '課程管理者' },
  { value: 3, label: '學生' },
];

const name = ref('');
const userType = ref(3);
const llmApiKey = ref('');
const loading = ref(false);
const message = ref('');
const messageType = ref(''); // 'success' | 'danger'

const account = computed(() => authStore.user?.person_id ?? '—');
const isLlmApiKeyDisabled = computed(() => Number(userType.value) === 3);

function initFromUser() {
  const u = authStore.user;
  name.value = u?.name ?? '';
  const ut = u?.user_type;
  userType.value = ut === 1 || ut === 2 || ut === 3 ? Number(ut) : 3;
  llmApiKey.value = u?.llm_api_key ?? '';
}
watch(() => authStore.user, initFromUser, { immediate: true });

async function fetchLlmApiKey() {
  if (!authStore.user) return;
  try {
    const res = await fetch(`${API_BASE}${API_GET_LLM_API_KEY}`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      llmApiKey.value = data?.llm_api_key ?? '';
    }
  } catch {
    // 忽略，保留 authStore 或空值
  }
}
watch(() => authStore.user, fetchLlmApiKey, { immediate: true });

async function saveProfile() {
  const personId = authStore.user?.person_id;
  if (!personId) {
    message.value = '請先登入';
    messageType.value = 'danger';
    return;
  }
  const u = authStore.user;
  const payload = {};
  if (name.value !== (u?.name ?? '')) payload.name = name.value;
  if (Number(userType.value) !== (u?.user_type ?? 3)) payload.user_type = Number(userType.value);
  if (!isLlmApiKeyDisabled.value && (llmApiKey.value ?? '') !== (u?.llm_api_key ?? '')) payload.llm_api_key = llmApiKey.value ?? ''; // 空字串表示清除
  if (Object.keys(payload).length === 0) {
    message.value = '未變更任何欄位';
    messageType.value = 'danger';
    return;
  }
  message.value = '';
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}${API_UPDATE_PROFILE}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Person-Id': String(personId),
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = '更新失敗';
      try {
        const body = JSON.parse(text);
        if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        if (text && text.length < 200) msg = text;
      }
      message.value = msg;
      messageType.value = 'danger';
      return;
    }
    const data = JSON.parse(text);
    const userData = data.user != null ? data.user : data;
    authStore.setUser(userData);
    initFromUser();
    message.value = '已儲存';
    messageType.value = 'success';
  } catch (e) {
    message.value = e.message || '無法連線，請確認後端已啟動';
    messageType.value = 'danger';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="執行中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid">
        <span class="navbar-brand mb-0">個資修改</span>
      </div>
    </div>
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <div class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">個人資料</div>
        <div class="mb-3">
          <label class="form-label small text-secondary fw-medium mb-1">帳號（person_id）</label>
          <input :value="account" type="text" class="form-control form-control-sm" placeholder="帳號" readonly disabled>
        </div>
        <div class="mb-3">
          <label class="form-label small text-secondary fw-medium mb-1">名稱</label>
          <input v-model="name" type="text" class="form-control form-control-sm" placeholder="名稱">
        </div>
        <div class="mb-3">
          <label class="form-label small text-secondary fw-medium mb-1">身分（user_type）</label>
          <select v-model.number="userType" class="form-select form-select-sm">
            <option v-for="opt in USER_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label small text-secondary fw-medium mb-1">LLM API Key</label>
          <input
            v-model="llmApiKey"
            type="text"
            class="form-control form-control-sm"
            placeholder="選填，用於呼叫 LLM"
            autocomplete="off"
            :disabled="isLlmApiKeyDisabled"
          >
          <div v-if="isLlmApiKeyDisabled" class="form-text small">學生身分無法編輯 LLM API Key</div>
        </div>
        <div v-if="message" :class="['alert py-2 mb-3', messageType === 'success' ? 'alert-success' : 'alert-danger']" role="alert">
          {{ message }}
        </div>
        <button type="button" class="btn btn-primary btn-sm" :disabled="loading" @click="saveProfile">
          儲存
        </button>
      </div>
    </div>
  </div>
</template>
