<script setup>
/**
 * AddUserModal — 新增單筆使用者 Modal
 *
 * Props:
 *   open              Boolean  是否顯示（父層控制開關）
 *   existingPersonIds Set      目前系統中已存在的 person_id 集合，供即時重複檢查
 *
 * Emits:
 *   close   Modal 請求關閉（父層負責將 open 設 false）
 *   saved   新增成功，父層應重新抓取使用者列表
 */
import { ref, computed, watch } from 'vue';
import { API_BASE, API_USER_USERS } from '../constants/api.js';
import {
  MANAGER_USER_TYPE,
  RESTRICTED_USER_TYPE,
  USER_TYPE_LABELS,
} from '../router/permissions.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { parseFetchError } from '../utils/apiError.js';

const props = defineProps({
  open: { type: Boolean, required: true },
  existingPersonIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits(['close', 'saved']);

/** 後端 Upload User 僅允許管理者、學生 */
const userTypeOptions = [
  { value: MANAGER_USER_TYPE, label: USER_TYPE_LABELS[MANAGER_USER_TYPE] },
  { value: RESTRICTED_USER_TYPE, label: USER_TYPE_LABELS[RESTRICTED_USER_TYPE] },
];

const personId = ref('');
const name = ref('');
const userType = ref(RESTRICTED_USER_TYPE);
const saving = ref(false);
const submitError = ref('');

const personIdTrimmed = computed(() => personId.value.trim());

const personIdDuplicate = computed(() => {
  const pid = personIdTrimmed.value;
  if (!pid) return false;
  return props.existingPersonIds.has(pid);
});

const submitEnabled = computed(() => {
  if (saving.value) return false;
  if (!personIdTrimmed.value || !name.value.trim()) return false;
  const ut = Number(userType.value);
  if (ut !== MANAGER_USER_TYPE && ut !== RESTRICTED_USER_TYPE) return false;
  if (personIdDuplicate.value) return false;
  return true;
});

const currentUserTypeLabel = computed(() => {
  const ut = Number(userType.value);
  const opt = userTypeOptions.find((o) => Number(o.value) === ut);
  return opt?.label ?? USER_TYPE_LABELS[RESTRICTED_USER_TYPE];
});

/** 每次開啟時重設表單 */
watch(
  () => props.open,
  (val) => {
    if (val) {
      personId.value = '';
      name.value = '';
      userType.value = RESTRICTED_USER_TYPE;
      submitError.value = '';
    }
  },
);

function setUserType(value) {
  userType.value = Number(value);
  submitError.value = '';
}

function close() {
  if (saving.value) return;
  emit('close');
}

async function submit() {
  if (!submitEnabled.value) return;
  const pid = personIdTrimmed.value;
  const nm = name.value.trim();
  const ut = Number(userType.value);
  if (props.existingPersonIds.has(pid)) {
    submitError.value = '此登入 ID 已存在，無法新增。';
    return;
  }
  saving.value = true;
  submitError.value = '';
  try {
    const res = await loggedFetch(
      `${API_BASE}${API_USER_USERS}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: pid, name: nm, user_type: ut }),
      },
      { personId: pid },
    );
    const text = await res.text();
    if (!res.ok) {
      submitError.value = parseFetchError(res, text);
      return;
    }
    emit('saved');
    emit('close');
  } catch (e) {
    submitError.value = e.message || '新增失敗';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal fade show d-block my-modal-backdrop"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-single-modal-title"
      @click.self="close"
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
              :disabled="saving"
              @click="close"
            />
          </div>
          <div class="modal-body pt-2">
            <div class="mb-3">
              <label for="user-single-id" class="form-label my-font-sm-400 my-color-gray-1 mb-0">登入 ID</label>
              <input
                id="user-single-id"
                v-model="personId"
                type="text"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                :class="{ 'is-invalid': personIdDuplicate }"
                maxlength="256"
                autocomplete="off"
                placeholder="登入識別用 ID"
                :disabled="saving"
                @input="submitError = ''"
              >
              <div v-if="personIdDuplicate" class="invalid-feedback d-block my-font-sm-400">
                此登入 ID 已存在
              </div>
            </div>
            <div class="mb-3">
              <label for="user-single-name" class="form-label my-font-sm-400 my-color-gray-1 mb-0">姓名</label>
              <input
                id="user-single-name"
                v-model="name"
                type="text"
                class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                maxlength="256"
                autocomplete="name"
                :disabled="saving"
                @input="submitError = ''"
              >
            </div>
            <div class="mb-0">
              <label for="user-single-type-dd-btn" class="form-label my-font-sm-400 my-color-gray-1 mb-0">類型</label>
              <div class="dropdown w-100 min-w-0 my-design-08-dropdown" data-bs-display="static">
                <button
                  id="user-single-type-dd-btn"
                  type="button"
                  class="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white w-100 min-w-0 px-3 py-2 text-start"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  :disabled="saving"
                >
                  <span class="text-truncate flex-grow-1 pe-2 text-start">{{ currentUserTypeLabel }}</span>
                  <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0" aria-hidden="true" />
                </button>
                <ul class="dropdown-menu dropdown-menu-start w-100" aria-labelledby="user-single-type-dd-btn">
                  <li v-for="opt in userTypeOptions" :key="opt.value">
                    <button
                      type="button"
                      class="dropdown-item"
                      :class="{ active: Number(userType) === Number(opt.value) }"
                      @click="setUserType(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
            <div v-if="submitError" class="my-color-red my-font-sm-400 mt-3 mb-0">
              {{ submitError }}
            </div>
          </div>
          <div class="modal-footer border-top-0 pt-0">
            <button type="button" class="btn my-btn-outline-gray-2" :disabled="saving" @click="close">
              取消
            </button>
            <button
              type="button"
              class="btn my-button-blue"
              :disabled="!submitEnabled"
              @click="submit"
            >
              {{ saving ? '送出中…' : '新增使用者' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
