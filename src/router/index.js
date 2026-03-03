/**
 * 路由：/login 登入頁；/main 為主頁，/main/:view 對應各功能（試題、答題分析、儀表板等）。
 */
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import HomeView from '../views/HomeView.vue';

/** 允許的 view 路徑（網址用） */
const VALID_VIEWS = ['work', 'answer-analysis', 'dashboard', 'profile', 'create-rag-zip', 'users'];

/** 各 view 的頁面標題 */
const VIEW_TITLES = {
  work: '試題 - AIQuiz',
  'answer-analysis': '答題分析 - AIQuiz',
  dashboard: '儀表板 - AIQuiz',
  profile: '個資修改 - AIQuiz',
  'create-rag-zip': '建立 RAG - AIQuiz',
  users: '使用者管理 - AIQuiz',
};

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
    redirect: (to) => ({ path: '/main/work', query: to.query }),
  },
  {
    path: '/main/:view',
    name: 'Main',
    component: HomeView,
    meta: { title: 'AIQuiz' },
    beforeEnter(to, _from, next) {
      if (VALID_VIEWS.includes(to.params.view)) return next();
      next({ path: '/main/work', replace: true });
    },
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
  if (to.name === 'Main' && to.params.view && VIEW_TITLES[to.params.view]) {
    document.title = VIEW_TITLES[to.params.view];
  } else {
    document.title = to.meta.title ? `${to.meta.title}` : 'AIQuiz';
  }
  next();
});

export default router;
