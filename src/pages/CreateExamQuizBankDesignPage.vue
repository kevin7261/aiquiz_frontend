<script setup>
/**
 * 建立測驗題庫（設計稿入口）— 與 CreateExamQuizBankPage 同一元件，避免雙份維護。
 */
import CreateExamQuizBankPage from './CreateExamQuizBankPage.vue';

defineProps({
  tabId: { type: String, required: true },
});
</script>

<template>
  <CreateExamQuizBankPage :tab-id="tabId" />
</template>
