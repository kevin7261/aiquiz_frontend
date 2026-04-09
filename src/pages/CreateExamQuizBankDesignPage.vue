<script setup>
/**
 * 建立測驗題庫（僅前端示範）— 與 CreateExamQuizBankPage 同一元件，不呼叫 API。
 * mockWithoutApi 時出題設定可編輯／唯讀與測試題目區會一併展開（供介面稿截圖，不互斥隱藏）。
 */
import CreateExamQuizBankPage from './CreateExamQuizBankPage.vue';

defineProps({
  tabId: { type: String, required: true },
});
</script>

<template>
  <CreateExamQuizBankPage :tab-id="tabId" :mock-without-api="true" />
</template>
