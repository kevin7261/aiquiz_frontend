<script>
  /**
   * LoginView - 登入頁
   *
   * 以 person_id（使用者 ID）與 password 呼叫 POST /user/login。
   * 成功時：解析回傳的 user 物件、寫入 authStore.setUser、導向 /main（由 router 再導向 /exam）。
   * 失敗時：顯示後端 detail 或錯誤訊息於 error。
   * 載入中顯示 LoadingOverlay。
   */
  import { ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { useAuthStore } from '../stores/authStore.js';
  import { API_BASE } from '../constants/api.js';
  import LoadingOverlay from '../components/LoadingOverlay.vue';

  export default {
    components: { LoadingOverlay },
    name: 'LoginView',
    setup() {
      const router = useRouter();
      const authStore = useAuthStore();
      const personId = ref('');
      const password = ref('');
      const loading = ref(false);
      const error = ref('');

      const onLogin = async () => {
        error.value = '';
        loading.value = true;
        try {
          const res = await fetch(`${API_BASE}/user/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person_id: personId.value, password: password.value }),
          });
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
          router.push('/main'); // 會再 redirect 到 /exam
        } catch (e) {
          error.value = e.message || '無法連線，請確認後端已啟動';
        } finally {
          loading.value = false;
        }
      };

      return { personId, password, loading, error, onLogin };
    },
  };
</script>

<template>
  <div class="d-flex flex-column justify-content-center align-items-center h-100 my-bgcolor-gray-100 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="執行中..."
    />
    <div class="card shadow-sm my-login-card">
      <div class="card-body p-4">
        <h4 class="card-title text-center mb-4">AIQuiz 登入</h4>
        <form @submit.prevent="onLogin">
          <div class="mb-3">
            <label class="form-label" for="login-person-id">使用者 ID</label>
            <input
              id="login-person-id"
              v-model="personId"
              type="text"
              class="form-control"
              placeholder="請輸入使用者 ID"
              autocomplete="username"
            />
          </div>
          <div class="mb-3">
            <label class="form-label" for="login-password">密碼</label>
            <input
              id="login-password"
              v-model="password"
              type="text"
              class="form-control"
              placeholder="請輸入密碼"
              autocomplete="current-password"
            />
          </div>
          <div v-if="error" class="alert alert-danger py-2 mb-3" role="alert">{{ error }}</div>
          <button type="submit" class="btn btn-primary w-100" :disabled="loading">
            登入
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
