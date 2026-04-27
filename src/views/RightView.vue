<script>
  /**
   * RightView - 主畫面右側內容區
   *
   * 職責：
   * - 依 currentView 渲染對應頁面：測驗、作答弱點分析、建立測驗題庫、建立英文測驗題庫（獨立元件）、學生作答分析等
   * - 使用 KeepAlive + 動態元件：切換左側選單時保留各頁 DOM／狀態（捲動、表單、分頁內容），避免 v-if 卸載導致重設
  */
  import { markRaw } from 'vue';
  import ExamPage from '../pages/ExamPage.vue';
  import AnswerWeaknessAnalysisPage from '../pages/AnswerWeaknessAnalysisPage.vue';
  import StudentAnswerAnalysisPage from '../pages/StudentAnswerAnalysisPage.vue';
  import ProfilePage from '../pages/ProfilePage.vue';
  import CreateExamQuizBankPage from '../pages/CreateExamQuizBankPage.vue';
  import CreateEnglishExamQuizBankPage from '../pages/CreateEnglishExamQuizBankPage.vue';
  import DesignPage from '../pages/DesignPage.vue';
  import UserManagementPage from '../pages/UserManagementPage.vue';
  import SystemSettingsPage from '../pages/SystemSettingsPage.vue';
  import LogListPage from '../pages/LogListPage.vue';

  /** 與 HomeView currentView 鍵一致；markRaw 避免把元件選項做成深度 reactive */
  const VIEW_COMPONENTS = {
    work: markRaw(ExamPage),
    studentWeaknessAnalysis: markRaw(AnswerWeaknessAnalysisPage),
    studentAnswerAnalysis: markRaw(StudentAnswerAnalysisPage),
    profile: markRaw(ProfilePage),
    createExamQuizBank: markRaw(CreateExamQuizBankPage),
    createEnglishExamQuizBank: markRaw(CreateEnglishExamQuizBankPage),
    designPage: markRaw(DesignPage),
    userManagement: markRaw(UserManagementPage),
    systemSettings: markRaw(SystemSettingsPage),
    logList: markRaw(LogListPage),
  };

  const VIEWS_WITH_WORK_TAB_ID = new Set([
    'work',
    'createExamQuizBank',
    'createEnglishExamQuizBank',
    'designPage',
  ]);

  export default {
    name: 'RightView',
    components: { ExamPage, AnswerWeaknessAnalysisPage, StudentAnswerAnalysisPage, ProfilePage, CreateExamQuizBankPage, CreateEnglishExamQuizBankPage, DesignPage, UserManagementPage, SystemSettingsPage, LogListPage },
    props: {
      currentView: { type: String, required: true },
      tabId: { type: String, required: true },
    },
    computed: {
      activePageComponent() {
        return VIEW_COMPONENTS[this.currentView] ?? ExamPage;
      },
      activePageProps() {
        if (VIEWS_WITH_WORK_TAB_ID.has(this.currentView)) {
          return { tabId: this.tabId };
        }
        return {};
      },
    },
  };
</script>

<template>
  <main class="my-right-view flex-grow-1 overflow-hidden d-flex flex-column">
    <KeepAlive :max="12">
      <component
        :is="activePageComponent"
        :key="currentView"
        v-bind="activePageProps"
      />
    </KeepAlive>
  </main>
</template>

<style scoped>
.my-right-view {
  min-height: 0;
  min-width: 0;
}
</style>
