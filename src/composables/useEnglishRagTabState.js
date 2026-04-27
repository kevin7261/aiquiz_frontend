/**
 * 建立「英文測驗題庫」專用：RAG 分頁狀態（與建立測驗題庫的 useRagTabState 分離，不共用同一 composable）
 *
 * 職責：
 * - 維護 tabStateMap：每個 rag tab id 對應一筆 reactive 狀態（含英文教材來源 text／mp3／youtube 等）
 * - getTabState(id)、currentState
 */
import { computed, reactive } from 'vue';
import { generateTabId, isNewTabId as checkIsNewTabId, DEFAULT_SYSTEM_INSTRUCTION } from '../utils/englishExamRag.js';

/**
 * @param {import('vue').Ref<string>} activeTabId
 * @param {import('vue').Ref<string[]>} newTabIds
 * @param {import('vue').Ref<object[]>} ragList
 * @param {object} authStore
 * @param {object} [options]
 */
export function useEnglishRagTabState(activeTabId, newTabIds, ragList, authStore, options = {}) {
  const defaultSystemInstruction = options.defaultSystemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
  const tabStateMap = reactive({});

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
        ragMetadata: '',
        withRag: true,
        packResponseJson: null,
        packLoading: false,
        packError: '',
        packBuildTotal: 0,
        packBuildDone: 0,
        packBuildCurrent: 0,
        packBuildFilename: '',
        packBuildRepackFilename: '',
        packBuildRagFilename: '',
        generateQuizTabId: '',
        generateQuizLoading: false,
        generateQuizError: '',
        generateQuizResponseJson: null,
        /** 測驗階段 sub-tab：順序與主分頁 tab 列相同概念，id 字串與 generateTabId 風格獨立 */
        testPhaseOrder: [],
        activeTestPhaseId: null,
        phaseCardById: {},
        slotFormState: {},
        showQuizGeneratorBlock: false,
        _synced: false,
        forExamLoading: false,
        forExamError: '',
        systemInstruction: defaultSystemInstruction,
        englishSourceKind: 'text',
        englishPasteText: '',
        englishYoutubeUrl: '',
        englishTranscriptAudioLoading: false,
        englishTranscriptAudioError: '',
        englishTranscriptAudioDurationMs: null,
        englishTranscriptStorageBucket: '',
        englishTranscriptStoragePath: '',
        englishTranscriptYoutubeLoading: false,
        englishTranscriptYoutubeError: '',
        englishTranscriptYoutubeDurationMs: null,
        englishBuildSystemLoading: false,
        englishBuildSystemError: '',
        /** POST /english_system/tab/build-system 成功後隱藏「開始建立題庫」、顯示測驗階段區（與 tab/build-rag-zip 後 hasRagMetadata 對齊） */
        englishSystemBuildSucceeded: false,
        /** MP3／YouTube 轉逐字稿成功後，來源輸入改為唯讀顯示 */
        englishSourceInputLocked: false,
        englishLockedMp3Display: '',
        englishLockedYoutubeDisplay: '',
      });
    } else {
      const s = tabStateMap[id];
      if (s.englishSourceKind === undefined) {
        s.englishSourceKind = 'text';
        s.englishPasteText = '';
        s.englishYoutubeUrl = '';
      }
      if (s.englishTranscriptAudioLoading === undefined) s.englishTranscriptAudioLoading = false;
      if (s.englishTranscriptAudioError === undefined) s.englishTranscriptAudioError = '';
      if (s.englishTranscriptAudioDurationMs === undefined) s.englishTranscriptAudioDurationMs = null;
      if (s.englishTranscriptStorageBucket === undefined) s.englishTranscriptStorageBucket = '';
      if (s.englishTranscriptStoragePath === undefined) s.englishTranscriptStoragePath = '';
      if (s.englishTranscriptYoutubeLoading === undefined) s.englishTranscriptYoutubeLoading = false;
      if (s.englishTranscriptYoutubeError === undefined) s.englishTranscriptYoutubeError = '';
      if (s.englishTranscriptYoutubeDurationMs === undefined) s.englishTranscriptYoutubeDurationMs = null;
      if (s.englishBuildSystemLoading === undefined) s.englishBuildSystemLoading = false;
      if (s.englishBuildSystemError === undefined) s.englishBuildSystemError = '';
      if (s.englishSystemBuildSucceeded === undefined) s.englishSystemBuildSucceeded = false;
      if (s.englishSourceInputLocked === undefined) s.englishSourceInputLocked = false;
      if (s.englishLockedMp3Display === undefined) s.englishLockedMp3Display = '';
      if (s.englishLockedYoutubeDisplay === undefined) s.englishLockedYoutubeDisplay = '';
      if (s.testPhaseOrder === undefined) {
        s.testPhaseOrder = [];
        s.activeTestPhaseId = null;
        s.phaseCardById = {};
        const n = Number(s.quizSlotsCount) || 0;
        if (n > 0) {
          const list = Array.isArray(s.cardList) ? s.cardList : [];
          for (let i = 0; i < n; i++) {
            const pid = `mig-${i}-${s.tabId || 'tab'}`;
            s.testPhaseOrder.push(pid);
            s.phaseCardById[pid] = list[i] ?? null;
          }
          for (let i = 1; i <= n; i++) {
            const pid = s.testPhaseOrder[i - 1];
            if (s.slotFormState && s.slotFormState[i] != null) {
              s.slotFormState[pid] = s.slotFormState[i];
              delete s.slotFormState[i];
            }
          }
          s.activeTestPhaseId = s.testPhaseOrder[0] || null;
        }
        if (s.quizSlotsCount !== undefined) delete s.quizSlotsCount;
        if (s.cardList !== undefined) delete s.cardList;
      }
      if (s.phaseCardById === undefined) s.phaseCardById = {};
    }
    return tabStateMap[id];
  }

  const currentState = computed(() => {
    const id = activeTabId.value;
    if (id) return getTabState(id);
    const firstNew = newTabIds.value[0];
    const firstRag = ragList.value[0];
    return getTabState(firstNew || (firstRag && (firstRag.rag_tab_id ?? firstRag.id ?? firstRag)) || 'new');
  });

  return { tabStateMap, getTabState, currentState, isNewTabId: checkIsNewTabId };
}
