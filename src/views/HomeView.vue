<script>
  /**
   * HomeView - 標題 AIQuiz；右上角「工作」「儀表板」按鈕開啟 tab（工作可開多個）；tab 列可切換與個別關閉。
   */
  import { ref, computed, onMounted } from 'vue';
  import LoadingOverlay from '../components/LoadingOverlay.vue';
  import TestTab from '../tabs/TestTab.vue';
  import DashboardTab from '../tabs/DashboardTab.vue';
  import AnswerAnalysisTab from '../tabs/AnswerAnalysisTab.vue';
  import ProfileTab from '../tabs/ProfileTab.vue';
  import CreateRAGTab from '../tabs/CreateRAGTab.vue';
  import UserManagementTab from '../tabs/UserManagementTab.vue';
  import { useDataStore } from '../stores/dataStore.js';
  import { useAuthStore } from '../stores/authStore.js';

  const TAB_LABELS = { work: '試題', dashboard: '儀表板', answerAnalysis: '答題分析', profile: '個資修改', createRAG: '建立 RAG', userManagement: '使用者管理' };
  let tabIdSeq = 0;

  export default {
    name: 'HomeView',
    components: { LoadingOverlay, TestTab, DashboardTab, AnswerAnalysisTab, ProfileTab, CreateRAGTab, UserManagementTab },

    setup() {
      const dataStore = useDataStore();
      const authStore = useAuthStore();
      const tabs = ref([]);
      const activeTabId = ref(null);
      /** 右上角顯示：登入者 ID 與名稱 */
      const userAccount = computed(() => (authStore.user ? `ID ${authStore.user.user_id}` : '未登入'));
      const userName = computed(() => (authStore.user && authStore.user.name ? authStore.user.name : '—'));

      const hasOpenTabs = computed(() => tabs.value.length > 0);

      const openTab = (type) => {
        const id = `tab-${++tabIdSeq}`;
        tabs.value = [...tabs.value, { id, type }];
        activeTabId.value = id;
        if (type === 'work') dataStore.addWorkTab(id);
      };

      const switchTab = (id) => {
        if (tabs.value.some((t) => t.id === id)) activeTabId.value = id;
      };

      const closeTab = (id) => {
        const idx = tabs.value.findIndex((t) => t.id === id);
        if (idx === -1) return;
        const type = tabs.value[idx].type;
        tabs.value = tabs.value.filter((t) => t.id !== id);
        if (activeTabId.value === id) {
          const next = tabs.value[idx] ?? tabs.value[idx - 1];
          activeTabId.value = next ? next.id : null;
        }
        if (type === 'work') dataStore.removeWorkTab(id);
      };

      const tabLabel = (tab) =>
        tab.type === 'work'
          ? `試題 #${tab.id.replace(/^tab-/, '')}`
          : TAB_LABELS[tab.type];

      const draggedFromIndex = ref(null);
      const dropTargetIndex = ref(null);

      const onTabDragStart = (e, fromIndex) => {
        draggedFromIndex.value = fromIndex;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(fromIndex));
        e.dataTransfer.setData('application/json', JSON.stringify({ index: fromIndex }));
      };

      const onTabDragOver = (e, toIndex) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropTargetIndex.value = toIndex;
      };

      const onTabDragLeave = () => {
        dropTargetIndex.value = null;
      };

      const onTabDrop = (e, toIndex) => {
        e.preventDefault();
        dropTargetIndex.value = null;
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
        const list = [...tabs.value];
        const [item] = list.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        list.splice(insertIndex, 0, item);
        tabs.value = list;
        const orderedWorkIds = list.filter((t) => t.type === 'work').map((t) => t.id);
        dataStore.reorderWorkTabs(orderedWorkIds);
      };

      const onTabDragEnd = () => {
        draggedFromIndex.value = null;
        dropTargetIndex.value = null;
      };

      onMounted(() => {
        openTab('work');
      });

      return {
        tabs,
        activeTabId,
        hasOpenTabs,
        userAccount,
        userName,
        openTab,
        switchTab,
        closeTab,
        tabLabel,
        draggedFromIndex,
        dropTargetIndex,
        onTabDragStart,
        onTabDragOver,
        onTabDragLeave,
        onTabDrop,
        onTabDragEnd,
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
          <a class="navbar-brand" href="#">AIQuiz</a>
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
                <a class="nav-link active" aria-current="page" href="#" @click.prevent="openTab('work')">試題</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="openTab('answerAnalysis')">答題分析</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="openTab('dashboard')">儀表板</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="openTab('profile')">個資修改</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="openTab('createRAG')">建立 RAG</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" @click.prevent="openTab('userManagement')">使用者管理</a>
              </li>
              <li class="nav-item">
                <span class="text-muted small">{{ userAccount }} / {{ userName }}</span>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <template v-if="hasOpenTabs">
        <nav class="my-bgcolor-gray-100">
          <ul class="d-inline-flex nav nav-tabs">
            <li
              v-for="(tab, index) in tabs"
              :key="tab.id"
              class="nav-item my-tab-item"
              :class="{ 'my-tab-item-dragging': draggedFromIndex === index, 'my-tab-item-drop-target': dropTargetIndex === index }"
              draggable="true"
              @dragstart="onTabDragStart($event, index)"
              @dragover="onTabDragOver($event, index)"
              @dragleave="onTabDragLeave"
              @drop="onTabDrop($event, index)"
              @dragend="onTabDragEnd"
            >
              <div
                class="d-inline-flex align-items-center nav-link my-tab-head gap-1 py-2"
                :class="{ active: activeTabId === tab.id }"
              >
                <span @click="switchTab(tab.id)">{{ tabLabel(tab) }}</span>
                <button
                  type="button"
                  class="btn btn-link my-tab-close-btn border-0 text-muted p-0"
                  title="關閉此分頁"
                  @click.stop="closeTab(tab.id)"
                >
                  ×
                </button>
              </div>
            </li>
          </ul>
        </nav>

        <main class="flex-grow-1 overflow-hidden">
          <template v-for="tab in tabs" :key="tab.id">
            <div v-show="activeTabId === tab.id" class="h-100">
              <TestTab v-if="tab.type === 'work'" :tabId="tab.id" />
              <DashboardTab v-else-if="tab.type === 'dashboard'" />
              <AnswerAnalysisTab v-else-if="tab.type === 'answerAnalysis'" />
              <ProfileTab v-else-if="tab.type === 'profile'" />
              <CreateRAGTab v-else-if="tab.type === 'createRAG'" :tabId="tab.id" />
              <UserManagementTab v-else-if="tab.type === 'userManagement'" />
            </div>
          </template>
        </main>
      </template>
    </div>
  </div>
</template>
