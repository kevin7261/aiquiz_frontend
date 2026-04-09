/**
 * API 常數模組 - 後端 API 路徑與基底網址
 *
 * 對應後端專案儲存庫名稱：**MyQuiz.ai_backend**（與本前端 MyQuiz.ai_frontend 配對）。
 * 用途：集中管理所有 API 端點，方便切換環境與維護。
 * 請求時請搭配 API_BASE 組成完整 URL（或由 axios 等 baseURL 設定）。
 */

/** 正式環境後端（MyQuiz.ai_backend 於 Render 之預設網址；非本機開啟前端時使用） */
const API_BASE_PRODUCTION = 'https://myquiz-ai-backend.onrender.com';
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
 * - npm run serve 且網址為 localhost／127.0.0.1：使用目前頁面 origin，請求經 vue.config.js proxy 預設轉發本機 8000。
 * - 生產建置在本機開啟：連 127.0.0.1:8000。
 * - 其餘（含區網 IP 開發站）：連 MyQuiz.ai_backend 之 Render 預設網址。
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
    if (isValidHttpOrigin(trimmed)) return trimmed;
  }
  if (typeof window === 'undefined') return API_BASE_PRODUCTION;
  if (isFrontendLocalHost()) {
    if (process.env.NODE_ENV === 'development') {
      const o = window.location.origin;
      // file:// 等情境下 origin 可能為字串 "null"，無法作為 fetch 基底
      if (isValidHttpOrigin(o)) return String(o).replace(/\/$/, '');
      return API_BASE_LOCAL;
    }
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
 * 軟刪除使用者：POST /user/users/delete；body { person_id } 為欲刪除者；
 * query person_id 為呼叫者（必填），由 loggedFetch 自動帶入，勿覆寫為被刪者。
 */
export const API_USER_DELETE = '/user/users/delete';

/** RAG 出題：POST /rag/tab/quiz/create；body: rag_id（必填）、rag_tab_id（選填，可 ""）、quiz_level（「基礎」或「進階」字串）、unit_name（選填，可 ""；與 POST /rag/tab/build-rag-zip 回傳 outputs[].unit_name 一致，空則後端用第一筆）；LLM Key 依 Rag.person_id 自 User；回傳 quiz_content、quiz_hint、quiz_answer_reference、rag_quiz_id 等 */
export const API_GENERATE_QUIZ = '/rag/tab/quiz/create';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
/** 評分 API 表單欄位：測驗題目內容（與後端 quiz_content、Quiz 表一致） */
export const API_REQUEST_QUIZ_CONTENT = 'quiz_content';

/** RAG 評分：POST /rag/tab/quiz/grade（Grade Submission）；body: rag_id, rag_tab_id, rag_quiz_id, quiz_content, quiz_answer, quiz_answer_reference（選填可 ""）；回傳 202 + job_id；GET /rag/tab/quiz/grade-result/{job_id}（Get Grade Result）輪詢；ready 時 result: { quiz_score, quiz_comments, rag_answer_id } */
export const API_RAG_QUIZ_GRADE = '/rag/tab/quiz/grade';
export const API_RAG_QUIZ_GRADE_RESULT = '/rag/tab/quiz/grade-result';

/** Create Tab（RAG）：POST /rag/tab/create；僅建立一筆 Rag；body 必填 rag_tab_id、person_id、tab_name，選填 local（預設 false；本機前端可傳 true）；system_prompt_instruction 請於 POST /rag/tab/build-rag-zip 傳入；回傳建立欄位（尚無檔案時不含 file_size） */
export const API_CREATE_UNIT = '/rag/tab/create';
/** 列出 RAG：GET /rag/tabs；query 可選 local（須與 Rag.local 相符；未傳時後端依連線判定）；僅 deleted=false；每筆含表欄位（含 for_exam、file_size〔MB〕、file_metadata、rag_metadata）、quizzes（每題含 answers）、頂層 answers */
export const API_RAG_LIST = '/rag/tabs';
/** 上傳教材檔：POST /rag/tab/upload-zip，需先 POST /rag/tab/create；Form: file、rag_tab_id、person_id（必填）；file 可為 .pdf、.doc、.docx、.ppt、.pptx 等後端可解析格式；不需 llm_api_key；回傳 file_metadata（內含 file_size〔MB〕等）並寫入 DB */
export const API_UPLOAD_ZIP = '/rag/tab/upload-zip';
/** 刪除 RAG：POST /rag/tab/delete/{rag_tab_id}；不需 X-Person-Id */
export const API_RAG_DELETE = '/rag/tab/delete';
/** 更新 RAG 分頁顯示名稱：PUT /rag/tab/tab-name；body JSON：rag_id、tab_name；以 rag_id 比對，僅更新 deleted=false；回傳 rag_id、rag_tab_id、person_id、tab_name、updated_at */
export const API_RAG_UNIT_NAME = '/rag/tab/tab-name';
/** 建 RAG ZIP：POST /rag/tab/build-rag-zip；依已上傳 ZIP（rag_tab_id，路徑 {person_id}/{rag_tab_id}/upload 與 tab/upload-zip 一致）與 unit_list 抽出資料夾重壓並存後端；body 必填 rag_tab_id、person_id、unit_list（逗號分隔多個輸出檔，加號為同檔內多資料夾）、system_prompt_instruction、chunk_size、chunk_overlap；LLM Key 依 person_id 自 User；回傳 JSON 含 outputs[]（每項可含 file_size〔MB〕）；寫入 Rag.rag_metadata 並更新 chunk_size、chunk_overlap；不需 llm_api_key */
export const API_BUILD_RAG_ZIP = '/rag/tab/build-rag-zip';
/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
export const API_RAG_APPLIED = '/rag/applied';
/** 試題頁用 RAG：GET /rag/tab/for-exam 取得試題用 RAG（for_exam=true 且 deleted=false，0 或 1 筆），無 parameters；回傳含 Rag 表之 file_size〔MB〕、file_metadata，outputs／rag_metadata.outputs 每項可含 file_size〔MB〕。設為試題用改由 PUT system-settings（見下方 rag-for-exam-*） */
export const API_RAG_FOR_EXAM = '/rag/tab/for-exam';
/** 設為試題用 RAG（本機前端）：PUT body { rag_id }；System_Setting key=rag_localhost */
export const API_PUT_RAG_FOR_EXAM_LOCALHOST = '/system-settings/rag-for-exam-localhost';
/** 設為試題用 RAG（非本機前端）：PUT body { rag_id }；System_Setting key=rag_deploy */
export const API_PUT_RAG_FOR_EXAM_DEPLOY = '/system-settings/rag-for-exam-deploy';

/** 個人答題分析：GET /person-analysis/quizzes/{person_id}；僅含 Exam_Answer 有對應之題；列表格式與 GET /exam/tabs、GET /rag/tabs 每筆一致（quizzes／exam_quizzes、頂層 answers／exam_answers、每題可含 answers）；另帶 count、weakness_report（有 LLM Key 時） */
export const API_QUIZZES_BY_PERSON = '/person-analysis/quizzes';
/** 學生作答分析：GET /course-analysis/quizzes；全部 Exam_Quiz，格式同上；weakness_report 固定 null */
export const API_COURSE_ANALYSIS_QUIZZES = '/course-analysis/quizzes';

/** Exam API：GET /exam/tabs List Exams（deleted=false；Exam.local 須與 query local 相符；未傳 local 時後端依連線判定；query: person_id 可選、local 建議與 POST /rag/tab/create 一致） */
export const API_EXAM_TESTS = '/exam/tabs';
/** Exam：POST /exam/tab/create；body 可選 exam_tab_id（未傳則後端產生）、person_id、tab_name、local（預設 false；本機前端應傳 true 與 RAG tab/create 一致）；回傳 exam_id、exam_tab_id、person_id、tab_name、local、created_at */
export const API_CREATE_EXAM = '/exam/tab/create';
/** 更新測驗分頁顯示名稱：PUT /exam/tab/tab-name；body JSON：exam_id、tab_name；以 exam_id 比對，僅更新 deleted=false；回傳 exam_id、exam_tab_id、person_id、tab_name、updated_at */
export const API_EXAM_UNIT_NAME = '/exam/tab/tab-name';
/** Exam：POST /exam/tab/delete/{exam_tab_id} Delete Exam；不需 X-Person-Id */
export const API_EXAM_DELETE = '/exam/tab/delete';
/** Exam：POST /exam/tab/quiz/create（Exam Create Quiz）；body 對齊 RAG 的 POST /rag/tab/quiz/create：exam_id 或 exam_tab_id（二擇一；可 ""／0 搭配另一欄）、quiz_level（「基礎」或「進階」）、unit_name（選填可 ""）；LLM Key 由系統設定；試題 RAG 依連線讀 rag_localhost／rag_deploy。回傳對應 Exam_Quiz 等欄位 */
export const API_EXAM_CREATE_QUIZ = '/exam/tab/quiz/create';
/** @deprecated 使用 API_EXAM_CREATE_QUIZ */
export const API_EXAM_GENERATE_QUIZ = API_EXAM_CREATE_QUIZ;
/** @deprecated 使用 API_EXAM_CREATE_QUIZ */
export const API_TEST_GENERATE_QUIZ = API_EXAM_CREATE_QUIZ;
/** Exam：POST /exam/tab/quiz/grade；body: exam_id, exam_tab_id, exam_quiz_id, quiz_content, quiz_answer, quiz_answer_reference（選填可 ""）；後端由系統設定取 llm_api_key；回傳 202 + job_id；GET /exam/tab/quiz/grade-result/{job_id} 輪詢；ready 時 result 含 quiz_score、quiz_comments（與 RAG 輪詢 result 對齊） */
export const API_EXAM_QUIZ_GRADE = '/exam/tab/quiz/grade';
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
 * - PUT  /system-settings/rag-for-exam-localhost  Put Rag For Exam Localhost（body: rag_id）
 * - PUT  /system-settings/rag-for-exam-deploy  Put Rag For Exam Deploy（body: rag_id）
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
