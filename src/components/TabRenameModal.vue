<script setup>
/**
 * 分頁名稱編輯：Bootstrap 5 風格 modal（半透明底）
 */
import { ref, watch } from 'vue';

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

function onBackdropClick() {
  if (!props.saving) close();
}

function onSave() {
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
      @click.self="onBackdropClick"
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
              :disabled="saving"
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
