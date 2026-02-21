/**
 * 路由：/login 登入頁、/main 主頁；/ 不再使用。
 */
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import HomeView from '../views/HomeView.vue';

const routes = [
  { path: '/', redirect: '/login' },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { title: '登入 - AIQuiz' },
  },
  {
    path: '/main',
    name: 'Main',
    component: HomeView,
    meta: { title: 'AIQuiz' },
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

router.beforeEach((to, _from, next) => {
  document.title = to.meta.title ? `${to.meta.title}` : 'AIQuiz';
  next();
});

export default router;
