<script>
  /**
   * LoginView - 登入頁，路由 /login；按登入跳轉 /main。
   */
  import { useRouter } from 'vue-router';

  export default {
    name: 'LoginView',
    setup() {
      const router = useRouter();
      const onLogin = () => {
        router.push('/main');
      };
      return { onLogin };
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
            <label class="form-label" for="login-account">帳號</label>
            <input id="login-account" type="text" class="form-control" placeholder="請輸入帳號" />
          </div>
          <div class="mb-3">
            <label class="form-label" for="login-password">密碼</label>
            <input id="login-password" type="password" class="form-control" placeholder="請輸入密碼" />
          </div>
          <button type="submit" class="btn btn-primary w-100">登入</button>
        </form>
      </div>
    </div>
  </div>
</template>
