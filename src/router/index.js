/**
 * 路由：/login 登入頁；/main 為主頁，/main/:view 對應各功能（exam、答題分析、儀表板等）。
 */
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import HomeView from '../views/HomeView.vue';

/** 允許的 view 路徑（網址用） */
const VALID_VIEWS = ['work', 'answer-analysis', 'dashboard', 'profile', 'create-rag', 'users'];

/** 各 view 的頁面標題 */
const VIEW_TITLES = {
  work: 'Exam - AIQuiz',
  'answer-analysis': '答題分析 - AIQuiz',
  dashboard: '儀表板 - AIQuiz',
  profile: '個資修改 - AIQuiz',
  'create-rag': '建立 RAG - AIQuiz',
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
    redirect: (to) => ({ path: '/exam', query: to.query }),
  },
  {
    path: '/exam',
    name: 'Exam',
    component: HomeView,
    meta: { title: 'Exam - AIQuiz' },
  },
  {
    path: '/main/:view',
    name: 'Main',
    component: HomeView,
    meta: { title: 'AIQuiz' },
    beforeEnter(to, _from, next) {
      if (VALID_VIEWS.includes(to.params.view)) return next();
      next({ path: '/exam', replace: true });
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
  } else if (to.meta.title) {
    document.title = to.meta.title;
  } else {
    document.title = 'AIQuiz';
  }
  next();
});

export default router;
