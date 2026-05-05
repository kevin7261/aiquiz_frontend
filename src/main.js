/**
 * MyQuiz.ai 前端應用程式入口
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

// Pinia 須在 Router 之前註冊；並在掛載 router 前先建立 auth store，讓 persistedstate 同步從 localStorage 還原。
// 否則首輪 beforeEach 可能在 store 尚未 hydrate 時讀到 user === null，誤判未登入而導向 /login（像「自動登出」）。
app.use(pinia);
useAuthStore();
app.use(router);

/**
 * 全域路由守衛：主區塊與 /exam 需登入；依 user_type 限制可進入的路由（學生不可直連無權限 path）
 * - 需登入：/exam、以及 name 為 Main 的 /:view（如 /manage-users、/profile）
 * - 舊網址 /main、/main/* 仍會觸發登入檢查後再重導向
 * - user_type 3：測驗／作答弱點分析／建立測驗題庫／設定（/exam、/student-weakness-analysis、/create-exam-bank、/profile）；其餘導向 /exam
 * - /logs（系統 Log）：僅 user_type 1；其餘導向 /exam
 * - 未定義路徑：已登入 → /exam；未登入 → /login
 */
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  if (to.name === 'Login' && authStore.user) {
    next({ path: '/exam', replace: true });
    return;
  }

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
