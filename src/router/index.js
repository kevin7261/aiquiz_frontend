/**
 * Vue Router 設定 - 前端路由與頁面標題
 *
 * 路由結構：
 * - / → 重導向至 /login
 * - /login → 登入頁（LoginView）
 * - /main → 重導向至 /exam（保留 query）
 * - /exam → 試卷/工作區（HomeView，等同 /main/work）
 * - /main/:view → 主區塊各功能（student-weakness-analysis、profile、create-test-bank 等），由 HomeView 依 view 渲染
 *
 * 主區塊與 /exam 需登入、依 user_type 限制路由，見 main.js 的 router.beforeEach 與 permissions.js。
 */
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import HomeView from '../views/HomeView.vue';

/** 允許的 view 參數（對應 /main/:view 的網址片段，用於側邊選單） */
const VALID_VIEWS = [
  'work',
  'student-weakness-analysis',
  'student-answer-analysis',
  'profile',
  'create-test-bank',
  'users',
  'settings',
];

/** 各 view 對應的瀏覽器頁籤標題 */
const VIEW_TITLES = {
  work: '試卷 - AIQuiz',
  'student-weakness-analysis': '作答弱點分析 - AIQuiz',
  'student-answer-analysis': '學生作答分析 - AIQuiz',
  profile: '設定 - AIQuiz',
  'create-test-bank': '建立測試題庫 - AIQuiz',
  users: '使用者管理 - AIQuiz',
  settings: '系統設定 - AIQuiz',
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
    meta: { title: '試卷 - AIQuiz' },
  },
  {
    path: '/main/analysis',
    redirect: '/main/student-weakness-analysis',
  },
  {
    path: '/main/create-unit',
    redirect: '/main/create-test-bank',
  },
  {
    path: '/main/create-rag',
    redirect: '/main/create-test-bank',
  },
  {
    path: '/main/course-analysis',
    redirect: '/main/student-answer-analysis',
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

/** 每次導航時依路由設定 document.title，方便書籤與多分頁辨識 */
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
