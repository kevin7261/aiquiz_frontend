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
import { loggedFetch } from '../utils/loggedFetch.js';

const authStore = useAuthStore();

/** 區塊設定：僅 API 與文案不同，程式邏輯完全一致 */
const BLOCKS = [
  {
    id: 'courseName',
    getUrl: API_GET_SYSTEM_SETTING_COURSE_NAME,
    putUrl: API_PUT_SYSTEM_SETTING_COURSE_NAME,
    bodyKey: 'course_name',
    label: '課程名稱',
    placeholder: '選填',
    getSuccessMessage: () => '課程名稱已儲存',
  },
  {
    id: 'llmApiKey',
    getUrl: API_GET_LLM_API_KEY,
    putUrl: API_PUT_SYSTEM_SETTING_LLM_API_KEY,
    bodyKey: 'llm_api_key',
    label: 'AI 服務 API 金鑰',
    placeholder: '選填，供系統呼叫 AI 服務',
    getSuccessMessage: (value) => (value ? 'API 金鑰已儲存' : 'API 金鑰已清除'),
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
      BLOCKS.map((b) => loggedFetch(`${API_BASE}${b.getUrl}`, { method: 'GET' }))
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
    state[BLOCKS[0].id].message = e.message || '無法連線，請檢查網路或稍後再試';
    state[BLOCKS[0].id].messageType = 'danger';
  } finally {
    fetchLoading.value = false;
  }
}

watch(() => authStore.user, fetchSettings, { immediate: true });

async function putSettingByUrl(url, body) {
  const res = await loggedFetch(`${API_BASE}${url}`, {
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
    state[block.id].message = e.message || '無法連線，請檢查網路或稍後再試';
    state[block.id].messageType = 'danger';
  } finally {
    state[block.id].loading = false;
  }
}
</script>

<template>
  <div class="d-flex flex-column bg-body-secondary h-100 position-relative">
    <LoadingOverlay
      :is-visible="fetchLoading || BLOCKS.some((b) => state[b.id].loading)"
      loading-text="載入或儲存設定中..."
    />
    <div class="navbar navbar-expand-lg bg-white flex-shrink-0">
      <div class="container-fluid d-flex justify-content-center">
        <span class="navbar-brand my-font-xl-400 mb-0">系統設定</span>
      </div>
    </div>
    <div class="flex-grow-1 overflow-auto bg-white px-4 py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
          <div class="text-start my-page-block-spacing">
            <div class="my-bgcolor-page-block rounded-3 p-3 p-lg-4 mb-4">
            <template v-for="block in BLOCKS" :key="block.id">
              <div class="mb-4">
                <label class="form-label my-font-sm-600 text-secondary mb-1">{{ block.label }}</label>
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <div class="flex-grow-1" style="min-width: 0">
                    <input
                      v-model="state[block.id].value"
                      type="text"
                      class="form-control form-control-sm"
                      :placeholder="block.placeholder"
                      :disabled="fetchLoading"
                      :autocomplete="block.id === 'llmApiKey' ? 'off' : undefined"
                    >
                    <div v-if="fetchLoading" class="form-text my-font-sm-400">載入中...</div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary flex-shrink-0"
                    :disabled="state[block.id].loading || fetchLoading"
                    @click="save(block)"
                  >
                    儲存
                  </button>
                </div>
              </div>
              <div
                v-if="state[block.id].message"
                :class="['alert', state[block.id].messageType === 'success' ? 'alert-success' : 'alert-danger', 'py-2', 'mb-4']"
                role="alert"
              >
                {{ state[block.id].message }}
              </div>
            </template>
            <div class="mb-4">
              <label class="form-label my-font-sm-600 text-secondary mb-1">服務位址（僅供查閱）</label>
              <div
                class="form-control form-control-sm bg-body-secondary font-monospace text-break py-2"
                role="status"
              >
                {{ API_BASE }}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
