<script setup>
/**
 * RagTabsBar - 建立 RAG 頁的分頁列
 *
 * 顯示：後端 RAG 列表（ragItems）+ 尚未儲存的「新增」分頁（newTabItems）+ 「+」按鈕。
 * 點選分頁會 emit update:activeTabId；點「+」會 emit add-new-tab。
 * 已儲存的 ragItems：僅當前選中分頁顯示筆（rename-tab）與刪除（delete-rag，× 圖示）；試卷用 RAG（_isExamRag）僅綠點、無刪除；newTabItems 無筆／刪除。
 * 若 RAG 列表與新分頁皆空，僅顯示「+ 新增」按鈕以建立第一個 RAG。
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
  /** 是否正在建立新 RAG（按「+」後） */
  createRagLoading: { type: Boolean, default: false },
  /** RAG 列表載入失敗訊息 */
  ragListError: { type: String, default: '' },
  /** 建立 RAG 失敗訊息 */
  createRagError: { type: String, default: '' },
  /** 刪除 RAG 請求進行中（禁用各分頁 ×） */
  deleteRagLoading: { type: Boolean, default: false },
  /** 重新命名請求進行中（禁用筆與 ×） */
  renameTabLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:activeTabId', 'add-new-tab', 'delete-rag', 'rename-tab']);
</script>

<template>
  <div class="flex-shrink-0 bg-white">
    <div class="d-flex align-items-center justify-content-center px-4 w-100 border-bottom border-secondary-subtle">
      <!-- 載入中僅顯示文字 -->
      <template v-if="ragListLoading">
        <span class="small text-secondary">載入中...</span>
      </template>
      <!-- 無任何分頁時只顯示「+ 新增」建立按鈕（上下留白，避免貼齊底線） -->
      <template v-else-if="ragItems.length === 0 && newTabItems.length === 0">
        <div class="w-100 d-flex justify-content-center py-2">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary bg-white"
            :disabled="createRagLoading"
            @click="emit('add-new-tab')"
          >
            {{ createRagLoading ? '建立中...' : '+ 新增' }}
          </button>
        </div>
      </template>
      <!-- 有分頁時顯示 nav-tabs + 右側「+ 新增」（與底線留距，不貼齊） -->
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
                class="btn btn-link btn-sm p-0 text-muted text-decoration-none tab-nav-action-btn"
                title="重新命名分頁"
                aria-label="重新命名分頁"
                :disabled="deleteRagLoading || renameTabLoading"
                @click.stop="emit('rename-tab', item._tabId)"
              >
                <i class="fa-solid fa-pen" aria-hidden="true" />
              </button>
              <span
                v-if="item._isExamRag"
                class="d-inline-flex align-items-center justify-content-center flex-shrink-0"
                style="min-width: 1.25rem; line-height: 1;"
                title="試卷用 RAG"
                role="img"
                aria-label="試卷用 RAG，無法由此刪除群組"
              >
                <span class="rounded-circle bg-success d-inline-block" style="width: 0.5rem; height: 0.5rem;" />
              </span>
              <button
                v-else-if="activeTabId === item._tabId"
                type="button"
                class="btn btn-link btn-sm p-0 text-muted text-decoration-none tab-nav-action-btn"
                title="刪除此出題單元"
                aria-label="刪除此出題單元"
                :disabled="deleteRagLoading || renameTabLoading"
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
          <li class="nav-item ms-2 d-flex align-items-center">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary bg-white mb-2"
              :disabled="createRagLoading"
              @click="emit('add-new-tab')"
            >
              {{ createRagLoading ? '建立中...' : '+ 新增' }}
            </button>
          </li>
        </ul>
      </template>
    </div>
    <!-- 列表載入錯誤（例如網路問題） -->
    <div v-if="ragListError" class="alert alert-warning py-2 small mx-4 mb-3">
      {{ ragListError }}
    </div>
    <!-- 建立 RAG 失敗（例如後端驗證錯誤） -->
    <div v-if="createRagError" class="alert alert-danger py-2 small mx-4 mb-3">
      {{ createRagError }}
    </div>
  </div>
</template>

<style scoped>
/* 頁籤筆／刪除：同外框與圖示字級（略小），避免與 .btn-sm 字級衝突故設在 .fa-solid） */
.tab-nav-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  min-width: 0.875rem;
  height: 0.875rem;
  padding: 0 !important;
  line-height: 1;
}
.tab-nav-action-btn :deep(.fa-solid) {
  font-size: 0.6875rem;
  line-height: 1;
  width: 1em;
  height: 1em;
}
</style>
