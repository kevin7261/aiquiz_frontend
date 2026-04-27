/**
 * 建立「英文測驗題庫」專用：RAG 列表 Composable（與 `useRagList.js` 分離）
 *
 * 職責：呼叫 GET /rag/tabs?local=（與 Rag.local / POST /rag/tab/create 一致）、維護 ragList / ragListLoading / ragListError，
 * 並以 normalizeRagListResponse 正規化後端回傳格式。供 CreateEnglishExamQuizBankPage 使用。
 *
 * 以 watch（immediate）依登入身分載入列表：Pinia 還原較晚時 loggedFetch 會在 user 就緒後再帶 person_id query；
 * 頁面 onMounted 勿再呼叫 fetchRagList，以免與 immediate 重複一次。
 */
import { ref, watch, unref } from 'vue';
import { API_BASE, API_RAG_LIST, isFrontendLocalHost } from '../constants/api.js';
import { normalizeRagListResponse } from '../utils/englishExamRag.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { useAuthStore } from '../stores/authStore.js';

/** 與 ExamPage getCurrentPersonId 一致：用於偵測 user 是否就緒／身分變更 */
function listReloadKeyFromUser(user) {
  if (!user || typeof user !== 'object') return '';
  const pid = user.person_id;
  if (pid != null && String(pid).trim() !== '') return String(pid).trim();
  const uid = user.user_id ?? user.id;
  if (uid != null && String(uid).trim() !== '') return String(uid).trim();
  return '';
}

/**
 * @param {object} [options]
 * @param {import('vue').Ref<boolean> | import('vue').ComputedRef<boolean> | boolean} [options.fetchEnabled=true] — 為 false 時不呼叫 GET /rag/tabs（由父層灌入列表時使用）
 */
export function useEnglishExamRagList(options = {}) {
  const authStore = useAuthStore();
  const fetchEnabledOption = options.fetchEnabled;
  function isFetchEnabled() {
    if (fetchEnabledOption === undefined) return true;
    return unref(fetchEnabledOption) !== false;
  }

  /** RAG 項目陣列（正規化後） */
  const ragList = ref([]);
  /** 是否正在載入 */
  const ragListLoading = ref(false);
  /** 載入失敗時的錯誤訊息 */
  const ragListError = ref('');

  /**
   * 拉取 RAG 列表並更新 ragList / ragListLoading / ragListError
   * @param {{ silent?: boolean }} [opts] — silent: true 時不變更 ragListLoading（避免全螢幕遮罩；供「設為測驗用」等已另有按鈕 loading 的情境）
   */
  async function fetchRagList(opts = {}) {
    if (!isFetchEnabled()) return;
    const silent = opts.silent === true;
    if (!silent) {
      ragListLoading.value = true;
    }
    ragListError.value = '';
    try {
      const listParams = new URLSearchParams();
      listParams.set('local', String(isFrontendLocalHost()));
      const res = await loggedFetch(`${API_BASE}${API_RAG_LIST}?${listParams}`, { method: 'GET' });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      ragList.value = normalizeRagListResponse(data);
    } catch (err) {
      ragListError.value = err.message || '無法載入 RAG 列表';
      ragList.value = [];
    } finally {
      if (!silent) {
        ragListLoading.value = false;
      }
    }
  }

  watch(
    () => [listReloadKeyFromUser(authStore.user), isFetchEnabled()],
    () => {
      if (!isFetchEnabled()) {
        ragListLoading.value = false;
        ragListError.value = '';
        return;
      }
      fetchRagList();
    },
    { immediate: true }
  );

  return { ragList, ragListLoading, ragListError, fetchRagList };
}
