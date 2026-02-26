/**
 * 應用程式入口：建立 Vue app、註冊 router 與 pinia、引入樣式與 Bootstrap、掛載 #app。
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/authStore.js';

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './assets/css/common.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(router);
app.use(pinia);

router.beforeEach((to, _from, next) => {
  const isMainArea = to.name === 'Main' || to.path === '/main' || to.path.startsWith('/main/');
  if (isMainArea && !useAuthStore().user) {
    next('/login');
    return;
  }
  next();
});

app.mount('#app');
