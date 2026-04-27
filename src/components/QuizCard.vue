<script setup>
import { computed } from 'vue';
import { QUIZ_LEVEL_LABELS, normalizeQuizLevelLabel } from '../utils/rag.js';

/** 與 Design 頁、建立題庫「難度」群組選項一致 */
const difficultyOptions = QUIZ_LEVEL_LABELS;
/**
 * QuizCard - 單一題目卡片
 *
 * 顯示：題號、單元/難度、題目內容、提示（可切換顯示）、參考答案(暫存)、答案區、批改結果。
 * 未確定前可輸入答案並按「確定批改」送出評分。
 * 供 CreateExamQuizBankPage、ExamPage 使用；評分邏輯由父層透過 useQuizGrading 處理。
 *
 * card 物件需含：quiz, hint, referenceAnswer, quiz_answer（使用者作答）, confirmed, gradingResult, ragName, rag_id（可選，供與 currentRagId 比對是否可作答）, generateLevel, id；測驗頁另含 exam_quiz_id、quiz_rate、rateError，RAG 題庫頁另含 rag_quiz_id（與後端 API 欄位一致）。designEmbedded：true 時不套 rounded-4 深灰外框（由父層區塊包住）；稿頁「測試題目」每題一區塊時應為 false。showExamRating：測驗頁專用，顯示讚／差（32×32 透明底；未選 fa-regular gray-1、選中 fa-solid 黑色）並 emit rate-quiz，且不顯示「批改規則（預覽）」。questionHintOnly：建立英文測驗題庫用，僅顯示「第 N 題」、題目、提示（與 designUi 相同 class），不顯示單元／難度、參考答案、作答、批改。
 */
const props = defineProps({
  /** 題目資料（含題目、提示、答案、批改結果等） */
  card: { type: Object, required: true },
  /** 題號（從 1 開始，用於顯示「第 N 題」） */
  slotIndex: { type: Number, required: true },
  /** 批改 prompt 內「課程名稱」占位（與建立測驗題庫頁 course 一致） */
  courseName: { type: String, default: 'MyQuiz.ai' },
  /** 目前分頁／試題用 RAG 的 rag_id；與 card.rag_id 皆有值且不同時，停用答案輸入與確定 */
  currentRagId: { type: [String, Number], default: null },
  /** 為 true 時略過上述 rag_id 比對（介面稿頁用） */
  skipRagMismatchGuard: { type: Boolean, default: false },
  /** 與 UI 元件參考按鈕／字色一致（建立測驗題庫設計稿用） */
  designUi: { type: Boolean, default: false },
  /** 稿頁「測試題目」外層已包 rounded-4 深灰塊時為 true，本卡不再重複外框 */
  designEmbedded: { type: Boolean, default: false },
  /** 正在送出「確定批改」（全螢幕 LoadingOverlay 由父層顯示；按鈕僅停用） */
  gradeSubmitting: { type: Boolean, default: false },
  /** 測驗頁：顯示題目讚／差（32×32 my-btn-circle · 透明底；未選 fa-regular my-color-gray-1、選中 fa-solid my-color-black；與 POST /exam/tab/quiz/rate 搭配；需 designUi）；為 true 時不顯示「批改規則（預覽）」 */
  showExamRating: { type: Boolean, default: false },
  /** 建立英文測驗題庫：僅題目＋提示，版式與本元件 designUi 相同，其餘區塊隱藏 */
  questionHintOnly: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-hint', 'confirm-answer', 'update:quiz_answer', 'rate-quiz']);

function isDifficultyPillActive(opt) {
  const normalized = normalizeQuizLevelLabel(props.card?.generateLevel);
  return normalized != null && normalized === opt;
}

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

/** 有後端／驗證回傳文字且非送出中時才顯示「批改結果」區塊（不預留空白、不顯示尚未批改） */
const showGradingResultSection = computed(
  () =>
    !props.questionHintOnly &&
    !props.gradeSubmitting &&
    String(props.card?.gradingResult ?? '').trim() !== ''
);
</script>

<template>
  <div
    :class="[
      designUi
        ? (designEmbedded ? 'w-100 min-w-0 mb-0' : 'my-bgcolor-gray-3 rounded-4 shadow-sm p-4 mb-0 w-100 min-w-0')
        : ['my-bgcolor-page-block rounded-3 p-3 p-lg-4', 'mb-4'],
      { 'mt-4': !designUi && slotIndex > 1 },
    ]"
  >
    <div
      class="text-start w-100 min-w-0"
      :class="designUi ? 'd-flex flex-column gap-4' : ''"
    >
      <div :class="designUi ? 'd-flex flex-column gap-3 w-100 min-w-0' : ''">
      <div
        class="my-font-lg-600 my-color-black"
        :class="designUi ? 'mb-0' : 'mb-3'"
      >第 {{ slotIndex }} 題</div>
      <!-- 單元與難度（唯讀）；questionHintOnly 時隱藏 -->
      <div
        v-if="!questionHintOnly"
        class="d-flex flex-row align-items-end gap-3 w-100 min-w-0"
        :class="[designUi ? 'flex-nowrap mb-0' : 'flex-wrap mb-3']"
      >
        <div
          class="d-flex flex-column min-w-0"
          :class="designUi ? 'flex-grow-1 gap-1' : 'w-100 flex-shrink-0 gap-0'"
        >
          <div
            :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
          >單元</div>
          <div
            v-if="designUi"
            class="d-flex justify-content-between align-items-center my-font-md-400 my-color-black w-100 min-w-0 px-3 py-2 rounded-2 my-bgcolor-white my-border-gray-2"
            :title="card.ragName || '—'"
            role="presentation"
          >
            <span class="text-truncate text-start pe-2">{{ card.ragName || '—' }}</span>
            <i class="fa-solid fa-chevron-down my-dropdown-toggle-caret flex-shrink-0 opacity-50" aria-hidden="true" />
          </div>
          <div
            v-else
            class="form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 px-3 py-2 d-flex align-items-center"
            :style="{ minHeight: '31px' }"
          >{{ card.ragName || '—' }}</div>
        </div>
        <div
          class="d-flex flex-column"
          :class="designUi ? 'flex-shrink-0 gap-1' : 'flex-shrink-0 w-100 gap-0'"
        >
          <div
            :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
          >難度</div>
          <div
            v-if="designUi"
            class="btn-group my-btn-group-pill flex-shrink-0 pe-none"
            role="group"
            aria-label="難度（唯讀）"
          >
            <button
              v-for="opt in difficultyOptions"
              :key="'diff-pill-' + opt"
              type="button"
              class="btn d-flex justify-content-center align-items-center my-font-md-400 px-3 py-2"
              :class="isDifficultyPillActive(opt) ? 'my-button-white' : 'my-button-gray-3'"
              tabindex="-1"
            >
              {{ opt }}
            </button>
          </div>
          <div
            v-else
            class="form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 px-3 py-2 d-flex align-items-center"
            :style="{ minHeight: '31px' }"
          >{{ card.generateLevel || '—' }}</div>
        </div>
      </div>
      </div>
      <div
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <div
          :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
        >題目</div>
        <div
          class="lh-base"
          :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
        >
          {{ card.quiz }}
        </div>
        <div
          v-if="designUi && showExamRating"
          class="d-flex justify-content-end align-items-center w-100 min-w-0"
          role="group"
          aria-label="題目評價"
        >
          <button
            type="button"
            class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle flex-shrink-0 border-0 shadow-none lh-1"
            title="讚"
            :aria-pressed="card.quiz_rate === 1"
            @click="emit('rate-quiz', 'up')"
          >
            <i
              class="fa-thumbs-up"
              :class="card.quiz_rate === 1 ? 'fa-solid my-color-black' : 'fa-regular my-color-gray-1'"
              aria-hidden="true"
            />
            <span class="visually-hidden">讚</span>
          </button>
          <button
            type="button"
            class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle flex-shrink-0 border-0 shadow-none lh-1"
            title="差"
            :aria-pressed="card.quiz_rate === -1"
            @click="emit('rate-quiz', 'down')"
          >
            <i
              class="fa-thumbs-down"
              :class="card.quiz_rate === -1 ? 'fa-solid my-color-black' : 'fa-regular my-color-gray-1'"
              aria-hidden="true"
            />
            <span class="visually-hidden">差</span>
          </button>
        </div>
        <div
          v-if="designUi && showExamRating && card.rateError"
          class="my-font-sm-400 my-color-red text-end mb-0 w-100"
        >
          {{ card.rateError }}
        </div>
      </div>
      <div
        v-if="designUi && showExamRating"
        class="w-100 min-w-0 d-flex flex-column gap-1 mb-0"
      >
        <button
          type="button"
          class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-start flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
          style="flex: 0 0 auto;"
          @click="emit('toggle-hint', card)"
        >
          {{ card.hintVisible ? '隱藏提示' : '顯示提示' }}
        </button>
        <div
          v-show="card.hintVisible"
          class="my-font-sm-400 form-control my-input-md my-input-md--on-dark my-bgcolor-light-gray rounded-2 w-100 min-w-0 px-3 py-2 my-color-gray-4"
        >
          {{ card.hint }}
        </div>
      </div>
      <div
        v-else
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <button
          type="button"
          class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-start flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
          style="flex: 0 0 auto;"
          @click="emit('toggle-hint', card)"
        >
          {{ card.hintVisible ? '隱藏提示' : '顯示提示' }}
        </button>
        <div
          v-show="card.hintVisible"
          class="my-font-sm-400"
          :class="designUi ? 'form-control my-input-md my-input-md--on-dark my-bgcolor-light-gray rounded-2 w-100 min-w-0 px-3 py-2 my-color-gray-4' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2 mt-2'"
        >
          {{ card.hint }}
        </div>
      </div>
      <div
        v-if="card.referenceAnswer && !questionHintOnly"
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <div
          :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
        >參考答案(暫存)</div>
        <div
          class="my-font-sm-400"
          style="white-space: pre-wrap;"
          :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
        >{{ card.referenceAnswer }}</div>
      </div>
      <div
        v-if="!questionHintOnly"
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <div class="d-flex justify-content-between align-items-baseline gap-2" :class="designUi ? '' : 'mb-1'">
          <label
            :for="`quiz-answer-${card.id}`"
            :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
          >答案</label>
          <span
            :class="designUi ? 'my-font-sm-400 my-color-gray-4 text-end flex-shrink-0 mb-0' : 'form-text my-font-sm-400 my-color-gray-4 text-end flex-shrink-0 mb-0'"
          >{{ card.quiz_answer.length }} / 2000</span>
        </div>
        <template v-if="!card.confirmed">
          <textarea
            :id="`quiz-answer-${card.id}`"
            :value="card.quiz_answer"
            class="form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2"
            :readonly="answerInputDisabled || gradeSubmitting"
            @input="emit('update:quiz_answer', $event.target.value)"
            rows="4"
            placeholder="請輸入您的答案..."
            maxlength="2000"
          />
          <div
            v-if="answerInputDisabled"
            :class="designUi ? 'my-font-sm-400 my-color-red mt-1' : 'form-text my-font-sm-400 my-color-red'"
          >此題與目前題庫版本不一致，無法作答。請改題或重新產生題目。</div>
          <div :class="designUi ? 'd-flex justify-content-center mt-2' : 'd-flex justify-content-end mt-2'">
            <button
              type="button"
              class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 flex-shrink-0 px-3 py-2 my-font-md-400 my-button-white"
              :disabled="answerInputDisabled || gradeSubmitting"
              :aria-busy="gradeSubmitting"
              aria-label="確定批改"
              @click="emit('confirm-answer', card)"
            >
              確定批改
            </button>
          </div>
        </template>
        <template v-else>
          <div
            class="my-font-sm-400 mb-2"
            :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
          >{{ card.quiz_answer }}</div>
        </template>
      </div>
      <div
        v-if="!showExamRating && !questionHintOnly"
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <label
          class="d-block"
          :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
        >批改規則（預覽）</label>
        <div
          class="my-font-sm-400"
          :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
        >
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
      <!-- 批改結果區：僅在回傳後有內容時顯示（送出中不占位） -->
      <div
        v-if="showGradingResultSection"
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <div
          :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
        >批改結果</div>
        <div
          class="my-font-sm-400"
          style="white-space: pre-wrap;"
          :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
        >{{ card.gradingResult }}</div>
      </div>
    </div>
  </div>
</template>
