<script setup>
/**
 * TabRenameModal — 分頁重新命名 Modal
 *
 * Bootstrap 5 風格 Modal（半透明背景底層；點背景不關閉），透過 Teleport 掛至 body 避免 z-index 問題。
 *
 * Props:
 *   modelValue   Boolean  v-model：是否顯示（父層控制開關）
 *   initialName  String   開啟時表單的初始名稱
 *   saving       Boolean  是否正在儲存（停用按鈕、禁止關閉）
 *   error        String   儲存失敗時的錯誤訊息（由父層傳入）
 *   title        String   Modal 標題列文字（預設「修改名稱」）
 *
 * Emits:
 *   update:modelValue  開啟／關閉狀態變更（v-model 綁定用）
 *   save               使用者按下確定，帶出 trim 後的名稱字串
 *
 * 「確定」：trim 後非空且與 initialName（trim 後）不同才可按；Enter 同規則。
 */
import { ref, watch, computed } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 開啟時表單初始值 */
  initialName: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  /** 標題列文字 */
  title: { type: String, default: '修改名稱' },
});

const emit = defineEmits(['update:modelValue', 'save']);

const localName = ref('');

const confirmDisabled = computed(() => {
  if (props.saving) return true;
  const next = String(localName.value ?? '').trim();
  const baseline = String(props.initialName ?? '').trim();
  if (next === '') return true;
  if (next === baseline) return true;
  return false;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) localName.value = props.initialName ?? '';
  }
);

watch(
  () => props.initialName,
  (v) => {
    if (props.modelValue) localName.value = v ?? '';
  }
);

function close() {
  emit('update:modelValue', false);
}

function onSave() {
  if (confirmDisabled.value) return;
  emit('save', localName.value.trim());
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="modal fade show d-block my-modal-backdrop"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'tab-rename-modal-title'"
    >
      <div class="modal-dialog modal-dialog-centered" @click.stop>
        <div class="modal-content border-0 my-bgcolor-gray-3 p-4 d-flex flex-column gap-3">
          <div class="modal-header border-bottom-0 p-0">
            <h5 id="tab-rename-modal-title" class="modal-title my-color-black">{{ title }}</h5>
            <button
              type="button"
              class="btn-close"
              :disabled="saving"
              @click="close"
            />
          </div>
          <div class="modal-body p-0">
            <label
              class="form-label flex-shrink-0 my-font-sm-400 my-color-black mb-0"
              for="tab-rename-input"
            >
              名稱
            </label>
            <input
              id="tab-rename-input"
              v-model="localName"
              type="text"
              class="form-control my-input-md my-input-md--on-dark rounded-2 flex-shrink-0 w-100 px-3 py-2"
              maxlength="200"
              autocomplete="off"
              :disabled="saving"
              @keydown.enter.prevent="onSave"
            />
            <div v-if="error" class="my-color-red my-font-sm-400 mt-2">{{ error }}</div>
          </div>
          <div class="modal-footer border-top-0 p-0 d-flex flex-wrap justify-content-end gap-2">
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless px-3 py-2"
              :disabled="saving"
              @click="close"
            >
              取消
            </button>
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 my-font-md-400 my-button-black px-3 py-2"
              :disabled="confirmDisabled"
              :aria-busy="saving"
              @click="onSave"
            >
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
