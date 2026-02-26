<script setup>
/** 個資修改頁面。 */
import { ref } from 'vue';

const account = ref('user@example.com');
const name = ref('王小明');
const email = ref('user@example.com');

function saveProfile() {
  // 待後端串接：送出帳號、名稱、email 等
}
</script>

<template>
  <div class="d-flex flex-column my-bgcolor-gray-200 h-100">
    <div class="flex-grow-1 overflow-auto my-bgcolor-white p-4">
      <div class="my-bgcolor-gray-100 rounded text-start p-4">
        <h6 class="my-title-sm-black mb-3">個資修改</h6>
        <div class="mb-3">
          <label class="form-label my-title-xs-gray">帳號</label>
          <input v-model="account" type="text" class="form-control" placeholder="帳號">
        </div>
        <div class="mb-3">
          <label class="form-label my-title-xs-gray">名稱</label>
          <input v-model="name" type="text" class="form-control" placeholder="名稱">
        </div>
        <div class="mb-3">
          <label class="form-label my-title-xs-gray">Email</label>
          <input v-model="email" type="email" class="form-control" placeholder="Email">
        </div>
        <button type="button" class="btn btn-primary btn-sm" @click="saveProfile">
          儲存
        </button>
      </div>
    </div>
  </div>
</template>
