/**
 * Pack 虛擬資料夾（rag_list）Composable
 *
 * 職責：
 * - 從 currentState 與 fileMetadataToShow 衍生 secondFoldersFull、ragListDisplayGroups
 * - 拖曳事件：onDragStartTag、onDragOver、onDragLeave、onDropRagList
 * - 群組操作：removeFromRagList、removeRagListGroup、addRagListGroup、addAllSecondFoldersAsGroups
 * - 以 watch 同步 packTasks 字串與 packTasksList 陣列（parsePackTasksList / serializePackTasksList）
 */
import { computed, watch } from 'vue';
import { parsePackTasksList, serializePackTasksList } from '../utils/rag.js';

/**
 * @param {import('vue').Ref<object>} currentState - 目前 RAG tab 的狀態（含 packTasks、packTasksList、zipSecondFolders）
 * @param {import('vue').Ref<object>} fileMetadataToShow - 上傳 ZIP 後後端回傳的 file_metadata（含 second_folders）
 * @param {import('vue').Ref<boolean>} packAndGenerateDisabled - 為 true 時不允許 drop 等操作
 */
export function usePackTasks(currentState, fileMetadataToShow, packAndGenerateDisabled) {
  /** 第二層資料夾名稱列表（來自 ZIP 上傳回傳或 currentState） */
  const secondFoldersFull = computed(() => {
    const folders = fileMetadataToShow.value?.second_folders ?? currentState.value.zipSecondFolders ?? [];
    return Array.isArray(folders) ? folders : [];
  });

  /** 用於畫面的 rag_list 群組（二維陣列）；若無則依 second_folders 給一空群組 */
  const ragListDisplayGroups = computed(() => {
    const list = currentState.value.packTasksList ?? [];
    if (list.length > 0) return list;
    if (secondFoldersFull.value.length > 0) return [[]];
    return [];
  });

  /** 拖曳開始：寫入 dataTransfer 供 onDropRagList 讀取 */
  function onDragStartTag(e, folderName, fromRagList, groupIdx, tagIdx) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      folderName,
      fromRagList: !!fromRagList,
      groupIdx: fromRagList ? groupIdx : -1,
      tagIdx: fromRagList ? tagIdx : -1,
    }));
    e.dataTransfer.setData('text/plain', folderName);
  }

  /** 拖曳經過：允許 drop、顯示視覺回饋 */
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget?.classList?.add('bg-info-subtle', 'border-info');
  }

  /** 拖曳離開：移除視覺回饋 */
  function onDragLeave(e) {
    e.currentTarget?.classList?.remove('bg-info-subtle', 'border-info');
  }

  /** 放下：從 dataTransfer 讀取來源，更新 currentState.packTasksList */
  function onDropRagList(e, targetGroupIdx) {
    e.preventDefault();
    e.currentTarget?.classList?.remove('bg-info-subtle', 'border-info');
    if (packAndGenerateDisabled.value) return;
    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    } catch (_) {
      data = { folderName: e.dataTransfer.getData('text/plain') || '', fromRagList: false };
    }
    const folderName = (data.folderName || '').trim();
    if (!folderName) return;
    const state = currentState.value;
    let list = [...(state.packTasksList || [])];
    if (data.fromRagList && data.groupIdx >= 0) {
      const g = list[data.groupIdx];
      if (Array.isArray(g)) {
        const next = g.filter((_, i) => i !== data.tagIdx);
        list[data.groupIdx] = next.length ? next : null;
      }
    }
    if (targetGroupIdx >= list.length) {
      for (let i = list.length; i <= targetGroupIdx; i++) list.push([]);
    }
    const target = list[targetGroupIdx];
    const arr = Array.isArray(target) ? [...target] : [];
    if (!arr.includes(folderName)) arr.push(folderName);
    list[targetGroupIdx] = arr;
    list = list.filter((g) => g != null && (Array.isArray(g) ? g.length > 0 : g));
    state.packTasksList = list;
  }

  /** 從指定群組移除一個資料夾 tag */
  function removeFromRagList(groupIdx, tagIdx) {
    const state = currentState.value;
    const list = [...(state.packTasksList || [])];
    const g = list[groupIdx];
    if (!Array.isArray(g)) return;
    const next = g.filter((_, i) => i !== tagIdx);
    list[groupIdx] = next.length ? next : null;
    state.packTasksList = list.filter((x) => x != null && (Array.isArray(x) ? x.length > 0 : x));
  }

  /** 移除整個群組 */
  function removeRagListGroup(groupIdx) {
    const state = currentState.value;
    const list = [...(state.packTasksList || [])];
    list.splice(groupIdx, 1);
    state.packTasksList = list.filter((x) => x != null && (Array.isArray(x) ? x.length > 0 : x));
  }

  /** 新增一個空群組 */
  function addRagListGroup() {
    const state = currentState.value;
    state.packTasksList = [...(state.packTasksList || []), []];
  }

  /** 將所有 second_folders 各成單一資料夾一組，追加到 packTasksList */
  function addAllSecondFoldersAsGroups() {
    const names = secondFoldersFull.value;
    if (!names.length) return;
    const state = currentState.value;
    const existing = state.packTasksList ?? [];
    const newGroups = names.map((name) => [name]);
    state.packTasksList = [...existing, ...newGroups];
  }

  /* 雙向同步：packTasks 字串 ↔ packTasksList 陣列 */
  watch(
    () => currentState.value.packTasks,
    (val) => {
      const parsed = parsePackTasksList(val);
      const current = currentState.value.packTasksList;
      if (JSON.stringify(parsed) !== JSON.stringify(current)) {
        currentState.value.packTasksList = parsed;
      }
    }
  );
  watch(
    () => currentState.value.packTasksList,
    (list) => {
      const serialized = serializePackTasksList(list);
      const current = currentState.value.packTasks;
      if (serialized !== current) {
        currentState.value.packTasks = serialized;
      }
    },
    { deep: true }
  );

  return {
    secondFoldersFull,
    ragListDisplayGroups,
    onDragStartTag,
    onDragOver,
    onDragLeave,
    onDropRagList,
    removeFromRagList,
    removeRagListGroup,
    addRagListGroup,
    addAllSecondFoldersAsGroups,
  };
}
