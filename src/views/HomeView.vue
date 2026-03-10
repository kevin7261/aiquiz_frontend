<script>
  /**
   * HomeView - 登入後的主畫面
   *
   * 職責：
   * - 頂部導覽列：測驗、個人分析、建立 RAG、課程分析、使用者管理、系統設定、個資修改、登出
   * - 依 route.path / route.params.view 決定 currentView，只渲染對應的一個頁面組件
   * - /exam 對應 work（ExamPage），/main/:view 對應 analysis / createRAG 等
   * - onMounted 時在 dataStore 註冊一個工作分頁（MAIN_WORK_TAB_ID）供 Exam 使用
   */
  import { computed, onMounted } from 'vue';
  import { useRouter, useRoute } from 'vue-router';
  import LoadingOverlay from '../components/LoadingOverlay.vue';
  import ExamPage from '../pages/ExamPage.vue';
  import AnalysisPage from '../pages/AnalysisPage.vue';
  import CourseAnalysisPage from '../pages/CourseAnalysisPage.vue';
  import ProfilePage from '../pages/ProfilePage.vue';
  import CreateRAG from '../pages/CreateRAG.vue';
  import UserManagementPage from '../pages/UserManagementPage.vue';
  import SystemSettingsPage from '../pages/SystemSettingsPage.vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { useAuthStore } from '../stores/authStore.js';

  /** Exam 頁使用的固定分頁 id（與 dataStore workTabs 對應） */
  const MAIN_WORK_TAB_ID = 'main';

  /** 網址 params.view 對應內部 currentView 類型 */
  const PATH_TO_VIEW = {
    work: 'work',
    'analysis': 'analysis',
    'course-analysis': 'courseAnalysis',
    profile: 'profile',
    'create-rag': 'createRAG',
    users: 'userManagement',
    settings: 'systemSettings',
  };
  const VIEW_TO_PATH = Object.fromEntries(Object.entries(PATH_TO_VIEW).map(([k, v]) => [v, k]));

  export default {
    name: 'HomeView',
    components: { LoadingOverlay, ExamPage, AnalysisPage, CourseAnalysisPage, ProfilePage, CreateRAG, UserManagementPage, SystemSettingsPage },

    setup() {
      const router = useRouter();
      const route = useRoute();
      const dataStore = useDataStore();
      const authStore = useAuthStore();
      /** 目前要顯示的區塊：work | analysis | courseAnalysis | profile | createRAG | userManagement | systemSettings */
      const currentView = computed(() => {
        if (route.path === '/exam') return 'work';
        return PATH_TO_VIEW[route.params.view] || 'work';
      });
      const userAccount = computed(() => (authStore.user ? `ID ${authStore.user.user_id}` : '未登入'));
      const userName = computed(() => (authStore.user && authStore.user.name ? authStore.user.name : '—'));
      /** user_type 對應中文：1=系統開發者 2=課程管理者 3=學生 */
      const USER_TYPE_LABELS = { 1: '系統開發者', 2: '課程管理者', 3: '學生' };
      const userTypeLabel = computed(() => {
        const ut = authStore.user?.user_type;
        return ut === 1 || ut === 2 || ut === 3 ? USER_TYPE_LABELS[ut] : (ut != null ? String(ut) : '—');
      });

      /** 切換顯示區塊（由導覽連結或程式呼叫）；work 導向 /exam，其餘導向 /main/:view */
      const setView = (type) => {
        if (type === 'work') {
          if (route.path !== '/exam') router.push('/exam');
          return;
        }
        const path = VIEW_TO_PATH[type] ?? 'work';
        if (route.params.view !== path) router.push(`/main/${path}`);
      };

      /** 登出：清空 authStore 並導向 /login */
      const onLogout = () => {
        authStore.logout();
        router.push('/login');
      };

      onMounted(() => {
        dataStore.addWorkTab(MAIN_WORK_TAB_ID);
      });

      return {
        currentView,
        MAIN_WORK_TAB_ID,
        userAccount,
        userName,
        userTypeLabel,
        setView,
        onLogout,
      };
    },
  };
</script>

<template>
  <div class="d-flex flex-column h-100">
    <LoadingOverlay
      :isVisible="false"
      loadingText="載入中..."
      :progress="0"
      :showProgress="false"
      subText=""
    />

    <div class="d-flex flex-column h-100">
      <nav class="navbar navbar-expand-lg navbar-light bg-light">
        <div class="container-fluid">
          <span class="navbar-brand mb-0">AIQuiz</span>
          <span v-if="userName" class="navbar-text ms-2">{{ userName }}</span>
          <button
            class="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarSupportedContent"
            aria-controls="navbarSupportedContent"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="align-items-center navbar-nav gap-2 ms-auto mb-2 mb-lg-0">
              <li class="nav-item">
                <router-link
                  to="/exam"
                  class="nav-link"
                  active-class="active"
                  aria-current="page"
                >測驗</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/analysis"
                  class="nav-link"
                  active-class="active"
                >個人分析</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/create-rag"
                  class="nav-link"
                  active-class="active"
                >建立 RAG</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/course-analysis"
                  class="nav-link"
                  active-class="active"
                >課程分析</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/users"
                  class="nav-link"
                  active-class="active"
                >使用者管理</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/settings"
                  class="nav-link"
                  active-class="active"
                >系統設定</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/profile"
                  class="nav-link"
                  active-class="active"
                >個資修改</router-link>
              </li>
              <li class="nav-item">
                <span class="text-muted small">{{ userAccount }} / {{ userName }} / {{ userTypeLabel }}</span>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="onLogout">登出</a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <main class="flex-grow-1 overflow-hidden">
        <ExamPage v-if="currentView === 'work'" :tabId="MAIN_WORK_TAB_ID" />
        <AnalysisPage v-else-if="currentView === 'analysis'" />
        <CourseAnalysisPage v-else-if="currentView === 'courseAnalysis'" />
        <ProfilePage v-else-if="currentView === 'profile'" />
        <CreateRAG v-else-if="currentView === 'createRAG'" :tabId="MAIN_WORK_TAB_ID" />
        <UserManagementPage v-else-if="currentView === 'userManagement'" />
        <SystemSettingsPage v-else-if="currentView === 'systemSettings'" />
      </main>
    </div>
  </div>
</template>
