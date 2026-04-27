/**
 * ⚡ vite.config.js - Vite 建置工具配置文件
 *
 * 功能說明：
 * 1. 🔌 配置 Vue 3 插件支援
 * 2. 📁 設定路徑別名，簡化模組引入
 * 3. 🖥️ 配置開發伺服器設定
 * 4. ⚡ 優化建置性能和開發體驗
 *
 * 設計理念：
 * - 使用 Vite 提供快速的開發體驗
 * - 配置路徑別名提高程式碼可讀性
 * - 支援跨平台開發環境
 *
 * @config vite.config.js
 * @version 1.0.0
 * @see https://vitejs.dev/config/
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Vite 官方配置參考：https://vitejs.dev/config/
export default defineConfig({
  /**
   * 🔌 插件配置 (Plugins Configuration)
   * 註冊 Vite 插件以支援不同的功能和語法
   */
  plugins: [
    vue(), // Vue 3 單文件組件支援插件
  ],

  /**
   * 📁 模組解析配置 (Module Resolution Configuration)
   * 設定模組引入的路徑別名和解析規則
   */
  resolve: {
    /**
     * 🔗 路徑別名設定 (Path Alias Configuration)
     * 設定簡化的路徑別名，提高程式碼可讀性和維護性
     */
    alias: {
      '@': path.resolve(__dirname, './src'), // '@' 指向 src 目錄
    },
  },

  /**
   * 🖥️ 開發伺服器配置 (Development Server Configuration)
   * 設定本地開發環境的伺服器參數
   */
  server: {
    /**
     * 🔌 服務端口（與 Vue CLI vue.config.js 預設對齊）
     */
    port: 8081,

    /**
     * 🌐 主機設定
     * true 等同於 '0.0.0.0'，允許外部設備訪問
     * false 等同於 'localhost'，僅允許本機訪問
     */
    host: true,

    /**
     * 與 vue.config.js 一致：/english_system 轉發本機後端（做法 B）
     */
    proxy: {
      '/english_system': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
