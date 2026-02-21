<script>
  /**
   * LoadingOverlay - 全螢幕載入遮罩。Props: isVisible, loadingText, progress, showProgress, subText。
   */
  export default {
    name: 'LoadingOverlay',
    props: {
      isVisible: { type: Boolean, default: false, required: true },
      loadingText: { type: String, default: '載入中...' },
      progress: {
        type: Number,
        default: -1,
        validator: (v) => v >= -1 && v <= 100,
      },
      showProgress: { type: Boolean, default: false },
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
