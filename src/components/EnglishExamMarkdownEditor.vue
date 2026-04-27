<script setup>
/**
 * 建立英文測驗題庫「文字內容」用：EasyMDE + 「編輯／預覽」切換；預覽為 marked + DOMPurify（與全站 renderMarkdown 一致）
 * previewOnly：讀入／build-system 完成等唯讀時僅顯示預覽，不掛 EasyMDE、不顯示編輯分頁
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** 僅預覽：已讀入或 build-system 完成；不掛編輯器、不顯示編輯／預覽切換 */
  previewOnly: { type: Boolean, default: false },
  /** 對應外層 <label for="…">，維持無障礙關聯 */
  textareaId: { type: String, default: 'english-bank-paste-text' },
});

const emit = defineEmits(['update:modelValue']);

const previewHtml = computed(() => renderMarkdownToSafeHtml(props.modelValue));
const previewEmpty = computed(() => !(props.modelValue != null && String(props.modelValue).trim()));

/** 編輯器與 HTML 預覽二擇一顯示（避免左右並排） */
const viewMode = ref('edit');

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
      viewMode.value = 'preview';
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

watch(viewMode, (m) => {
  if (m !== 'edit' || props.previewOnly) return;
  nextTick(() => {
    easyMDE?.codemirror?.refresh();
  });
});

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
        class="english-exam-md-preview-panel my-bgcolor-surface min-w-0 rounded-2 border overflow-auto"
        role="region"
        aria-label="Markdown 預覽（僅讀）"
        tabindex="0"
      >
        <div
          v-if="!previewEmpty"
          class="english-exam-md-preview-body px-3 py-2 text-break"
          v-html="previewHtml"
        />
        <div
          v-else
          class="english-exam-md-preview-empty px-3 py-4 my-font-sm-400 my-color-gray-4 text-center"
        >
          尚無內容可預覽
        </div>
      </div>
    </template>
    <template v-else>
    <div
      class="btn-group my-btn-group-pill w-100 mb-2"
      role="tablist"
      aria-label="Markdown 編輯或預覽"
    >
      <button
        type="button"
        class="btn d-flex justify-content-center align-items-center text-center my-font-md-400 px-2 px-sm-3 py-2 flex-fill"
        :class="viewMode === 'edit' ? 'my-button-white' : 'my-button-gray-3'"
        role="tab"
        :aria-selected="viewMode === 'edit'"
        aria-controls="english-exam-md-editor-panel"
        :tabindex="viewMode === 'edit' ? 0 : -1"
        @click="viewMode = 'edit'"
      >
        編輯
      </button>
      <button
        type="button"
        class="btn d-flex justify-content-center align-items-center text-center my-font-md-400 px-2 px-sm-3 py-2 flex-fill"
        :class="viewMode === 'preview' ? 'my-button-white' : 'my-button-gray-3'"
        role="tab"
        :aria-selected="viewMode === 'preview'"
        aria-controls="english-exam-md-preview-panel"
        :tabindex="viewMode === 'preview' ? 0 : -1"
        @click="viewMode = 'preview'"
      >
        預覽
      </button>
    </div>

    <div
      v-show="viewMode === 'edit'"
      id="english-exam-md-editor-panel"
      class="english-exam-md-editor-wrap min-w-0"
      role="tabpanel"
      aria-label="Markdown 編輯"
    >
      <textarea :id="textareaId" ref="textareaRef" />
    </div>

    <div
      v-show="viewMode === 'preview'"
      id="english-exam-md-preview-panel"
      class="english-exam-md-preview-panel my-bgcolor-surface min-w-0 rounded-2 border overflow-auto"
      role="tabpanel"
      aria-label="Markdown 預覽"
    >
      <div
        v-if="!previewEmpty"
        class="english-exam-md-preview-body px-3 py-2 text-break"
        v-html="previewHtml"
      />
      <div
        v-else
        class="english-exam-md-preview-empty px-3 py-4 my-font-sm-400 my-color-gray-4 text-center"
      >
        尚無內容可預覽
      </div>
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

.english-exam-md-preview-panel {
  min-height: 280px;
  max-height: var(--english-md-preview-max-h);
  border-color: var(--bs-border-color, #dee2e6) !important;
  overflow-y: auto;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
}

.english-exam-md-preview-body :deep(h1),
.english-exam-md-preview-body :deep(h2),
.english-exam-md-preview-body :deep(h3) {
  margin-top: 0.75rem;
  margin-bottom: 0.35rem;
  font-weight: 600;
  line-height: 1.3;
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
</style>
