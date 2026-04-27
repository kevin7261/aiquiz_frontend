/**
 * 🔧 vue.config.js - Vue CLI 專案配置文件
 *
 * 功能說明：
 * 1. 🌐 配置專案的公開路徑，用於 GitHub Pages 部署
 * 2. 📦 設定 Babel 轉譯依賴項目，確保舊瀏覽器兼容性
 * 3. 🖥️ 配置開發伺服器的端口和主機設定
 * 4. 🚀 優化建置和開發環境的各項設定
 *
 * 設計理念：
 * - 支援 GitHub Pages 部署的路徑配置
 * - 提供穩定的開發環境設定
 * - 確保跨平台和跨瀏覽器的兼容性
 *
 * @config vue.config.js
 * @version 1.0.0
 */

const { defineConfig } = require('@vue/cli-service');

/**
 * 開發伺服器 API 代理目標（npm run serve）。
 * 預設本機 FastAPI（與 src/constants/api.js 之 API_BASE_LOCAL 一致）；若要改打 Render 請設 DEV_API_PROXY_TARGET。
 */
const devApiProxyTarget =
  process.env.DEV_API_PROXY_TARGET && String(process.env.DEV_API_PROXY_TARGET).trim() !== ''
    ? String(process.env.DEV_API_PROXY_TARGET).replace(/\/$/, '')
    : 'http://127.0.0.1:8000';

module.exports = defineConfig({
  /**
   * 🌐 公開路徑設定 (Public Path Configuration)
   * - 開發環境 (npm run serve)：'/'，可用 http://localhost:8080 開啟
   * - Vercel 部署（根路徑）：'/'，避免請求 /MyQuiz.ai_frontend/js/... 拿到 HTML 導致 Unexpected token '<'
   * - GitHub Pages：'/MyQuiz.ai_frontend/'，建置時需設 VUE_APP_DEPLOY=gh-pages
   */
  publicPath:
    process.env.NODE_ENV === 'production'
      ? process.env.VERCEL === '1' || process.env.VUE_APP_DEPLOY !== 'gh-pages'
        ? '/'
        : '/MyQuiz.ai_frontend/'
      : '/',

  /**
   * 📄 頁面標題設定 (Page Title Configuration)
   * 設定應用程式的頁面標題
   */
  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].title = 'MyQuiz.ai';
      return args;
    });
  },

  /**
   * 📦 依賴項目轉譯設定 (Transpile Dependencies)
   * 啟用 Babel 轉譯 node_modules 中的依賴項目
   * - true：轉譯所有依賴項目，確保舊瀏覽器兼容性
   * - false：不轉譯依賴項目，建置速度較快但可能有兼容性問題
   */
  transpileDependencies: true,

  /**
   * 🖥️ 開發伺服器配置 (Development Server Configuration)
   * 設定本地開發環境的伺服器參數
   */
  devServer: {
    /**
     * 🔌 服務端口
     * 設定開發伺服器監聽的端口號
     */
    port: 8080,

    /**
     * 🌐 主機設定
     * '0.0.0.0' 允許外部設備訪問（如手機、其他電腦）
     * 'localhost' 僅允許本機訪問
     */
    host: '0.0.0.0',

    /**
     * HMR WebSocket：以區網 IP（例 http://10.x.x.x:8081）開頁時，預設可能連到錯誤主機而報
     * WebSocket connection to 'ws://…:8081/ws' failed。設為 auto 讓客戶端依目前網址決定 ws 目標。
     * @see https://webpack.js.org/configuration/dev-server/#devserverclient
     */
    client: {
      webSocketURL: 'auto://0.0.0.0:0/ws',
    },

    /**
     * 🔀 開發環境 API 代理（避開 CORS）
     * 預設轉發本機 8000；線上後端請設 DEV_API_PROXY_TARGET（Vercel 生產不走此 proxy，見 api.js API_BASE）。
     * 使用物件格式（webpack-dev-server v4 最穩定的寫法）。
     * 每個 key 為前綴；SPA 路由 /exam（無後綴斜線）不會被 /exam/tab 吃掉。
     * /user/ 需加斜線，避免誤匹配 SPA 的 /user-management、/users 等前端路由。
     * ※ 預設（api.js）開發直連 http://127.0.0.1:8000，後端 CORS 須含前端 origin。若要在 .env 把
     *    VUE_APP_API_BASE 設成與 dev server 同 origin，則 fetch 才會走此 proxy 到 8000。
     */
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/rag': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/english_system': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/user/': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/exam/tab': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/system-settings/': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/person-analysis/': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/course-analysis/': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      '/log/': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
