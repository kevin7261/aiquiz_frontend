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
  title: { type: String, default: '修改分頁名稱' },
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
      class="modal fade show d-block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'tab-rename-modal-title'"
      style="background-color: rgba(0, 0, 0, 0.45);"
      @click.self="onBackdropClick"
    >
      <div class="modal-dialog modal-dialog-centered" @click.stop>
        <div class="modal-content shadow">
          <div class="modal-header border-bottom-0 pb-0">
            <h5 id="tab-rename-modal-title" class="modal-title">{{ title }}</h5>
            <button
              type="button"
              class="btn-close"
              aria-label="關閉"
              :disabled="saving"
              @click="close"
            />
          </div>
          <div class="modal-body pt-2">
            <label class="form-label my-font-size-sm text-secondary mb-1" for="tab-rename-input">名稱</label>
            <input
              id="tab-rename-input"
              v-model="localName"
              type="text"
              class="form-control"
              maxlength="200"
              autocomplete="off"
              :disabled="saving"
              @keydown.enter.prevent="onSave"
            />
            <div v-if="error" class="text-danger my-font-size-sm mt-2">{{ error }}</div>
          </div>
          <div class="modal-footer border-top-0 pt-0">
            <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="close">
              取消
            </button>
            <button type="button" class="btn btn-primary" :disabled="saving" @click="onSave">
              {{ saving ? '儲存中…' : '儲存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
