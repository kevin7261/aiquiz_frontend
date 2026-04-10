<script>
  /**
   * HomeView - 登入後的主畫面
   *
   * 職責：
   * - 左側選單：測驗、作答弱點分析；其餘項目與登出在使用者名下拉選單
   * - 依 route.path / route.params.view 決定 currentView，只渲染對應的一個頁面組件
   * - /exam 對應 work（ExamPage），/:view 對應 student-weakness-analysis / create-test-bank（建立測驗題庫頁）等
   * - onMounted 時在 dataStore 註冊一個工作分頁（MAIN_WORK_TAB_ID）供 Exam 使用
   */
  import { computed, onMounted, watch } from 'vue';
  import { useRouter, useRoute } from 'vue-router';
  import LoadingOverlay from '../components/LoadingOverlay.vue';
  import LeftView from './LeftView.vue';
  import RightView from './RightView.vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { useAuthStore } from '../stores/authStore.js';
  import { userMayAccessRoute } from '../router/permissions.js';

  /** Exam 頁使用的固定分頁 id（與 dataStore workTabs 對應） */
  const MAIN_WORK_TAB_ID = 'main';

  /** 網址 params.view 對應內部 currentView 類型 */
  const PATH_TO_VIEW = {
    work: 'work',
    'student-weakness-analysis': 'studentWeaknessAnalysis',
    'student-answer-analysis': 'studentAnswerAnalysis',
    profile: 'profile',
    'create-test-bank': 'createExamQuizBank',
    design: 'designPage',
    'manage-users': 'userManagement',
    settings: 'systemSettings',
    logs: 'logList',
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
      /** 目前要顯示的區塊：work | studentWeaknessAnalysis | studentAnswerAnalysis | profile | createExamQuizBank | designPage | userManagement | systemSettings | logList */
      const currentView = computed(() => {
        if (route.path === '/exam') return 'work';
        return PATH_TO_VIEW[route.params.view] || 'work';
      });
      const userName = computed(() => (authStore.user && authStore.user.name ? authStore.user.name : '—'));

      /** 切換顯示區塊（由導覽連結或程式呼叫）；work 導向 /exam，其餘導向 /:view */
      const setView = (type) => {
        if (type === 'work') {
          if (route.path !== '/exam') router.push('/exam');
          return;
        }
        const path = VIEW_TO_PATH[type] ?? 'work';
        if (route.params.view !== path) router.push(`/${path}`);
      };

      /** 登出：清空 authStore 並導向 /login */
      const onLogout = () => {
        authStore.logout();
        router.push('/login');
      };

      onMounted(() => {
        dataStore.addWorkTab(MAIN_WORK_TAB_ID);
      });

      /** 與全域守衛雙重確認：若仍落在無權限路由（例如狀態還原時序），強制導向 /exam */
      watch(
        () => [route.fullPath, authStore.user],
        () => {
          if (!authStore.user) return;
          if (!userMayAccessRoute(authStore.user, route)) {
            router.replace({ path: '/exam', replace: true });
          }
        },
        { immediate: true }
      );

      return {
        currentView,
        MAIN_WORK_TAB_ID,
        userName,
        authStore,
        setView,
        onLogout,
      };
    },
  };
</script>

<template>
  <div class="container-fluid h-100 d-flex flex-column p-0">
    <LoadingOverlay
      :isVisible="false"
      loadingText="載入中..."
      :progress="0"
      :showProgress="false"
      subText=""
    />

    <div class="row h-100 g-0 my-home-layout">
      <div class="col-4 col-md-3 col-lg-2 h-100 overflow-hidden">
        <LeftView
          :user-name="userName"
          :user-type="authStore.user?.user_type"
          @logout="onLogout"
        />
      </div>
      <div class="col-8 col-md-9 col-lg-10 h-100 overflow-hidden d-flex flex-column">
        <RightView :current-view="currentView" :tab-id="MAIN_WORK_TAB_ID" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-home-layout {
  min-height: 0;
  flex: 1 1 0;
}
</style>
