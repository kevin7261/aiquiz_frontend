<script setup>
/**
 * ProfilePage - 個資修改頁面
 *
 * 以 PATCH /user/profile 更新 name、llm_api_key（以 person_id 識別，Header X-Person-Id）。
 * llm_api_key 僅 user_type 1／2 可見與變更；其餘類型不顯示、不寫入 payload。
 * 可從 GET /system-settings/llm-api-key 取得系統 LLM Key 顯示（僅 1／2）。
 */
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_UPDATE_PROFILE, API_GET_LLM_API_KEY } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';

const authStore = useAuthStore();

const name = ref('');
const llmApiKey = ref('');
const loading = ref(false);
const message = ref('');
const messageType = ref(''); // 'success' | 'danger'

const account = computed(() => authStore.user?.person_id ?? '—');

/** 僅系統開發者／課程管理者可設定 LLM API Key */
const canEditLlmApiKey = computed(() => {
  const t = Number(authStore.user?.user_type);
  return t === 1 || t === 2;
});

function initFromUser() {
  const u = authStore.user;
  name.value = u?.name ?? '';
  if (canEditLlmApiKey.value) {
    llmApiKey.value = u?.llm_api_key ?? '';
  } else {
    llmApiKey.value = '';
  }
}
watch(() => authStore.user, initFromUser, { immediate: true });

async function fetchLlmApiKey() {
  if (!authStore.user || !canEditLlmApiKey.value) return;
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
  if (
    canEditLlmApiKey.value &&
    (llmApiKey.value ?? '') !== (u?.llm_api_key ?? '')
  ) {
    payload.llm_api_key = llmApiKey.value ?? ''; // 空字串表示清除
  }
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
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand mb-0">個資修改</span>
      </div>
    </div>
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
      <div class="text-start page-block-spacing">
        <div class="mb-4">
          <label class="form-label small text-secondary fw-medium mb-1">帳號</label>
          <input :value="account" type="text" class="form-control form-control-sm" placeholder="帳號" readonly disabled>
        </div>
        <div class="mb-4">
          <label class="form-label small text-secondary fw-medium mb-1">名稱</label>
          <input v-model="name" type="text" class="form-control form-control-sm" placeholder="名稱">
        </div>
        <div v-if="canEditLlmApiKey" class="mb-4">
          <label class="form-label small text-secondary fw-medium mb-1">LLM API Key</label>
          <input
            v-model="llmApiKey"
            type="text"
            class="form-control form-control-sm"
            placeholder="選填，用於呼叫 LLM"
            autocomplete="off"
          >
        </div>
        <div v-if="message" :class="['alert py-2 mb-4', messageType === 'success' ? 'alert-success' : 'alert-danger']" role="alert">
          {{ message }}
        </div>
        <button type="button" class="btn btn-primary btn-sm" :disabled="loading" @click="saveProfile">
          儲存
        </button>
      </div>
        </div>
      </div>
    </div>
  </div>
</template>
