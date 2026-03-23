<script setup>
/**
 * QuizCard - 單一題目卡片
 *
 * 顯示：題號、單元/難度、題目內容、提示（可切換顯示）、參考答案、回答區、批改結果。
 * 未確定前可輸入答案並按「確定」送出評分。
 * 供 CreateRAG 頁、ExamPage 使用；評分邏輯由父層透過 useQuizGrading 處理。
 *
 * card 物件需含：quiz, hint, referenceAnswer, answer, confirmed, gradingResult, ragName, generateLevel, id 等。
 */
defineProps({
  /** 題目資料（含題目、提示、答案、批改結果等） */
  card: { type: Object, required: true },
  /** 題號（從 1 開始，用於顯示「第 N 題」） */
  slotIndex: { type: Number, required: true },
});

const emit = defineEmits(['toggle-hint', 'confirm-answer', 'update:answer']);
</script>

<template>
  <div class="card mb-4" :class="{ 'mt-4': slotIndex > 1 }">
    <div class="card-header py-2">
      <span class="fs-6 fw-semibold mb-0">第 {{ slotIndex }} 題</span>
    </div>
    <div class="card-body text-start">
      <!-- 單元與難度（唯讀顯示） -->
      <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
        <div>
          <label class="form-label small text-secondary fw-medium mb-1">單元</label>
          <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ card.ragName || '—' }}</div>
        </div>
        <div>
          <label class="form-label small text-secondary fw-medium mb-1">難度</label>
          <div class="form-control form-control-sm bg-body-secondary border small" style="min-height: 31px;">{{ card.generateLevel || '—' }}</div>
        </div>
      </div>
      <div class="mb-3">
        <div class="form-label small text-secondary fw-medium mb-1">題目</div>
        <div class="bg-body-secondary border rounded p-2 lh-base">
          {{ card.quiz }}
        </div>
      </div>
      <div class="mb-3">
        <button type="button" class="btn btn-sm btn-outline-secondary py-0" @click="emit('toggle-hint', card)">
          {{ card.hintVisible ? '隱藏提示' : '顯示提示' }}
        </button>
        <div v-show="card.hintVisible" class="rounded bg-body-tertiary small mt-2 p-2 text-secondary">
          {{ card.hint }}
        </div>
      </div>
      <div v-if="card.referenceAnswer" class="mb-3">
        <div class="form-label small text-secondary fw-medium mb-1">參考答案</div>
        <div class="rounded bg-body-tertiary border p-2 small" style="white-space: pre-wrap;">{{ card.referenceAnswer }}</div>
      </div>
      <div class="mb-3">
        <label :for="`answer-${card.id}`" class="form-label small text-secondary fw-medium mb-1">回答</label>
        <template v-if="!card.confirmed">
          <textarea
            :id="`answer-${card.id}`"
            :value="card.answer"
            class="form-control"
            @input="emit('update:answer', $event.target.value)"
            rows="4"
            placeholder="請輸入您的回答..."
            maxlength="2000"
          />
          <div class="form-text small">{{ card.answer.length }} / 2000</div>
          <div class="d-flex gap-2 mt-2">
            <button type="button" class="btn btn-sm btn-primary" @click="emit('confirm-answer', card)">確定</button>
          </div>
        </template>
        <template v-else>
          <div class="rounded bg-body-tertiary small mb-2 p-2">{{ card.answer }}</div>
        </template>
      </div>
      <!-- 批改結果區（由 useQuizGrading 格式化後顯示） -->
      <div class="border rounded bg-light p-3 mb-3">
        <div class="form-label small fw-semibold text-secondary mb-1">批改結果</div>
        <div class="small" style="white-space: pre-wrap;">{{ card.gradingResult || '尚未批改' }}</div>
      </div>
    </div>
  </div>
</template>
