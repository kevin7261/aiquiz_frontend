<script setup>
import { computed } from 'vue';

/**
 * QuizCard - 單一題目卡片
 *
 * 顯示：題號、單元/難度、題目內容、提示（可切換顯示）、參考答案(暫存)、答案區、批改結果。
 * 未確定前可輸入答案並按「確定」送出評分。
 * 供 CreateExamQuizBankPage、ExamPage 使用；評分邏輯由父層透過 useQuizGrading 處理。
 *
 * card 物件需含：quiz, hint, referenceAnswer, quiz_answer（使用者作答）, confirmed, gradingResult, ragName, rag_id（可選，供與 currentRagId 比對是否可作答）, generateLevel, id；測驗頁另含 exam_quiz_id，RAG 題庫頁另含 rag_quiz_id（與後端 API 欄位一致）。
 */
const props = defineProps({
  /** 題目資料（含題目、提示、答案、批改結果等） */
  card: { type: Object, required: true },
  /** 題號（從 1 開始，用於顯示「第 N 題」） */
  slotIndex: { type: Number, required: true },
  /** 批改 prompt 內「課程名稱」占位（與建立測驗題庫頁 course 一致） */
  courseName: { type: String, default: 'AIQuiz' },
  /** 目前分頁／試題用 RAG 的 rag_id；與 card.rag_id 皆有值且不同時，停用答案輸入與確定 */
  currentRagId: { type: [String, Number], default: null },
  /** 為 true 時略過上述 rag_id 比對（介面稿頁用） */
  skipRagMismatchGuard: { type: Boolean, default: false },
  /** 與 UI 元件參考按鈕／字色一致（建立測驗題庫設計稿用） */
  designUi: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-hint', 'confirm-answer', 'update:quiz_answer']);

/** 兩邊 rag_id 皆已知且不一致 → 不可在此 RAG 下作答 */
const answerInputDisabled = computed(() => {
  if (props.skipRagMismatchGuard) return false;
  const cur =
    props.currentRagId != null && String(props.currentRagId).trim() !== ''
      ? String(props.currentRagId).trim()
      : '';
  const q =
    props.card?.rag_id != null && String(props.card.rag_id).trim() !== ''
      ? String(props.card.rag_id).trim()
      : '';
  if (!cur || !q) return false;
  return cur !== q;
});
</script>

<template>
  <div
    class="rounded-3 p-3 p-lg-4 mb-4"
    :class="[
      designUi ? 'my-bgcolor-gray-dark' : 'my-bgcolor-page-block',
      { 'mt-4': slotIndex > 1 },
    ]"
  >
    <div
      class="my-font-lg-600 border-bottom pb-2 mb-3"
      :class="designUi ? 'my-color-white' : ''"
    >第 {{ slotIndex }} 題</div>
    <div class="text-start">
      <!-- 單元與難度（唯讀顯示） -->
      <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
        <div>
          <label class="form-label my-font-sm-600 mb-1 my-color-gray-light">單元</label>
          <div class="form-control form-control-sm my-bgcolor-surface-tint border my-font-sm-400" style="min-height: 31px;">{{ card.ragName || '—' }}</div>
        </div>
        <div>
          <label class="form-label my-font-sm-600 mb-1 my-color-gray-light">難度</label>
          <div class="form-control form-control-sm my-bgcolor-surface-tint border my-font-sm-400" style="min-height: 31px;">{{ card.generateLevel || '—' }}</div>
        </div>
      </div>
      <div class="mb-3">
        <div class="form-label my-font-sm-600 mb-1 my-color-gray-light">題目</div>
        <div class="my-bgcolor-surface-tint border rounded lh-base p-2">
          {{ card.quiz }}
        </div>
      </div>
      <div class="mb-3">
        <button
          type="button"
          :class="[
            designUi
              ? 'btn rounded-pill d-inline-flex justify-content-center align-items-center my-font-sm-400 my-button-white-border px-3 py-0'
              : 'btn my-btn-outline-neutral my-font-sm-400 py-0',
          ]"
          @click="emit('toggle-hint', card)"
        >
          {{ card.hintVisible ? '隱藏提示' : '顯示提示' }}
        </button>
        <div
          v-show="card.hintVisible"
          class="rounded my-bgcolor-surface-tint my-font-sm-400 my-color-gray-light p-2 mt-2"
        >
          {{ card.hint }}
        </div>
      </div>
      <div v-if="card.referenceAnswer" class="mb-3">
        <div class="form-label my-font-sm-600 mb-1 my-color-gray-light">參考答案(暫存)</div>
        <div class="rounded my-bgcolor-surface-tint border my-font-sm-400 p-2" style="white-space: pre-wrap;">{{ card.referenceAnswer }}</div>
      </div>
      <div class="mb-3">
        <div class="d-flex justify-content-between align-items-baseline gap-2 mb-1">
          <label
            :for="`quiz-answer-${card.id}`"
            class="form-label my-font-sm-600 mb-0 my-color-gray-light"
          >答案</label>
          <span class="form-text my-font-sm-400 my-color-gray-light text-end flex-shrink-0 mb-0">{{ card.quiz_answer.length }} / 2000</span>
        </div>
        <template v-if="!card.confirmed">
          <textarea
            :id="`quiz-answer-${card.id}`"
            :value="card.quiz_answer"
            class="form-control"
            :disabled="answerInputDisabled"
            @input="emit('update:quiz_answer', $event.target.value)"
            rows="4"
            placeholder="請輸入您的答案..."
            maxlength="2000"
          />
          <div v-if="answerInputDisabled" class="form-text my-font-sm-400 my-color-yellow">此題與目前題庫版本不一致，無法作答。請改題或重新產生題目。</div>
          <div class="d-flex justify-content-end mt-2">
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center flex-shrink-0 px-3 py-2 my-font-md-400 my-button-blue"
              :disabled="answerInputDisabled"
              @click="emit('confirm-answer', card)"
            >確定</button>
          </div>
        </template>
        <template v-else>
          <div class="rounded my-bgcolor-surface-tint my-font-sm-400 p-2 mb-2">{{ card.quiz_answer }}</div>
        </template>
      </div>
      <div class="mb-3">
        <label class="form-label my-font-sm-600 mb-1 my-color-gray-light">批改規則（預覽）</label>
        <div class="my-font-sm-400 border rounded my-bgcolor-surface-tint p-3">
          你是一位「{{ courseName }}」課程的教授，請批改這道題目：<br>
          【評分規範】<br>
          根據「測驗題目」與「課程內容」，評估「學生答案」的內容是否正確。<br>
          測驗題目：{quiz_content}<br>
          學生答案：{quiz_answer}<br>
          課程內容：{context_text}<br>
          【重要限制】<br>
          請使用繁體中文 (Traditional Chinese) 撰寫評語 (quiz_comments)。<br>
          【評分標準】<br>
          0-5分，一定是整數 (quiz_score)。<br>
          0: 完全錯誤或未作答。<br>
          1: 只有少量內容正確。<br>
          2: 大幅缺漏，只有部分內容正確。<br>
          3: 部分正確，但有大幅缺漏。<br>
          4: 大致正確，略有不足。<br>
          5: 完全正確且完整。<br>
          【回傳格式】<br>
          請以指定格式回傳（含分數與評語欄位）：<br>
          { "quiz_score": int,<br>
          "quiz_comments": str[] }<br>
        </div>
      </div>
      <!-- 批改結果區（由 useQuizGrading 格式化後顯示） -->
      <div class="mb-3">
        <div class="form-label my-font-sm-600 mb-1 my-color-gray-light">批改結果</div>
        <div class="rounded my-bgcolor-surface-tint border my-font-sm-400 p-2" style="white-space: pre-wrap;">{{ card.gradingResult || '尚未批改' }}</div>
      </div>
    </div>
  </div>
</template>
