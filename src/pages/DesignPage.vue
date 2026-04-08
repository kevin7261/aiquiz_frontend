<script setup>
import { ref } from 'vue';
import DesignPageCopyBtn from '../components/DesignPageCopyBtn.vue';
defineProps({
  tabId: { type: String, default: '' },
});

const designSampleChoice = ref('選項一');
const designSampleChoiceWhite = ref('選項一');
</script>

<template>
  <!--
    DesignPage｜UI 元件參考（稿）
    - 根層：全高 flex 直向、黑底（my-bgcolor-black）；頂部固定、下方主區可捲動。
    - 內容寬：container-fluid + row 置中，欄寬上限 col-xl-10／col-xxl-8（與頂欄一致）。
    - 章節：各 <section> 使用 my-page-block-spacing；區塊標題 h2 在深灰塊內，class 固定為 my-font-lg-600 my-color-white text-break mb-4；07 分頁標題另包 px 與分頁列區隔。
    - 複製：DesignPageCopyBtn 為 32px 圓形白無框（my-btn-circle + my-button-white-borderless）；淺底色票加 on-light-bg。
    - 編號：05 區塊內含「08 · 下拉選單」（視覺緊接在按鈕示範下方）；其後為 06 輸入、07 分頁、08 表格。
  -->
  <div class="h-100 d-flex flex-column overflow-hidden my-bgcolor-black">
    <!-- 頁首：稿名，不隨內文捲動 -->
    <header class="flex-shrink-0 my-bgcolor-black py-3 px-3 px-md-4">
      <div class="container-fluid px-0">
        <div class="row justify-content-center">
          <div class="col-12 col-xl-10 col-xxl-8">
            <p class="my-font-xl-600 my-color-white text-break mb-0">UI 元件參考</p>
          </div>
        </div>
      </div>
    </header>

    <!-- 主內文：overflow-auto 僅此層捲動 -->
    <div class="flex-grow-1 overflow-auto">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <!-- 與 header 同寬上限，避免寬螢過長一行 -->
          <div class="col-12 col-xl-10 col-xxl-8">

          <!-- ===== 01 · 字階 =====
               common：.my-font-{xl|lg|md|sm}-{400|600}；左欄字重 400、右欄 600；<dl> 示範語意結構 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">01 · 字階</h2>
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

          <!-- ===== 02 · 語意色 =====
               紅／黃／綠／藍：每列左 my-bgcolor-*、右 my-color-*（深灰底上字色）；
               黃底等淺色票上的複製鈕需 on-light-bg -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">02 · 語意色</h2>
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

          <!-- ===== 03 · 灰階 · 背景 =====
               中性色 my-bgcolor-* / my-color-*；淺灰底（my-bgcolor-gray-light、my-bgcolor-white）上複製鈕用 on-light-bg -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">03 · 灰階 · 背景</h2>
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

          <!-- ===== 04 · 區塊定義 =====
               稿頁深灰內容區外層建議 class 字串（與業務頁淺底 my-bgcolor-page-block 分開說明） -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">04 · 區塊定義</h2>
                <div class="my-font-sm-400 d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >rounded-4 my-bgcolor-gray-dark p-3 mb-4</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="rounded-4 my-bgcolor-gray-dark p-3 mb-4" />
                  </div>
                </div>
            </div>
          </section>

          <!-- ===== 05 · 按鈕 + 08 · 下拉選單（同一 section） =====
               按鈕：小／中／大三組；每組 藍／白色／白描邊／白無框；圓形白無框下附兩鍵 btn-group + my-btn-group-pill（中）：選中 my-button-white、未選 my-button-black。單行輸入見獨立區塊「06 · 輸入」。
               圓形：分頁「+」與複製鈕同規 my-btn-circle + my-button-white-borderless。
               08 下拉：緊接於此深底區塊下；觸發鈕僅示範「中」字級（my-font-md-400 · px-3 py-2）之藍底、白色（my-button-white）與白無框；選單 my-dropdown-menu。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">05 · 按鈕</h2>
                <div class="d-flex flex-column gap-4">
                  <!-- 小：字級 my-font-sm-400、內距 px-3 py-1 -->
                  <div>
                    <div class="my-color-gray-light my-font-sm-400 mb-2">小（my-font-sm-400 · px-3 py-1）</div>
                    <div class="d-flex flex-column gap-3">
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-blue flex-shrink-0 px-3 py-1"
                        >
                          藍色
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-blue px-3 py-1</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-blue px-3 py-1"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white flex-shrink-0 px-3 py-1"
                        >
                          白色
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white px-3 py-1</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white px-3 py-1"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border flex-shrink-0 px-3 py-1"
                        >
                          白描邊
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border px-3 py-1</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border px-3 py-1"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-borderless flex-shrink-0 px-3 py-1"
                        >
                          白無框
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-borderless px-3 py-1</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-borderless px-3 py-1"
                        />
                      </div>
                    </div>
                  </div>
                  <!-- 中：字級 my-font-md-400、內距 px-3 py-2（全站表單／下拉觸發與此組對齊；文字輸入見 06 · 輸入） -->
                  <div>
                    <div class="my-color-gray-light my-font-sm-400 mb-2">中（my-font-md-400 · px-3 py-2）</div>
                    <div class="d-flex flex-column gap-3">
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue flex-shrink-0 px-3 py-2"
                        >
                          藍色
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-3 py-2</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-3 py-2"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                        >
                          白色
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-3 py-2</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-3 py-2"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border flex-shrink-0 px-3 py-2"
                        >
                          白描邊
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border px-3 py-2</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border px-3 py-2"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless flex-shrink-0 px-3 py-2"
                        >
                          白無框
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless px-3 py-2</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                  <!-- 大：字級同中、內距 px-4 py-3 -->
                  <div>
                    <div class="my-color-gray-light my-font-sm-400 mb-2">大（my-font-md-400 · px-4 py-3）</div>
                    <div class="d-flex flex-column gap-3">
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue flex-shrink-0 px-4 py-3"
                        >
                          藍色
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-4 py-3</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-4 py-3"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white flex-shrink-0 px-4 py-3"
                        >
                          白色
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-4 py-3</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-4 py-3"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border flex-shrink-0 px-4 py-3"
                        >
                          白描邊
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border px-4 py-3</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border px-4 py-3"
                        />
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless flex-shrink-0 px-4 py-3"
                        >
                          白無框
                        </button>
                        <code
                          class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                          >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless px-4 py-3</code>
                        <DesignPageCopyBtn
                          class="align-self-end align-self-md-center ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless px-4 py-3"
                        />
                      </div>
                    </div>
                  </div>
                  <!-- 圓形圖示鈕：32×32，與建立測驗題庫分頁「+」／ExamPage 新增分頁同規 -->
                  <div>
                    <div class="my-color-gray-light my-font-sm-400 mb-2">圓形白無框（md · my-btn-circle · 例：fa-plus）</div>
                    <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                      <button
                        type="button"
                        class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle flex-shrink-0"
                        aria-label="圓形白無框（範例圖示 fa-plus）"
                      >
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      </button>
                      <code
                        class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                        >btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle</code>
                      <DesignPageCopyBtn
                        class="align-self-end align-self-md-center ms-auto"
                        text="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle"
                      />
                    </div>
                  </div>
                  <!-- 兩鍵群組（示範：選中白色填色、未選黑底；字級同「中」） -->
                  <div>
                    <div class="my-color-gray-light my-font-sm-400 mb-2">
                      兩鍵群組（btn-group · my-btn-group-pill · 中 · 選中 my-button-white · 未選 my-button-black）
                    </div>
                    <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                      <div
                        class="btn-group my-btn-group-pill flex-shrink-0"
                        role="group"
                        aria-label="示範：兩鍵群組（選中／未選）"
                      >
                        <button
                          type="button"
                          class="btn d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-3 py-2"
                        >
                          選項甲
                        </button>
                        <button
                          type="button"
                          class="btn d-flex justify-content-center align-items-center my-font-md-400 my-button-black px-3 py-2"
                        >
                          選項乙
                        </button>
                      </div>
                      <code
                        class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                        >btn-group my-btn-group-pill · btn … my-font-md-400 my-button-white px-3 py-2 · btn … my-button-black px-3 py-2</code>
                      <DesignPageCopyBtn
                        class="align-self-end align-self-md-center ms-auto"
                        text="btn-group my-btn-group-pill btn my-font-md-400 my-button-white px-3 py-2 btn my-font-md-400 my-button-black px-3 py-2"
                      />
                    </div>
                  </div>
                </div>
            </div>

            <!-- 08 · 下拉選單（仍屬 05 同一 section；獨立深底塊） -->
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4 mt-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">08 · 下拉選單</h2>
              <div>
                <div class="my-color-gray-light my-font-sm-400 mb-2">中（my-font-md-400 · px-3 py-2）</div>
                <div class="d-flex flex-column gap-3">
                  <!-- 藍底觸發：designSampleChoice 綁定示範選項文字 -->
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <div class="dropdown flex-shrink-0">
                      <button
                        id="design-dd-md-blue-btn"
                        class="btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-blue flex-shrink-0 px-3 py-2"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <span class="text-truncate text-start pe-2">{{ designSampleChoice }}</span>
                        <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                      </button>
                      <ul class="dropdown-menu my-dropdown-menu" aria-labelledby="design-dd-md-blue-btn">
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
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-blue flex-shrink-0 px-3 py-2</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-blue flex-shrink-0 px-3 py-2"
                    />
                  </div>
                  <!-- 白色填色觸發：designSampleChoiceWhite 綁定示範選項文字，my-button-white -->
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <div class="dropdown flex-shrink-0">
                      <button
                        id="design-dd-md-white-btn"
                        class="btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <span class="text-truncate text-start pe-2">{{ designSampleChoiceWhite }}</span>
                        <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                      </button>
                      <ul class="dropdown-menu my-dropdown-menu" aria-labelledby="design-dd-md-white-btn">
                        <li>
                          <a class="dropdown-item" href="#" @click.prevent="designSampleChoiceWhite = '選項一'">選項一</a>
                        </li>
                        <li>
                          <a class="dropdown-item" href="#" @click.prevent="designSampleChoiceWhite = '選項二'">選項二</a>
                        </li>
                        <li>
                          <a class="dropdown-item" href="#" @click.prevent="designSampleChoiceWhite = '選項三'">選項三</a>
                        </li>
                      </ul>
                    </div>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white flex-shrink-0 px-3 py-2</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                    />
                  </div>
                  <!-- 白無框觸發：同字級／內距，my-button-white-borderless -->
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <div class="dropdown flex-shrink-0">
                      <button
                        id="design-dd-md-bl-btn"
                        class="btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white-borderless flex-shrink-0 px-3 py-2"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <span class="text-truncate text-start pe-2">選項</span>
                        <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                      </button>
                      <ul class="dropdown-menu my-dropdown-menu" aria-labelledby="design-dd-md-bl-btn">
                        <li><a class="dropdown-item" href="#" @click.prevent>選項一</a></li>
                        <li><a class="dropdown-item" href="#" @click.prevent>選項二</a></li>
                      </ul>
                    </div>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white-borderless flex-shrink-0 px-3 py-2</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-pill d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white-borderless flex-shrink-0 px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ===== 06 · 輸入 =====
               單行／輸入區塊：啟用與停用各一；標籤與欄位上下排列；.form-control.my-input-md.my-input-md--on-dark · .rounded-2；停用加 HTML disabled。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
              <h2 class="my-font-lg-600 my-color-white text-break mb-4">06 · 輸入</h2>
              <div class="d-flex flex-column gap-4">
                <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                  <div
                    class="d-flex flex-column gap-2 flex-shrink-0 align-self-stretch align-self-md-start"
                    style="max-width: min(100%, 18rem)"
                  >
                    <label
                      class="my-color-gray-light flex-shrink-0 my-font-sm-400 mb-0"
                      for="design-input-md-on"
                    >
                      輸入（啟用）
                    </label>
                    <input
                      id="design-input-md-on"
                      type="text"
                      class="form-control my-input-md my-input-md--on-dark rounded-2 flex-shrink-0 w-100 px-3 py-2"
                      placeholder="單行輸入"
                      autocomplete="off"
                    >
                  </div>
                  <code
                    class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                  >
                    form-control my-input-md my-input-md--on-dark rounded-2
                  </code>
                  <DesignPageCopyBtn
                    class="align-self-end align-self-md-center ms-auto"
                    text="form-control my-input-md my-input-md--on-dark rounded-2"
                  />
                </div>
                <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                  <div
                    class="d-flex flex-column gap-2 flex-shrink-0 align-self-stretch align-self-md-start"
                    style="max-width: min(100%, 18rem)"
                  >
                    <label
                      class="my-color-gray-light flex-shrink-0 my-font-sm-400 mb-0"
                      for="design-input-md-off"
                    >
                      輸入（停用）
                    </label>
                    <input
                      id="design-input-md-off"
                      type="text"
                      class="form-control my-input-md my-input-md--on-dark rounded-2 flex-shrink-0 w-100 px-3 py-2"
                      value="示範文字"
                      disabled
                      autocomplete="off"
                    >
                  </div>
                  <code
                    class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                  >
                    form-control my-input-md my-input-md--on-dark rounded-2 · disabled
                  </code>
                  <DesignPageCopyBtn
                    class="align-self-end align-self-md-center ms-auto"
                    text="form-control my-input-md my-input-md--on-dark rounded-2（加 HTML disabled）"
                  />
                </div>
                <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-start gap-2 gap-md-3 w-100">
                  <div
                    class="d-flex flex-column gap-2 flex-shrink-0 align-self-stretch w-100"
                    style="max-width: min(100%, 28rem)"
                  >
                    <label
                      class="my-color-gray-light flex-shrink-0 my-font-sm-400 mb-0"
                      for="design-textarea-md-on"
                    >
                      輸入區塊（啟用）
                    </label>
                    <textarea
                      id="design-textarea-md-on"
                      class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                      rows="4"
                      placeholder="多行輸入"
                    ></textarea>
                  </div>
                  <code
                    class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                  >
                    textarea · form-control my-input-md my-input-md--on-dark rounded-2
                  </code>
                  <DesignPageCopyBtn
                    class="align-self-end align-self-md-start ms-auto"
                    text="textarea form-control my-input-md my-input-md--on-dark rounded-2"
                  />
                </div>
                <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-start gap-2 gap-md-3 w-100">
                  <div
                    class="d-flex flex-column gap-2 flex-shrink-0 align-self-stretch w-100"
                    style="max-width: min(100%, 28rem)"
                  >
                    <label
                      class="my-color-gray-light flex-shrink-0 my-font-sm-400 mb-0"
                      for="design-textarea-md-off"
                    >
                      輸入區塊（停用）
                    </label>
                    <textarea
                      id="design-textarea-md-off"
                      class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 px-3 py-2"
                      rows="4"
                      disabled
                    >示範多行文字（停用）</textarea>
                  </div>
                  <code
                    class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                  >
                    textarea · form-control my-input-md my-input-md--on-dark rounded-2 · disabled
                  </code>
                  <DesignPageCopyBtn
                    class="align-self-end align-self-md-start ms-auto"
                    text="textarea form-control my-input-md my-input-md--on-dark rounded-2（加 HTML disabled）"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- ===== 07 · 分頁 =====
               靜態示範：分頁1（active）／分頁2。外殼 class 同業務稿頁。 -->
          <section class="my-page-block-spacing">
            <div class="my-bgcolor-gray-dark p-3 p-lg-4 mb-3">
              <h2 class="my-font-lg-600 my-color-white text-break mb-0">07 · 分頁</h2>
            </div>
            <div
              class="flex-shrink-0 my-rag-tabs-bar my-rag-tabs-bar--design my-bgcolor-black my-rag-tabs-bar--design-fullwidth-bottom"
            >
                <div class="d-flex justify-content-center w-100 px-4 align-items-end pb-0">
                  <ul class="nav nav-tabs border-bottom-0">
                    <li class="nav-item">
                      <div role="tab" class="nav-link d-flex align-items-center gap-1 active" aria-current="page">
                        <span class="flex-grow-1 text-start pe-2">分頁1</span>
                        <button
                          type="button"
                          disabled
                          class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-light pe-2"
                          title="重新命名分頁（示範，無功能）"
                        >
                          <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        </button>
                        <button
                          type="button"
                          disabled
                          class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-light"
                          title="刪除此出題單元（示範，無功能）"
                        >
                          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                      </div>
                    </li>
                    <li class="nav-item">
                      <div role="tab" class="nav-link d-flex align-items-center gap-1">
                        <span class="flex-grow-1 text-start pe-2">分頁2</span>
                        <!-- 與分頁1 同寬：筆位留白（未選不顯示筆） -->
                        <span
                          class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn pe-2"
                          aria-hidden="true"
                        />
                        <span
                          class="d-inline-flex justify-content-center align-items-center flex-shrink-0 my-tab-nav-action-btn"
                          title="試卷用題庫"
                          role="img"
                        >
                          <span
                            class="rounded-circle d-inline-block my-bgcolor-blue"
                            style="width: 0.5rem; height: 0.5rem"
                          />
                        </span>
                      </div>
                    </li>
                    <li class="nav-item d-flex align-items-center ms-2">
                      <button
                        type="button"
                        disabled
                        class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle"
                        title="新增分頁（示範，無功能）"
                        aria-label="新增分頁（示範，無功能）"
                      >
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="my-bgcolor-gray-dark p-3 p-lg-4 mb-4">
                <div class="my-font-sm-400 d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">外殼（與稿頁相同）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 my-bgcolor-black p-2"
                      >flex-shrink-0 my-rag-tabs-bar my-rag-tabs-bar--design my-bgcolor-black my-rag-tabs-bar--design-fullwidth-bottom</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="flex-shrink-0 my-rag-tabs-bar my-rag-tabs-bar--design my-bgcolor-black my-rag-tabs-bar--design-fullwidth-bottom"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">內層置中列</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 my-bgcolor-black p-2"
                      >d-flex justify-content-center w-100 px-4 align-items-end pb-0</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="d-flex justify-content-center w-100 px-4 align-items-end pb-0"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">結構</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 my-bgcolor-black p-2"
                      >ul.nav.nav-tabs.border-bottom-0 · li.nav-item · .nav-link（px-3 py-2）.active</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="nav nav-tabs border-bottom-0"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">筆／刪除（僅當前分頁）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 my-bgcolor-black p-2"
                      >btn btn-link my-tab-nav-action-btn（common：ps-1）· fa-pen · fa-xmark</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="my-tab-nav-action-btn" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">試卷用題庫（藍點）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 my-bgcolor-black p-2"
                      >rounded-circle d-inline-block my-bgcolor-blue（0.5rem）</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="my-bgcolor-blue"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">新增分頁（32×32 rounded-circle · my-btn-circle · fa-plus／建立中 fa-spinner）</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 my-bgcolor-black p-2"
                      >btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-white-borderless my-btn-circle"
                    />
                  </div>
                </div>
              </div>
          </section>

          <!-- ===== 08 · 表格 =====
               外層捲動框 + Bootstrap table；表頭／儲存格內距 px-3 py-2；輔助欄 my-color-gray-light。
               進階表頭樣式見 common .my-table（本示範為輕量版）。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-dark p-3 mb-4">
            <h2 class="my-font-lg-600 my-color-white text-break mb-4">08 · 表格</h2>
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
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">外層捲動框</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >rounded-4 overflow-auto border</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="rounded-4 overflow-auto border"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">表格</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >table table-striped table-hover mb-0</code>
                    <DesignPageCopyBtn
                      class="align-self-end align-self-md-center ms-auto"
                      text="table table-striped table-hover mb-0"
                    />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">表頭／儲存格</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >px-3 py-2</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="px-3 py-2" />
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-light flex-shrink-0 my-font-sm-400">輔助字色</span>
                    <code
                      class="user-select-all my-font-sm-400 font-monospace my-color-gray-light text-break flex-grow-1 min-w-0 rounded-2 my-bgcolor-black p-2"
                      >my-color-gray-light</code>
                    <DesignPageCopyBtn class="align-self-end align-self-md-center ms-auto" text="my-color-gray-light" />
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
