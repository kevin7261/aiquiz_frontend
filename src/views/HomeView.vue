<script>
  /**
   * HomeView - 主畫面一次只顯示一個功能，由網址 /main/:view 與導航列切換。
   */
  import { computed, onMounted } from 'vue';
  import { useRouter, useRoute } from 'vue-router';
  import LoadingOverlay from '../components/LoadingOverlay.vue';
  import TestPage from '../pages/TestPage.vue';
  import DashboardPage from '../pages/DashboardPage.vue';
  import AnswerAnalysisPage from '../pages/AnswerAnalysisPage.vue';
  import ProfilePage from '../pages/ProfilePage.vue';
  import CreateRAGPage from '../pages/CreateRAGPage.vue';
  import UserManagementPage from '../pages/UserManagementPage.vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { useAuthStore } from '../stores/authStore.js';

  const MAIN_WORK_TAB_ID = 'main';

  /** 網址 path 對應內部 view 類型 */
  const PATH_TO_VIEW = {
    work: 'work',
    'answer-analysis': 'answerAnalysis',
    dashboard: 'dashboard',
    profile: 'profile',
    'create-rag': 'createRAG',
    users: 'userManagement',
  };
  const VIEW_TO_PATH = Object.fromEntries(Object.entries(PATH_TO_VIEW).map(([k, v]) => [v, k]));

  export default {
    name: 'HomeView',
    components: { LoadingOverlay, TestPage, DashboardPage, AnswerAnalysisPage, ProfilePage, CreateRAGPage, UserManagementPage },

    setup() {
      const router = useRouter();
      const route = useRoute();
      const dataStore = useDataStore();
      const authStore = useAuthStore();
      /** 由網址 params.view 換算成內部類型，預設試題 */
      const currentView = computed(() => PATH_TO_VIEW[route.params.view] || 'work');
      const userAccount = computed(() => (authStore.user ? `ID ${authStore.user.user_id}` : '未登入'));
      const userName = computed(() => (authStore.user && authStore.user.name ? authStore.user.name : '—'));

      const setView = (type) => {
        const path = VIEW_TO_PATH[type] ?? 'work';
        if (route.params.view !== path) router.push(`/main/${path}`);
      };

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
                  to="/main/work"
                  class="nav-link"
                  active-class="active"
                  aria-current="page"
                >試題</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/answer-analysis"
                  class="nav-link"
                  active-class="active"
                >答題分析</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/dashboard"
                  class="nav-link"
                  active-class="active"
                >儀表板</router-link>
              </li>
              <li class="nav-item">
                <router-link
                  to="/main/profile"
                  class="nav-link"
                  active-class="active"
                >個資修改</router-link>
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
                  to="/main/users"
                  class="nav-link"
                  active-class="active"
                >使用者管理</router-link>
              </li>
              <li class="nav-item">
                <span class="text-muted small">{{ userAccount }} / {{ userName }}</span>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="onLogout">登出</a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <main class="flex-grow-1 overflow-hidden">
        <TestPage v-if="currentView === 'work'" :tabId="MAIN_WORK_TAB_ID" />
        <DashboardPage v-else-if="currentView === 'dashboard'" />
        <AnswerAnalysisPage v-else-if="currentView === 'answerAnalysis'" />
        <ProfilePage v-else-if="currentView === 'profile'" />
        <CreateRAGPage v-else-if="currentView === 'createRAG'" :tabId="MAIN_WORK_TAB_ID" />
        <UserManagementPage v-else-if="currentView === 'userManagement'" />
      </main>
    </div>
  </div>
</template>
