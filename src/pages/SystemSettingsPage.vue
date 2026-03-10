<script setup>
/**
 * SystemSettingsPage - 系統設定頁面
 *
 * 負責 LLM API Key：GET /system-settings/llm-api-key 取得、PUT /system-settings/llm-api-key 更新（body: llm_api_key，空字串表示清除）。
 * 資料庫僅一筆，不需 person_id。進入頁面時依 authStore.user 觸發取得，儲存後顯示成功/失敗訊息。
 */
import { ref, watch } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import { API_BASE, API_GET_LLM_API_KEY, API_PUT_LLM_API_KEY } from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';

const authStore = useAuthStore();

const llmApiKey = ref('');
const loading = ref(false);
const fetchLoading = ref(false);
const message = ref('');
const messageType = ref(''); // 'success' | 'danger'

async function fetchLlmApiKey() {
  if (!authStore.user) {
    llmApiKey.value = '';
    return;
  }
  fetchLoading.value = true;
  message.value = '';
  try {
    const res = await fetch(`${API_BASE}${API_GET_LLM_API_KEY}`, {
      method: 'GET',
    });
    const text = await res.text();
    if (!res.ok) {
      try {
        const body = JSON.parse(text);
        if (body.detail) message.value = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        if (text && text.length < 200) message.value = text;
      }
      messageType.value = 'danger';
      return;
    }
    const data = text ? JSON.parse(text) : {};
    llmApiKey.value = data.llm_api_key ?? '';
  } catch (e) {
    message.value = e.message || '無法連線，請確認後端已啟動';
    messageType.value = 'danger';
  } finally {
    fetchLoading.value = false;
  }
}

watch(() => authStore.user, fetchLlmApiKey, { immediate: true });

async function saveLlmApiKey() {
  if (!authStore.user) {
    message.value = '請先登入';
    messageType.value = 'danger';
    return;
  }
  loading.value = true;
  message.value = '';
  try {
    const res = await fetch(`${API_BASE}${API_PUT_LLM_API_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_api_key: llmApiKey.value ?? '' }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = '儲存失敗';
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
    message.value = llmApiKey.value ? 'LLM API Key 已儲存' : 'LLM API Key 已清除';
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
      loading-text="儲存中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid">
        <span class="navbar-brand mb-0">系統設定</span>
      </div>
    </div>
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <div class="bg-body-tertiary rounded text-start p-4 mb-3">
        <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">LLM API Key</div>
        <p class="small text-secondary mb-3">
          用於呼叫 LLM 的 API Key，留空並儲存可清除已儲存的 Key。
        </p>
        <div class="mb-3">
          <label class="form-label small text-secondary fw-medium mb-1">API Key</label>
          <input
            v-model="llmApiKey"
            type="text"
            class="form-control form-control-sm"
            placeholder="選填，用於呼叫 LLM"
            autocomplete="off"
            :disabled="fetchLoading"
          >
          <div v-if="fetchLoading" class="form-text small">載入中...</div>
        </div>
        <div v-if="message" :class="['alert py-2 mb-3', messageType === 'success' ? 'alert-success' : 'alert-danger']" role="alert">
          {{ message }}
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="loading || fetchLoading"
          @click="saveLlmApiKey"
        >
          儲存
        </button>
      </div>
    </div>
  </div>
</template>
