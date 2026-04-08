<template>
  <button
    type="button"
    class="btn rounded-circle d-flex align-items-center justify-content-center my-btn-circle my-font-md-400 bg-transparent border-0 flex-shrink-0 lh-1 shadow-none my-design-page-copy-btn"
    :class="onLightBg ? 'my-design-page-copy-btn--light' : 'my-design-page-copy-btn--dark'"
    @click.prevent="onCopy"
  >
    <i class="fa-regular fa-copy" aria-hidden="true"></i>
  </button>
</template>

<script setup>
const props = defineProps({
  text: { type: String, required: true },
  /** 淺底（黃／淺灰／白區塊） */
  onLightBg: { type: Boolean, default: false },
})

async function onCopy() {
  try {
    await navigator.clipboard.writeText(props.text.trim())
  } catch {
    /* 非安全情境或瀏覽器不支援時略過 */
  }
}
</script>

<style scoped>
/* 權杖色；勿用 Bootstrap link-*／語意 text-* */
.my-design-page-copy-btn--dark {
  color: var(--my-color-gray-light);
}

.my-design-page-copy-btn--dark:hover,
.my-design-page-copy-btn--dark:focus-visible,
.my-design-page-copy-btn--dark:active {
  color: var(--my-color-white);
  background-color: color-mix(in srgb, var(--my-color-white) 12%, transparent);
}

.my-design-page-copy-btn--light {
  color: var(--my-color-black);
}

.my-design-page-copy-btn--light:hover,
.my-design-page-copy-btn--light:focus-visible,
.my-design-page-copy-btn--light:active {
  color: var(--my-color-black);
  background-color: color-mix(in srgb, var(--my-color-black) 8%, transparent);
}

.my-design-page-copy-btn:focus-visible {
  outline: 2px solid var(--my-color-blue-focus-ring);
  outline-offset: 2px;
}
</style>
