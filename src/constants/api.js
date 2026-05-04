/**
 * API 常數模組 - 後端 API 路徑與基底網址
 *
 * 對應後端專案儲存庫名稱：**MyQuiz.ai_backend**（與本前端 MyQuiz.ai_frontend 配對）。
 * 用途：集中管理所有 API 端點，方便切換環境與維護。
 * 請求時請搭配 API_BASE 組成完整 URL（或由 axios 等 baseURL 設定）。
 */

/** 正式環境後端（MyQuiz.ai_backend 於 Render；非本機開啟前端時使用） */
const API_BASE_PRODUCTION = 'https://myquiz-ai.onrender.com';
/** 本機直連後端（生產建置在本機開啟、或未走 vue 代理時） */
const API_BASE_LOCAL = 'http://127.0.0.1:8000';

/**
 * 前端是否在本機網址開啟（localhost / 127.0.0.1）。與 API_BASE 一致；供 POST /rag/tab/create body.local、GET /rag/tabs?local=。
 * （Node／測試環境無 window 時為 false。）
 */
export function isFrontendLocalHost() {
  if (typeof window === 'undefined' || !window.location?.hostname) return false;
  const h = String(window.location.hostname).toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * 後端 API 基底網址：
 * - 可設 .env 的 VUE_APP_API_BASE 強制覆寫（勿結尾 /）。
 * - npm run serve（development）預設：{@link API_BASE_LOCAL} 直連本機 API（作法 A，與 Postman/curl 相同網域）；瀏覽器為跨埠時後端 CORS 須允許前端 origin（如 http://localhost:8081）。
 * - 若要改經 dev server 之 webpack proxy，可設 VUE_APP_API_BASE 與目前頁面 origin 相同（例 http://localhost:8081），則以該 origin 為 API_BASE。
 * - 生產建置在本機開啟：連 127.0.0.1:8000。
 * - 其餘：連 MyQuiz.ai_backend 之 Render 預設網址。
 */
function isValidHttpOrigin(value) {
  if (value == null || String(value).trim() === '' || String(value) === 'null') return false;
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveApiBase() {
  const fromEnv = typeof process !== 'undefined' && process.env && process.env.VUE_APP_API_BASE;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    const trimmed = String(fromEnv).replace(/\/$/, '');
    if (isValidHttpOrigin(trimmed)) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        try {
          if (new URL(trimmed).origin === window.location.origin) {
            /* eslint-disable no-console -- 明確改走 dev proxy 時之提示 */
            if (typeof console !== 'undefined') {
              console.warn(
                '[api] VUE_APP_API_BASE 與目前開發頁面同源，將以該 origin 走 webpack proxy；預設直連 API 請刪除 VUE_APP_API_BASE 或改設 http://127.0.0.1:8000'
              );
            }
            /* eslint-enable no-console */
            if (isValidHttpOrigin(window.location.origin)) {
              return String(window.location.origin).replace(/\/$/, '');
            }
          }
        } catch {
          /* ignore */
        }
      }
      return trimmed;
    }
  }
  if (typeof window === 'undefined') return API_BASE_PRODUCTION;
  if (process.env.NODE_ENV === 'development') {
    return API_BASE_LOCAL;
  }
  if (isFrontendLocalHost()) {
    return API_BASE_LOCAL;
  }
  return API_BASE_PRODUCTION;
}

export const API_BASE = resolveApiBase();

/** 設定（profile）：PATCH /user/profile；以 person_id 識別（body 或 Header X-Person-Id，二擇一）；body 可傳 name、user_type（1=開發者 2=管理者 3=學生）、llm_api_key（建立測驗題庫用；空字串表示清除）；回傳更新後使用者資訊（不含 password） */
export const API_UPDATE_PROFILE = '/user/profile';

/**
 * 使用者列表與新增（Upload User）：GET /user/users；POST /user/users
 * POST body：person_id、name、user_type；query person_id 須與 body.person_id 一致（loggedFetch 第三參數 personId）
 */
export const API_USER_USERS = '/user/users';

/**
 * 批次新增學生：POST /user/users/batch；body 為陣列 [{ person_id, name }]；後端 user_type 固定 3（學生）。
 * query person_id 為呼叫者（必填）；由 loggedFetch 自動帶入目前登入者，勿覆寫為新使用者 ID。
 */
export const API_USER_BATCH = '/user/users/batch';

/**
 * 軟刪除使用者：PUT /user/users/delete；body { person_id } 為欲刪除者；
 * query person_id 為呼叫者（必填），由 loggedFetch 自動帶入，勿覆寫為被刪者。
 */
export const API_USER_DELETE = '/user/users/delete';

/** RAG 出題：POST /rag/tab/quiz/create；body: rag_id（必填）、rag_tab_id（選填，可 ""）、quiz_level（「基礎」或「進階」字串）、unit_name（選填，可 ""；與 POST /rag/tab/build-rag-zip 回傳 outputs[].unit_name 一致，空則後端用第一筆）；LLM Key 依 Rag.person_id 自 User；回傳 quiz_content、quiz_hint、quiz_answer_reference、rag_quiz_id 等 */
export const API_GENERATE_QUIZ = '/rag/tab/quiz/create';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
/** 評分 API 表單欄位：測驗題目內容（與後端 quiz_content、Quiz 表一致） */
export const API_REQUEST_QUIZ_CONTENT = 'quiz_content';

/** RAG 單元題評分：POST /rag/tab/unit/quiz/llm-grade（Rag Grade Quiz，非同步）；body 以 rag_id、rag_quiz_id、quiz_answer 為核心；quiz_content 可省略（後端自 Rag_Quiz 讀）；選填 rag_tab_id、answer_user_prompt_text；unit_type 2／3／4 時以 transcription 純 LLM 批改，其餘依 rag_id 載入 RAG ZIP；回傳 202 + job_id；GET /rag/tab/unit/quiz/grade-result/{job_id} 輪詢；ready 時 result: quiz_score、quiz_comments、rag_quiz_id、rag_answer_id 等 */
export const API_RAG_QUIZ_GRADE = '/rag/tab/unit/quiz/llm-grade';
export const API_RAG_QUIZ_GRADE_RESULT = '/rag/tab/unit/quiz/grade-result';

/** Create Tab（RAG）：POST /rag/tab/create；僅建立一筆 Rag；body 必填 rag_tab_id、person_id、tab_name，選填 local（預設 false；本機前端可傳 true）；回傳建立欄位（尚無檔案時不含 file_size） */
export const API_CREATE_UNIT = '/rag/tab/create';
/** 列出 RAG：GET /rag/tabs；回傳 { rags, count }；query 可選 local（須與 Rag.local 相符；未傳時後端依連線判定）；僅 deleted=false；每筆含表欄位（含 for_exam、file_size〔MB〕、file_metadata）、units[]（每單元含 transcription、quizzes、for_exam 等）、相容頂層 quizzes／answers */
export const API_RAG_LIST = '/rag/tabs';
/** 上傳教材檔：POST /rag/tab/upload-zip，需先 POST /rag/tab/create；Form: file、rag_tab_id、person_id（必填）；file 可為 .pdf、.doc、.docx、.ppt、.pptx 等後端可解析格式；不需 llm_api_key；回傳 file_metadata（內含 file_size〔MB〕等）並寫入 DB */
export const API_UPLOAD_ZIP = '/rag/tab/upload-zip';
/** 刪除 RAG：PUT /rag/tab/delete/{rag_tab_id}；不需 X-Person-Id */
export const API_RAG_DELETE = '/rag/tab/delete';
/** 軟刪除 Rag_Quiz：PUT /rag/tab/quiz/delete/{rag_quiz_id} */
export const API_RAG_TAB_QUIZ_DELETE = '/rag/tab/quiz/delete';
/** 更新 RAG 分頁顯示名稱：PUT /rag/tab/tab-name；body JSON：rag_id、tab_name；以 rag_id 比對，僅更新 deleted=false；回傳 rag_id、rag_tab_id、person_id、tab_name、updated_at */
export const API_RAG_UNIT_NAME = '/rag/tab/tab-name';
/** 建 RAG ZIP：POST /rag/tab/build-rag-zip；body 依 OpenAPI PackRequest：rag_tab_id、person_id、unit_list、chunk_size、chunk_overlap、chunk_sizes、chunk_overlaps、unit_types、build_faiss、transcriptions；後端若支援可加 unit_names（與群組同序逗號字串）；query：person_id（必填）、repack_only（選填，true 時強制不建 FAISS）；成功時 application/x-ndjson（fetch 讀 response.body，勿 response.json）；整批成敗以最後 complete.success；POST /rag/tab/build-rag-zip-stream 行為相同（OpenAPI 隱藏） */
export const API_BUILD_RAG_ZIP = '/rag/tab/build-rag-zip';
/** RAG 文字單元（unit_type 2）：GET /rag/transcript/text；query：`rag_tab_id`、`folder_name`、`person_id`。讀 ZIP 內該資料夾**一個** .md／.txt／.doc／.docx */
export const API_RAG_TRANSCRIPT_TEXT = '/rag/transcript/text';
/** RAG 音訊單元逐字稿：GET /rag/transcript/audio；query：`rag_tab_id`、`folder_name`、`person_id`（ZIP 內該資料夾之音訊轉寫） */
export const API_RAG_TRANSCRIPT_AUDIO = '/rag/transcript/audio';
/** RAG YouTube 單元逐字稿：GET /rag/transcript/youtube；query：同上；選填 `youtube_url`（與播放器解析網址一致時可帶） */
export const API_RAG_TRANSCRIPT_YOUTUBE = '/rag/transcript/youtube';
/** RAG 音訊單元原始音檔：GET /rag/unit/audio-file；query：rag_tab_id、folder_name（不需 person_id） */
export const API_RAG_UNIT_AUDIO_FILE = '/rag/unit/audio-file';
/** RAG YouTube 單元 URL：GET /rag/unit/youtube-url；query：rag_tab_id、folder_name（不需 person_id） */
export const API_RAG_UNIT_YOUTUBE_URL = '/rag/unit/youtube-url';
/** 列出指定 tab 下所有未刪除 Rag_Unit（含關聯 quizzes）：GET /rag/tab/units；query: rag_tab_id、person_id（必填）；依 created_at 舊→新 */
export const API_RAG_TAB_UNITS = '/rag/tab/units';
/** 音訊單元原始 MP3：GET /rag/tab/unit/mp3-file；query：rag_tab_id、rag_unit_id（不需 person_id）；僅 Rag_Unit.unit_type=3 時回傳音訊本體 */
export const API_RAG_TAB_UNIT_MP3_FILE = '/rag/tab/unit/mp3-file';
/**
 * 依 rag_tab_id／rag_unit_id 建立空白 Rag_Quiz（不呼叫 LLM）；rag_quiz_id 由後端於回應中帶出。
 * POST /rag/tab/unit/quiz/create；query person_id；body: { rag_tab_id, rag_unit_id }
 */
export const API_RAG_TAB_UNIT_QUIZ_CREATE = '/rag/tab/unit/quiz/create';
/** POST /rag/tab/unit/quiz/llm-generate — body：`rag_quiz_id`、`quiz_name`、`quiz_user_prompt_text`（後兩者可 ""）；query：`person_id`（必填）。`rag_tab_id`／`rag_unit_id` 不需傳，後端依 rag_quiz_id 解析 */
export const API_RAG_TAB_UNIT_QUIZ_LLM_GENERATE = '/rag/tab/unit/quiz/llm-generate';
/** 更新 Rag_Quiz 題名：PUT /rag/tab/unit/quiz/quiz-name；body 以 rag_quiz_id 比對（僅 deleted=false）；回傳 rag_quiz_id、rag_tab_id、rag_unit_id、person_id、quiz_name、updated_at 等 */
export const API_RAG_TAB_UNIT_QUIZ_QUIZ_NAME = '/rag/tab/unit/quiz/quiz-name';
/** Rag_Quiz.for_exam：POST /rag/tab/unit/quiz/for-exam — query person_id；body 僅 `rag_quiz_id`、`for_exam`（true＝測驗用、false＝取消） */
export const API_RAG_TAB_UNIT_QUIZ_FOR_EXAM = '/rag/tab/unit/quiz/for-exam';
/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
export const API_RAG_APPLIED = '/rag/applied';
/** 試題用 RAG（單筆）：GET /rag/tab/for-exam（for_exam=true 且 deleted=false，0 或 1 筆），無 parameters。測驗頁請用 GET /exam/rag-for-exams（{@link API_RAG_FOR_EXAMS}）。 */
export const API_RAG_FOR_EXAM = '/rag/tab/for-exam';
/**
 * List RAG units & quizzes marked for exam：GET /exam/rag-for-exams
 * Query `person_id` 必填（全站慣例）；建議併帶 `local`（與 GET /exam/tabs、GET /rag/tabs 一致，本機 true／false）。
 * 僅含後端認定之「測驗用」單元／題目（例如 for_exam 篩選）；若教材尚未標為測驗用，回傳 `units: []` 屬正常，與「完整單元列表」API 不同。
 * Rag_Quiz 出題／批改規則欄位若為預覽截短，前端勿當完整字串逕送 LLM。
 */
export const API_RAG_FOR_EXAMS = '/exam/rag-for-exams';

/** 個人答題分析：GET /person-analysis/quizzes/{person_id}；僅含作答有對應之題；列表格式與 GET /exam/tabs、GET /rag/tabs 每筆一致（含 units→quizzes 或扁平 quizzes；頂層 answers／內嵌 answer_*）；另帶 count、weakness_report（有 LLM Key 時） */
export const API_QUIZZES_BY_PERSON = '/person-analysis/quizzes';
/** 學生作答分析：GET /course-analysis/quizzes；全部 Exam_Quiz，格式同上；weakness_report 固定 null */
export const API_COURSE_ANALYSIS_QUIZZES = '/course-analysis/quizzes';

/** Exam API：GET /exam/tabs List Exams（deleted=false；person_id／local 篩選；未傳 local 時後端依連線判定）。每筆含 units[]（Exam_Unit），每單元 quizzes[]（Exam_Quiz），題列可內嵌 answer_content／quiz_score／answer_critique */
export const API_EXAM_TESTS = '/exam/tabs';
/** Exam：POST /exam/tab/create；query person_id 必填；body 可選 exam_tab_id（未傳則後端產生）、person_id、tab_name、local（預設 false；本機前端應傳 true 與 RAG tab/create 一致）；回傳 exam_id、exam_tab_id、person_id、tab_name、local、created_at */
export const API_CREATE_EXAM = '/exam/tab/create';
/** 更新測驗分頁顯示名稱：PUT /exam/tab/tab-name；body JSON：exam_id、tab_name；以 exam_id 比對，僅更新 deleted=false；回傳 exam_id、exam_tab_id、person_id、tab_name、updated_at */
export const API_EXAM_UNIT_NAME = '/exam/tab/tab-name';
/** Exam：PUT /exam/tab/delete/{exam_tab_id} Delete Exam；不需 X-Person-Id */
export const API_EXAM_DELETE = '/exam/tab/delete';
/**
 * POST /exam/tab/quiz/create（OpenAPI：**Exam Create Quiz (no LLM)**）
 * Query：`person_id`（必填）。Body：僅 `exam_tab_id`。
 * LLM 出題請用 {@link API_EXAM_TAB_QUIZ_LLM_GENERATE}
 */
export const API_EXAM_CREATE_QUIZ = '/exam/tab/quiz/create';
/** @deprecated 使用 API_EXAM_CREATE_QUIZ */
export const API_EXAM_GENERATE_QUIZ = API_EXAM_CREATE_QUIZ;
/** @deprecated 使用 API_EXAM_CREATE_QUIZ */
export const API_TEST_GENERATE_QUIZ = API_EXAM_CREATE_QUIZ;
/**
 * POST /exam/tab/quiz/llm-generate — Rag LLM Generate Quiz；query：`person_id`（必填）。
 * Body：**僅** `exam_quiz_id`、`rag_tab_id`、`rag_unit_id`、`rag_quiz_id`（皆必填）；三 RAG 鍵須對應同一 Tab；列已有有效兩鍵時請求須一致否則 400，列未寫入時以此請求綁定寫回。勿傳出題／批改提示文字（後端自 Rag_Quiz 讀並寫回 Exam_Quiz）。`unit_type` 1=RAG／向量；2–4=transcription 純 LLM。成功後更新該列並清空作答欄位。
 */
export const API_EXAM_TAB_QUIZ_LLM_GENERATE = '/exam/tab/quiz/llm-generate';
/** Exam：POST /exam/tab/quiz/llm-grade（Exam Grade Quiz，202 + job_id）；body：`exam_quiz_id`、`quiz_content`（可 ""）、`quiz_answer`；query `person_id` 必填；`unit_type` 2／3／4 改 transcription 純 LLM 批改；完成後更新 answer_content／answer_critique；GET /exam/tab/quiz/grade-result/{job_id} 輪詢 */
export const API_EXAM_QUIZ_GRADE = '/exam/tab/quiz/llm-grade';
/** @deprecated 舊路徑 POST /exam/tab/quiz/grade；批改請使用 {@link API_EXAM_QUIZ_GRADE}（llm-grade） */
export const API_EXAM_QUIZ_GRADE_LEGACY = '/exam/tab/quiz/grade';
/** Exam：GET /exam/tab/quiz/grade-result/{job_id}（Get Grade Result）；ready 時 result 含 quiz_score、quiz_comments 等，對齊 RAG */
export const API_EXAM_QUIZ_GRADE_RESULT = '/exam/tab/quiz/grade-result';
/** Exam：POST /exam/tab/quiz/rate；body: exam_quiz_id、quiz_rate（僅 -1、0、1）；更新 Exam_Quiz.quiz_rate；成功回傳 exam_quiz_id、quiz_rate、updated_at 與訊息 */
export const API_EXAM_RATE_QUIZ = '/exam/tab/quiz/rate';

/**
 * 系統設定 system-settings
 * - GET  /system-settings/course-name   Get Course Name Setting
 * - PUT  /system-settings/course-name   Put Course Name Setting
 * - GET  /system-settings/llm-api-key  Get Llm Api Key
 * - PUT  /system-settings/llm-api-key  Put Llm Api Key
 */
/** GET：取得課程名稱；回傳含 course_name。 */
export const API_GET_SYSTEM_SETTING_COURSE_NAME = '/system-settings/course-name';
/** PUT：寫入課程名稱；body 僅傳 { course_name }。表 key=course_name；若尚無該 key 則新增且 value 為空，已有則不覆蓋 value。 */
export const API_PUT_SYSTEM_SETTING_COURSE_NAME = '/system-settings/course-name';
/** GET：取得 LLM API Key。若尚無資料，回傳 llm_api_key_id 等皆為 null。 */
export const API_GET_LLM_API_KEY = '/system-settings/llm-api-key';
/** PUT：寫入或更新系統預設 LLM API Key（表 key=llm_api_key）；body 僅傳 { llm_api_key }，空字串表示清除。 */
export const API_PUT_SYSTEM_SETTING_LLM_API_KEY = '/system-settings/llm-api-key';

/** GET：系統 Log 列表。 */
export const API_LIST_LOGS = '/log/logs';
