<script setup>
/**
 * 出題區「選擇單元」：Bootstrap 5 dropdown；行為等同原生 select + v-model。
 * 與 Design 08 一致：外層 .my-design-08-dropdown；觸發 rounded-2、my-button-white（白底、gray-2 邊）；選單 .dropdown-menu Bootstrap 預設。
 */
import { computed } from 'vue';
import { unitSelectValue } from '../utils/englishExamRag.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '— 請選擇單元 —' },
  /** 用於觸發鈕 id（會加上 -toggle），須在頁面內唯一 */
  menuId: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue']);

const toggleId = computed(() => `${props.menuId}-toggle`);

const buttonLabel = computed(() => {
  const v = String(props.modelValue || '').trim();
  if (!v) return props.placeholder;
  const opt = props.options.find((o) => unitSelectValue(o) === v);
  if (opt && opt.rag_name != null && String(opt.rag_name).trim() !== '') {
    return String(opt.rag_name);
  }
  return props.placeholder;
});

function select(val) {
  emit('update:modelValue', val);
}
</script>

<template>
  <div class="dropdown w-100 my-design-08-dropdown">
    <button
      :id="toggleId"
      class="btn dropdown-toggle w-100 d-flex justify-content-between align-items-center my-unit-select-dd-toggle my-dropdown-caret my-font-md-400 my-button-white px-3 py-2 rounded-2 text-start"
      type="button"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      :disabled="disabled"
      :title="buttonLabel"
    >
      <span class="text-truncate flex-grow-1 pe-2">{{ buttonLabel }}</span>
      <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0" aria-hidden="true" />
    </button>
    <ul
      class="dropdown-menu dropdown-menu-start w-100 my-unit-select-dd-menu"
      :aria-labelledby="toggleId"
    >
      <li>
        <button
          type="button"
          class="dropdown-item"
          :class="{ active: !String(modelValue || '').trim() }"
          @click="select('')"
        >
          {{ placeholder }}
        </button>
      </li>
      <li v-for="(opt, i) in options" :key="unitSelectValue(opt) || 'u-' + i">
        <button
          type="button"
          class="dropdown-item text-wrap"
          :class="{ active: unitSelectValue(opt) === modelValue }"
          @click="select(unitSelectValue(opt))"
        >
          {{ opt.rag_name }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 觸發鈕與選單同寬，佔滿父層 */
.my-unit-select-dd-toggle {
  max-width: 100%;
}
.my-unit-select-dd-menu {
  max-height: 280px;
  overflow-y: auto;
  max-width: 100%;
}
</style>
