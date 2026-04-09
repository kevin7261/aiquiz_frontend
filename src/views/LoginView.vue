<script>
  /**
   * LoginView - 登入頁
   *
   * 以 person_id（使用者 ID）與 password 呼叫 POST /user/login。
   * 成功時：解析回傳的 user 物件、寫入 authStore.setUser、導向 /exam。
   * 失敗時：顯示後端 detail 或錯誤訊息於 error。
   * 載入中：全螢幕 LoadingOverlay，並停用送出。
   */
  import { ref, onMounted } from 'vue';
  import { useRouter } from 'vue-router';
  import { useAuthStore } from '../stores/authStore.js';
  import { API_BASE, API_GET_SYSTEM_SETTING_COURSE_NAME } from '../constants/api.js';
  import { loggedFetch } from '../utils/loggedFetch.js';
  import LoadingOverlay from '../components/LoadingOverlay.vue';

  export default {
    name: 'LoginView',
    components: { LoadingOverlay },
    setup() {
      const router = useRouter();
      const authStore = useAuthStore();
      const courseName = ref('MyQuiz.ai');
      const personId = ref('');
      const password = ref('');
      const loading = ref(false);
      const error = ref('');

      onMounted(async () => {
        try {
          const res = await loggedFetch(`${API_BASE}${API_GET_SYSTEM_SETTING_COURSE_NAME}`, { method: 'GET' });
          if (res.ok) {
            const data = await res.json();
            if (data.course_name && String(data.course_name).trim()) {
              courseName.value = String(data.course_name).trim();
            }
          }
        } catch {
          // 保持預設 MyQuiz.ai
        }
      });

      const onLogin = async () => {
        error.value = '';
        loading.value = true;
        try {
          const res = await loggedFetch(
            `${API_BASE}/user/login`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ person_id: personId.value, password: password.value }),
            },
            { personId: personId.value }
          );
          const text = await res.text();
          if (!res.ok) {
            let msg = '登入失敗';
            try {
              const body = JSON.parse(text);
              if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
            } catch {
              if (text && text.length < 150) msg = text;
            }
            error.value = msg;
            return;
          }
          const data = JSON.parse(text);
          // 後端可能回傳 { user: {...} } 或直接回傳使用者物件
          const userData = data.user != null ? data.user : data;
          authStore.setUser(userData);
          router.push('/exam');
        } catch (e) {
          error.value = e.message || '無法連線，請檢查網路或稍後再試';
        } finally {
          loading.value = false;
        }
      };

      return { courseName, personId, password, loading, error, onLogin };
    },
  };
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay :is-visible="loading" loading-text="登入中..." />
    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div
        class="container-fluid px-3 px-md-4 py-4 flex-grow-1 d-flex align-items-center justify-content-center"
      >
        <div class="rounded-4 my-bgcolor-gray-3 shadow-sm p-4 w-100 my-login-view-card my-color-black">
          <p class="my-font-xl-600 my-color-black text-break text-center mb-4 mb-md-3">
            {{ courseName }} 登入
          </p>
          <form @submit.prevent="onLogin">
            <div class="mb-3 d-flex flex-column gap-0">
              <label class="form-label my-font-sm-400 my-color-gray-1 mb-0" for="login-person-id">使用者 ID</label>
              <input
                id="login-person-id"
                v-model="personId"
                type="text"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                placeholder="請輸入使用者 ID"
                autocomplete="username"
                :disabled="loading"
              />
            </div>
            <div class="mb-3 d-flex flex-column gap-0">
              <label class="form-label my-font-sm-400 my-color-gray-1 mb-0" for="login-password">密碼</label>
              <input
                id="login-password"
                v-model="password"
                type="text"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                placeholder="請輸入密碼"
                autocomplete="current-password"
                :disabled="loading"
              />
            </div>
            <div v-if="error" class="my-alert-danger-soft py-2 mb-3" role="alert">{{ error }}</div>
            <button
              type="submit"
              class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-4 py-2 w-100"
              :disabled="loading"
              :aria-busy="loading"
            >
              登入
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-login-view-card {
  width: 100%;
  max-width: 360px;
}
</style>
