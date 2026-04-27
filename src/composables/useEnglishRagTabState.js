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
        cardList: [],
        slotFormState: {},
        showQuizGeneratorBlock: false,
        quizSlotsCount: 0,
        _synced: false,
        forExamLoading: false,
        forExamError: '',
        systemInstruction: defaultSystemInstruction,
        englishSourceKind: 'text',
        englishPasteText: '',
        englishYoutubeUrl: '',
        englishYoutubeTranscriptLanguages: '',
        englishTranscriptAudioLoading: false,
        englishTranscriptAudioError: '',
        englishTranscriptAudioDurationMs: null,
        englishTranscriptStorageBucket: '',
        englishTranscriptStoragePath: '',
        englishTranscriptYoutubeLoading: false,
        englishTranscriptYoutubeError: '',
        englishTranscriptYoutubeDurationMs: null,
      });
    } else {
      const s = tabStateMap[id];
      if (s.englishSourceKind === undefined) {
        s.englishSourceKind = 'text';
        s.englishPasteText = '';
        s.englishYoutubeUrl = '';
      }
      if (s.englishYoutubeTranscriptLanguages === undefined) s.englishYoutubeTranscriptLanguages = '';
      if (s.englishTranscriptAudioLoading === undefined) s.englishTranscriptAudioLoading = false;
      if (s.englishTranscriptAudioError === undefined) s.englishTranscriptAudioError = '';
      if (s.englishTranscriptAudioDurationMs === undefined) s.englishTranscriptAudioDurationMs = null;
      if (s.englishTranscriptStorageBucket === undefined) s.englishTranscriptStorageBucket = '';
      if (s.englishTranscriptStoragePath === undefined) s.englishTranscriptStoragePath = '';
      if (s.englishTranscriptYoutubeLoading === undefined) s.englishTranscriptYoutubeLoading = false;
      if (s.englishTranscriptYoutubeError === undefined) s.englishTranscriptYoutubeError = '';
      if (s.englishTranscriptYoutubeDurationMs === undefined) s.englishTranscriptYoutubeDurationMs = null;
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
