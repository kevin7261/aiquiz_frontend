<script>
  /**
   * App - 根組件，僅提供路由出口。
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
  <div id="app" class="d-flex flex-column h-100">
    <div class="d-flex flex-column overflow-hidden flex-grow-1">
      <router-view />
    </div>
  </div>
</template>

<style>
  @import './assets/css/common.css';
</style>
