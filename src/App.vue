<script>
  /**
   * App.vue - 應用程式根組件
   *
   * 職責：
   * - 作為整站最外層容器，提供 flex 佈局與全高
   * - 透過 <router-view /> 渲染當前路由對應的頁面（登入頁或主頁）
   * - 不包含導覽列或側邊欄，版面由各 View 自行負責
   */
  export default {
    name: 'App',
    components: {},
    setup() {
      return {};
    },
  };
</script>

<template>
  <!-- 全高 flex 容器，子元素可 flex-grow 填滿 -->
  <div id="app" class="d-flex flex-column h-100">
    <div class="d-flex flex-column overflow-hidden flex-grow-1">
      <!-- 路由出口：依目前路徑顯示對應的 View 組件 -->
      <router-view />
    </div>
  </div>
</template>

<style>
  /* 再次引入全域樣式，確保覆寫與變數可用 */
  @import './assets/css/common.css';
</style>
