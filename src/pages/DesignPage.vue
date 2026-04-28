<script setup>
import { ref } from 'vue';
import DesignPageCopyBtn from '../components/DesignPageCopyBtn.vue';
defineProps({
  tabId: { type: String, default: '' },
});

const designSampleChoiceWhite = ref('選項一');
</script>

<template>
  <!--
    DesignPage｜UI 元件參考（稿）
    - 根層：全高 flex 直向、網頁 canvas 灰淺（my-bgcolor-gray-4）；頂部固定、頁首標題無底分隔線、下方主區可捲動。
    - 頁首標題「UI 元件參考」置中、無 col；主內文 container-fluid px-3 px-md-4 py-4 + row 置中，欄寬與測驗頁一致 col-lg-10 col-xl-8 col-xxl-6。
    - 章節：各 <section> 使用 my-page-block-spacing；區塊 rounded-4 my-bgcolor-gray-3、無 border；子標題 .my-font-lg-600（common 預設字色 --my-color-black）。
    - 複製：DesignPageCopyBtn 預設淺底深字；class 示範列多為黑框（.my-design-swatch-row my-bgcolor-black）複製鈕 :on-light-bg="false"；08 區塊本體 my-bgcolor-gray-3（與 canvas 區隔）；其內 class 示範列仍 .my-design-swatch-row--light、:on-light-bg="true"、<code> my-color-black。黑框內 <code>／示範 <span> 皆併 my-font-sm-400（黑底併 my-color-white），避免 Bootstrap code 字級覆蓋。02／03 色票每組一顆色圓；底／字 class 兩黑框橫向同一排（.my-design-swatch-rows）。
    - 編號：05 區塊內含「09 · 徽章」與「08 · 下拉選單」；其後為 06 輸入、07 分頁、08 表格。
  -->
  <div class="d-flex flex-column h-100 overflow-hidden my-bgcolor-gray-4 position-relative">
    <!-- 頁首：稿名，不隨內文捲動（與測驗頁同層級） -->
    <header class="flex-shrink-0 my-bgcolor-gray-4 p-4">
      <div class="container-fluid px-0 text-center">
        <p class="my-font-xl-400 my-color-black text-break mb-0">UI 元件參考</p>
      </div>
    </header>

    <!-- 主內文：overflow-auto 僅此層捲動 -->
    <div class="flex-grow-1 overflow-auto my-bgcolor-gray-4 d-flex flex-column min-h-0">
      <div class="container-fluid px-3 px-md-4 py-4">
        <div class="row justify-content-center">
          <div class="col-12 col-lg-10 col-xl-8 col-xxl-6">

          <!-- ===== 01 · 字階 =====
               common：.my-font-{xl|lg|md|sm}-{400|600}；左欄字重 400、右欄 600；<dl> 示範語意結構 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">01 · 字階</div>
                <div class="row g-4 align-items-start">
                  <div class="col-12 col-md-6">
                    <dl class="mb-0">
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-xl-400 my-color-black">第一級 · 一般</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-xl-400</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-xl-400" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-lg-400 my-color-black">第二級 · 一般</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-lg-400</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-lg-400" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-md-400 my-color-black">第三級 · 一般</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-md-400</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-md-400" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1">
                        <dt class="my-font-sm-400 my-color-black">第四級 · 一般</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-sm-400</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-sm-400" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div class="col-12 col-md-6">
                    <dl class="mb-0">
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-xl-600 my-color-black">第一級 · 強調</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-xl-600</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-xl-600" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-lg-600 my-color-black">第二級 · 強調</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-lg-600</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-lg-600" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 pb-3 mb-3">
                        <dt class="my-font-md-600 my-color-black">第三級 · 強調</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-md-600</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-md-600" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1">
                        <dt class="my-font-sm-600 my-color-black">第四級 · 強調</dt>
                        <dd class="my-font-sm-400 mb-0 w-100">
                          <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                            <span class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white">.my-font-sm-600</span>
                            <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-font-sm-600" :on-light-bg="false" />
                          </div>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
            </div>
          </section>

          <!-- ===== 02 · 語意色 =====
               每語意一顆色圓；底／字 class 各一黑框，.my-design-swatch-rows 橫向同一排，各附複製鈕。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">02 · 語意色</div>
                <div class="row g-3">
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-red" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-red</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-red" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-red</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-red" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-green" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-green</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-green" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-green</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-green" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-blue" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-blue</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-blue" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-blue</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-blue" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </section>

          <!-- ===== 03 · 灰階 · 背景 =====
               每列一顆色圓（背景階）；底／字 class 兩黑框橫向同一排（.my-design-swatch-rows）。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">03 · 灰階 · 背景</div>
                <div class="row g-3">
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-black" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-black" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-white</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-white" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-gray-2" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-gray-2</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-gray-2" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-black" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-gray-3" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-gray-3</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-gray-3" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-black" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-gray-4" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-gray-4</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-gray-4" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-black" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="my-design-swatch-cell">
                      <span class="my-design-swatch-dot my-bgcolor-white" aria-hidden="true"></span>
                      <div class="my-design-swatch-rows">
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-bgcolor-white</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-bgcolor-white" :on-light-bg="false" />
                        </div>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0">
                          <code class="my-font-sm-400 my-color-white font-monospace text-break flex-grow-1 min-w-0 px-1">.my-color-black</code>
                          <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text=".my-color-black" :on-light-bg="false" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </section>

          <!-- ===== 04 · 區塊定義 =====
               Design 頁章節外層：rounded-4 my-bgcolor-gray-3 p-4 mb-5、無 border；全站 canvas 為 gray-4（body）；業務內容區 my-bgcolor-page-block（底同 --my-color-gray-3）。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">04 · 區塊定義</div>
                <div class="my-font-sm-400 d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >rounded-4 my-bgcolor-gray-3 p-4 mb-5</code>
                      <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text="rounded-4 my-bgcolor-gray-3 p-4 mb-5"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                </div>
            </div>
          </section>

          <!-- ===== 05 · 按鈕 + 09 · 徽章 + 08 · 下拉選單（同一 section） =====
               按鈕：小／中／大三組；小／中每組 藍／黑／描邊／黑無框；大僅藍／黑（填色，無白描邊與黑無框示範）；描邊（my-button-white-border）淺底 gray-1 邊＋字見 common。圓形黑無框下附兩鍵 btn-group + my-btn-group-pill（圓角同輸入 rounded-2、非膠囊；中）：選中 my-button-white、未選示範 my-button-gray-3（選項乙）。單行輸入見「06 · 輸入」。
               圓形：分頁「+」與複製鈕同規 my-btn-circle + my-button-transparent-borderless。
               09 徽章：在 08 下拉之上；僅示範灰底黑字；class 順序 badge … my-bgcolor-gray-3、my-color-black、描邊、rounded、px-2 py-1（rounded 在 badge 與色票之後、間距置末）。
               08 下拉：區塊底 my-bgcolor-gray-3；外層 .my-design-08-dropdown；示範一白底觸發邊 gray-2；示範二透明底無邊框；選單 .dropdown-menu Bootstrap 預設；觸發 rounded-2 同輸入（非膠囊）。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">05 · 按鈕</div>
                <div class="d-flex flex-column gap-4">
                  <!-- 小：字級 my-font-sm-400、內距 px-3 py-1 -->
                  <div>
                    <div class="my-color-gray-4 my-font-sm-400 mb-2">小（my-font-sm-400 · px-3 py-1）</div>
                    <div class="d-flex flex-column gap-3">
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-blue flex-shrink-0 px-3 py-1"
                        >
                          藍色
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-blue px-3 py-1</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-blue px-3 py-1"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white flex-shrink-0 px-3 py-1"
                        >
                          黑色
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white px-3 py-1</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white px-3 py-1"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border flex-shrink-0 px-3 py-1"
                        >
                          白描邊
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border px-3 py-1</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border px-3 py-1"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-transparent-borderless flex-shrink-0 px-3 py-1"
                        >
                          黑無框
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-transparent-borderless px-3 py-1</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-sm-400 my-button-transparent-borderless px-3 py-1"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- 中：字級 my-font-md-400、內距 px-3 py-2（全站表單／下拉觸發與此組對齊；文字輸入見 06 · 輸入） -->
                  <div>
                    <div class="my-color-gray-4 my-font-sm-400 mb-2">中（my-font-md-400 · px-3 py-2）</div>
                    <div class="d-flex flex-column gap-3">
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue flex-shrink-0 px-3 py-2"
                        >
                          藍色
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-3 py-2</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-3 py-2"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white flex-shrink-0 px-3 py-2"
                        >
                          黑色
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-3 py-2</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-3 py-2"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border flex-shrink-0 px-3 py-2"
                        >
                          白描邊
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border px-3 py-2</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white-border px-3 py-2"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless flex-shrink-0 px-3 py-2"
                        >
                          黑無框
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless px-3 py-2</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless px-3 py-2"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- 大：字級同中、內距 px-4 py-3；不示範白描邊／黑無框（class 與中組相同，僅改 px-4 py-3） -->
                  <div>
                    <div class="my-color-gray-4 my-font-sm-400 mb-2">大（my-font-md-400 · px-4 py-3 · 僅藍／黑）</div>
                    <div class="d-flex flex-column gap-3">
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue flex-shrink-0 px-4 py-3"
                        >
                          藍色
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-4 py-3</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-blue px-4 py-3"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                      <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                        <button
                          type="button"
                          class="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white flex-shrink-0 px-4 py-3"
                        >
                          黑色
                        </button>
                        <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                          <code
                            class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                            >btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-4 py-3</code>
                          <DesignPageCopyBtn
                          class="flex-shrink-0 ms-auto"
                          text="btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-white px-4 py-3"
                      :on-light-bg="false"/>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- 圓形圖示鈕：32×32，與建立測驗題庫分頁「+」／ExamPage 新增分頁同規 -->
                  <div>
                    <div class="my-color-gray-4 my-font-sm-400 mb-2">圓形黑無框（md · my-btn-circle · 例：fa-plus）</div>
                    <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                      <button
                        type="button"
                        class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle flex-shrink-0"
                        aria-label="圓形黑無框（範例圖示 fa-plus）"
                      >
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      </button>
                      <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                        <code
                          class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                          >btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle</code>
                        <DesignPageCopyBtn
                        class="flex-shrink-0 ms-auto"
                        text="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle"
                      :on-light-bg="false"/>
                      </div>
                    </div>
                  </div>
                  <!-- 兩鍵群組（外框／分段線同 my-input-md：gray-2；選中白底深字、未選示範 my-button-gray-3；字級同「中」） -->
                  <div>
                    <div class="my-color-gray-4 my-font-sm-400 mb-2">
                      兩鍵群組（btn-group · my-btn-group-pill · rounded-2 同輸入 · 中 · 外框 gray-2 · 選中 my-button-white 白底 · 未選示範 my-button-gray-3＝填色 gray-3）
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
                          class="btn d-flex justify-content-center align-items-center my-font-md-400 my-button-gray-3 px-3 py-2"
                        >
                          選項乙
                        </button>
                      </div>
                      <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                        <code
                          class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                          >btn-group my-btn-group-pill · btn … my-font-md-400 my-button-white px-3 py-2 · btn … my-font-md-400 my-button-gray-3 px-3 py-2</code>
                        <DesignPageCopyBtn
                        class="flex-shrink-0 ms-auto"
                        text="btn-group my-btn-group-pill btn my-font-md-400 my-button-white px-3 py-2 btn my-font-md-400 my-button-gray-3 px-3 py-2"
                      :on-light-bg="false"/>
                      </div>
                    </div>
                  </div>
                </div>
            </div>

            <!-- 09 · 徽章（仍屬 05 同一 section；在 08 下拉之上） -->
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5 mt-4">
              <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">09 · 徽章</div>
              <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                <span
                  class="badge my-bgcolor-gray-3 my-color-black my-border-gray-2 user-select-none my-font-sm-400 flex-shrink-0 align-self-start rounded px-2 py-1"
                >
                  標籤
                </span>
                <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                  <code
                    class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                  >
                    badge my-bgcolor-gray-3 my-color-black my-border-gray-2 user-select-none my-font-sm-400 rounded px-2 py-1
                  </code>
                  <DesignPageCopyBtn
                    class="flex-shrink-0 ms-auto"
                    text="badge my-bgcolor-gray-3 my-color-black my-border-gray-2 user-select-none my-font-sm-400 rounded px-2 py-1"
                    :on-light-bg="false"
                  />
                </div>
              </div>
            </div>

            <!-- 08 · 下拉選單（仍屬 05 同一 section） -->
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5 mt-4">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">08 · 下拉選單</div>
              <div class="my-design-08-dropdown">
                <div class="my-color-gray-1 my-font-sm-400 mb-2">中（my-font-md-400 · px-3 py-2）；外層 .my-design-08-dropdown；觸發 rounded-2 同輸入；示範一邊 gray-2；示範二透明底無邊框；選單 Bootstrap 預設</div>
                <div class="d-flex flex-column gap-3">
                  <!-- 示範一（預設文案選項一）：白底 rounded-2＋邊線同 my-input-md -->
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <div class="dropdown flex-shrink-0">
                      <button
                        id="design-dd-md-white-btn"
                        class="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white flex-shrink-0 px-3 py-2 text-start"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <span class="text-truncate text-start pe-2">{{ designSampleChoiceWhite }}</span>
                        <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                      </button>
                      <ul
                        class="dropdown-menu"
                        aria-labelledby="design-dd-md-white-btn"
                      >
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
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >my-design-08-dropdown · btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white flex-shrink-0 px-3 py-2 text-start</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-white flex-shrink-0 px-3 py-2 text-start"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <!-- 示範二：my-button-transparent-borderless → 透明底、無邊框 -->
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <div class="dropdown flex-shrink-0">
                      <button
                        id="design-dd-md-bl-btn"
                        class="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-transparent-borderless flex-shrink-0 px-3 py-2 text-start"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <span class="text-truncate text-start pe-2">選項</span>
                        <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret" aria-hidden="true"></i>
                      </button>
                      <ul class="dropdown-menu" aria-labelledby="design-dd-md-bl-btn">
                        <li><a class="dropdown-item" href="#" @click.prevent>選項一</a></li>
                        <li><a class="dropdown-item" href="#" @click.prevent>選項二</a></li>
                      </ul>
                    </div>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >my-design-08-dropdown · btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-transparent-borderless flex-shrink-0 px-3 py-2 text-start</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="btn rounded-2 d-flex justify-content-between align-items-center dropdown-toggle my-dropdown-caret my-font-md-400 my-button-transparent-borderless flex-shrink-0 px-3 py-2 text-start"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ===== 06 · 輸入 =====
               單行／輸入區塊：啟用與停用各一；停用＝ readonly（勿用 disabled）；全站 .form-control.my-input-md.rounded-2。版面：row 兩欄（示範｜黑框 class＋複製，併 .my-design-swatch-row）。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
              <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">06 · 輸入</div>
              <div class="d-flex flex-column gap-4">
                <!-- 單行：示範與複製鈕垂直置中 -->
                <div class="row g-3 g-lg-4 align-items-center">
                  <div class="col-12 col-md-5 col-lg-4">
                    <div class="d-flex flex-column gap-0">
                      <label
                        class="my-color-gray-1 my-font-sm-400 mb-0"
                        for="design-input-md-on"
                      >
                        輸入（啟用）
                      </label>
                      <input
                        id="design-input-md-on"
                        type="text"
                        class="form-control my-input-md rounded-2 w-100"
                        placeholder="單行輸入"
                        autocomplete="off"
                      >
                    </div>
                  </div>
                  <div class="col-12 col-md d-flex align-items-center">
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                      <code
                        class="user-select-all my-font-sm-400 d-block w-100 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                      >
                        form-control my-input-md rounded-2
                      </code>
                      <DesignPageCopyBtn
                        class="flex-shrink-0 ms-auto"
                        text="form-control my-input-md rounded-2"
                        :on-light-bg="false"
                      />
                    </div>
                  </div>
                </div>
                <div class="row g-3 g-lg-4 align-items-center">
                  <div class="col-12 col-md-5 col-lg-4">
                    <div class="d-flex flex-column gap-0">
                      <label
                        class="my-color-gray-1 my-font-sm-400 mb-0"
                        for="design-input-md-off"
                      >
                        輸入（停用）
                      </label>
                      <input
                        id="design-input-md-off"
                        type="text"
                        class="form-control my-input-md rounded-2 w-100"
                        value="示範文字"
                        readonly
                        autocomplete="off"
                      >
                    </div>
                  </div>
                  <div class="col-12 col-md d-flex align-items-center">
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100">
                      <code
                        class="user-select-all my-font-sm-400 d-block w-100 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                      >
                        form-control my-input-md rounded-2 · readonly
                      </code>
                      <DesignPageCopyBtn
                        class="flex-shrink-0 ms-auto"
                        text="form-control my-input-md rounded-2 readonly"
                        :on-light-bg="false"
                      />
                    </div>
                  </div>
                </div>
                <!-- 多行：頂端對齊，複製鈕與 class 區與 textarea 同高起點 -->
                <div class="row g-3 g-lg-4 align-items-start">
                  <div class="col-12 col-lg-5 col-xl-4">
                    <div class="d-flex flex-column gap-0">
                      <label
                        class="my-color-gray-1 my-font-sm-400 mb-0"
                        for="design-textarea-md-on"
                      >
                        輸入區塊（啟用）
                      </label>
                      <textarea
                        id="design-textarea-md-on"
                        class="form-control my-input-md rounded-2 w-100"
                        rows="4"
                        placeholder="多行輸入"
                      ></textarea>
                    </div>
                  </div>
                  <div class="col-12 col-lg d-flex align-items-start">
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100 align-items-start">
                      <code
                        class="user-select-all my-font-sm-400 d-block w-100 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                      >
                        textarea · form-control my-input-md rounded-2
                      </code>
                      <DesignPageCopyBtn
                        class="flex-shrink-0 ms-auto align-self-start"
                        text="textarea form-control my-input-md rounded-2"
                        :on-light-bg="false"
                      />
                    </div>
                  </div>
                </div>
                <div class="row g-3 g-lg-4 align-items-start">
                  <div class="col-12 col-lg-5 col-xl-4">
                    <div class="d-flex flex-column gap-0">
                      <label
                        class="my-color-gray-1 my-font-sm-400 mb-0"
                        for="design-textarea-md-off"
                      >
                        輸入區塊（停用）
                      </label>
                      <textarea
                        id="design-textarea-md-off"
                        class="form-control my-input-md rounded-2 w-100"
                        rows="4"
                        readonly
                      >示範多行文字（停用，可選取複製）</textarea>
                    </div>
                  </div>
                  <div class="col-12 col-lg d-flex align-items-start">
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 w-100 align-items-start">
                      <code
                        class="user-select-all my-font-sm-400 d-block w-100 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                      >
                        textarea · form-control my-input-md rounded-2 · readonly
                      </code>
                      <DesignPageCopyBtn
                        class="flex-shrink-0 ms-auto align-self-start"
                        text="textarea form-control my-input-md rounded-2 readonly"
                        :on-light-bg="false"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ===== 07 · 分頁 =====
               外殼 my-bgcolor-gray-3；分頁列 my-rag-tabs-bar my-bgcolor-gray-4（與全站 canvas）；其下說明區與章節灰底一致。ul.nav-tabs.w-100、justify-content:center（common）、選中 --my-color-black 底線 2pt；黑底稿另見 my-rag-tabs-bar--design。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 overflow-hidden mb-4">
              <div class="px-3 px-lg-4 py-3">
                <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-0">07 · 分頁</div>
              </div>
              <div class="flex-shrink-0 w-100 my-rag-tabs-bar my-bgcolor-gray-4">
                <div class="d-flex justify-content-center w-100 align-items-center">
                  <ul class="nav nav-tabs w-100">
                    <li class="nav-item">
                      <div role="tab" class="nav-link d-flex align-items-center gap-1 active" aria-current="page">
                        <span class="flex-grow-1 text-start pe-2">分頁1</span>
                        <button
                          type="button"
                          disabled
                          class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4 pe-2"
                          title="重新命名分頁（示範，無功能）"
                        >
                          <i class="fa-solid fa-pen" aria-hidden="true"></i>
                        </button>
                        <button
                          type="button"
                          disabled
                          class="btn btn-link text-decoration-none my-tab-nav-action-btn my-color-gray-4"
                          title="刪除此出題單元（示範，無功能）"
                        >
                          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                      </div>
                    </li>
                    <li class="nav-item">
                      <div role="tab" class="nav-link d-flex align-items-center gap-1">
                        <span class="flex-grow-1 text-start pe-2">分頁2</span>
                        <!-- 未選分頁不顯示筆／刪除時不佔寬（與建立測驗題庫頁一致） -->
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
                        class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle mb-2"
                        title="新增分頁（示範，無功能）"
                        aria-label="新增分頁（示範，無功能）"
                        @click.prevent
                      >
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="px-3 px-lg-4 py-3">
                <div class="my-font-sm-400 d-flex flex-column gap-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">分頁列底（gray-4）</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >flex-shrink-0 w-100 my-rag-tabs-bar my-bgcolor-gray-4</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="flex-shrink-0 w-100 my-rag-tabs-bar my-bgcolor-gray-4"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">內層置中列</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >d-flex justify-content-center w-100 px-4 align-items-center</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="d-flex justify-content-center w-100 px-4 align-items-center"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">結構</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >ul.nav.nav-tabs.w-100 · li.nav-item · .nav-link（px-3 py-2）.active</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="nav nav-tabs w-100"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">筆／刪除（僅當前分頁）</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >btn btn-link my-tab-nav-action-btn（common：ps-1）· fa-pen · fa-xmark</code>
                      <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text="my-tab-nav-action-btn"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">試卷用題庫（藍點）</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >rounded-circle d-inline-block my-bgcolor-blue（0.5rem）</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="my-bgcolor-blue"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">新增分頁（32×32 rounded-circle · my-btn-circle · fa-plus；建立中為全螢幕 LoadingOverlay）</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle mb-2</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle mb-2"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ===== 08 · 表格 =====
               外層捲動框 + Bootstrap table；表頭／儲存格內距 px-3 py-2；輔助欄 my-color-gray-4。
               進階表頭樣式見 common .my-table（本示範為輕量版）。 -->
          <section class="my-page-block-spacing">
            <div class="rounded-4 my-bgcolor-gray-3 p-4 mb-5">
            <div role="heading" aria-level="2" class="my-font-lg-600 my-color-black text-break mb-4">08 · 表格</div>
                <div class="rounded-4 overflow-auto border">
                  <table class="table table-striped table-hover my-font-md-400 mb-0">
                    <thead>
                      <tr>
                        <th class="my-font-md-600 px-3 py-2" scope="col">項目</th>
                        <th class="my-font-md-600 px-3 py-2" scope="col">說明</th>
                        <th class="my-font-md-600 text-end px-3 py-2" scope="col">數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td class="my-font-md-400 px-3 py-2">範例列 A</td>
                        <td class="my-font-md-400 my-color-gray-4 px-3 py-2">輔助欄位</td>
                        <td class="my-font-md-400 text-end px-3 py-2">12</td>
                      </tr>
                      <tr>
                        <td class="my-font-md-400 px-3 py-2">範例列 B</td>
                        <td class="my-font-md-400 my-color-gray-4 px-3 py-2">輔助欄位</td>
                        <td class="my-font-md-400 text-end px-3 py-2">3</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="my-font-sm-400 d-flex flex-column gap-3 mt-3">
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">外層捲動框</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >rounded-4 overflow-auto border</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="rounded-4 overflow-auto border"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">表格</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >table table-striped table-hover mb-0</code>
                      <DesignPageCopyBtn
                      class="flex-shrink-0 ms-auto"
                      text="table table-striped table-hover mb-0"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">表頭／儲存格</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >px-3 py-2</code>
                      <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text="px-3 py-2"
                      :on-light-bg="false"/>
                    </div>
                  </div>
                  <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 gap-md-3 w-100">
                    <span class="my-color-gray-4 flex-shrink-0 my-font-sm-400">輔助字色</span>
                    <div class="my-design-swatch-row my-bgcolor-black min-w-0 flex-grow-1">
                      <code
                        class="user-select-all my-font-sm-400 font-monospace text-break flex-grow-1 min-w-0 px-1 my-color-white"
                        >my-color-gray-4</code>
                      <DesignPageCopyBtn class="flex-shrink-0 ms-auto" text="my-color-gray-4"
                      :on-light-bg="false"/>
                    </div>
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
