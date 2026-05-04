<script setup>
/**
 * BatchAddStudentsModal — 批次新增學生 Modal
 *
 * 透過拖放或選擇 Excel（.xlsx / .xls）上傳，解析 ID 與姓名兩欄後預覽，
 * 並於送出前檢查檔內重複以及與現有使用者的衝突。
 * 取消關閉時保留已載入的檔案（UX 一致，方便使用者繼續操作）；
 * 批次送出成功後清空檔案狀態。
 *
 * Props:
 *   open              Boolean  是否顯示（父層控制開關）
 *   existingPersonIds Set      目前系統中已存在的 person_id 集合，供衝突檢查
 *
 * Emits:
 *   close   Modal 請求關閉（父層負責將 open 設 false）
 *   saved   新增成功，父層應重新抓取使用者列表
 */
import { ref, computed } from 'vue';
import { API_BASE, API_USER_BATCH } from '../constants/api.js';
import { loggedFetch } from '../utils/loggedFetch.js';
import { parseFetchError } from '../utils/apiError.js';
import { useExcelImport, EXCEL_ACCEPT_ATTR } from '../composables/useExcelImport.js';

const props = defineProps({
  open: { type: Boolean, required: true },
  existingPersonIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits(['close', 'saved']);

const saving = ref(false);
const submitError = ref('');

const {
  excelFileInputRef,
  isExcelDragOver,
  excelFileName,
  excelPreviewRows,
  excelParseError,
  onExcelDragOver,
  onExcelDragLeave,
  onExcelDrop,
  openExcelFileDialog,
  onExcelChange,
  resetExcel,
} = useExcelImport({ disabled: saving });

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

/** @param {{ person_id: string }[]} payload @returns {string[]} */
function duplicatePersonIdsInPayload(payload) {
  const seen = new Set();
  const dups = new Set();
  for (const { person_id } of payload) {
    if (seen.has(person_id)) dups.add(person_id);
    else seen.add(person_id);
  }
  return [...dups];
}

const duplicateIdsInFile = computed(() => duplicatePersonIdsInPayload(batchPayloadNormalized.value));

const idsClashingExisting = computed(() => {
  const clash = new Set();
  for (const { person_id } of batchPayloadNormalized.value) {
    if (props.existingPersonIds.has(person_id)) clash.add(person_id);
  }
  return [...clash];
});

/** 有有效列、無檔內重複、無與現有使用者重複時才可批次送出 */
const submitEnabled = computed(() => {
  if (saving.value) return false;
  if (excelPreviewRows.value.length === 0) return false;
  if (batchPayloadNormalized.value.length === 0) return false;
  if (duplicateIdsInFile.value.length > 0) return false;
  if (idsClashingExisting.value.length > 0) return false;
  return true;
});

function close() {
  if (saving.value) return;
  emit('close');
}

async function submit() {
  if (!submitEnabled.value) return;
  const payload = batchPayloadNormalized.value;
  saving.value = true;
  submitError.value = '';
  try {
    const res = await loggedFetch(`${API_BASE}${API_USER_BATCH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      submitError.value = parseFetchError(res, text);
      return;
    }
    resetExcel();
    submitError.value = '';
    emit('saved');
    emit('close');
  } catch (e) {
    submitError.value = e.message || '批次新增失敗';
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
      aria-labelledby="user-batch-modal-title"
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
              :disabled="saving"
              @click="close"
            />
          </div>
          <div class="modal-body pt-2">
            <input
              ref="excelFileInputRef"
              type="file"
              :accept="EXCEL_ACCEPT_ATTR"
              class="d-none"
              :disabled="saving"
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
              <p class="my-font-sm-400 my-color-gray-4 mt-2 mb-0">
                共 {{ excelPreviewRows.length }} 筆預覽（有效登入 ID：{{ batchPayloadNormalized.length }} 筆）
              </p>
            </div>
            <div
              v-if="excelPreviewRows.length > 0 && batchPayloadNormalized.length === 0"
              class="my-alert-warning-soft rounded my-font-sm-400 py-2 mt-3 mb-0"
              role="alert"
            >
              沒有有效的登入 ID，請檢查 Excel。
            </div>
            <div
              v-if="duplicateIdsInFile.length > 0"
              class="my-alert-danger-soft rounded my-font-sm-400 py-2 mt-3 mb-0"
              role="alert"
            >
              Excel 內登入 ID 重複：{{ duplicateIdsInFile.join('、') }}，請修正檔案後再試。
            </div>
            <div
              v-if="idsClashingExisting.length > 0"
              class="my-alert-danger-soft rounded my-font-sm-400 py-2 mt-3 mb-0"
              role="alert"
            >
              以下登入 ID 已存在於系統：{{ idsClashingExisting.join('、') }}，請從檔案移除後再試。
            </div>
            <div v-if="submitError" class="my-color-red my-font-sm-400 mt-2 mb-0">
              {{ submitError }}
            </div>
          </div>
          <div class="modal-footer border-top-0 pt-0">
            <button type="button" class="btn my-btn-outline-gray-2" :disabled="saving" @click="close">
              關閉
            </button>
            <button
              type="button"
              class="btn my-button-blue"
              :disabled="!submitEnabled"
              @click="submit"
            >
              {{ saving ? '處理中…' : '批次新增學生' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
