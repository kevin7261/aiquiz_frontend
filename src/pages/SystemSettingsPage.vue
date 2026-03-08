<script setup>
/** 系統設定頁面：LLM API Key 的取得（GET /system-settings/llm-api-key）與更新（PUT）。 */
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
  const personId = authStore.user?.person_id;
  if (!personId) {
    llmApiKey.value = '';
    return;
  }
  fetchLoading.value = true;
  message.value = '';
  try {
    const res = await fetch(`${API_BASE}${API_GET_LLM_API_KEY}`, {
      method: 'GET',
      headers: { 'X-Person-Id': String(personId) },
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

watch(() => authStore.user?.person_id, fetchLlmApiKey, { immediate: true });

async function saveLlmApiKey() {
  const personId = authStore.user?.person_id;
  if (!personId) {
    message.value = '請先登入';
    messageType.value = 'danger';
    return;
  }
  loading.value = true;
  message.value = '';
  try {
    const res = await fetch(`${API_BASE}${API_PUT_LLM_API_KEY}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Person-Id': String(personId),
      },
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
    <div class="flex-shrink-0 bg-white border-bottom">
      <div class="d-flex align-items-center gap-2 px-4 pt-2 pb-2">
        <span class="fs-5 fw-semibold">系統設定</span>
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
            type="password"
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
