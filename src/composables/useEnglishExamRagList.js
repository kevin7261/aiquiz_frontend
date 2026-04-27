/**
 * 建立「英文測驗題庫」專用：列表 Composable（與 `useRagList.js` 分離）
 *
 * 清單來源為 GET /english_system/tabs?local=（與 Rag.local 一致；回傳每筆可併入 phases／quizzes／answers）；並平行呼叫 GET /rag/tabs 以合併 file_metadata、unit_list 等同 rag_tab_id 的 RAG 欄位。
 * 若 English_System 表無列，側欄為空（不再僅依 RAG＋前端 registry 顯示）。
 *
 * 以 watch（immediate）依登入身分載入；Pinia 還原較晚時 loggedFetch 會在 user 就緒後再帶 person_id query。
 */
import { ref, watch, unref } from 'vue';
import { API_BASE, API_RAG_LIST, API_ENGLISH_SYSTEM_TABS, isFrontendLocalHost } from '../constants/api.js';
import { normalizeRagListResponse } from '../utils/englishExamRag.js';
import {
  registerEnglishSystemTabIds,
  syncEnglishRagTabRegistryFromList,
} from '../utils/englishRagRegistry.js';
import {
  mergeEnglishSystemTabWithRag,
  normalizeEnglishSystemTabsResponse,
  getEnglishSystemTabRowId,
} from '../utils/englishSystem.js';
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
   * 拉取 English System 清單（及 RAG 合併）並更新 ragList / ragListLoading / ragListError
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
      const qs = listParams.toString();
      const [resRag, resEs] = await Promise.all([
        loggedFetch(`${API_BASE}${API_RAG_LIST}?${qs}`, { method: 'GET' }),
        loggedFetch(`${API_BASE}${API_ENGLISH_SYSTEM_TABS}?${qs}`, { method: 'GET' }),
      ]);
      if (!resEs.ok) throw new Error(resEs.statusText || '無法載入英文測驗題庫列表');
      const dataEs = await resEs.json();
      const englishRows = normalizeEnglishSystemTabsResponse(dataEs);
      let allRags = [];
      if (resRag.ok) {
        const dataRag = await resRag.json();
        allRags = normalizeRagListResponse(dataRag);
      }
      syncEnglishRagTabRegistryFromList(allRags);
      registerEnglishSystemTabIds(englishRows);
      const byTabId = new Map(
        allRags.map((r) => [String(r.rag_tab_id ?? r.id ?? '').trim(), r]).filter(([k]) => k)
      );
      const seen = new Set();
      const merged = [];
      for (const es of englishRows) {
        const tid = getEnglishSystemTabRowId(es);
        if (!tid || seen.has(tid)) continue;
        seen.add(tid);
        const rag = byTabId.get(tid);
        const row = mergeEnglishSystemTabWithRag(es, rag);
        if (row) merged.push(row);
      }
      ragList.value = merged;
    } catch (err) {
      ragListError.value = err.message || '無法載入英文測驗題庫列表';
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
