# MyQuiz.ai_frontend

[![Vue.js](https://img.shields.io/badge/Vue.js-3.2.13-4FC08D?style=flat-square&logo=vue.js)](https://vuejs.org/)
[![Vue Router](https://img.shields.io/badge/Vue_Router-4.5.1-4FC08D?style=flat-square&logo=vue.js)](https://router.vuejs.org/)
[![Pinia](https://img.shields.io/badge/Pinia-2.1.0-FFD859?style=flat-square)](https://pinia.vuejs.org/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3.0-7952B3?style=flat-square&logo=bootstrap)](https://getbootstrap.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

基於 Vue 3 的 **MyQuiz.ai** 單頁應用程式（倉庫名稱 MyQuiz.ai_frontend），提供**工作分頁**與**儀表板**介面，適合數據展示、工作流程與儀表板類專案。程式碼含中文註解，便於維護與擴充。

**後端 API** 對應之儲存庫名稱為 **MyQuiz.ai_backend**（正式環境預設基底網址見 `src/constants/api.js` 之 `API_BASE_PRODUCTION`；本機開發經 `vue.config.js` proxy 轉發至同一後端）。

### 上傳到新 Repository（MyQuiz.ai_frontend）

本專案已改為獨立 Git 儲存庫。若要推送到 GitHub 上的新 repository `MyQuiz.ai_frontend`：

1. 在 GitHub 建立新 repository，名稱設為 **MyQuiz.ai_frontend**（不要勾選「Add a README」）。
2. 在專案目錄執行：

```bash
git remote add origin https://github.com/kevin7261/MyQuiz.ai_frontend.git
git branch -M main
git push -u origin main
```

若使用 SSH：`git remote add origin git@github.com:kevin7261/MyQuiz.ai_frontend.git`

---

## 目錄

- [專案概述](#專案概述)
- [功能說明](#功能說明)
- [技術棧](#技術棧)
- [環境需求](#環境需求)
- [安裝與執行](#安裝與執行)
- [專案結構](#專案結構)
- [設定檔說明](#設定檔說明)
- [腳本指令](#腳本指令)
- [架構與資料流](#架構與資料流)
- [組件說明](#組件說明)
- [樣式系統](#樣式系統)
- [開發指南](#開發指南)
- [建置與部署](#建置與部署)
- [API 參考](#api-參考)
- [故障排除](#故障排除)
- [貢獻指南](#貢獻指南)
- [授權與聯絡](#授權與聯絡)

---

## 專案概述

### 簡介

**MyQuiz.ai** 為一單頁應用程式（SPA），以 Vue 3 為核心，搭配 Vue Router、Pinia、Bootstrap 5 與 Font Awesome，實作「工作分頁」與「儀表板」兩大區塊，並可依需求擴充狀態與頁面。後端服務由獨立儲存庫 **MyQuiz.ai_backend** 提供 REST API。

### 目標與特色

| 項目 | 說明 |
|------|------|
| **技術棧** | Vue 3 Composition API、Vue Router 4、Pinia、Bootstrap 5、Font Awesome |
| **介面** | 標題列 + Tab 切換（工作分頁 / 儀表板）+ 內容區 + 頁腳 |
| **版面** | 固定版面，無 RWD 設定 |
| **狀態管理** | Pinia store 預留擴充，可集中管理全域狀態 |
| **程式風格** | 中文註解、ESLint、Prettier、Vue CLI 建置 |

### 適用情境

- 內部工具或儀表板
- 數據與統計展示
- 學術或研究用介面
- 需快速擴充分頁與狀態的 Vue 3 專案

---

## 功能說明

### 首頁（`/`）

首頁由 **HomeView** 組成，包含：

1. **標題列**  
   顯示目前分頁名稱（「工作分頁」或「儀表板」）。

2. **分頁導航**  
   - **🔧 工作分頁**：切換至工作分頁內容。  
   - **📊 儀表板**：切換至儀表板內容。

3. **內容區**  
   依所選 Tab 顯示 **WorkTab** 或 **DashboardTab**。

4. **頁腳**  
   臺灣大學地理環境資源學系與年份。

### 工作分頁（WorkTab）

- 當前工作狀態說明。  
- 支援格式：GeoJSON, Shapefile, KML, CSV。  
- 工作區功能：數據處理與分析、屬性查詢與篩選、地理計算工具。  
- 快速操作按鈕：載入資料、執行分析、匯出結果。  

（以上為靜態說明，實際邏輯可於 `src/tabs/WorkTab.vue` 擴充。）

### 儀表板（DashboardTab）

- **系統統計**：數據點總數、使用記憶體等（目前為佔位）。  
- **分析摘要**：空間參考（如 WGS84）、最後更新時間。  
- **數據品質指標**：完整性、準確性、時效性進度條。  
- **快速操作**：重新整理、匯出報告、設定警報。  

（數值與行為可於 `src/tabs/DashboardTab.vue` 改為接 API 或 store。）

### 載入覆蓋層（LoadingOverlay）

全螢幕載入遮罩組件，可由父組件控制顯示/隱藏、載入文字、進度與副標。目前首頁傳入 `isVisible: false`，預設不顯示；若未來有非同步載入需求，可改為綁定 store 或 props。

---

## 技術棧

### 核心依賴（dependencies）

| 套件 | 版本 | 用途 |
|------|------|------|
| **vue** | ^3.2.13 | 前端框架，Composition API、響應式、組件化 |
| **vue-router** | ^4.5.1 | 單頁應用路由（History 模式、守衛、meta） |
| **pinia** | ^2.1.0 | 狀態管理，取代 Vuex，支援 DevTools、持久化 |
| **bootstrap** | ^5.3.0 | 網格、元件、工具類、JS 元件 |
| **@fortawesome/fontawesome-free** | ^6.7.2 | 圖示字體（solid / regular / brands） |
| **core-js** | ^3.8.3 | Babel 依賴，用於 polyfill（babel.config.js 之 corejs: 3） |

### 開發依賴（devDependencies）

| 套件 | 版本 | 用途 |
|------|------|------|
| **@vue/cli-service** | ^5.0.8 | Vue CLI 建置與開發伺服器 |
| **@vue/cli-plugin-babel** | ^5.0.8 | Babel 轉譯與 polyfill（useBuiltIns: 'usage', corejs: 3） |
| **@vue/cli-plugin-eslint** | ^5.0.8 | ESLint 整合 |
| **@babel/core** | ^7.12.16 | Babel 核心 |
| **@babel/eslint-parser** | ^7.12.16 | ESLint 使用 Babel 解析器 |
| **eslint** | ^8.57.0 | 程式碼檢查 |
| **eslint-plugin-vue** | ^9.27.0 | Vue 專用規則 |
| **eslint-config-prettier** | ^10.1.5 | 關閉與 Prettier 衝突的規則 |
| **eslint-plugin-prettier** | ^5.4.1 | 以 Prettier 作為 ESLint 規則 |
| **prettier** | ^3.5.3 | 程式碼格式化 |
| **gh-pages** | ^5.0.0 | 部署至 GitHub Pages（`npm run deploy`） |
| **html-webpack-plugin** | ^4.5.2 | HTML 產物與 title 等設定（由 Vue CLI 使用） |

### 瀏覽器支援（browserslist）

- 設定於 `package.json` 的 `browserslist`。  
- 預設：`"> 1%", "last 2 versions", "not dead", "not ie 11"`。  
- 影響 Babel 與 Autoprefixer 的輸出，建置時會依此產生相容程式碼。

---

## 環境需求

- **Node.js**：>= 14.0.0（建議 16.x 或 18.x LTS）。  
- **套件管理**：npm >= 6.0.0 或 yarn >= 1.22.0。  
- **作業系統**：Windows / macOS / Linux 皆可；開發伺服器設定 `host: '0.0.0.0'`，區域網路可連線。

---

## 安裝與執行

### 1. 取得專案

```bash
git clone https://github.com/kevin7261/MyQuiz.ai_frontend.git
cd MyQuiz.ai_frontend
```

（若專案根目錄即為 `frontend`，則從 `frontend` 開始即可。）

### 2. 安裝依賴

```bash
npm install
# 或
yarn install
```

會安裝 `package.json` 中所有 `dependencies` 與 `devDependencies`，並產生 `node_modules` 與 `package-lock.json`（或 `yarn.lock`）。

### 3. 啟動開發伺服器

```bash
npm run serve
# 或
yarn serve
```

- 使用 **Vue CLI** 啟動開發伺服器。  
- 預設：**http://localhost:8080**（port 在 `vue.config.js` 的 `devServer.port` 設定）。  
- 支援熱重載（HMR），修改程式存檔後會自動更新瀏覽器。  
- `host: '0.0.0.0'` 時，同一網路可透過本機 IP:8080 存取。

### 4. 建置生產版本

```bash
npm run build
# 或
yarn build
```

- 產出目錄：**dist/**。  
- 生產環境 `publicPath` 為 **`/MyQuiz.ai_frontend/`**（對應 GitHub Pages 子路徑）。  
- 建置時會進行壓縮、Tree-shaking、chunk 分割等優化。

### 5. 部署至 GitHub Pages

```bash
npm run deploy
# 或
yarn deploy
```

- 會先執行 `predeploy`（即 `npm run build`），再以 **gh-pages** 將 `dist` 目錄推送至 `gh-pages` 分支。  
- 若倉庫為 `https://github.com/kevin7261/autoq`，則線上網址為：**https://kevin7261.github.io/MyQuiz.ai_frontend**。  
- `vue.config.js` 中生產環境 `publicPath: '/MyQuiz.ai_frontend/'` 需與 GitHub 專案名稱一致，否則資源路徑會錯誤。

---

## 專案結構

```
frontend/
├── public/                    # 靜態資源（不經 webpack 處理，複製至 dist 根目錄）
│   ├── index.html             # 入口 HTML，含 <div id="app">
│   ├── favicon.ico            # 網站圖示
│   ├── 404.html               # 可選：SPA 404 頁
│   └── data/                  # 靜態數據（可放 JSON、壓縮檔等）
│       └── rag_db.zip
│
├── src/
│   ├── main.js                # 應用程式入口：建立 Vue app、掛載 router/pinia、引入全域樣式
│   ├── App.vue                 # 根組件：僅含 <router-view>，作為路由出口
│   │
│   ├── router/
│   │   └── index.js           # Vue Router 設定：routes、history、beforeEach（設定 document.title）
│   │
│   ├── stores/
│   │   └── dataStore.js       # Pinia store（id: 'data'），目前為預留擴充用
│   │
│   ├── views/
│   │   └── HomeView.vue       # 首頁：標題、Tab 導航、WorkTab/DashboardTab、頁腳
│   │
│   ├── tabs/
│   │   ├── WorkTab.vue        # 工作分頁內容（靜態說明與按鈕）
│   │   └── DashboardTab.vue   # 儀表板內容（統計、品質指標、按鈕）
│   │
│   ├── components/
│   │   └── LoadingOverlay.vue # 全螢幕載入遮罩（isVisible、loadingText、progress、subText）
│   │
│   ├── assets/
│   │   ├── css/
│   │   │   ├── variables.css  # CSS 變數：顏色、字體、間距等
│   │   │   └── common.css     # 全域樣式與工具類（引入 variables.css）
│   │   └── logo.png           # 專案 logo（可選）
│   │
│   └── constants/             # 常數目錄（目前僅 .gitkeep，可放常數或列舉）
│       └── .gitkeep
│
├── babel.config.js            # Babel：@vue/cli-plugin-babel/preset，corejs: 3，useBuiltIns: 'usage'
├── vue.config.js              # Vue CLI：publicPath、devServer、chainWebpack（title）、transpileDependencies
├── vite.config.js             # 若未來改用 Vite 建置可在此設定
├── jsconfig.json              # JS 路徑別名等（可給編輯器與工具使用）
├── package.json               # 依賴、腳本、browserslist、eslintConfig
├── package-lock.json          # npm 依賴鎖檔
├── README.md                  # 本說明文件
│
└── scripts/                   # 自訂腳本（可選，如建置前處理）
    ├── remove-console.js
    └── remove-console-ast.js
```

### 目錄職責簡表

| 目錄/檔案 | 職責 |
|-----------|------|
| **src/main.js** | 建立 app、註冊 router/pinia、引入 Bootstrap / Font Awesome / common.css、掛載 `#app` |
| **src/App.vue** | 根組件，僅提供 `<router-view>` |
| **src/router/index.js** | 定義 routes（`/` → HomeView）、createWebHistory、beforeEach 設定 title |
| **src/stores/dataStore.js** | Pinia store，目前僅預留狀態，供日後擴充 |
| **src/views/HomeView.vue** | 首頁版面：標題、Tab、WorkTab/DashboardTab、頁腳 |
| **src/tabs/*.vue** | 各分頁的 UI 與邏輯（可再接 API 或 store） |
| **src/components/*.vue** | 可重用 UI（如 LoadingOverlay） |
| **src/assets/css/** | 全域變數與樣式，供各組件與 main 使用 |

---

## 設定檔說明

### vue.config.js

- **publicPath**  
  - 開發：`/`。  
  - 生產：`/MyQuiz.ai_frontend/`，對應 GitHub Pages 專案路徑。

- **chainWebpack**  
  - 設定 `html-webpack-plugin` 的 title 為 `'MyQuiz.ai'`（使用者可見品牌名稱）。

- **transpileDependencies**  
  - `true`：轉譯 `node_modules` 內依賴，提高舊瀏覽器相容性。

- **devServer**  
  - `port: 8080`。  
  - `host: '0.0.0.0'`：允許區域網路存取。

### babel.config.js

- **preset**：`@vue/cli-plugin-babel/preset`。  
- **useBuiltIns: 'usage'**：依程式碼使用情況自動注入 polyfill。  
- **corejs: 3**：使用 core-js 3。

### package.json 中的 eslintConfig

- **extends**：`plugin:vue/vue3-essential`、`eslint:recommended`。  
- **parser**：`@babel/eslint-parser`。  
- **rules**：`no-console: warn`、`no-debugger: warn`、`vue/multi-word-component-names: off` 等。

---

## 腳本指令

| 指令 | 說明 |
|------|------|
| **npm run serve** | 啟動開發伺服器（預設 http://localhost:8080），支援 HMR |
| **npm run build** | 建置生產版本至 `dist/`，使用生產 publicPath |
| **npm run lint** | 執行 ESLint 檢查 |
| **npm run lint:fix** | 執行 ESLint 並自動修復可修復問題 |
| **npm run prettier** | 使用 Prettier 格式化專案內檔案 |
| **npm run prettier:check** | 僅檢查格式，不寫入 |
| **npm run format** | 先執行 prettier，再執行 lint:fix |
| **npm run predeploy** | 由 deploy 自動呼叫，實際執行 `npm run build` |
| **npm run deploy** | 先 build，再以 gh-pages 部署 dist 至 gh-pages 分支 |

---

## 架構與資料流

### 應用程式啟動順序

1. **main.js**  
   - `createApp(App)` → `app.use(router)` → `app.use(pinia)` → `app.mount('#app')`。  
   - 載入 Bootstrap CSS/JS、Font Awesome、`common.css`。

2. **App.vue**  
   - 僅渲染 `<router-view />`，由路由決定顯示哪個 view。

3. **router**  
   - 路徑 `/` 對應 **HomeView**；其餘路徑可於 `router/index.js` 擴充。

4. **HomeView**  
   - 使用 `ref('work')` 管理 `activeTab`，以 `switchTab('work'|'dashboard')` 切換。  
   - 依 `activeTab` 顯示 **WorkTab** 或 **DashboardTab**。  
   - 不依賴 dataStore 的圖層或複雜狀態；若未來有全域狀態，可改為從 dataStore 讀寫。

### 資料流（目前）

- **路由**：`router` → 決定顯示 HomeView。  
- **分頁**：HomeView 的 `activeTab` → 決定顯示 WorkTab 或 DashboardTab。  
- **全域狀態**：Pinia `dataStore` 目前僅預留，未在畫面上使用；可於 dataStore 新增 state/getters/actions，再在任一組件中 `useDataStore()` 使用。

---

## 組件說明

### App.vue

- **角色**：根組件，僅作為路由出口。  
- **template**：`<div id="app">` 內含 `<router-view />`。  
- **樣式**：引入 `./assets/css/common.css`。

### HomeView.vue

- **角色**：首頁畫面，包含標題、Tab、內容、頁腳。  
- **狀態**：`activeTab`（'work' | 'dashboard'）。  
- **計算屬性**：`currentTabTitle` 依 `activeTab` 回傳「工作分頁」或「儀表板」。  
- **子組件**：LoadingOverlay、WorkTab、DashboardTab。  
- **注意**：LoadingOverlay 目前 `isVisible` 固定為 `false`；若有非同步載入，可改為響應式變數或 store。

### WorkTab.vue

- **角色**：工作分頁內容。  
- **技術**：`<script setup>`，無 props/emit。  
- **內容**：工作狀態、支援格式、工作區功能、快速操作按鈕（UI  only，可自行綁定事件與 API/store）。

### DashboardTab.vue

- **角色**：儀表板內容。  
- **技術**：`<script setup>`。  
- **內容**：系統統計、分析摘要、數據品質進度條、快速操作按鈕；可改為從 store 或 API 取得數據。

### LoadingOverlay.vue

- **Props**：`isVisible`（必填）、`loadingText`、`progress`、`showProgress`、`subText`。  
- **用途**：全螢幕半透明遮罩 + 載入文字（與可選進度條）。  
- **使用處**：HomeView 內，目前僅作佔位，不顯示。

### dataStore.js（Pinia）

- **Store id**：`'data'`。  
- **選項**：`persist: true`（會使用 pinia 持久化插件若已註冊）。  
- **目前內容**：單一 `_placeholder` ref，回傳於 store；可依需求擴充 state、getters、actions。

---

## 樣式系統

### variables.css

- 定義 CSS 自訂屬性：  
  - 顏色（如 `--my-color-*`、`--my-bgcolor-*`）。  
  - 字體（字型、大小、字重、字距）。  
  - 間距、陰影等。  
- 供 `common.css` 與各組件透過 `var(--...)` 使用。

### common.css

- 引入 **variables.css**。  
- 全域重置與基礎樣式（如 `html/body`、`#app`）。  
- 工具類：如 `.my-title-*`、`.my-content-*`、`.my-bgcolor-*`、`.my-color-*` 等，對應 variables 中的變數。

### 使用方式

- 在 **main.js** 或 **App.vue** 中已引入 `common.css`；HomeView 也再次引入以確保樣式覆蓋順序。  
- 組件內可直接使用 Bootstrap 類與自訂 `.my-*` 類，或寫 `<style scoped>` 使用 `var(--my-*)`。

---

## 開發指南

### 程式碼檢查與格式化

```bash
npm run lint        # 僅檢查
npm run lint:fix    # 檢查並自動修復
npm run prettier    # 格式化
npm run format      # prettier + lint:fix
```

建議提交前執行一次 `npm run format`，以符合專案 ESLint / Prettier 設定。

### 新增頁面（新路由）

1. 在 `src/views/` 新增 Vue 組件（例如 `AboutView.vue`）。  
2. 在 `src/router/index.js` 的 `routes` 中新增一筆：  
   - `path`、`name`、`component`（可 lazy load：`() => import('@/views/AboutView.vue')`）。  
   - 若有需要，在 `meta` 設定 `title`，以便在 `beforeEach` 中設定 `document.title`。

### 新增分頁 Tab

1. 在 `src/tabs/` 新增組件（例如 `ReportTab.vue`）。  
2. 在 **HomeView.vue**：  
   - `import` 新組件。  
   - 在 `components` 中註冊。  
   - 在 `currentTabTitle` 的 `switch` 中加上新 case。  
   - 在 template 的 nav 中加一個按鈕（`@click="switchTab('report')"` 等）。  
   - 在內容區加一個 `v-if="activeTab === 'report'"` 並渲染新組件。

### 使用 Pinia Store

在任一組件或組合式函式中：

```javascript
import { useDataStore } from '@/stores/dataStore';

export default {
  setup() {
    const store = useDataStore();
    // 讀寫 store._placeholder 或未來擴充的 state/actions
    return { store };
  },
};
```

可於 `dataStore.js` 中新增 `ref`/`computed`/ 函式，並在 `return` 中暴露給組件使用。

### 註解與風格

- 重要模組與函式建議加上 JSDoc 或區塊註解（中文亦可）。  
- 組件名建議多字（例如 `HomeView`、`WorkTab`），以利除錯與規範；本專案已關閉 `vue/multi-word-component-names`，可依團隊習慣調整。

---

## 建置與部署

### 建置

```bash
npm run build
```

- 產出在 **dist/**。  
- 生產環境 `publicPath` 為 `/MyQuiz.ai_frontend/`，所有資源路徑會以 `/MyQuiz.ai_frontend/` 為前綴。  
- 若需部署到其他路徑，請修改 `vue.config.js` 的 `publicPath`。

### 本機預覽建置結果

建置完成後可用靜態檔案伺服器預覽，例如：

```bash
npx serve dist -s
```

`-s` 會啟用 SPA fallback（所有路徑回傳 index.html）。注意預覽時網址需與 `publicPath` 一致（例如掛在 `/MyQuiz.ai_frontend/` 下）。

### 部署至 GitHub Pages

1. 倉庫設定中啟用 GitHub Pages，來源選 **gh-pages** 分支（或依你使用的設定）。  
2. 執行：

   ```bash
   npm run deploy
   ```

3. 確認倉庫名與 `publicPath` 一致（例如倉庫 `username/MyQuiz.ai_frontend` → `publicPath: '/MyQuiz.ai_frontend/'`）。  
4. 線上網址一般為：`https://<username>.github.io/MyQuiz.ai_frontend/`。

---

## API 參考

### useDataStore()

- **來源**：`@/stores/dataStore`。  
- **回傳**：Pinia store 實例。  
- **目前對外**：`_placeholder`（ref，可讀寫）。  
- **擴充方式**：在 `dataStore.js` 的 `defineStore` 回傳函式中新增 state / getters / actions，再於組件中呼叫。

### Router

- **createWebHistory(process.env.BASE_URL)**：HTML5 History 模式。  
- **routes**：目前僅 `{ path: '/', name: 'Home', component: HomeView, meta: { title: 'MyQuiz.ai', ... } }`。  
- **beforeEach**：依路由設定 `document.title`（`Main` 且為有效 view 時用 `VIEW_TITLES`；否則若有 `meta.title` 則用之；否則預設 `MyQuiz.ai`）。

---

## 故障排除

### 開發伺服器無法啟動

- 確認 Node 版本 >= 14，建議 16 或 18。  
- 刪除 `node_modules` 與 `package-lock.json` 後重新 `npm install`。  
- 檢查 8080 port 是否被佔用，必要時在 `vue.config.js` 修改 `devServer.port`。

### 建置後頁面空白或資源 404

- 檢查 `vue.config.js` 的 **publicPath** 是否與實際部署路徑一致（例如 GitHub Pages 的 `/MyQuiz.ai_frontend/`）。  
- 若部署在子路徑，需確保 `router` 的 `createWebHistory(base)` 的 base 與 publicPath 一致（Vue CLI 會透過 `process.env.BASE_URL` 處理）。

### ESLint / Prettier 報錯

- 執行 `npm run lint:fix` 與 `npm run prettier`。  
- 若仍不符合預期，檢查 `.eslintrc*` 與 `package.json` 內 `eslintConfig`，以及是否有本機 `.prettierrc` 覆寫設定。

### Pinia 持久化或舊資料

- 若曾使用舊版 store（例如含圖層狀態），瀏覽器可能留有 localStorage。  
- 在開發者工具 → Application → Local Storage 中刪除該網域下與 pinia 相關的 key，或清除網站資料後重新載入。

---

## 貢獻指南

1. Fork 本倉庫。  
2. 建立分支（例如 `feature/xxx` 或 `fix/xxx`）。  
3. 修改後執行 `npm run format` 與 `npm run lint`，通過後再提交。  
4. 提交訊息建議使用語義化前綴：`feat:`、`fix:`、`docs:`、`style:`、`refactor:`、`chore:` 等。  
5. 對本倉庫發起 Pull Request，並簡述變更內容。

---

## 授權與聯絡

- **授權**：MIT License，詳見 [LICENSE](LICENSE)。  
- **作者**：Kevin Cheng  
- **Email**：kevin7261@gmail.com  
- **GitHub**：[@kevin7261](https://github.com/kevin7261)  
- **專案首頁**：[https://kevin7261.github.io/MyQuiz.ai_frontend](https://kevin7261.github.io/MyQuiz.ai_frontend)

---

若本專案對你有幫助，歡迎給一個 Star；若有問題或建議，可透過 GitHub Issues 或上述信箱聯絡。
