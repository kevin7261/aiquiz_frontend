<script>
  /**
   * LoadingOverlay - 全螢幕載入遮罩
   *
   * 用於登入中、長時間 API 等情境。可選顯示進度條（progress 0–100）與副標（subText）。
   * 需由父層控制 isVisible，為 true 時覆蓋整個視窗並置中顯示 spinner 與文字。
   */
  export default {
    name: 'LoadingOverlay',
    props: {
      /** 是否顯示遮罩（為 false 時不渲染） */
      isVisible: { type: Boolean, default: false, required: true },
      /** 主文字，例如「載入中...」「執行中...」 */
      loadingText: { type: String, default: '載入中...' },
      /** 進度 0–100；-1 表示不顯示進度（需搭配 showProgress） */
      progress: {
        type: Number,
        default: -1,
        validator: (v) => v >= -1 && v <= 100,
      },
      /** 是否顯示進度條（與 progress >= 0 一起使用） */
      showProgress: { type: Boolean, default: false },
      /** 副標文字（可選） */
      subText: { type: String, default: '' },
    },
  };
</script>

<template>
  <div
    v-if="isVisible"
    class="d-flex justify-content-center align-items-center position-fixed top-0 start-0 w-100 h-100 my-loading-overlay-backdrop"
  >
    <div class="text-center my-bgcolor-white rounded shadow my-loading-overlay-panel p-4">
      <div class="spinner-border text-primary my-loading-spinner mb-3" role="status">
        <span class="visually-hidden">載入中...</span>
      </div>
      <div class="my-title-lg-black">{{ loadingText }}</div>
      <div class="mt-3" v-if="showProgress && progress >= 0">
        <div class="progress my-loading-progress">
          <div
            class="d-flex align-items-center justify-content-center progress-bar bg-primary my-loading-progress-bar"
            role="progressbar"
            :style="{ '--my-loading-progress-pct': progress + '%' }"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            {{ Math.round(progress) }}%
          </div>
        </div>
      </div>
      <div v-if="subText" class="mt-2">
        <small class="my-content-xs-gray">{{ subText }}</small>
      </div>
    </div>
  </div>
</template>
