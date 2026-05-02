<script setup>
import { computed, ref } from 'vue';
import EnglishExamMarkdownEditor from './EnglishExamMarkdownEditor.vue';
import { renderMarkdownToSafeHtml } from '../utils/renderMarkdown.js';

/**
 * QuizCard - 單一題目卡片
 *
 * 顯示：題號（可隱藏）、題目內容、提示（可切換顯示）、答案區（預設帶入暫存參考答案，並於欄位下方註明）、批改結果；測驗頁 hideGradingPrompt 時「批改規則」以 modal 按鈕置於批改結果內容下方。
 * 可輸入答案並按「開始批改」送出評分；按鈕常駐，再次批改時 composable 會先將 confirmed 設為 false 再更新結果。顯示「批改規則」區時須先有非空白內容才可按「開始批改」。**RAG 題庫且 card.rag_quiz_for_exam === true（測驗用）時**：批改規則改為預覽唯讀（黑底預覽），與建立頁出題規則一致。
 * 供 CreateExamQuizBankPage、ExamPage 使用；評分邏輯由父層透過 useQuizGrading 處理。
 *
 * card 物件需含：quiz, hint, referenceAnswer, quiz_answer（使用者作答）, gradingPrompt（可選；Markdown；**RAG** 批改 POST 對應 answer_user_prompt_text；**Exam** 時批改指引仍不由前端於 POST 送出，欄位可編輯以相容），confirmed, gradingResult, ragName, rag_id（可選，供與 currentRagId 比對是否可作答）, id；測驗頁另含 exam_quiz_id、quiz_rate、rateError、quiz_user_prompt_text（可選；POST /exam/tab/quiz/llm-generate 回傳之出題模板快照，與 gradingPrompt 一併在 hideGradingPrompt 時唯讀顯示）；RAG 題庫頁／單元題另含 rag_quiz_id、rag_tab_id、rag_unit_id（狀態／其他 API）、rag_quiz_for_exam（已標為測驗用試題；for-exam 僅送 rag_quiz_id／for_exam）。designEmbedded：true 時不套 rounded-4 深灰外框（由父層區塊包住）；稿頁「測試題目」每題一區塊時應為 false。hideRagQuizForExamToolbar：true 時不在卡內顯示「設為測驗用」（由建立頁置於題型區塊最下方（題目卡片之後）常駐；未出題或未批改為 disabled）。showExamRating：測驗頁專用，顯示讚／差（32×32 透明底；未選 fa-regular gray-1、選中 fa-solid 黑色）並 emit rate-quiz。questionHintOnly：建立英文測驗題庫用，僅顯示「第 N 題」、題目、提示（與 designUi 相同 class），不顯示參考答案、作答、批改。hideGradingPrompt／hideGradingResult：測驗頁可隱藏批改輸入／結果區（仍可送出批改）。readOnlyAnswer：作答弱點分析／學生作答分析等純顯示頁，答案區唯讀、不顯示「開始批改」。
 */
const props = defineProps({
  /** 題目資料（含題目、提示、答案、批改結果等） */
  card: { type: Object, required: true },
  /** 題號（從 1 開始，用於顯示「第 N 題」） */
  slotIndex: { type: Number, required: true },
  /** 目前分頁／試題用 RAG 的 rag_id；與 card.rag_id 皆有值且不同時，停用答案輸入與確定 */
  currentRagId: { type: [String, Number], default: null },
  /** 為 true 時略過上述 rag_id 比對（介面稿頁用） */
  skipRagMismatchGuard: { type: Boolean, default: false },
  /** 與 UI 元件參考按鈕／字色一致（建立測驗題庫設計稿用） */
  designUi: { type: Boolean, default: false },
  /** 稿頁「測試題目」外層已包 rounded-4 深灰塊時為 true，本卡不再重複外框 */
  designEmbedded: { type: Boolean, default: false },
  /** 正在送出「開始批改」（全螢幕 LoadingOverlay 由父層顯示；按鈕僅停用） */
  gradeSubmitting: { type: Boolean, default: false },
  /** 測驗頁：顯示題目讚／差（32×32 my-btn-circle · 透明底；未選 fa-regular my-color-gray-1、選中 fa-solid my-color-black；與 POST /exam/tab/quiz/rate 搭配；需 designUi） */
  showExamRating: { type: Boolean, default: false },
  /** true 時讚／差按鈕停用且不 emit（作答弱點分析等唯讀頁與測驗題目區版面一致用） */
  examRatingReadOnly: { type: Boolean, default: false },
  /** 建立英文測驗題庫：僅題目＋提示，版式與本元件 designUi 相同，其餘區塊隱藏 */
  questionHintOnly: { type: Boolean, default: false },
  /** 父層已顯示「第 N 題」時，隱藏本卡題號（避免重複） */
  hideSlotIndex: { type: Boolean, default: false },
  /** 測驗頁：隱藏「批改規則」Markdown 區（仍可依既有 gradingPrompt 送出） */
  hideGradingPrompt: { type: Boolean, default: false },
  /** 測驗頁：隱藏「批改結果」區塊 */
  hideGradingResult: { type: Boolean, default: false },
  /** 建立測驗題庫（單元題）：批改有結果後可標記 Rag_Quiz.for_exam（POST /rag/tab/unit/quiz/for-exam） */
  showRagQuizForExamAction: { type: Boolean, default: false },
  /** true 時不在本卡「批改結果」下方顯示 for-exam 鈕（改由父層例如題型區塊下方置中顯示） */
  hideRagQuizForExamToolbar: { type: Boolean, default: false },
  /** true 時答案區唯讀、不顯示「開始批改」（仍顯示批改結果區；與 hideGradingPrompt 併用於分析頁） */
  readOnlyAnswer: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-hint', 'confirm-answer', 'update:quiz_answer', 'update:grading_prompt', 'rate-quiz', 'mark-rag-quiz-for-exam']);

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

const cardMarkedForExam = computed(
  () => props.card?.rag_quiz_for_exam === true || props.card?.rag_quiz_for_exam === 1,
);

/** 有後端／驗證回傳文字且非送出中時才顯示「批改結果」區塊（不預留空白、不顯示尚未批改） */
const showGradingResultSection = computed(
  () =>
    !props.hideGradingResult &&
    !props.questionHintOnly &&
    !props.gradeSubmitting &&
    String(props.card?.gradingResult ?? '').trim() !== ''
);

const showRagQuizForExamToolbar = computed(() => {
  if (props.hideRagQuizForExamToolbar) return false;
  if (!props.showRagQuizForExamAction || props.questionHintOnly) return false;
  if (!cardMarkedForExam.value) {
    if (!showGradingResultSection.value) return false;
  }
  const raw = props.card?.rag_quiz_id ?? props.card?.quiz_id;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1;
});

/** 題幹有文字才顯示作答／「開始批改」等（後端空白列或未產出題文時不應出現批改流程） */
const hasQuizBody = computed(() => String(props.card?.quiz ?? '').trim() !== '');

/** 無提示內容時不顯示「顯示提示」與空白提示區 */
const hasHintText = computed(() => String(props.card?.hint ?? '').trim() !== '');

/** 測驗頁 hideGradingPrompt：顯示 llm-generate／Exam_Quiz 之出題模板（quiz_user_prompt_text） */
const quizUserPromptSnapshotTrimmed = computed(() => {
  const c = props.card;
  if (!c || typeof c !== 'object') return '';
  const raw = c.quiz_user_prompt_text ?? c.quizUserPromptText;
  return String(raw ?? '').trim();
});

/** 測驗頁 hideGradingPrompt：批改模板對應 gradingPrompt（answer_user_prompt_text） */
const answerUserPromptSnapshotTrimmed = computed(() =>
  String(props.card?.gradingPrompt ?? '').trim(),
);

const promptModalKind = ref('');

const promptModalTitle = computed(() =>
  promptModalKind.value === 'question' ? '出題規則' : '批改規則'
);

const promptModalText = computed(() => {
  if (promptModalKind.value === 'question') return quizUserPromptSnapshotTrimmed.value;
  if (promptModalKind.value === 'grading') return answerUserPromptSnapshotTrimmed.value;
  return '';
});

const promptModalHtml = computed(() => renderMarkdownToSafeHtml(promptModalText.value));

function openPromptModal(kind) {
  if (kind === 'question' && quizUserPromptSnapshotTrimmed.value === '') return;
  if (kind === 'grading' && answerUserPromptSnapshotTrimmed.value === '') return;
  promptModalKind.value = kind;
}

function closePromptModal() {
  promptModalKind.value = '';
}

/**
 * designUi 時頂區為 flex gap-4 的子項之一；若第 N 題隱藏（如測驗頁、建立題庫 embedded），勿渲染空白包住器，否則與「題目」區之間會多出一格 gap。
 */
const showQuizCardHeaderBand = computed(
  () => !props.designUi || !props.hideSlotIndex,
);
</script>

<template>
  <div>
    <Teleport to="body">
      <div
        v-if="promptModalKind"
        class="modal fade show d-block my-modal-backdrop"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`quiz-card-prompt-modal-title-${card.id}`"
        @click.self="closePromptModal"
      >
        <div
          class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
          @click.stop
        >
          <div class="modal-content border-0 my-bgcolor-gray-3 p-4 d-flex flex-column gap-3">
            <div class="modal-header border-bottom-0 p-0">
              <h5
                :id="`quiz-card-prompt-modal-title-${card.id}`"
                class="modal-title my-color-black"
              >{{ promptModalTitle }}</h5>
              <button
                type="button"
                class="btn-close"
                aria-label="關閉"
                @click="closePromptModal"
              />
            </div>
            <div class="modal-body p-0" style="max-height: 70vh; overflow: auto;">
              <div
                v-if="promptModalHtml"
                class="my-markdown-rendered my-font-md-400 my-color-black text-break"
                v-html="promptModalHtml"
              />
              <span
                v-else
                class="my-font-md-400 my-color-black"
              >—</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
    <div
      :class="[
        designUi
          ? (designEmbedded ? 'w-100 min-w-0 mb-0' : 'my-bgcolor-gray-3 rounded-4 p-4 mb-0 w-100 min-w-0')
          : ['my-bgcolor-page-block rounded-3 p-3 p-lg-4', 'mb-4'],
        { 'mt-4': !designUi && slotIndex > 1 },
      ]"
    >
    <div
      class="text-start w-100 min-w-0"
      :class="designUi ? 'd-flex flex-column gap-4' : ''"
    >
      <div
        v-if="showQuizCardHeaderBand"
        :class="designUi ? 'd-flex flex-column gap-3 w-100 min-w-0' : ''"
      >
      <div
        v-if="!hideSlotIndex"
        class="my-font-lg-600 my-color-black"
        :class="designUi ? 'mb-0' : 'mb-3'"
      >第 {{ slotIndex }} 題</div>
      </div>
      <div
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <div class="d-flex justify-content-between align-items-center gap-2 w-100 min-w-0">
          <div
            :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
          >題目</div>
        </div>
        <div
          class="lh-base"
          :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
        >
          {{ card.quiz }}
        </div>
        <template v-if="designUi && showExamRating && hasQuizBody">
          <div
            class="d-flex flex-row flex-wrap align-items-center gap-2 w-100 min-w-0"
            :class="hasHintText || quizUserPromptSnapshotTrimmed !== '' ? 'justify-content-between' : 'justify-content-end'"
          >
            <div
              v-if="hasHintText || quizUserPromptSnapshotTrimmed !== ''"
              class="d-inline-flex flex-wrap align-items-center gap-2 min-w-0"
            >
              <button
                v-if="hideGradingPrompt && quizUserPromptSnapshotTrimmed !== ''"
                type="button"
                class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
                @click="openPromptModal('question')"
              >
                出題規則
              </button>
              <button
                v-if="hasHintText"
                type="button"
                class="btn rounded-pill d-inline-flex justify-content-center align-items-center flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
                @click="emit('toggle-hint', card)"
              >
                {{ card.hintVisible ? '隱藏提示' : '顯示提示' }}
              </button>
            </div>
            <div
              class="d-inline-flex justify-content-end align-items-center flex-shrink-0 gap-1"
              role="group"
              aria-label="題目評價"
            >
              <button
                type="button"
                class="btn rounded-circle d-flex justify-content-center align-items-center my-font-md-400 my-button-transparent-borderless my-btn-circle flex-shrink-0 border-0 shadow-none lh-1"
                title="讚"
                :aria-pressed="card.quiz_rate === 1"
                :disabled="examRatingReadOnly"
                @click="!examRatingReadOnly && emit('rate-quiz', 'up')"
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
                :disabled="examRatingReadOnly"
                @click="!examRatingReadOnly && emit('rate-quiz', 'down')"
              >
                <i
                  class="fa-thumbs-down"
                  :class="card.quiz_rate === -1 ? 'fa-solid my-color-black' : 'fa-regular my-color-gray-1'"
                  aria-hidden="true"
                />
                <span class="visually-hidden">差</span>
              </button>
            </div>
          </div>
          <div
            v-if="card.rateError"
            class="my-font-sm-400 my-color-red text-end mb-0 w-100"
          >
            {{ card.rateError }}
          </div>
          <div
            v-if="hasHintText"
            v-show="card.hintVisible"
            class="my-font-sm-400 form-control my-input-md my-input-md--on-dark my-bgcolor-light-gray rounded-2 w-100 min-w-0 px-3 py-2 my-color-gray-4"
          >
            {{ card.hint }}
          </div>
        </template>
        <button
          v-else-if="hideGradingPrompt && hasQuizBody && quizUserPromptSnapshotTrimmed !== ''"
          type="button"
          class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-start flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
          @click="openPromptModal('question')"
        >
          出題規則
        </button>
      </div>
      <div
        v-if="!(designUi && showExamRating) && hasHintText"
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
        v-if="!questionHintOnly && hasQuizBody"
        class="w-100 min-w-0"
        :class="designUi ? 'd-flex flex-column gap-1 mb-0' : 'mb-3'"
      >
        <div class="d-flex justify-content-between align-items-baseline gap-2" :class="designUi ? '' : 'mb-1'">
          <label
            :for="`quiz-answer-${card.id}`"
            :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
          >答案</label>
          <span
            v-if="!readOnlyAnswer"
            :class="designUi ? 'my-font-sm-400 my-color-gray-4 text-end flex-shrink-0 mb-0' : 'form-text my-font-sm-400 my-color-gray-4 text-end flex-shrink-0 mb-0'"
          >{{ card.quiz_answer.length }} / 2000</span>
        </div>
        <template v-if="readOnlyAnswer">
          <div
            :id="`quiz-answer-${card.id}`"
            class="my-font-sm-400 mb-0"
            :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
          >{{ card.quiz_answer }}</div>
        </template>
        <template v-else-if="!card.confirmed">
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
        </template>
        <template v-else>
          <div
            class="my-font-sm-400 mb-2"
            :class="designUi ? 'form-control my-input-md my-input-md--on-dark rounded-2 w-100 min-w-0 px-3 py-2' : 'form-control my-input-md my-input-md--on-dark rounded-2 my-form-control-static w-100 min-w-0 px-3 py-2'"
          >{{ card.quiz_answer }}</div>
        </template>
        <p
          v-if="!readOnlyAnswer && !card.confirmed && String(card.referenceAnswer ?? '').trim() !== ''"
          :class="designUi ? 'my-font-sm-400 my-color-gray-4 mb-0 mt-1' : 'form-text my-font-sm-400 my-color-gray-4 mb-0 mt-1'"
          role="note"
        >
          此欄預設為暫存參考答案，可自行修改。
        </p>
        <template v-if="!readOnlyAnswer && !card.confirmed">
          <div
            v-if="answerInputDisabled"
            :class="designUi ? 'my-font-sm-400 my-color-red mt-1' : 'form-text my-font-sm-400 my-color-red'"
          >此題與目前題庫版本不一致，無法作答。請改題或重新產生題目。</div>
        </template>
        <div
          v-if="!hideGradingPrompt"
          class="d-flex flex-column gap-1 w-100 min-w-0 mt-3 quiz-card-grading-prompt-editor"
        >
          <label
            :for="`quiz-grading-prompt-${card.id}`"
            :class="designUi ? 'my-color-gray-1 flex-shrink-0 my-font-sm-400 mb-0' : 'form-label my-font-sm-600 mb-0 my-color-gray-1'"
          >批改規則</label>
          <EnglishExamMarkdownEditor
            :model-value="String(card.gradingPrompt ?? '')"
            :textarea-id="`quiz-grading-prompt-${card.id}`"
            :preview-only="cardMarkedForExam"
            :preview-design-dark="cardMarkedForExam"
            :disabled="
              cardMarkedForExam
                ? false
                : answerInputDisabled || gradeSubmitting
            "
            @update:model-value="emit('update:grading_prompt', $event)"
          />
        </div>
        <div
          v-if="!readOnlyAnswer"
          :class="designUi ? 'd-flex justify-content-center mt-2' : 'd-flex justify-content-end mt-2'"
        >
          <button
            type="button"
            class="btn rounded-pill d-flex justify-content-center align-items-center gap-2 flex-shrink-0 px-3 py-2 my-font-md-400 my-button-white"
            :disabled="
              answerInputDisabled ||
              gradeSubmitting ||
              !String(card.quiz_answer ?? '').trim().length ||
              (!hideGradingPrompt &&
                !String(card.gradingPrompt ?? '').trim().length)
            "
            :aria-busy="gradeSubmitting"
            aria-label="開始批改"
            @click="emit('confirm-answer', card)"
          >
            開始批改
          </button>
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
        <button
          v-if="hideGradingPrompt && answerUserPromptSnapshotTrimmed !== ''"
          type="button"
          class="btn rounded-pill d-inline-flex justify-content-center align-items-center align-self-start flex-shrink-0 my-font-sm-400 my-color-gray-1 my-btn-outline-gray-1 px-3 py-1"
          @click="openPromptModal('grading')"
        >
          批改規則
        </button>
        <div
          v-if="showRagQuizForExamToolbar"
          class="w-100 min-w-0 d-flex flex-column align-items-center gap-2 mt-3"
        >
          <button
            type="button"
            :class="
              cardMarkedForExam
                ? 'btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-btn-outline-green-hollow px-3 py-2'
                : 'btn rounded-pill d-flex justify-content-center align-items-center my-font-md-400 my-button-green px-3 py-2'
            "
            :disabled="card.ragQuizForExamLoading"
            :aria-busy="card.ragQuizForExamLoading"
            @click="emit('mark-rag-quiz-for-exam', card)"
          >
            {{ cardMarkedForExam ? '取消設為測驗用' : '設為測驗用' }}
          </button>
          <div
            v-if="String(card.ragQuizForExamError ?? '').trim() !== ''"
            class="my-alert-danger-soft my-font-sm-400 py-2 mb-0 w-100 text-center"
          >
            {{ card.ragQuizForExamError }}
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* EasyMDE 編輯區與出題規則欄同 min-height；唯讀預覽高度由內容決定 */
.quiz-card-grading-prompt-editor :deep(.english-exam-md-editor-root) {
  --english-md-preview-max-h: min(60vh, 28rem);
}
.quiz-card-grading-prompt-editor :deep(.english-exam-md-editor-wrap .CodeMirror) {
  min-height: 400px !important;
}
.quiz-card-grading-prompt-editor :deep(.english-exam-md-editor-wrap .CodeMirror-scroll) {
  min-height: 400px;
}
</style>
