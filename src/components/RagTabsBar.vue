<script setup>
/**
 * RagTabsBar - 建立 RAG 頁的分頁列
 *
 * 顯示：後端 RAG 列表（ragItems）+ 尚未儲存的「新增」分頁（newTabItems）+ Font Awesome「+」按鈕。
 * 點選分頁會 emit update:activeTabId；點新增鈕會 emit add-new-tab。
 * 已儲存的 ragItems：僅當前選中分頁顯示筆（rename-tab）與刪除（delete-rag，× 圖示）；試卷用 RAG（_isExamRag）僅綠點、無刪除；newTabItems 無筆／刪除。
 * 若 RAG 列表與新分頁皆空，僅顯示新增（fa-plus）按鈕以建立第一個 RAG。
 * 下方可顯示 ragListError、createRagError 警告/錯誤訊息。
 */
defineProps({
  /** 後端 RAG 項目，每項需有 _tabId、_label（由父層從 ragList 轉換） */
  ragItems: { type: Array, default: () => [] },
  /** 尚未寫入後端的「新增」分頁，每項需有 id、label */
  newTabItems: { type: Array, default: () => [] },
  /** 目前選中的分頁 id（v-model 用） */
  activeTabId: { type: [String, Number], default: null },
  /** 是否正在載入 RAG 列表 */
  ragListLoading: { type: Boolean, default: false },
  /** 是否正在建立新 RAG（按新增鈕後） */
  createRagLoading: { type: Boolean, default: false },
  /** RAG 列表載入失敗訊息 */
  ragListError: { type: String, default: '' },
  /** 建立 RAG 失敗訊息 */
  createRagError: { type: String, default: '' },
  /** 刪除 RAG 請求進行中（禁用各分頁 ×） */
  deleteRagLoading: { type: Boolean, default: false },
  /** 重新命名請求進行中（禁用筆與 ×） */
  renameTabLoading: { type: Boolean, default: false },
  /** 為 true 時不因載入狀態禁用新增鈕與分頁操作按鈕（介面稿頁用） */
  relaxButtonDisables: { type: Boolean, default: false },
  /** 與 UI 元件參考深色底＋04 藍色按鈕一致（建立測驗題庫設計稿用） */
  designChrome: { type: Boolean, default: false },
});

const emit = defineEmits(['update:activeTabId', 'add-new-tab', 'delete-rag', 'rename-tab']);
</script>

<template>
  <div
    class="flex-shrink-0"
    :class="[
      designChrome ? 'my-rag-tabs-bar--design my-bgcolor-black border-bottom' : 'bg-white',
    ]"
  >
    <div
      class="d-flex justify-content-center w-100 px-4"
      :class="[
        designChrome ? 'align-items-end pb-0' : 'align-items-center border-bottom border-secondary-subtle',
      ]"
    >
      <!-- 載入中僅顯示文字 -->
      <template v-if="ragListLoading">
        <span class="my-font-sm-400" :class="designChrome ? 'my-color-gray-light' : 'text-secondary'">載入中...</span>
      </template>
      <!-- 無任何分頁時只顯示新增鈕（fa-plus；上下留白，避免貼齊底線） -->
      <template v-else-if="ragItems.length === 0 && newTabItems.length === 0">
        <div
          class="w-100 d-flex justify-content-center"
          :class="designChrome ? 'py-0' : 'py-2'"
        >
          <button
            type="button"
            class="btn rounded-circle d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless my-btn-circle"
            title="新增分頁"
            :aria-label="createRagLoading ? '建立中' : '新增分頁'"
            :aria-busy="createRagLoading"
            :disabled="relaxButtonDisables ? false : createRagLoading"
            @click="emit('add-new-tab')"
          >
            <i
              class="fa-solid"
              :class="createRagLoading ? 'fa-spinner fa-spin' : 'fa-plus'"
              aria-hidden="true"
            />
          </button>
        </div>
      </template>
      <!-- 有分頁時顯示 nav-tabs + 右側新增鈕（與底線留距，不貼齊） -->
      <template v-else>
        <ul class="nav nav-tabs border-bottom-0">
          <li v-for="item in ragItems" :key="'rag-' + item._tabId" class="nav-item">
            <div
              role="tab"
              class="nav-link d-flex align-items-center gap-1"
              :class="{ active: activeTabId === item._tabId }"
              :aria-current="activeTabId === item._tabId ? 'page' : undefined"
            >
              <span
                class="flex-grow-1 text-start"
                style="cursor: pointer;"
                @click="emit('update:activeTabId', item._tabId)"
              >
                {{ item._label }}
              </span>
              <button
                v-if="activeTabId === item._tabId"
                type="button"
                :class="[
                  'btn btn-link text-decoration-none my-tab-nav-action-btn p-0',
                  designChrome ? 'my-color-gray-light' : 'text-muted',
                ]"
                title="重新命名分頁"
                :disabled="relaxButtonDisables ? false : deleteRagLoading || renameTabLoading"
                @click.stop="emit('rename-tab', item._tabId)"
              >
                <i class="fa-solid fa-pen" aria-hidden="true" />
              </button>
              <span
                v-if="item._isExamRag"
                class="d-inline-flex align-items-center justify-content-center flex-shrink-0"
                style="min-width: 1.25rem; line-height: 1;"
                title="試卷用題庫"
                role="img"
              >
                <span
                  class="rounded-circle d-inline-block"
                  :class="designChrome ? 'my-bgcolor-blue' : 'bg-success'"
                  style="width: 0.5rem; height: 0.5rem;"
                />
              </span>
              <button
                v-else-if="activeTabId === item._tabId"
                type="button"
                :class="[
                  'btn btn-link text-decoration-none my-tab-nav-action-btn p-0',
                  designChrome ? 'my-color-gray-light' : 'text-muted',
                ]"
                title="刪除此出題單元"
                :disabled="relaxButtonDisables ? false : deleteRagLoading || renameTabLoading"
                @click.stop="emit('delete-rag', item._tabId)"
              >
                <i class="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
          </li>
          <li v-for="item in newTabItems" :key="'new-' + item.id" class="nav-item">
            <button
              type="button"
              class="nav-link"
              :class="{ active: activeTabId === item.id }"
              :aria-current="activeTabId === item.id ? 'page' : undefined"
              @click="emit('update:activeTabId', item.id)"
            >
              {{ item.label }}
            </button>
          </li>
          <li class="nav-item d-flex align-items-center ms-2">
            <button
              type="button"
              title="新增分頁"
              :aria-label="createRagLoading ? '建立中' : '新增分頁'"
              :aria-busy="createRagLoading"
              :class="[
                'btn rounded-circle d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless my-btn-circle',
                designChrome ? '' : 'mb-2',
              ]"
              :disabled="relaxButtonDisables ? false : createRagLoading"
              @click="emit('add-new-tab')"
            >
              <i
                class="fa-solid"
                :class="createRagLoading ? 'fa-spinner fa-spin' : 'fa-plus'"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </template>
    </div>
    <!-- 列表載入錯誤（例如網路問題） -->
    <div v-if="ragListError" class="alert alert-warning my-font-sm-400 py-2 mx-4 mb-3">
      {{ ragListError }}
    </div>
    <!-- 建立 RAG 失敗（例如後端驗證錯誤） -->
    <div v-if="createRagError" class="alert alert-danger my-font-sm-400 py-2 mx-4 mb-3">
      {{ createRagError }}
    </div>
  </div>
</template>

<style scoped>
/* 分頁：取消 active 塊狀底色；選中僅底線為主色（不覆寫字色、字重、間距與版面位置） */
.nav-tabs {
  border-bottom: none !important;
}

/* 不要出現在分頁文字上方的橫線（Bootstrap nav-tabs 預設上邊框／圓角） */
.nav-tabs .nav-link {
  border-top: none !important;
  border-top-left-radius: 0 !important;
  border-top-right-radius: 0 !important;
}

.nav-tabs .nav-link.active,
.nav-tabs .nav-link.active:hover,
.nav-tabs .nav-link.active:focus,
.nav-tabs .nav-link.active:focus-visible {
  background-color: transparent !important;
  border-top-color: transparent !important;
  border-left-color: transparent !important;
  border-right-color: transparent !important;
  border-bottom-color: var(--my-color-blue) !important;
}

.my-rag-tabs-bar--design .nav-tabs .nav-link {
  color: var(--my-color-gray-light);
}
.my-rag-tabs-bar--design .nav-tabs .nav-link.active {
  color: var(--my-color-white);
}
.my-rag-tabs-bar--design .nav-tabs .nav-link.active,
.my-rag-tabs-bar--design .nav-tabs .nav-link.active:hover,
.my-rag-tabs-bar--design .nav-tabs .nav-link.active:focus,
.my-rag-tabs-bar--design .nav-tabs .nav-link.active:focus-visible {
  border-bottom-color: var(--my-color-blue) !important;
}

/* 設計稿：分頁底緣與外層底線之間不留空隙 */
.my-rag-tabs-bar--design .nav-tabs {
  margin-bottom: 0 !important;
}
.my-rag-tabs-bar--design .nav-tabs .nav-link {
  padding-bottom: 0.25rem;
  margin-bottom: 0;
}
.my-rag-tabs-bar--design .nav-item {
  margin-bottom: 0 !important;
}

/* 頁籤筆／刪除：同外框與圖示字級（略小），字級設在 .fa-solid 以免與 .btn-link 預設字級牽制 */
.my-tab-nav-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  min-width: 0.875rem;
  height: 0.875rem;
  padding: 0 !important;
  line-height: 1;
}
.my-tab-nav-action-btn :deep(.fa-solid) {
  font-size: var(--my-font-size-sm);
  line-height: 1;
  width: 1em;
  height: 1em;
}
</style>
