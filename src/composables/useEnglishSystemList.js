/**
 * English System 列表：GET /english_system/tabs?local=（與 GET /rag/tabs 一致）＋ person_id（loggedFetch 自動帶 person_id）
 */
import { ref, watch, unref } from 'vue';
import { API_BASE, API_ENGLISH_SYSTEM_TABS, isFrontendLocalHost } from '../constants/api.js';
import { normalizeEnglishSystemTabsResponse } from '../utils/englishSystem.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { useAuthStore } from '../stores/authStore.js';

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
 * @param {import('vue').Ref<boolean> | import('vue').ComputedRef<boolean> | boolean} [options.fetchEnabled=true]
 */
export function useEnglishSystemList(options = {}) {
  const authStore = useAuthStore();
  const fetchEnabledOption = options.fetchEnabled;
  function isFetchEnabled() {
    if (fetchEnabledOption === undefined) return true;
    return unref(fetchEnabledOption) !== false;
  }

  const englishSystemList = ref([]);
  const englishSystemListLoading = ref(false);
  const englishSystemListError = ref('');

  async function fetchEnglishSystemList(opts = {}) {
    if (!isFetchEnabled()) return;
    const silent = opts.silent === true;
    if (!silent) englishSystemListLoading.value = true;
    englishSystemListError.value = '';
    try {
      const listParams = new URLSearchParams();
      listParams.set('local', String(isFrontendLocalHost()));
      const res = await loggedFetch(
        `${API_BASE}${API_ENGLISH_SYSTEM_TABS}?${listParams.toString()}`,
        { method: 'GET' }
      );
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      englishSystemList.value = normalizeEnglishSystemTabsResponse(data);
    } catch (err) {
      englishSystemListError.value = err.message || '無法載入英文測驗題庫列表';
      englishSystemList.value = [];
    } finally {
      if (!silent) englishSystemListLoading.value = false;
    }
  }

  watch(
    () => [listReloadKeyFromUser(authStore.user), isFetchEnabled()],
    () => {
      if (!isFetchEnabled()) {
        englishSystemListLoading.value = false;
        englishSystemListError.value = '';
        return;
      }
      fetchEnglishSystemList();
    },
    { immediate: true }
  );

  return {
    englishSystemList,
    englishSystemListLoading,
    englishSystemListError,
    fetchEnglishSystemList,
  };
}
