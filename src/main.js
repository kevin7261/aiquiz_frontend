/**
 * AIQuiz 前端應用程式入口
 *
 * 職責：
 * - 建立 Vue 3 應用實例並掛載至 #app
 * - 註冊 Vue Router（前端路由）
 * - 註冊 Pinia（狀態管理）並啟用持久化外掛
 * - 全域導航守衛：未登入時訪問主區塊會導向登入頁
 * - 引入 Bootstrap、Font Awesome、全域樣式與 JS
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './router';
import { userMayAccessRoute } from './router/permissions.js';
import { useAuthStore } from './stores/authStore.js';

/* 第三方樣式與全域樣式 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './assets/css/common.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

// Pinia 須在 Router 之前註冊，navigation guard 內的 useAuthStore 才能正確讀到 persist 還原後的 user
app.use(pinia);
app.use(router);

/**
 * 全域路由守衛：主區塊與 /exam 需登入；依 user_type 限制可進入的路由（學生不可直連無權限 path）
 * - 需登入：/exam、/main、/main/*
 * - user_type 3：僅 /exam、/main/analysis、/main/profile；其餘導向 /exam
 * - 未定義路徑：已登入 → /exam；未登入 → /login
 */
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  if (!to.matched.length) {
    next(authStore.user ? { path: '/exam', replace: true } : { path: '/login', replace: true });
    return;
  }

  const requiresAuth =
    to.name === 'Exam' || to.name === 'Main' || to.path === '/main' || to.path.startsWith('/main/');

  if (requiresAuth && !authStore.user) {
    next('/login');
    return;
  }
  if (requiresAuth && authStore.user && !userMayAccessRoute(authStore.user, to)) {
    next({ path: '/exam', replace: true });
    return;
  }
  next();
});

app.mount('#app');
