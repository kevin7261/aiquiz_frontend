/**
 * Vue Router 設定 - 前端路由與頁面標題
 *
 * 路由結構：
 * - / → 重導向至 /login
 * - /login → 登入頁（LoginView）
 * - /exam → 測驗/工作區（HomeView，內部 currentView 為 work）
 * - /:view → 主區塊各功能（student-weakness-analysis、profile、create-test-bank、design、manage-users 等），由 HomeView 依 view 渲染
 * - /main、/main/:view → 舊網址相容，重導向至 /exam 或 /:view
 *
 * 主區塊與 /exam 需登入、依 user_type 限制路由（/logs 僅 user_type=1），見 main.js 的 router.beforeEach 與 permissions.js。
 */
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import HomeView from '../views/HomeView.vue';

/** 允許的 view 參數（對應 /:view 的網址片段，用於側邊選單） */
const VALID_VIEWS = [
  'work',
  'student-weakness-analysis',
  'student-answer-analysis',
  'profile',
  'create-test-bank',
  'create-english-test-bank',
  'design',
  'manage-users',
  'settings',
  'logs',
];

/** 各 view 對應的瀏覽器頁籤標題 */
const VIEW_TITLES = {
  work: '測驗 - MyQuiz.ai',
  'student-weakness-analysis': '作答弱點分析 - MyQuiz.ai',
  'student-answer-analysis': '學生作答分析 - MyQuiz.ai',
  profile: '設定 - MyQuiz.ai',
  'create-test-bank': '建立測驗題庫 - MyQuiz.ai',
  'create-english-test-bank': '建立英文測驗題庫 - MyQuiz.ai',
  design: 'UI 元件（Bootstrap） - MyQuiz.ai',
  'manage-users': '使用者管理 - MyQuiz.ai',
  settings: '系統設定 - MyQuiz.ai',
  logs: '系統 Log - MyQuiz.ai',
};

const routes = [
  { path: '/', redirect: '/login' },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { title: '登入 - MyQuiz.ai' },
  },
  {
    path: '/exam',
    name: 'Exam',
    component: HomeView,
    meta: { title: '測驗 - MyQuiz.ai' },
  },
  // 舊網址相容（書籤）：/main/... → 新路徑
  {
    path: '/main',
    redirect: (to) => ({ path: '/exam', query: to.query }),
  },
  {
    path: '/main/analysis',
    redirect: '/student-weakness-analysis',
  },
  {
    path: '/main/create-unit',
    redirect: '/create-test-bank',
  },
  {
    path: '/main/create-rag',
    redirect: '/create-test-bank',
  },
  {
    path: '/main/course-analysis',
    redirect: '/student-answer-analysis',
  },
  {
    path: '/main/:view',
    redirect: (to) => ({ path: `/${to.params.view}`, query: to.query }),
  },
  {
    path: '/analysis',
    redirect: '/student-weakness-analysis',
  },
  {
    path: '/create-unit',
    redirect: '/create-test-bank',
  },
  {
    path: '/create-rag',
    redirect: '/create-test-bank',
  },
  {
    path: '/course-analysis',
    redirect: '/student-answer-analysis',
  },
  {
    path: '/users',
    redirect: (to) => ({ path: '/manage-users', query: to.query }),
  },
  {
    path: '/user-management',
    redirect: (to) => ({ path: '/manage-users', query: to.query }),
  },
  {
    path: '/:view',
    name: 'Main',
    component: HomeView,
    meta: { title: 'MyQuiz.ai' },
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

/** 每次導航時依路由設定 document.title，方便書籤與多分頁辨識 */
router.beforeEach((to, _from, next) => {
  if (to.name === 'Main' && to.params.view && VIEW_TITLES[to.params.view]) {
    document.title = VIEW_TITLES[to.params.view];
  } else if (to.meta.title) {
    document.title = to.meta.title;
  } else {
    document.title = 'MyQuiz.ai';
  }
  next();
});

export default router;
