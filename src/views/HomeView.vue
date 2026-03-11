<script>
  /**
   * HomeView - 登入後的主畫面
   *
   * 職責：
   * - 左側選單：測驗、個人測驗分析、建立 RAG、課程測驗分析、使用者管理、系統設定、個資修改、登出
   * - 依 route.path / route.params.view 決定 currentView，只渲染對應的一個頁面組件
   * - /exam 對應 work（ExamPage），/main/:view 對應 analysis / createRAG 等
   * - onMounted 時在 dataStore 註冊一個工作分頁（MAIN_WORK_TAB_ID）供 Exam 使用
   */
  import { computed, onMounted } from 'vue';
  import { useRouter, useRoute } from 'vue-router';
  import LoadingOverlay from '../components/LoadingOverlay.vue';
  import LeftView from './LeftView.vue';
  import RightView from './RightView.vue';
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
    components: { LoadingOverlay, LeftView, RightView },

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
      /** 1=系統開發者 2=課程管理者 3=學生；用於 LeftView 選單權限 */
      const userType = computed(() => {
        const ut = authStore.user?.user_type;
        return ut === 1 || ut === 2 || ut === 3 ? ut : 3;
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
        userType,
        setView,
        onLogout,
      };
    },
  };
</script>

<template>
  <div class="container-fluid h-100 p-0 d-flex flex-column">
    <LoadingOverlay
      :isVisible="false"
      loadingText="載入中..."
      :progress="0"
      :showProgress="false"
      subText=""
    />

    <div class="row h-100 g-0 home-layout">
      <div class="col-4 col-lg-3 col-xl-2 col-xxl-2 h-100 overflow-hidden">
        <LeftView
          :user-account="userAccount"
          :user-name="userName"
          :user-type-label="userTypeLabel"
          :user-type="userType"
          @logout="onLogout"
        />
      </div>
      <div class="col-8 col-lg-9 col-xl-10 col-xxl-10 h-100 overflow-hidden d-flex flex-column">
        <RightView :current-view="currentView" :tab-id="MAIN_WORK_TAB_ID" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-layout {
  min-height: 0;
  flex: 1 1 0;
}
</style>
