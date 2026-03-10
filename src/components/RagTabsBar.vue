<script setup>
/**
 * RagTabsBar - 建立 RAG 頁的分頁列
 *
 * 顯示：後端 RAG 列表（ragItems）+ 尚未儲存的「新增」分頁（newTabItems）+ 「+」按鈕。
 * 點選分頁會 emit update:activeTabId；點「+」會 emit add-new-tab。
 * 若 RAG 列表與新分頁皆空，僅顯示一個「+」按鈕以建立第一個 RAG。
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
});

const emit = defineEmits(['update:activeTabId', 'add-new-tab']);
</script>

<template>
  <div class="flex-shrink-0 bg-white">
    <div class="d-flex align-items-center px-4">
      <!-- 載入中僅顯示文字 -->
      <template v-if="ragListLoading">
        <span class="small text-secondary">載入中...</span>
      </template>
      <!-- 無任何分頁時只顯示一個「+」建立按鈕 -->
      <template v-else-if="ragItems.length === 0 && newTabItems.length === 0">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="createRagLoading"
          @click="emit('add-new-tab')"
        >
          {{ createRagLoading ? '建立中...' : '+' }}
        </button>
      </template>
      <!-- 有分頁時顯示 nav-tabs + 右側「+」按鈕 -->
      <template v-else>
        <ul class="nav nav-tabs">
          <li v-for="item in ragItems" :key="'rag-' + item._tabId" class="nav-item">
            <button
              type="button"
              class="nav-link"
              :class="{ active: activeTabId === item._tabId }"
              :aria-current="activeTabId === item._tabId ? 'page' : undefined"
              @click="emit('update:activeTabId', item._tabId)"
            >
              {{ item._label }}
            </button>
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
          <li class="nav-item ms-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary"
              :disabled="createRagLoading"
              @click="emit('add-new-tab')"
            >
              {{ createRagLoading ? '建立中...' : '+' }}
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
