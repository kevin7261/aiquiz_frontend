<script setup>
/**
 * 建立英文測驗題庫「文字內容」用：EasyMDE（工具列含預覽等）。
 * previewOnly：讀入／build-system 完成等唯讀時僅顯示 HTML 預覽（marked + DOMPurify，與全站 renderMarkdown 一致），不掛 EasyMDE。
 * previewDesignDark：僅在 previewOnly 時生效；黑底白字預覽（與 DesignPage `.my-design-swatch-row` + `my-bgcolor-black` 示範一致）。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** 僅預覽：已讀入或 build-system 完成；不掛編輯器 */
  previewOnly: { type: Boolean, default: false },
  /** 唯讀預覽用：Design 頁同款黑底白字（須併 previewOnly） */
  previewDesignDark: { type: Boolean, default: false },
  /** 對應外層 <label for="…">，維持無障礙關聯 */
  textareaId: { type: String, default: 'english-bank-paste-text' },
});

const emit = defineEmits(['update:modelValue']);

const previewHtml = computed(() => renderMarkdownToSafeHtml(props.modelValue));
const previewEmpty = computed(() => !(props.modelValue != null && String(props.modelValue).trim()));

const textareaRef = ref(null);
/** @type {null | { value: (v?: string) => string, codemirror: { setOption: (k: string, v: unknown) => void, refresh: () => void }, toTextArea: () => void }} */
let easyMDE = null;

function syncReadOnly() {
  if (!easyMDE?.codemirror) return;
  easyMDE.codemirror.setOption('readOnly', props.disabled);
}

function initEasyMde() {
  if (props.previewOnly || easyMDE) return;
  const el = textareaRef.value;
  if (!el) return;
  easyMDE = new EasyMDE({
    element: el,
    initialValue: props.modelValue ?? '',
    placeholder: props.placeholder ? String(props.placeholder) : undefined,
    spellChecker: false,
    autoDownloadFontAwesome: false,
    status: false,
    minHeight: '260px',
    renderingConfig: {
      singleLineBreaks: false,
    },
  });
  easyMDE.codemirror.on('change', () => {
    emit('update:modelValue', easyMDE.value());
  });
  syncReadOnly();
}

function destroyEasyMde() {
  if (easyMDE) {
    easyMDE.toTextArea();
    easyMDE = null;
  }
}

onMounted(() => {
  nextTick(() => {
    if (!props.previewOnly) {
      initEasyMde();
    }
  });
});

watch(
  () => props.modelValue,
  (v) => {
    if (!easyMDE) return;
    const next = v ?? '';
    if (easyMDE.value() !== next) {
      easyMDE.value(next);
    }
  }
);

watch(
  () => props.disabled,
  () => {
    syncReadOnly();
  }
);

watch(
  () => props.previewOnly,
  (po) => {
    if (po) {
      destroyEasyMde();
    } else {
      nextTick(() => {
        initEasyMde();
        nextTick(() => {
          easyMDE?.codemirror?.refresh();
        });
      });
    }
  }
);

onBeforeUnmount(() => {
  destroyEasyMde();
});
</script>

<template>
  <div class="english-exam-md-editor-root min-w-0">
    <!-- 唯讀讀入／已建置：只顯示預覽 -->
    <template v-if="previewOnly">
      <div
        :id="textareaId"
        class="english-exam-md-preview-panel min-w-0 rounded-2 overflow-x-auto overflow-y-visible"
        :class="
          previewDesignDark
            ? 'english-exam-md-preview-panel--design-dark my-bgcolor-black border border-white'
            : 'english-exam-md-preview-panel--surface my-bgcolor-surface border'
        "
        role="region"
        aria-label="Markdown 預覽（僅讀）"
        tabindex="0"
      >
        <div
          v-if="!previewEmpty"
          class="english-exam-md-preview-body px-3 py-2 text-break"
          :class="previewDesignDark ? 'my-color-white my-font-md-400' : ''"
          v-html="previewHtml"
        />
        <div
          v-else
          class="english-exam-md-preview-empty px-3 py-4 my-font-sm-400 text-center"
          :class="previewDesignDark ? 'my-color-gray-2' : 'my-color-gray-4'"
        >
          尚無內容可預覽
        </div>
      </div>
    </template>
    <template v-else>
      <div
        id="english-exam-md-editor-panel"
        class="english-exam-md-editor-wrap min-w-0"
        role="region"
        aria-label="Markdown 編輯"
      >
        <textarea :id="textareaId" ref="textareaRef" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.english-exam-md-editor-root {
  --english-md-preview-max-h: min(55vh, 28rem);
}

/* 與表單 rounded-2、灰底區塊視覺對齊；勿對整個 Container overflow:hidden，否則 CodeMirror 內部捲動條不會出現 */
.english-exam-md-editor-wrap :deep(.EasyMDEContainer) {
  border-radius: 0.25rem;
  overflow: visible;
  border: 1px solid var(--bs-border-color, #dee2e6);
}
.english-exam-md-editor-wrap :deep(.editor-toolbar) {
  border-radius: 0.25rem 0.25rem 0 0;
}
/* CodeMirror 5：由 .CodeMirror-scroll 負責 max-height + 捲動（與官方建議一致） */
.english-exam-md-editor-wrap :deep(.CodeMirror) {
  border-radius: 0 0 0.25rem 0.25rem;
  height: auto;
}
.english-exam-md-editor-wrap :deep(.CodeMirror-scroll) {
  min-height: 280px;
  max-height: var(--english-md-preview-max-h);
  overflow-y: auto !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
}

/* 唯讀預覽：高度隨內容伸縮，不設 max-height（出題／批改 prompt 等長文一次看完） */
.english-exam-md-preview-panel--surface {
  border-color: var(--bs-border-color, #dee2e6) !important;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
}

.english-exam-md-preview-panel--design-dark {
  border-color: var(--my-color-white) !important;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
}

/* Design 頁黑底示範列：唯讀 Markdown 內嵌元素字色／區塊對比 */
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(h1),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(h2),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(h3) {
  color: var(--my-color-white);
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(p),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(li),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(td),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(th) {
  color: var(--my-color-white);
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(a) {
  color: var(--my-color-blue-hover);
  word-break: break-word;
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(pre) {
  background: color-mix(in srgb, var(--my-color-white) 12%, transparent);
  color: var(--my-color-white);
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(code) {
  color: var(--my-color-white);
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(p code),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(li code) {
  background: color-mix(in srgb, var(--my-color-white) 14%, transparent);
  color: var(--my-color-white);
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(blockquote) {
  border-left-color: var(--my-color-gray-2);
  color: var(--my-color-gray-2);
}
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(th),
.english-exam-md-preview-panel--design-dark .english-exam-md-preview-body :deep(td) {
  border-color: color-mix(in srgb, var(--my-color-white) 35%, transparent);
}

.english-exam-md-preview-body :deep(h1),
.english-exam-md-preview-body :deep(h2),
.english-exam-md-preview-body :deep(h3) {
  margin-top: 0.75rem;
  margin-bottom: 0.35rem;
  font-weight: 600;
  line-height: 1.3;
}
.english-exam-md-preview-body :deep(h1:first-child),
.english-exam-md-preview-body :deep(h2:first-child),
.english-exam-md-preview-body :deep(h3:first-child) {
  margin-top: 0;
}
.english-exam-md-preview-body :deep(h1) {
  font-size: 1.35rem;
}
.english-exam-md-preview-body :deep(h2) {
  font-size: 1.2rem;
}
.english-exam-md-preview-body :deep(h3) {
  font-size: 1.05rem;
}
.english-exam-md-preview-body :deep(p) {
  margin-bottom: 0.5rem;
}
.english-exam-md-preview-body :deep(ul),
.english-exam-md-preview-body :deep(ol) {
  margin-bottom: 0.5rem;
  padding-left: 1.25rem;
}
.english-exam-md-preview-body :deep(pre) {
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-size: 0.875rem;
  background: var(--my-bgcolor-gray-3, #e9ecef);
}
.english-exam-md-preview-body :deep(code) {
  font-size: 0.9em;
}
.english-exam-md-preview-body :deep(p code),
.english-exam-md-preview-body :deep(li code) {
  padding: 0.1em 0.35em;
  border-radius: 0.2rem;
  background: var(--my-bgcolor-gray-3, #e9ecef);
}
.english-exam-md-preview-body :deep(blockquote) {
  margin: 0.5rem 0;
  padding-left: 0.75rem;
  border-left: 3px solid var(--my-color-gray-2, #adb5bd);
  color: var(--my-color-gray-1, #6c757d);
}
.english-exam-md-preview-body :deep(table) {
  width: 100%;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  border-collapse: collapse;
}
.english-exam-md-preview-body :deep(th),
.english-exam-md-preview-body :deep(td) {
  border: 1px solid var(--bs-border-color, #dee2e6);
  padding: 0.25rem 0.5rem;
}
.english-exam-md-preview-body :deep(a) {
  word-break: break-word;
}
/* 置於各區塊 margin 規則之後：最後一個子元素不再留底緣（單一 <p> 不會像多一層 pb-2） */
.english-exam-md-preview-body :deep(> *:last-child) {
  margin-bottom: 0;
}
</style>
