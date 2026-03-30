/**
 * RAG 列表 Composable
 *
 * 職責：呼叫 GET /rag/tabs?local=（與 Rag.local / POST /rag/tab/create 一致）、維護 ragList / ragListLoading / ragListError，
 * 並以 normalizeRagListResponse 正規化後端回傳格式。供 CreateExamQuizBankPage 使用。
 *
 * 以 watch（immediate）依登入身分載入列表：Pinia 還原較晚時 loggedFetch 會在 user 就緒後再帶 person_id query；
 * 頁面 onMounted 勿再呼叫 fetchRagList，以免與 immediate 重複一次。
 */
import { ref, watch } from 'vue';
import { API_BASE, API_RAG_LIST, isFrontendLocalHost } from '../constants/api.js';
import { normalizeRagListResponse } from '../utils/rag.js';
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

export function useRagList() {
  const authStore = useAuthStore();
  /** RAG 項目陣列（正規化後） */
  const ragList = ref([]);
  /** 是否正在載入 */
  const ragListLoading = ref(false);
  /** 載入失敗時的錯誤訊息 */
  const ragListError = ref('');

  /** 拉取 RAG 列表並更新 ragList / ragListLoading / ragListError */
  async function fetchRagList() {
    ragListLoading.value = true;
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
      ragListLoading.value = false;
    }
  }

  watch(
    () => listReloadKeyFromUser(authStore.user),
    () => {
      fetchRagList();
    },
    { immediate: true }
  );

  return { ragList, ragListLoading, ragListError, fetchRagList };
}
