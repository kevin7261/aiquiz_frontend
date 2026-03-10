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
import { useAuthStore } from './stores/authStore.js';

/* 第三方樣式與全域樣式 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './assets/css/common.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(router);
app.use(pinia);

/**
 * 全域路由守衛：主區塊需登入
 * - 主區塊包含：路由名稱為 Main、路徑為 /main 或 /main/* 的頁面
 * - 若使用者未登入（authStore.user 為空），導向 /login
 */
router.beforeEach((to, _from, next) => {
  const isMainArea = to.name === 'Main' || to.path === '/main' || to.path.startsWith('/main/');
  if (isMainArea && !useAuthStore().user) {
    next('/login');
    return;
  }
  next();
});

app.mount('#app');
