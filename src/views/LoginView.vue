<script>
  /**
   * LoginView - 登入頁，以 user_id 與 password 呼叫 POST /users/login，成功後寫入 authStore 並跳轉 /main。
   */
  import { ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { useAuthStore } from '../stores/authStore.js';

  const API_BASE = 'http://127.0.0.1:8000';

  export default {
    name: 'LoginView',
    setup() {
      const router = useRouter();
      const authStore = useAuthStore();
      const userId = ref('');
      const password = ref('');
      const loading = ref(false);
      const error = ref('');

      const onLogin = async () => {
        error.value = '';
        const id = parseInt(userId.value, 10);
        if (Number.isNaN(id) || id < 1) {
          error.value = '請輸入有效的使用者 ID（數字）';
          return;
        }
        if (!password.value.trim()) {
          error.value = '請輸入密碼';
          return;
        }
        loading.value = true;
        try {
          const res = await fetch(`${API_BASE}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: id, password: password.value }),
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
          authStore.setUser(data.user);
          router.push('/main');
        } catch (e) {
          error.value = e.message || '無法連線，請確認後端已啟動';
        } finally {
          loading.value = false;
        }
      };

      return { userId, password, loading, error, onLogin };
    },
  };
</script>

<template>
  <div class="d-flex flex-column justify-content-center align-items-center h-100 my-bgcolor-gray-100">
    <div class="card shadow-sm my-login-card">
      <div class="card-body p-4">
        <h4 class="card-title text-center mb-4">AIQuiz 登入</h4>
        <form @submit.prevent="onLogin">
          <div class="mb-3">
            <label class="form-label" for="login-user-id">使用者 ID</label>
            <input
              id="login-user-id"
              v-model="userId"
              type="text"
              inputmode="numeric"
              class="form-control"
              placeholder="請輸入使用者 ID（數字）"
              autocomplete="username"
            />
          </div>
          <div class="mb-3">
            <label class="form-label" for="login-password">密碼</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="form-control"
              placeholder="請輸入密碼"
              autocomplete="current-password"
            />
          </div>
          <div v-if="error" class="alert alert-danger py-2 mb-3" role="alert">{{ error }}</div>
          <button type="submit" class="btn btn-primary w-100" :disabled="loading">
            {{ loading ? '登入中...' : '登入' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
