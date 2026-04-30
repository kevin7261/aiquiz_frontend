/**
 * RAG 分頁狀態 Composable
 *
 * 職責：
 * - 維護 tabStateMap：每個 rag tab id 對應一筆 reactive 狀態（上傳 ZIP、pack、產生題目、題目列表等）
 * - getTabState(id)：取得或建立該 id 的狀態；若為 new tab 會用 generateTabId 產生 tabId
 * - currentState：依 activeTabId / newTabIds / ragList 解析出「目前分頁」的狀態
 */
import { computed, reactive } from 'vue';
import { generateTabId, isNewTabId as checkIsNewTabId, DEFAULT_SYSTEM_INSTRUCTION } from '../utils/rag.js';

/**
 * @param {import('vue').Ref<string>} activeTabId - 目前選中的 RAG tab id
 * @param {import('vue').Ref<string[]>} newTabIds - 尚未寫入後端的「新增」tab id 列表
 * @param {import('vue').Ref<object[]>} ragList - GET /rag/tabs 回傳的 RAG 列表
 * @param {object} authStore - Pinia auth store（用於 generateTabId(person_id)）
 * @param {object} [options] - defaultSystemInstruction 等
 */
export function useRagTabState(activeTabId, newTabIds, ragList, authStore, options = {}) {
  const defaultSystemInstruction = options.defaultSystemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
  /** 每個 tab id 對應的狀態物件（lazy 建立） */
  const tabStateMap = reactive({});

  /**
   * 取得指定 id 的 tab 狀態；若不存在會建立一筆預設狀態（含 zip、pack、cardList、systemInstruction 等）
   * @param {string} [id]
   */
  function getTabState(id) {
    if (!id) return getTabState(newTabIds.value[0] || ragList.value[0]?.rag_tab_id || 'new');
    if (!tabStateMap[id]) {
      const isNew = checkIsNewTabId(id);
      tabStateMap[id] = reactive({
        tabId: isNew ? generateTabId(authStore.user?.person_id) : id,
        uploadedZipFile: null,
        zipFileName: '',
        zipSecondFolders: [],
        zipResponseJson: null,
        zipLoading: false,
        zipError: '',
        zipTabId: isNew ? '' : id,
        packTasks: '',
        packTasksList: [],
        /** 與 packTasksList 每群一筆：0～4，見 rag.js UNIT_TYPE_* */
        packUnitTypes: [],
        /** 出題單元為文字／mp3／YouTube 時之逐字稿 Markdown（與 packTasksList 序對齊） */
        packUnitMarkdownTexts: [],
        packUnitYoutubeUrls: [],
        packUnitTranscriptLoading: [],
        packUnitTranscriptError: [],
        /** 與 packTasksList 每群一筆：分段長度（字元） */
        packChunkSizes: [],
        /** 與 packTasksList 每群一筆：分段重疊（字元） */
        packChunkOverlaps: [],
        ragMetadata: '',
        withRag: true,
        packResponseJson: null,
        packLoading: false,
        packError: '',
        /** POST build-rag-zip 串流進度（start.total） */
        packBuildTotal: 0,
        /** 已完成筆數（unit.index 或 building.completed_before） */
        packBuildDone: 0,
        /** 目前建置中的序號 1-based（building.index） */
        packBuildCurrent: 0,
        /** repack 工作檔名（building.filename；unit.output.filename） */
        packBuildFilename: '',
        /** 儲存路徑／bucket 內 repack（unit.output.repack_filename） */
        packBuildRepackFilename: '',
        /** 儲存路徑／bucket 內 RAG ZIP（unit.output.rag_filename） */
        packBuildRagFilename: '',
        generateQuizTabId: '',
        generateQuizLoading: false,
        generateQuizError: '',
        generateQuizResponseJson: null,
        cardList: [],
        slotFormState: {},
        showQuizGeneratorBlock: false,
        quizSlotsCount: 0,
        unitTabOrder: [],
        activeUnitTabId: null,
        /** 目前單元下「題型」子分頁索引（0-based → unitSlotQuizCards[slot-1][index]） */
        activeUnitQuizTypeIndex: 0,
        /** 同一測驗題庫分頁內，依單元子分頁 id 累計題號（create 成功時 +1，僅本頁會話） */
        unitPromptOrdinalByUnitTabId: {},
        /** 建立測驗題庫「單元子分頁」：每個 slot 對應一個單元，內為該單元底下多題 Card[]（與後端 quizzes[] 對齊） */
        unitSlotQuizCards: [],
        _synced: false,
        forExamLoading: false,
        forExamError: '',
        systemInstruction: defaultSystemInstruction,
      });
    }
    return tabStateMap[id];
  }

  /** 目前選中分頁的狀態（用於表單與按鈕） */
  const currentState = computed(() => {
    const id = activeTabId.value;
    if (id) return getTabState(id);
    const firstNew = newTabIds.value[0];
    const firstRag = ragList.value[0];
    return getTabState(firstNew || (firstRag && (firstRag.rag_tab_id ?? firstRag.id ?? firstRag)) || 'new');
  });

  return { tabStateMap, getTabState, currentState, isNewTabId: checkIsNewTabId };
}
