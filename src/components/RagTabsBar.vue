<script setup>
/**
 * 建立 RAG 頁的 tab 列：rag 列表 + 新增 tab + 錯誤訊息。
 */
defineProps({
  ragItems: { type: Array, default: () => [] },
  newTabItems: { type: Array, default: () => [] },
  activeTabId: { type: [String, Number], default: null },
  ragListLoading: { type: Boolean, default: false },
  createRagLoading: { type: Boolean, default: false },
  ragListError: { type: String, default: '' },
  createRagError: { type: String, default: '' },
});

const emit = defineEmits(['update:activeTabId', 'add-new-tab']);
</script>

<template>
  <div class="flex-shrink-0 bg-white">
    <div class="d-flex align-items-center px-4">
      <template v-if="ragListLoading">
        <span class="small text-secondary">載入中...</span>
      </template>
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
    <div v-if="ragListError" class="alert alert-warning py-2 small mx-4 mb-3">
      {{ ragListError }}
    </div>
    <div v-if="createRagError" class="alert alert-danger py-2 small mx-4 mb-3">
      {{ createRagError }}
    </div>
  </div>
</template>
