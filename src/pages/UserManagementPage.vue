<script setup>
/**
 * UserManagementPage - 使用者管理頁面
 *
 * 列表：GET /user/users（依 user_id 升冪）；每次從側欄進入本頁（KeepAlive onActivated）重新抓取。「新增一筆」「批次新增學生」並列於列表區塊下方，以按鈕開啟 Modal。
 * 單筆：POST /user/users；body person_id、name、user_type；query person_id 與 body.person_id 一致（loggedFetch personId）。
 * 批次：POST /user/users/batch；body 為 [{ person_id, name }]；query 為呼叫者 person_id（loggedFetch 預設）。
 * Excel 匯入後即檢查檔內重複與與列表重複；有則禁用「批次新增學生」按鈕。單筆送出前亦會檢查重複。
 * 單筆 Modal：輸入 ID 時即時比對列表；須 ID、姓名、類型皆填且未重複才可按「新增使用者」。類型為 Bootstrap 5 dropdown（同 Design 08／UnitSelectDropdown）。
 * 刪除：POST /user/users/delete，body 為被刪 person_id；query 為呼叫者（loggedFetch 預設）。
 */
import { ref, computed, onActivated } from 'vue';
import { API_BASE, API_USER_USERS, API_USER_BATCH, API_USER_DELETE } from '../constants/api.js';
import { useAuthStore } from '../stores/authStore.js';
import {
  userTypeLabel,
  MANAGER_USER_TYPE,
  RESTRICTED_USER_TYPE,
  USER_TYPE_LABELS,
} from '../router/permissions.js';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import { loggedFetch } from '../utils/loggedFetch.js';

const authStore = useAuthStore();

const EXCEL_ACCEPT_ATTR = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

const users = ref([]);
const count = ref(0);
const loading = ref(false);
const error = ref('');

const modalSingleOpen = ref(false);
const modalBatchOpen = ref(false);

const singlePersonId = ref('');
const singleName = ref('');
const singleUserType = ref(RESTRICTED_USER_TYPE);
const singleSaving = ref(false);
const singleSubmitError = ref('');

/** 後端 Upload User 僅允許管理者、學生 */
const userTypeOptions = [
  { value: MANAGER_USER_TYPE, label: USER_TYPE_LABELS[MANAGER_USER_TYPE] },
  { value: RESTRICTED_USER_TYPE, label: USER_TYPE_LABELS[RESTRICTED_USER_TYPE] },
];

const excelFileInputRef = ref(null);
const isExcelDragOver = ref(false);
const excelFileName = ref('');
const excelPreviewRows = ref([]);
const excelParseError = ref('');

const batchSaving = ref(false);
const batchSubmitError = ref('');

const deletingPersonId = ref(null);
const deleteUserError = ref('');

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: targetPid }),
    });
    const text = await res.text();
    if (!res.ok) {
      deleteUserError.value = formatApiError(res, text);
      return;
    }
    await fetchUsers();
  } catch (e) {
    deleteUserError.value = e.message || '刪除失敗';
  } finally {
    deletingPersonId.value = null;
  }
}

/** 目前列表中的 person_id（trim 後），供重複檢查 */
function existingPersonIdSet() {
  const s = new Set();
  for (const u of users.value) {
    const p = u?.person_id;
    if (p != null && String(p).trim() !== '') s.add(String(p).trim());
  }
  return s;
}

const singlePersonIdTrimmed = computed(() => singlePersonId.value.trim());

/** 輸入中的 person_id 是否與目前列表重複（即時） */
const singlePersonIdDuplicate = computed(() => {
  const pid = singlePersonIdTrimmed.value;
  if (!pid) return false;
  return existingPersonIdSet().has(pid);
});

/** ID、姓名、類型皆有效且 person_id 未重複時才可送出 */
const singleSubmitEnabled = computed(() => {
  if (singleSaving.value) return false;
  const pid = singlePersonIdTrimmed.value;
  const name = singleName.value.trim();
  if (!pid || !name) return false;
  const ut = Number(singleUserType.value);
  if (ut !== MANAGER_USER_TYPE && ut !== RESTRICTED_USER_TYPE) return false;
  if (singlePersonIdDuplicate.value) return false;
  return true;
});

/** 單筆 Modal：類型下拉觸發鈕顯示文字 */
const singleUserTypeLabel = computed(() => {
  const ut = Number(singleUserType.value);
  const opt = userTypeOptions.find((o) => Number(o.value) === ut);
  return opt?.label ?? USER_TYPE_LABELS[RESTRICTED_USER_TYPE];
});

function setSingleUserType(value) {
  singleUserType.value = Number(value);
  clearSingleSubmitError();
}

function clearSingleSubmitError() {
  singleSubmitError.value = '';
}

function isExcelFile(file) {
  if (!file || !file.name) return false;
  const n = file.name.toLowerCase();
  return n.endsWith('.xlsx') || n.endsWith('.xls');
}

function clearExcelFileInput() {
  if (excelFileInputRef.value) excelFileInputRef.value.value = '';
}

function onExcelDragOver(e) {
  if (batchSaving.value) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer?.types?.includes('Files')) isExcelDragOver.value = true;
}

function onExcelDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  isExcelDragOver.value = false;
}

function onExcelDrop(e) {
  if (batchSaving.value) return;
  e.preventDefault();
  e.stopPropagation();
  isExcelDragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  clearExcelFileInput();
  void setExcelPreviewFromFile(file);
}

function openExcelFileDialog() {
  if (batchSaving.value) return;
  excelFileInputRef.value?.click();
}

function onExcelChange(e) {
  if (batchSaving.value) return;
  const file = e.target.files?.[0];
  void setExcelPreviewFromFile(file);
  clearExcelFileInput();
}

function trimHeaderCell(v) {
  return String(v ?? '').trim();
}

function findIdColumnIndex(headerRow) {
  if (!Array.isArray(headerRow)) return -1;
  return headerRow.findIndex((c) => trimHeaderCell(c).toUpperCase() === 'ID');
}

/**
 * @param {unknown[]} headerRow
 */
function findNameColumnIndex(headerRow) {
  if (!Array.isArray(headerRow)) return -1;
  const trimmed = headerRow.map((c) => trimHeaderCell(c));
  const zh = trimmed.indexOf('姓名');
  if (zh !== -1) return zh;
  return trimmed.findIndex((h) => h.toUpperCase() === 'NAME');
}

/**
 * @param {File | null | undefined} file
 */
async function setExcelPreviewFromFile(file) {
  excelParseError.value = '';
  excelPreviewRows.value = [];
  excelFileName.value = '';
  if (!file) return;
  if (!isExcelFile(file)) {
    excelParseError.value = '請選擇 Excel 檔（.xlsx 或 .xls）';
    return;
  }
  excelFileName.value = file.name;
  try {
    const ab = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(ab, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('檔案中沒有工作表');
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!Array.isArray(matrix) || matrix.length === 0) throw new Error('工作表為空');
    const headerRow = matrix[0];
    if (!Array.isArray(headerRow)) throw new Error('無法讀取表頭');
    const idIdx = findIdColumnIndex(headerRow);
    const nameIdx = findNameColumnIndex(headerRow);
    if (idIdx === -1 || nameIdx === -1) {
      throw new Error('表頭須包含 ID 與 姓名 兩欄');
    }
    const out = [];
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;
      const idVal = row[idIdx];
      const nameVal = row[nameIdx];
      const empty =
        (idVal === '' || idVal == null) &&
        (nameVal === '' || nameVal == null) &&
        row.every((c) => c === '' || c == null);
      if (empty) continue;
      out.push({
        id: idVal === '' || idVal == null ? '—' : String(idVal).trim(),
        name: nameVal === '' || nameVal == null ? '—' : String(nameVal).trim(),
      });
    }
    excelPreviewRows.value = out;
    if (out.length === 0) excelParseError.value = '沒有資料列（或僅有表頭）';
  } catch (e) {
    excelParseError.value = e.message || '無法讀取 Excel';
    excelPreviewRows.value = [];
    excelFileName.value = '';
  }
}

/**
 * @param {Response} res
 * @param {string} text
 */
function formatApiError(res, text) {
  let msg = `服務暫時無法回應（${res.status}）`;
  try {
    const body = JSON.parse(text);
    if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
  } catch {
    if (text && text.length < 200) msg = text;
  }
  return msg;
}

async function fetchUsers() {
  loading.value = true;
  error.value = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_USER_USERS}`);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(formatApiError(res, text));
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

function openSingleModal() {
  singleSubmitError.value = '';
  singlePersonId.value = '';
  singleName.value = '';
  singleUserType.value = RESTRICTED_USER_TYPE;
  modalSingleOpen.value = true;
}

function closeSingleModal() {
  if (singleSaving.value) return;
  modalSingleOpen.value = false;
}

function openBatchModal() {
  batchSubmitError.value = '';
  modalBatchOpen.value = true;
}

function closeBatchModal() {
  if (batchSaving.value) return;
  modalBatchOpen.value = false;
}

/** 清空批次 Modal 內檔案與預覽（成功送出後關閉前呼叫，下次開啟為乾淨狀態） */
function resetBatchModalContent() {
  excelFileName.value = '';
  excelPreviewRows.value = [];
  excelParseError.value = '';
  batchSubmitError.value = '';
  clearExcelFileInput();
}

/**
 * @param {{ person_id: string }[]} payload
 * @returns {string[]} 在檔案中出現超過一次的 person_id
 */
function duplicatePersonIdsInPayload(payload) {
  const seen = new Set();
  const dups = new Set();
  for (const { person_id } of payload) {
    if (seen.has(person_id)) dups.add(person_id);
    else seen.add(person_id);
  }
  return [...dups];
}

/**
 * @param {{ person_id: string }[]} payload
 * @param {Set<string>} existing
 */
function personIdsAlreadyInSystem(payload, existing) {
  const clash = new Set();
  for (const { person_id } of payload) {
    if (existing.has(person_id)) clash.add(person_id);
  }
  return [...clash];
}

/** Excel 預覽列轉成 API 用 payload（略過空 person_id） */
const batchPayloadNormalized = computed(() =>
  excelPreviewRows.value
    .map((row) => {
      const pid = row.id === '—' ? '' : String(row.id).trim();
      const name = row.name === '—' ? '' : String(row.name).trim();
      return { person_id: pid, name };
    })
    .filter((item) => item.person_id !== ''),
);

const batchDuplicateIdsInFile = computed(() => duplicatePersonIdsInPayload(batchPayloadNormalized.value));

const batchIdsClashingExisting = computed(() =>
  personIdsAlreadyInSystem(batchPayloadNormalized.value, existingPersonIdSet()),
);

/** 有有效列、無檔內重複、無與現有使用者重複時才可批次送出 */
const batchSubmitEnabled = computed(() => {
  if (batchSaving.value) return false;
  if (excelPreviewRows.value.length === 0) return false;
  if (batchPayloadNormalized.value.length === 0) return false;
  if (batchDuplicateIdsInFile.value.length > 0) return false;
  if (batchIdsClashingExisting.value.length > 0) return false;
  return true;
});

async function submitSingleUser() {
  if (!singleSubmitEnabled.value) return;
  const pid = singlePersonId.value.trim();
  const name = singleName.value.trim();
  if (!pid) {
    singleSubmitError.value = '請填寫登入 ID';
    return;
  }
  if (!name) {
    singleSubmitError.value = '請填寫姓名';
    return;
  }
  const ut = Number(singleUserType.value);
  if (ut !== MANAGER_USER_TYPE && ut !== RESTRICTED_USER_TYPE) {
    singleSubmitError.value = '類型僅能為管理者或學生';
    return;
  }
  if (existingPersonIdSet().has(pid)) {
    singleSubmitError.value = '此登入 ID 已存在，無法新增。';
    return;
  }
  singleSaving.value = true;
  singleSubmitError.value = '';
  try {
    const res = await loggedFetch(
      `${API_BASE}${API_USER_USERS}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: pid,
          name,
          user_type: ut,
        }),
      },
      { personId: pid },
    );
    const text = await res.text();
    if (!res.ok) {
      singleSubmitError.value = formatApiError(res, text);
      return;
    }
    modalSingleOpen.value = false;
    await fetchUsers();
  } catch (e) {
    singleSubmitError.value = e.message || '新增失敗';
  } finally {
    singleSaving.value = false;
  }
}

async function submitBatchUsers() {
  if (!batchSubmitEnabled.value) return;
  const payload = batchPayloadNormalized.value;
  batchSaving.value = true;
  batchSubmitError.value = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_USER_BATCH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      batchSubmitError.value = formatApiError(res, text);
      return;
    }
    modalBatchOpen.value = false;
    resetBatchModalContent();
    await fetchUsers();
  } catch (e) {
    batchSubmitError.value = e.message || '批次新增失敗';
  } finally {
    batchSaving.value = false;
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
                  @click="openSingleModal"
                >
                  新增一筆使用者
                </button>
                <button
                  type="button"
                  class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-black px-4 py-2"
                  @click="openBatchModal"
                >
                  批次新增學生
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="modalSingleOpen"
        class="modal fade show d-block my-modal-backdrop"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-single-modal-title"
        @click.self="closeSingleModal"
      >
        <div class="modal-dialog modal-dialog-centered" @click.stop>
          <div class="modal-content">
            <div class="modal-header border-bottom-0 pb-0">
              <h5 id="user-single-modal-title" class="modal-title">
                新增一筆使用者
              </h5>
              <button
                type="button"
                class="btn-close"
                :disabled="singleSaving"
                @click="closeSingleModal"
              />
            </div>
            <div class="modal-body pt-2">
              <div class="mb-3">
                <label for="user-single-id" class="form-label my-font-sm-400 my-color-gray-1 mb-0">登入 ID</label>
                <input
                  id="user-single-id"
                  v-model="singlePersonId"
                  type="text"
                  class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                  :class="{ 'is-invalid': singlePersonIdDuplicate }"
                  maxlength="256"
                  autocomplete="off"
                  placeholder="登入識別用 ID"
                  :disabled="singleSaving"
                  @input="clearSingleSubmitError"
                >
                <div v-if="singlePersonIdDuplicate" class="invalid-feedback d-block my-font-sm-400">
                  此登入 ID 已存在
                </div>
              </div>
              <div class="mb-3">
                <label for="user-single-name" class="form-label my-font-sm-400 my-color-gray-1 mb-0">姓名</label>
                <input
                  id="user-single-name"
                  v-model="singleName"
                  type="text"
                  class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                  maxlength="256"
                  autocomplete="name"
                  :disabled="singleSaving"
                  @input="clearSingleSubmitError"
                >
              </div>
              <div class="mb-0">
                <label for="user-single-type-dd-btn" class="form-label my-font-sm-400 my-color-gray-1 mb-0">類型</label>
                <div class="dropdown w-100 min-w-0 my-design-08-dropdown" data-bs-popper="static">
                  <button
                    id="user-single-type-dd-btn"
                    type="button"
                    class="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white w-100 min-w-0 px-3 py-2 text-start"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    :disabled="singleSaving"
                  >
                    <span class="flex-grow-1 overflow-hidden text-truncate text-start pe-2">{{ singleUserTypeLabel }}</span>
                    <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0" aria-hidden="true" />
                  </button>
                  <ul class="dropdown-menu dropdown-menu-start w-100" aria-labelledby="user-single-type-dd-btn">
                    <li v-for="opt in userTypeOptions" :key="opt.value">
                      <button
                        type="button"
                        class="dropdown-item"
                        :class="{ active: Number(singleUserType) === Number(opt.value) }"
                        @click="setSingleUserType(opt.value)"
                      >
                        {{ opt.label }}
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
              <div v-if="singleSubmitError" class="my-color-red my-font-sm-400 mt-3 mb-0">
                {{ singleSubmitError }}
              </div>
            </div>
            <div class="modal-footer border-top-0 pt-0">
              <button type="button" class="btn my-btn-outline-gray-2" :disabled="singleSaving" @click="closeSingleModal">
                取消
              </button>
              <button
                type="button"
                class="btn my-button-blue"
                :disabled="!singleSubmitEnabled"
                @click="submitSingleUser"
              >
                {{ singleSaving ? '送出中…' : '新增使用者' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="modalBatchOpen"
        class="modal fade show d-block my-modal-backdrop"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-batch-modal-title"
        @click.self="closeBatchModal"
      >
        <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable" @click.stop>
          <div class="modal-content">
            <div class="modal-header border-bottom-0 pb-0">
              <h5 id="user-batch-modal-title" class="modal-title">
                批次新增學生
              </h5>
              <button
                type="button"
                class="btn-close"
                :disabled="batchSaving"
                @click="closeBatchModal"
              />
            </div>
            <div class="modal-body pt-2">
              <input
                ref="excelFileInputRef"
                type="file"
                :accept="EXCEL_ACCEPT_ATTR"
                class="d-none"
                :disabled="batchSaving"
                @change="onExcelChange"
              >
              <div
                class="my-zip-drop-zone text-center position-relative"
                :class="{ 'my-zip-drop-zone-over': isExcelDragOver }"
                @dragover.prevent="onExcelDragOver"
                @dragenter.prevent="onExcelDragOver"
                @dragleave="onExcelDragLeave"
                @drop="onExcelDrop"
                @click="openExcelFileDialog"
              >
                <template v-if="excelFileName">
                  <span class="my-font-sm-400 my-color-black">{{ excelFileName }}</span>
                  <div class="my-font-sm-400 my-color-gray-4 mt-1">拖曳檔案到這裡，或點擊重新選擇</div>
                </template>
                <template v-else>
                  <span class="my-font-sm-400 my-color-gray-4">拖曳 Excel 到這裡，或點擊選擇檔案</span>
                </template>
              </div>
              <div v-if="excelParseError" class="my-alert-warning-soft rounded my-font-sm-400 py-2 mt-2 mb-0" role="alert">
                {{ excelParseError }}
              </div>
              <div v-if="excelPreviewRows.length > 0" class="table-responsive mt-3">
                <table class="table table-bordered table-hover table-sm my-font-md-400 mb-0">
                  <thead class="my-table-thead">
                    <tr>
                      <th class="my-font-md-600">ID</th>
                      <th class="my-font-md-600">姓名</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in excelPreviewRows" :key="'excel-' + idx">
                      <td class="my-font-md-400 text-break">{{ row.id }}</td>
                      <td class="my-font-md-400 text-break">{{ row.name }}</td>
                    </tr>
                  </tbody>
                </table>
                <p class="my-font-sm-400 my-color-gray-4 mt-2 mb-0">共 {{ excelPreviewRows.length }} 筆預覽（有效登入 ID：{{ batchPayloadNormalized.length }} 筆）</p>
              </div>
              <div
                v-if="excelPreviewRows.length > 0 && batchPayloadNormalized.length === 0"
                class="my-alert-warning-soft rounded my-font-sm-400 py-2 mt-3 mb-0"
                role="alert"
              >
                沒有有效的登入 ID，請檢查 Excel。
              </div>
              <div
                v-if="batchDuplicateIdsInFile.length > 0"
                class="my-alert-danger-soft rounded my-font-sm-400 py-2 mt-3 mb-0"
                role="alert"
              >
                Excel 內登入 ID 重複：{{ batchDuplicateIdsInFile.join('、') }}，請修正檔案後再試。
              </div>
              <div
                v-if="batchIdsClashingExisting.length > 0"
                class="my-alert-danger-soft rounded my-font-sm-400 py-2 mt-3 mb-0"
                role="alert"
              >
                以下登入 ID 已存在於系統：{{ batchIdsClashingExisting.join('、') }}，請從檔案移除後再試。
              </div>
              <div v-if="batchSubmitError" class="my-color-red my-font-sm-400 mt-2 mb-0">
                {{ batchSubmitError }}
              </div>
            </div>
            <div class="modal-footer border-top-0 pt-0">
              <button type="button" class="btn my-btn-outline-gray-2" :disabled="batchSaving" @click="closeBatchModal">
                關閉
              </button>
              <button
                type="button"
                class="btn my-button-blue"
                :disabled="!batchSubmitEnabled"
                @click="submitBatchUsers"
              >
                {{ batchSaving ? '處理中…' : '批次新增學生' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

