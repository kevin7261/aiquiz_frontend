/**
 * RAG 列表 Composable
 *
 * 職責：呼叫 GET /rag/rags?local=（與 Rag.local / create-unit 一致）、維護 ragList / ragListLoading / ragListError，
 * 並以 normalizeRagListResponse 正規化後端回傳格式。供 CreateUnit 頁與 RagTabsBar 使用。
 */
import { ref } from 'vue';
import { API_BASE, API_RAG_LIST, isFrontendLocalHost } from '../constants/api.js';
import { normalizeRagListResponse } from '../utils/rag.js';

export function useRagList() {
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
      const res = await fetch(`${API_BASE}${API_RAG_LIST}?${listParams}`, { method: 'GET' });
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

  return { ragList, ragListLoading, ragListError, fetchRagList };
}
