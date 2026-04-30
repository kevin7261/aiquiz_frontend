<script setup>
/**
 * UserManagementPage - 使用者管理頁面
 *
 * 列表：GET /user/users（依 user_id 升冪）；每次從側欄進入本頁（KeepAlive onActivated）重新抓取。「新增一筆」「批次新增學生」並列於列表區塊下方，以按鈕開啟 Modal。
 * 單筆：POST /user/users；body person_id、name、user_type；query person_id 與 body.person_id 一致（loggedFetch personId）。
 * 批次：POST /user/users/batch；body 為 [{ person_id, name }]；query 為呼叫者 person_id（loggedFetch 預設）。
 * Excel 匯入後即檢查檔內重複與與列表重複；有則禁用「批次新增學生」按鈕。單筆送出前亦會檢查重複。
 * 單筆 Modal：輸入 ID 時即時比對列表；須 ID、姓名、類型皆填且未重複才可按「新增使用者」。類型為 Bootstrap 5 dropdown（同 Design 08／UnitSelectDropdown）。
 * 刪除：PUT /user/users/delete，body 為被刪 person_id；query 為呼叫者（loggedFetch 預設）。
 */
import { ref, computed, onActivated } from 'vue';
import { API_BASE, API_USER_USERS, API_USER_DELETE } from '../constants/api.js';
import { useAuthStore } from '../stores/authStore.js';
import { userTypeLabel } from '../router/permissions.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { parseFetchError } from '../utils/apiError.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import AddUserModal from '../components/AddUserModal.vue';
import BatchAddStudentsModal from '../components/BatchAddStudentsModal.vue';

const authStore = useAuthStore();

const users = ref([]);
const count = ref(0);
const loading = ref(false);
const error = ref('');

const modalSingleOpen = ref(false);
const modalBatchOpen = ref(false);

const deletingPersonId = ref(null);
const deleteUserError = ref('');

/** 目前列表中的 person_id（trim 後），供重複檢查；依賴 users，只在列表變動時重建 */
const existingPersonIdSet = computed(() => {
  const s = new Set();
  for (const u of users.value) {
    const p = u?.person_id;
    if (p != null && String(p).trim() !== '') s.add(String(p).trim());
  }
  return s;
});

/**
 * @param {{ person_id?: string | null } | null | undefined} u
 */
function isCurrentUserRow(u) {
  const me = authStore.user?.person_id ?? authStore.user?.user_id;
  const row = u?.person_id;
  if (me == null || row == null) return false;
  return String(me).trim() === String(row).trim();
}

/**
 * @param {{ person_id?: unknown, user_id?: unknown }} u
 * @param {number} idx
 */
function userRowKey(u, idx) {
  const p = u?.person_id != null ? String(u.person_id) : '';
  const id = u?.user_id != null ? String(u.user_id) : '';
  if (p || id) return `${p}::${id}`;
  return `row-${idx}`;
}

/**
 * @param {{ person_id?: string | null, user_id?: number } | null | undefined} u
 */
async function deleteUser(u) {
  const raw = u?.person_id;
  if (raw == null || String(raw).trim() === '') return;
  const targetPid = String(raw).trim();
  if (!window.confirm(`確定要刪除使用者「${targetPid}」？（刪除後無法復原）`)) return;
  deletingPersonId.value = targetPid;
  deleteUserError.value = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_USER_DELETE}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: targetPid }),
    });
    const text = await res.text();
    if (!res.ok) {
      deleteUserError.value = parseFetchError(res, text);
      return;
    }
    await fetchUsers();
  } catch (e) {
    deleteUserError.value = e.message || '刪除失敗';
  } finally {
    deletingPersonId.value = null;
  }
}

async function fetchUsers() {
  loading.value = true;
  error.value = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_USER_USERS}`);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(parseFetchError(res, text));
    }
    const data = JSON.parse(text);
    const list = Array.isArray(data.users) ? data.users : [];
    users.value = [...list].sort((a, b) => {
      const na = Number(a.user_id);
      const nb = Number(b.user_id);
      const ka = Number.isNaN(na) ? Number.POSITIVE_INFINITY : na;
      const kb = Number.isNaN(nb) ? Number.POSITIVE_INFINITY : nb;
      return ka - kb;
    });
    count.value = typeof data.count === 'number' ? data.count : users.value.length;
  } catch (e) {
    error.value = e.message || '無法載入使用者名單，請稍後再試';
    users.value = [];
    count.value = 0;
  } finally {
    loading.value = false;
  }
}

onActivated(() => {
  fetchUsers();
});
</script>

<template>
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <LoadingOverlay
      :is-visible="loading"
      loading-text="載入名單中..."
    />
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">使用者管理</p>
      </div>
    </header>
    <div class="flex-shrink-0">
      <div v-if="error" class="my-alert-warning-soft my-font-sm-400 py-2 mx-4 mb-3" role="alert">{{ error }}</div>
      <div v-if="deleteUserError" class="my-alert-danger-soft my-font-sm-400 py-2 mx-4 mb-3" role="alert">{{ deleteUserError }}</div>
    </div>
    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">
            <div class="text-start my-page-block-spacing">
              <div class="rounded-4 my-bgcolor-gray-3 p-4 w-100 min-w-0">
                <div class="mb-3">
                  <p class="my-font-sm-400 my-color-gray-4 text-center mb-0">
                    共 {{ count }} 筆使用者
                  </p>
                </div>
                <div v-if="loading" class="my-color-gray-4 my-font-sm-400" />
                <div v-else class="table-responsive">
                  <table class="table table-bordered table-hover table-sm my-font-md-400 mb-0">
                    <thead class="my-table-thead">
                      <tr>
                        <th class="my-font-md-600">登入 ID</th>
                        <th class="my-font-md-600">姓名</th>
                        <th class="my-font-md-600">類型</th>
                        <th class="my-font-md-600 text-center" style="width: 3rem;" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(u, idx) in users" :key="userRowKey(u, idx)">
                        <td class="my-font-md-400">{{ u.person_id ?? '—' }}</td>
                        <td class="my-font-md-400">{{ u.name ?? '—' }}</td>
                        <td class="my-font-md-400">{{ userTypeLabel(u.user_type) }}</td>
                        <td class="my-font-md-400 text-center align-middle">
                          <button
                            v-if="u.person_id != null && String(u.person_id).trim() !== '' && !isCurrentUserRow(u)"
                            type="button"
                            class="btn btn-link my-color-red text-decoration-none lh-1 p-0"
                            :disabled="deletingPersonId != null"
                            :title="`刪除 ${String(u.person_id).trim()}`"
                            @click="deleteUser(u)"
                          >
                            <i class="fa-solid fa-xmark" aria-hidden="true" />
                            <span class="visually-hidden">刪除</span>
                          </button>
                          <span v-else class="my-color-gray-4">—</span>
                        </td>
                      </tr>
                      <tr v-if="!loading && users.length === 0">
                        <td colspan="4" class="my-color-gray-4 text-center my-font-md-400">尚無使用者</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="d-flex flex-wrap justify-content-center align-items-center gap-2 mt-3">
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-black px-4 py-2"
                  @click="modalSingleOpen = true"
                >
                  新增一筆使用者
                </button>
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-black px-4 py-2"
                  @click="modalBatchOpen = true"
                >
                  批次新增學生
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AddUserModal
      :open="modalSingleOpen"
      :existing-person-ids="existingPersonIdSet"
      @close="modalSingleOpen = false"
      @saved="fetchUsers"
    />

    <BatchAddStudentsModal
      :open="modalBatchOpen"
      :existing-person-ids="existingPersonIdSet"
      @close="modalBatchOpen = false"
      @saved="fetchUsers"
    />
  </div>
</template>
