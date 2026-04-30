<script setup>
/**
 * Design 頁「08 · 下拉選單」同款：Bootstrap 5 dropdown；
 * 外層 .my-design-08-dropdown；觸發 btn rounded-2 · my-dropdown-caret · my-font-md-400 · my-button-white；
 * 選單 .dropdown-menu Bootstrap 預設。
 */
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [Number, String], required: true },
  /** @type {{ value: number | string, label: string }[]} */
  options: { type: Array, required: true },
  /** 頁內唯一，用於 aria-labelledby／toggle id */
  menuId: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  /** true：佔滿父層寬（如 Modal）；false：可配合 triggerWidth 固定觸發寬 */
  block: { type: Boolean, default: false },
  /** 例如 7.25rem；僅 !block 時套在外層 */
  triggerWidth: { type: String, default: '' },
  /** 觸發鈕 aria-label */
  ariaLabel: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue']);

const toggleId = computed(() => `${props.menuId}-toggle`);

const rootClass = computed(() => {
  if (props.block) return 'dropdown w-100 min-w-0 my-design-08-dropdown';
  return 'dropdown my-design-08-dropdown flex-shrink-0 min-w-0';
});

const rootStyle = computed(() => {
  if (props.block || !props.triggerWidth) return undefined;
  return { width: props.triggerWidth, maxWidth: '100%' };
});

function matchesOption(opt) {
  const a = props.modelValue;
  const b = opt.value;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (a !== '' && a != null && b !== '' && b != null && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

const buttonLabel = computed(() => {
  const hit = props.options.find((o) => matchesOption(o));
  return hit ? hit.label : '—';
});

function pick(val) {
  emit('update:modelValue', val);
}
</script>

<template>
  <div
    data-bs-display="static"
    :class="rootClass"
    :style="rootStyle"
  >
    <button
      :id="toggleId"
      type="button"
      class="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white w-100 min-w-0 px-3 py-2 text-start"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
    >
      <span class="text-truncate flex-grow-1 pe-2 text-start">{{ buttonLabel }}</span>
      <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0" aria-hidden="true" />
    </button>
    <ul
      class="dropdown-menu dropdown-menu-start w-100"
      :aria-labelledby="toggleId"
    >
      <li v-for="(opt, i) in options" :key="`${menuId}-opt-${i}`">
        <button
          type="button"
          class="dropdown-item text-wrap"
          :class="{ active: matchesOption(opt) }"
          @click="pick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
