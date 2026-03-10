/**
 * 工作分頁資料 Store（Pinia）
 *
 * 職責：
 * - 存放「工作分頁」列表（Exam 頁每個測驗分頁的 id 與 state 等）
 * - 提供新增、移除、取得、更新、依 id 順序重排，供 Exam 頁分頁列使用
 * - 啟用 persist，分頁順序與狀態在重新整理後保留
 *
 * WorkTabEntry 結構：{ id, state }，可依需求擴充其他欄位
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * 單一工作分頁內容的預設結構（可擴充）。
 * @typedef {{ id: string, state: string }} WorkTabEntry
 * @param {string} id - 分頁唯一 id（通常為 exam_tab_id 或類似）
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
    /** @type {import('vue').Ref<Array<{ id: string, state: string }>>} 每個工作分頁的內容列表，順序即分頁顯示順序 */
    const workTabs = ref([]);

    /** 目前所有工作分頁的 id 陣列（用於 v-for 與拖曳排序） */
    const workTabIds = computed(() => workTabs.value.map((t) => t.id));

    /**
     * 新增一筆工作分頁（開新測驗分頁時呼叫）
     * @param {string} id - 分頁 id，若已存在則不重複新增
     */
    function addWorkTab(id) {
      if (workTabs.value.some((t) => t.id === id)) return;
      workTabs.value = [...workTabs.value, defaultWorkTabEntry(id)];
    }

    /**
     * 移除指定 id 的工作分頁（關閉分頁時呼叫）
     * @param {string} id - 要移除的分頁 id
     */
    function removeWorkTab(id) {
      workTabs.value = workTabs.value.filter((t) => t.id !== id);
    }

    /**
     * 取得指定 id 的分頁內容
     * @param {string} id - 分頁 id
     * @returns {WorkTabEntry | undefined}
     */
    function getWorkTab(id) {
      return workTabs.value.find((t) => t.id === id);
    }

    /**
     * 更新指定 id 的分頁內容（淺層合併，不覆蓋未傳入的欄位）
     * @param {string} id - 分頁 id
     * @param {Partial<WorkTabEntry>} patch - 要合併的欄位
     */
    function updateWorkTab(id, patch) {
      const idx = workTabs.value.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const list = [...workTabs.value];
      list[idx] = { ...list[idx], ...patch };
      workTabs.value = list;
    }

    /**
     * 依給定的 id 順序重排 workTabs（拖曳排序後呼叫）
     * @param {string[]} orderedIds - 新的 id 順序
     */
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
