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
      /** 主文字，依頁面情境（例如「登入中...」「載入名單中...」） */
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
    class="loading-overlay d-flex justify-content-center align-items-center position-fixed top-0 start-0 w-100 h-100"
  >
    <div class="text-center my-bgcolor-white rounded shadow loading-overlay-panel p-4">
      <div class="spinner-border text-primary loading-overlay-spinner mb-3" role="status">
        <span class="visually-hidden">{{ loadingText }}</span>
      </div>
      <div class="fs-5 fw-semibold text-dark">{{ loadingText }}</div>
      <div class="mt-3" v-if="showProgress && progress >= 0">
        <div class="progress loading-overlay-progress">
          <div
            class="d-flex align-items-center justify-content-center progress-bar bg-primary loading-overlay-progress-bar"
            role="progressbar"
            :style="{ '--loading-overlay-progress-pct': progress + '%' }"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            {{ Math.round(progress) }}%
          </div>
        </div>
      </div>
      <div v-if="subText" class="mt-2">
        <span class="my-font-size-xs my-color-gray-light">{{ subText }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 9999;
}

.loading-overlay-panel {
  min-width: 300px;
  max-width: 400px;
}

.loading-overlay-spinner {
  width: 2rem;
  height: 2rem;
}

.loading-overlay-progress {
  height: 8px;
}

.loading-overlay-progress-bar {
  width: var(--loading-overlay-progress-pct, 0);
  transition: width 0.3s ease;
  font-size: var(--my-font-size-xs);
  color: var(--my-color-white);
}
</style>
