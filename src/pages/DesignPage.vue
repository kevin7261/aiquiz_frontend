<script setup>
import { ref } from 'vue';
import DesignPageCopyBtn from '../components/DesignPageCopyBtn.vue';
import RagTabsBar from '../components/RagTabsBar.vue';

defineProps({
  tabId: { type: String, default: '' },
});

const designSampleChoice = ref('選項一');

const designTabActiveId = ref('design-tab-1');
const designTabRagItems = ref([
  { _tabId: 'design-tab-1', _label: '分頁甲' },
  { _tabId: 'design-tab-2', _label: '分頁乙' },
]);
const designTabNewItems = ref([]);

function onDesignTabAdd() {
  const id = `design-new-${Date.now()}`;
  designTabNewItems.value.push({ id, label: '新分頁' });
  designTabActiveId.value = id;
}

function onDesignTabDelete(tabId) {
  designTabNewItems.value = designTabNewItems.value.filter((t) => t.id !== tabId);
  designTabRagItems.value = designTabRagItems.value.filter((t) => t._tabId !== tabId);
  if (designTabActiveId.value === tabId) {
    const firstRag = designTabRagItems.value[0];
    const firstNew = designTabNewItems.value[0];
    designTabActiveId.value = firstRag?._tabId ?? firstNew?.id ?? null;
  }
}

function onDesignTabRename(tabId) {
  const rag = designTabRagItems.value.find((t) => t._tabId === tabId);
  if (rag) {
    const name = window.prompt('分頁名稱', rag._label);
    if (name != null && name.trim()) rag._label = name.trim();
    return;
  }
  const neu = designTabNewItems.value.find((t) => t.id === tabId);
  if (neu) {
    const name = window.prompt('分頁名稱', neu.label);
    if (name != null && name.trim()) neu.label = name.trim();
  }
}
</script>

<template>
  <div class="h-100 d-flex flex-column overflow-hidden my-bgcolor-black" data-bs-theme="dark">
    <header class="flex-shrink-0 my-bgcolor-black py-3 px-3 px-md-4">
      <div class="container-fluid px-0">
        <div class="row justify-content-center">
          <div class="col-12 col-xl-10 col-xxl-8">
            <p class="my-font-xl-600 my-color-white text-break mb-0">UI 元件參考</p>
          </div>
        </div>
      </div>
    </header>
    <div class="flex-grow-1 overflow-auto">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-xl-10 col-xxl-8">
          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">01 · 字階</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="row g-4 align-items-start">
                  <div class="col-12 col-md-6">
                    <dl class="mb-0">
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-xl-400 my-color-white">第一級 · 一般</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-xl-400</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-xl-400" />
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-lg-400 my-color-white">第二級 · 一般</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-lg-400</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-lg-400" />
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-md-400 my-color-white">第三級 · 一般</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-md-400</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-md-400" />
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1">
                        <dt class="my-font-sm-400 my-color-white">第四級 · 一般</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-sm-400</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-sm-400" />
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div class="col-12 col-md-6">
                    <dl class="mb-0">
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-xl-600 my-color-white">第一級 · 強調</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-xl-600</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-xl-600" />
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-lg-600 my-color-white">第二級 · 強調</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-lg-600</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-lg-600" />
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-md-600 my-color-white">第三級 · 強調</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-md-600</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-md-600" />
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1">
                        <dt class="my-font-sm-600 my-color-white">第四級 · 強調</dt>
                        <dd class="my-font-sm-400 d-flex align-items-center gap-2 w-100 mb-0">
                          <span class="font-monospace my-color-white text-break flex-grow-1 min-w-0">.my-font-sm-600</span>
                          <DesignPageCopyBtn class="ms-auto" text=".my-font-sm-600" />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">02 · 語意色</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="row g-3">
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-red my-color-white h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-bgcolor-red</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-red" />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-dark my-color-red h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-red</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-red" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-yellow my-color-black h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 my-color-black px-1">.my-bgcolor-yellow</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-yellow" on-light-bg />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-dark my-color-yellow h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-yellow</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-yellow" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-green my-color-white h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-bgcolor-green</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-green" />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-dark my-color-green h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-green</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-green" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-blue my-color-white h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-bgcolor-blue</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-blue" />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-dark my-color-blue h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-blue</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-blue" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">03 · 灰階 · 背景</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="row g-3">
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-black my-color-white h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-bgcolor-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-black" />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-black my-color-white h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-white</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-white" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-dark my-color-white h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-bgcolor-gray-dark</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-gray-dark" />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-dark my-color-gray-light h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-gray-light</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-gray-light" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-light my-color-black h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 my-color-black px-1">.my-bgcolor-gray-light</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-gray-light" on-light-bg />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-gray-light my-color-gray-dark h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 px-1">.my-color-gray-dark</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-gray-dark" on-light-bg />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="row g-2">
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-white my-color-black h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 my-color-black px-1">.my-bgcolor-white</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-white" on-light-bg />
                        </div>
                      </div>
                      <div class="col-12 col-md-6">
                        <div
                          class="d-flex align-items-center gap-2 flex-wrap w-100 my-font-sm-400 rounded-3 text-center my-bgcolor-white my-color-black h-100 p-3"
                        >
                          <code class="font-monospace text-break text-center flex-grow-1 min-w-0 my-color-black px-1">.my-color-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-black" on-light-bg />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">04 · 區塊定義</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="my-font-sm-400 d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">深底稿</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4" />
                  </div>
                </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">05 · 按鈕</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-blue flex-shrink-0 px-3 py-1"
                    >
                      藍色
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-blue px-3 py-1</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-blue px-3 py-1"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-white-border flex-shrink-0 px-3 py-1"
                    >
                      白描邊
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-white-border px-3 py-1</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-white-border px-3 py-1"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-white-borderless flex-shrink-0 px-3 py-1"
                    >
                      白無框
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-white-borderless px-3 py-1</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex align-items-center justify-content-center my-font-sm-400 my-button-white-borderless px-3 py-1"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-blue flex-shrink-0 px-3 py-2"
                    >
                      藍色
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-blue px-3 py-2</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-blue px-3 py-2" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-border flex-shrink-0 px-3 py-2"
                    >
                      白描邊
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-border px-3 py-2</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-border px-3 py-2" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless flex-shrink-0 px-3 py-2"
                    >
                      白無框
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless px-3 py-2</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless px-3 py-2" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-blue flex-shrink-0 px-4 py-3"
                    >
                      藍色
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-blue px-4 py-3</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-blue px-4 py-3" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-border flex-shrink-0 px-4 py-3"
                    >
                      白描邊
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-border px-4 py-3</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-border px-4 py-3" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <button
                      type="button"
                      class="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless flex-shrink-0 px-4 py-3"
                    >
                      白無框
                    </button>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless px-4 py-3</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="btn rounded-pill d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless px-4 py-3" />
                  </div>
                </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">06 · 分頁</h2>
            <div class="my-bgcolor-gray-dark overflow-hidden rounded-3 mb-4">
              <div class="p-0">
                <RagTabsBar
                  :rag-items="designTabRagItems"
                  :new-tab-items="designTabNewItems"
                  :active-tab-id="designTabActiveId"
                  design-chrome
                  relax-button-disables
                  @update:active-tab-id="designTabActiveId = $event"
                  @add-new-tab="onDesignTabAdd"
                  @delete-rag="onDesignTabDelete"
                  @rename-tab="onDesignTabRename"
                />
              </div>
              <div class="border-top border-secondary border-opacity-25 p-4 mb-5">
                <div class="my-font-sm-400 d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">元件（深色頂列）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >RagTabsBar · designChrome · relaxButtonDisables</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="RagTabsBar designChrome relaxButtonDisables"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">結構</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >ul.nav.nav-tabs.border-bottom-0 · li.nav-item · .nav-link.active</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="nav nav-tabs border-bottom-0"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">筆／刪除（僅當前分頁）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn btn-link my-tab-nav-action-btn · fa-pen · fa-xmark</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="my-tab-nav-action-btn" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">新增分頁（32×32 rounded-circle · my-btn-circle · fa-plus／建立中 fa-spinner）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-circle d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless my-btn-circle</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-circle d-flex align-items-center justify-content-center my-font-md-400 my-button-white-borderless my-btn-circle"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">07 · 表格</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="rounded-4 overflow-auto border">
                  <table class="table table-striped table-hover mb-0">
                    <thead>
                      <tr>
                        <th class="px-3 py-2" scope="col">項目</th>
                        <th class="px-3 py-2" scope="col">說明</th>
                        <th class="text-end px-3 py-2" scope="col">數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td class="px-3 py-2">範例列 A</td>
                        <td class="my-color-gray-light px-3 py-2">輔助欄位</td>
                        <td class="text-end px-3 py-2">12</td>
                      </tr>
                      <tr>
                        <td class="px-3 py-2">範例列 B</td>
                        <td class="my-color-gray-light px-3 py-2">輔助欄位</td>
                        <td class="text-end px-3 py-2">3</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="my-font-sm-400 d-flex flex-column gap-3 mt-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">外層捲動框</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >rounded-4 overflow-auto border</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="rounded-4 overflow-auto border"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">表格</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >table table-striped table-hover mb-0</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="table table-striped table-hover mb-0"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">表頭／儲存格</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >px-3 py-2</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="px-3 py-2" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">輔助字色</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >my-color-gray-light</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="my-color-gray-light" />
                  </div>
                </div>
            </div>
          </section>

          <section class="my-page-block-spacing">
            <h2 class="my-font-lg-600 my-color-white text-break mb-3">08 · 下拉選單</h2>
            <div class="my-bgcolor-gray-dark rounded-3 p-3 p-lg-4 mb-4">
                <div class="mb-4">
                  <div class="dropdown">
                    <button
                      id="design-page-choice-dropdown-btn"
                      class="btn rounded-pill d-flex align-items-center justify-content-between dropdown-toggle my-dropdown-caret my-button-blue flex-shrink-0 px-3 py-2"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      <span class="text-truncate text-start pe-2">{{ designSampleChoice }}</span>
                      <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                    </button>
                    <ul class="dropdown-menu my-dropdown-menu" aria-labelledby="design-page-choice-dropdown-btn">
                      <li>
                        <a class="dropdown-item" href="#" @click.prevent="designSampleChoice = '選項一'">選項一</a>
                      </li>
                      <li>
                        <a class="dropdown-item" href="#" @click.prevent="designSampleChoice = '選項二'">選項二</a>
                      </li>
                      <li>
                        <a class="dropdown-item" href="#" @click.prevent="designSampleChoice = '選項三'">選項三</a>
                      </li>
                    </ul>
                  </div>
                </div>
                <div class="dropdown">
                  <button
                    class="btn rounded-pill d-flex align-items-center justify-content-between dropdown-toggle my-dropdown-caret my-button-white-border flex-shrink-0 px-3 py-2"
                    type="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    id="design-page-dropdown-btn"
                  >
                    <span class="text-truncate text-start pe-2">更多動作</span>
                    <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end my-dropdown-menu" aria-labelledby="design-page-dropdown-btn">
                    <li><a class="dropdown-item" href="#" @click.prevent>編輯</a></li>
                    <li><a class="dropdown-item" href="#" @click.prevent>複製</a></li>
                    <li><hr class="dropdown-divider" /></li>
                    <li><a class="dropdown-item my-dropdown-item-danger" href="#" @click.prevent>刪除</a></li>
                  </ul>
                </div>

                <div class="my-font-sm-400 d-flex flex-column gap-3 mt-4">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">觸發（填色 · my-button-blue）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-between dropdown-toggle my-dropdown-caret my-button-blue flex-shrink-0 px-3 py-2</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex align-items-center justify-content-between dropdown-toggle my-dropdown-caret my-button-blue flex-shrink-0 px-3 py-2"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">觸發（白描邊 · 同 05）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex align-items-center justify-content-between dropdown-toggle my-dropdown-caret my-button-white-border flex-shrink-0 px-3 py-2</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex align-items-center justify-content-between dropdown-toggle my-dropdown-caret my-button-white-border flex-shrink-0 px-3 py-2"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">箭頭（Font Awesome · 接在標籤後）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >fa-solid fa-chevron-down my-dropdown-toggle-caret</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="fa-solid fa-chevron-down my-dropdown-toggle-caret"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">標籤（選用）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >span.text-truncate.text-start.pe-2</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="text-truncate text-start pe-2"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">選單</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >dropdown-menu my-dropdown-menu</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="dropdown-menu my-dropdown-menu" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">選單靠右（選用）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >dropdown-menu dropdown-menu-end my-dropdown-menu</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="dropdown-menu dropdown-menu-end my-dropdown-menu"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 small">項目／分隔／危險</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >dropdown-item · dropdown-divider · dropdown-item my-dropdown-item-danger</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="dropdown-item my-dropdown-item-danger"
                    />
                  </div>
                </div>
            </div>
          </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
