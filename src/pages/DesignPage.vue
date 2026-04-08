<script setup>
import { ref } from 'vue';

defineProps({
  tabId: { type: String, default: '' },
});

const designSampleChoice = ref('選項一');
</script>

<template>
  <div class="h-100 overflow-auto my-bgcolor-black" data-bs-theme="dark">
    <div class="container-fluid px-3 px-md-4 py-4">
      <div class="row justify-content-center">
        <div class="col-12 col-xl-10 col-xxl-8">
          <header class="sticky-top my-bgcolor-black my-border-bottom-muted pb-3 mb-5">
            <p class="my-text-xl-600-white text-break mb-0">UI 元件參考</p>
          </header>

          <section class="mb-5">
            <h2 class="my-text-md-600-gray-light text-break mb-3">01 · 字階（五級 × 400／600）</h2>
            <div class="card border-0 rounded-4 my-shadow-card my-bgcolor-gray-dark">
              <div class="card-body p-3 p-lg-4">
                <div class="row g-4 align-items-start">
                  <div class="col-12 col-md-6">
                    <dl class="mb-0">
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-xl-400-white">第一級 · 一般</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-xl-400-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-lg-400-white">第二級 · 一般</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-lg-400-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-md-400-gray-light">第三級 · 一般</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-md-400-gray-light
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-sm-400-white">第四級 · 一般</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-sm-400-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1">
                        <dt class="my-text-xs-400-gray-light">第五級 · 一般</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-xs-400-gray-light
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div class="col-12 col-md-6">
                    <dl class="mb-0">
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-xl-600-white">第一級 · 強調</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-xl-600-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-lg-600-white">第二級 · 強調</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-lg-600-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-md-600-white">第三級 · 強調</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-md-600-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1 my-border-bottom-faint pb-3 mb-3">
                        <dt class="my-text-sm-600-white">第四級 · 強調</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-sm-600-white
                        </dd>
                      </div>
                      <div class="d-flex flex-column gap-1">
                        <dt class="my-text-xs-600-gray-light">第五級 · 強調</dt>
                        <dd class="my-font-size-sm font-monospace my-color-gray-light opacity-75 text-break">
                          .my-text-xs-600-gray-light
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="mb-5">
            <h2 class="my-text-md-600-gray-light text-break mb-3">02 · 語意色</h2>
            <div class="card border-0 rounded-4 my-shadow-card my-bgcolor-gray-dark">
              <div class="card-body p-3 p-lg-4">
                <div class="row g-3">
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-red my-color-white p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-red · .my-color-white</code>
                    </div>
                  </div>
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-yellow my-color-black p-3"
                    >
                      <code class="font-monospace text-break text-center px-1 my-color-black">.my-bgcolor-yellow · .my-color-black</code>
                    </div>
                  </div>
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-green my-color-white p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-green · .my-color-white</code>
                    </div>
                  </div>
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-blue my-color-white p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-blue · .my-color-white</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="mb-5">
            <h2 class="my-text-md-600-gray-light text-break mb-3">03 · 灰階 · 背景</h2>
            <div class="card border-0 rounded-4 my-shadow-card my-bgcolor-gray-dark">
              <div class="card-body p-3 p-lg-4">
                <div class="row g-3">
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-black my-color-white p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-black · .my-color-white</code>
                    </div>
                  </div>
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-gray-dark my-color-white p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-gray-dark · .my-color-white</code>
                    </div>
                  </div>
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-gray-light my-color-black p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-gray-light · .my-color-black</code>
                    </div>
                  </div>
                  <div class="col-12">
                    <div
                      class="d-flex align-items-center justify-content-center my-font-size-sm rounded-3 text-center my-bgcolor-white my-color-black p-3"
                    >
                      <code class="font-monospace text-break text-center px-1">.my-bgcolor-white · .my-color-black</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="mb-5">
            <h2 class="my-text-md-600-gray-light text-break mb-3">04 · 按鈕</h2>
            <div class="card border-0 rounded-4 my-shadow-card my-bgcolor-gray-dark">
              <div class="card-body p-3 p-lg-4">
                <div class="my-font-size-sm font-monospace my-color-gray-light text-break opacity-90 mb-4">
                  <p class="mb-2">
                    <code class="my-color-white text-break"
                      >d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm</code>
                  </p>
                  <p class="mb-2">
                    <code class="my-color-white text-break"
                      >d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg</code>
                  </p>
                  <p class="mb-2">
                    <code class="my-color-white text-break"
                      >d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm my-btn-border</code>
                  </p>
                  <p class="mb-0">
                    <code class="my-color-white text-break"
                      >d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg my-btn-border</code>
                  </p>
                </div>
                <p class="my-border-bottom-faint my-text-sm-600-white pb-1 mb-2">有底色</p>
                <p class="my-font-size-sm my-color-gray-light opacity-90 mb-2">小</p>
                <div class="row g-2 g-md-3 mb-2" role="group" aria-label="有底色小尺寸">
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm my-bgcolor-red my-color-white my-border-color-red my-btn-hover-red"
                    >
                      紅
                    </button>
                  </div>
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm my-bgcolor-yellow my-color-black my-border-color-yellow my-btn-hover-yellow"
                    >
                      黃
                    </button>
                  </div>
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm my-bgcolor-green my-color-white my-border-color-green my-btn-hover-green"
                    >
                      綠
                    </button>
                  </div>
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm my-bgcolor-blue my-color-white my-border-color-blue my-btn-hover-blue"
                    >
                      藍
                    </button>
                  </div>
                </div>
                <p class="my-font-size-sm my-color-gray-light opacity-90 mb-3">大</p>
                <div class="row g-2 g-md-3 mb-4" role="group" aria-label="有底色大尺寸">
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg my-bgcolor-red my-color-white my-border-color-red my-btn-hover-red"
                    >
                      紅
                    </button>
                  </div>
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg my-bgcolor-yellow my-color-black my-border-color-yellow my-btn-hover-yellow"
                    >
                      黃
                    </button>
                  </div>
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg my-bgcolor-green my-color-white my-border-color-green my-btn-hover-green"
                    >
                      綠
                    </button>
                  </div>
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg my-bgcolor-blue my-color-white my-border-color-blue my-btn-hover-blue"
                    >
                      藍
                    </button>
                  </div>
                </div>

                <p class="my-border-bottom-faint my-text-sm-600-white pb-1 mb-2">有邊框</p>
                <p class="my-font-size-sm my-color-gray-light opacity-90 mb-2">小</p>
                <div class="row g-2 g-md-3 mb-2" role="group" aria-label="有邊框小尺寸">
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-sm my-btn-border"
                    >
                      範例
                    </button>
                  </div>
                </div>
                <p class="my-font-size-sm my-color-gray-light opacity-90 mb-3">大</p>
                <div class="row g-2 g-md-3 mb-0" role="group" aria-label="有邊框大尺寸">
                  <div class="col-12 col-md-auto">
                    <button
                      type="button"
                      class="d-flex align-items-center justify-content-center btn w-100 w-md-auto my-btn-pill my-btn-lg my-btn-border"
                    >
                      範例
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="mb-5">
            <h2 class="my-text-md-600-gray-light text-break mb-3">05 · 表格</h2>
            <div class="card border-0 rounded-4 my-shadow-card my-bgcolor-gray-dark">
              <div class="card-body p-3 p-lg-4">
                <div class="rounded-4 overflow-auto my-border-subtle">
                  <table class="table my-table">
                    <thead>
                      <tr>
                        <th scope="col">項目</th>
                        <th scope="col">說明</th>
                        <th scope="col" class="text-end">數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>範例列 A</td>
                        <td class="my-color-gray-light">輔助欄位</td>
                        <td class="text-end">12</td>
                      </tr>
                      <tr>
                        <td>範例列 B</td>
                        <td class="my-color-gray-light">輔助欄位</td>
                        <td class="text-end">3</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="my-font-size-sm font-monospace my-color-gray-light text-break opacity-90 mt-3">
                  外層捲動框：<code class="my-color-white">.my-border-subtle</code>（可併
                  <code class="my-color-white">.rounded-4</code> <code class="my-color-white">.overflow-auto</code>）<br />
                  表格：<code class="my-color-white">.table</code> <code class="my-color-white">.my-table</code>（內距由
                  <code class="my-color-white">.my-table</code> 定義，勿疊 <code class="my-color-white">.table-sm</code>）；輔助字色另加
                  <code class="my-color-white">.my-color-gray-light</code>
                </p>
              </div>
            </div>
          </section>

          <section class="pb-4">
            <h2 class="my-text-md-600-gray-light text-break mb-3">06 · 下拉選單</h2>
            <div class="card border-0 rounded-4 my-shadow-card my-bgcolor-gray-dark">
              <div class="card-body p-3 p-lg-4">
                <div class="mb-4">
                  <div class="dropdown w-100 d-md-inline-block">
                    <button
                      id="design-page-choice-dropdown-btn"
                      class="d-flex align-items-center justify-content-between btn dropdown-toggle w-100 w-md-auto my-dropdown-caret my-btn-pill my-btn-sm my-bgcolor-blue my-color-white my-border-color-blue my-btn-hover-blue"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      aria-haspopup="true"
                    >
                      <span class="text-truncate text-center text-md-start flex-grow-1 min-w-0 pe-2">{{ designSampleChoice }}</span>
                      <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0" aria-hidden="true"></i>
                    </button>
                    <ul
                      class="dropdown-menu my-dropdown-menu w-100 w-md-auto"
                      aria-labelledby="design-page-choice-dropdown-btn"
                    >
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
                <div class="dropdown w-100 d-md-inline-block">
                  <button
                    class="d-flex align-items-center justify-content-between btn dropdown-toggle w-100 w-md-auto my-dropdown-caret my-btn-pill my-btn-sm my-btn-border"
                    type="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    id="design-page-dropdown-btn"
                  >
                    <span class="text-truncate text-center text-md-start flex-grow-1 min-w-0 pe-2">更多動作</span>
                    <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0" aria-hidden="true"></i>
                  </button>
                  <ul
                    class="dropdown-menu my-dropdown-menu dropdown-menu-start dropdown-menu-md-end w-100 w-md-auto"
                    aria-labelledby="design-page-dropdown-btn"
                  >
                    <li><a class="dropdown-item" href="#" @click.prevent>編輯</a></li>
                    <li><a class="dropdown-item" href="#" @click.prevent>複製</a></li>
                    <li><hr class="dropdown-divider" /></li>
                    <li>
                      <a class="dropdown-item my-dropdown-item-danger" href="#" @click.prevent>刪除</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
