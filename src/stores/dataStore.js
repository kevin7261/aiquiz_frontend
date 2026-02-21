/**
 * Pinia store。工作分頁列表存每個 WorkTab 的內容。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * 單一工作分頁內容的預設結構（可擴充）。
 * @typedef {{ id: string, state: string }} WorkTabEntry
 */
function defaultWorkTabEntry(id) {
  return {
    id,
    state: '準備中',
  };
}

export const useDataStore = defineStore(
  'data',
  () => {
    /** @type {import('vue').Ref<Array<{ id: string, state: string }>>} 每個工作分頁的內容列表 */
    const workTabs = ref([]);

    const workTabIds = computed(() => workTabs.value.map((t) => t.id));

    /** 新增一筆工作分頁內容（開新工作分頁時呼叫） */
    function addWorkTab(id) {
      if (workTabs.value.some((t) => t.id === id)) return;
      workTabs.value = [...workTabs.value, defaultWorkTabEntry(id)];
    }

    /** 移除指定 id 的工作分頁內容（關閉分頁時呼叫） */
    function removeWorkTab(id) {
      workTabs.value = workTabs.value.filter((t) => t.id !== id);
    }

    /** 取得指定 id 的內容，無則回傳 undefined */
    function getWorkTab(id) {
      return workTabs.value.find((t) => t.id === id);
    }

    /** 更新指定 id 的內容（淺層合併） */
    function updateWorkTab(id, patch) {
      const idx = workTabs.value.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const list = [...workTabs.value];
      list[idx] = { ...list[idx], ...patch };
      workTabs.value = list;
    }

    /** 依 id 順序重排 workTabs（拖曳排序後呼叫） */
    function reorderWorkTabs(orderedIds) {
      const idSet = new Set(orderedIds);
      const ordered = orderedIds
        .map((id) => workTabs.value.find((t) => t.id === id))
        .filter(Boolean);
      const rest = workTabs.value.filter((t) => !idSet.has(t.id));
      workTabs.value = [...ordered, ...rest];
    }

    return {
      workTabs,
      workTabIds,
      addWorkTab,
      removeWorkTab,
      getWorkTab,
      updateWorkTab,
      reorderWorkTabs,
    };
  },
  { persist: true }
);
