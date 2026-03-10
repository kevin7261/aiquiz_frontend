<script setup>
/**
 * SystemSettingsPage - 系統設定頁面
 *
 * 課程名稱與 LLM API Key 共用同一套邏輯，僅 API 端點與欄位名、文案不同。
 * 每區塊：GET 取得 → 顯示 → PUT 儲存（body 僅傳對應欄位），各自 loading / 訊息不連動。
 */
import { reactive, ref, watch } from 'vue';
import { useAuthStore } from '../stores/authStore.js';
import {
  API_BASE,
  API_GET_LLM_API_KEY,
  API_GET_SYSTEM_SETTING_COURSE_NAME,
  API_PUT_SYSTEM_SETTING_COURSE_NAME,
  API_PUT_SYSTEM_SETTING_LLM_API_KEY,
} from '../constants/api.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';

const authStore = useAuthStore();

/** 區塊設定：僅 API 與文案不同，程式邏輯完全一致 */
const BLOCKS = [
  {
    id: 'courseName',
    getUrl: API_GET_SYSTEM_SETTING_COURSE_NAME,
    putUrl: API_PUT_SYSTEM_SETTING_COURSE_NAME,
    bodyKey: 'course_name',
    title: '課程名稱',
    description: '顯示於系統的課程名稱，可留空。',
    label: '課程名稱',
    placeholder: '選填',
    getSuccessMessage: () => '課程名稱已儲存',
  },
  {
    id: 'llmApiKey',
    getUrl: API_GET_LLM_API_KEY,
    putUrl: API_PUT_SYSTEM_SETTING_LLM_API_KEY,
    bodyKey: 'llm_api_key',
    title: 'LLM API Key',
    description: '用於呼叫 LLM 的 API Key，留空並儲存可清除已儲存的 Key。',
    label: 'API Key',
    placeholder: '選填，用於呼叫 LLM',
    getSuccessMessage: (value) => (value ? 'LLM API Key 已儲存' : 'LLM API Key 已清除'),
  },
];

const fetchLoading = ref(false);
const state = reactive(
  Object.fromEntries(
    BLOCKS.map((b) => [
      b.id,
      { value: '', loading: false, message: '', messageType: '' },
    ])
  )
);

async function fetchSettings() {
  if (!authStore.user) {
    BLOCKS.forEach((b) => {
      state[b.id].value = '';
      state[b.id].message = '';
    });
    return;
  }
  fetchLoading.value = true;
  BLOCKS.forEach((b) => (state[b.id].message = ''));
  try {
    const responses = await Promise.all(
      BLOCKS.map((b) => fetch(`${API_BASE}${b.getUrl}`, { method: 'GET' }))
    );
    const texts = await Promise.all(responses.map((r) => r.text()));

    for (let i = 0; i < BLOCKS.length; i++) {
      const block = BLOCKS[i];
      const res = responses[i];
      const text = texts[i];
      if (!res.ok) {
        try {
          const body = text ? JSON.parse(text) : {};
          state[block.id].message = body.detail != null
            ? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail))
            : (text && text.length < 200 ? text : '儲存失敗');
        } catch {
          state[block.id].message = text && text.length < 200 ? text : '儲存失敗';
        }
        state[block.id].messageType = 'danger';
        return;
      }
      const data = text ? JSON.parse(text) : {};
      const val = data[block.bodyKey];
      state[block.id].value = val != null ? String(val) : '';
    }
  } catch (e) {
    state[BLOCKS[0].id].message = e.message || '無法連線，請確認後端已啟動';
    state[BLOCKS[0].id].messageType = 'danger';
  } finally {
    fetchLoading.value = false;
  }
}

watch(() => authStore.user, fetchSettings, { immediate: true });

async function putSettingByUrl(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = '儲存失敗';
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) msg = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
    } catch {
      if (text && text.length < 200) msg = text;
    }
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : {};
}

async function save(block) {
  if (!authStore.user) {
    state[block.id].message = '請先登入';
    state[block.id].messageType = 'danger';
    return;
  }
  state[block.id].loading = true;
  state[block.id].message = '';
  try {
    const body = { [block.bodyKey]: state[block.id].value ?? '' };
    await putSettingByUrl(block.putUrl, body);
    state[block.id].message = block.getSuccessMessage(state[block.id].value);
    state[block.id].messageType = 'success';
  } catch (e) {
    state[block.id].message = e.message || '無法連線，請確認後端已啟動';
    state[block.id].messageType = 'danger';
  } finally {
    state[block.id].loading = false;
  }
}
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="BLOCKS.some((b) => state[b.id].loading)"
      loading-text="儲存中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand mb-0">系統設定</span>
      </div>
    </div>
    <div class="flex-grow-1 overflow-auto bg-white p-4">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-8">
          <div
            v-for="block in BLOCKS"
            :key="block.id"
            class="bg-body-tertiary rounded text-start p-4 mb-3"
          >
            <div class="fs-5 fw-semibold mb-3 pb-2 border-bottom">{{ block.title }}</div>
            <p class="small text-secondary mb-3">
              {{ block.description }}
            </p>
            <div class="mb-3">
              <label class="form-label small text-secondary fw-medium mb-1">{{ block.label }}</label>
              <input
                v-model="state[block.id].value"
                type="text"
                class="form-control form-control-sm"
                :placeholder="block.placeholder"
                :disabled="fetchLoading"
                :autocomplete="block.id === 'llmApiKey' ? 'off' : undefined"
              >
              <div v-if="fetchLoading" class="form-text small">載入中...</div>
            </div>
            <div
              v-if="state[block.id].message"
              :class="['alert py-2 mb-3', state[block.id].messageType === 'success' ? 'alert-success' : 'alert-danger']"
              role="alert"
            >
              {{ state[block.id].message }}
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="state[block.id].loading || fetchLoading"
              @click="save(block)"
            >
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
