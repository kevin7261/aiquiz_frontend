/**
 * API 常數模組 - 後端 API 路徑與基底網址
 *
 * 用途：集中管理所有 API 端點，方便切換環境與維護。
 * 請求時請搭配 API_BASE 組成完整 URL（或由 axios 等 baseURL 設定）。
 */

/** 正式環境後端（非本機開啟前端時使用） */
const API_BASE_PRODUCTION = 'https://aiquiz-backend-z4mo.onrender.com';
/** 本機開發後端 */
const API_BASE_LOCAL = 'http://127.0.0.1:8000';

/**
 * 前端是否在本機網址開啟（localhost / 127.0.0.1）。與 API_BASE 一致；供 create-unit body.local、GET /rag/rags?local=。
 * （Node／測試環境無 window 時為 false。）
 */
export function isFrontendLocalHost() {
  if (typeof window === 'undefined' || !window.location?.hostname) return false;
  const h = String(window.location.hostname).toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * 後端 API 基底網址：本機前端網址時連本機後端，否則連 Render 預設後端。
 */
export const API_BASE = isFrontendLocalHost() ? API_BASE_LOCAL : API_BASE_PRODUCTION;

/** 設定（profile）：PATCH /user/profile；以 person_id 識別（body 或 Header X-Person-Id，二擇一）；body 可傳 name、user_type（1=系統開發者 2=課程管理者 3=學生）、llm_api_key（出題單元建立用；空字串表示清除）；回傳更新後使用者資訊（不含 password） */
export const API_UPDATE_PROFILE = '/user/profile';

/** RAG 出題：POST /rag/create-quiz；body: rag_id（必填）、rag_tab_id（選填，可 ""）、quiz_level（「基礎」或「進階」字串）、unit_name（選填，可 ""；與 build-rag-zip outputs[].unit_name 一致，空則後端用第一筆）；LLM Key 依 Rag.person_id 自 User；回傳 quiz_content、quiz_hint、quiz_answer_reference、rag_quiz_id 等 */
export const API_GENERATE_QUIZ = '/rag/create-quiz';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
/** 評分 API 表單欄位：測驗題目內容（與後端 quiz_content、Quiz 表一致） */
export const API_REQUEST_QUIZ_CONTENT = 'quiz_content';

/** RAG 評分：POST /rag/quiz-grade（Grade Submission）；body: rag_id, rag_tab_id, rag_quiz_id, quiz_content, quiz_answer, quiz_answer_reference（選填可 ""）；回傳 202 + job_id；GET /rag/quiz-grade-result/{job_id}（Get Grade Result）輪詢；ready 時 result: { quiz_score, quiz_comments, rag_answer_id } */
export const API_RAG_QUIZ_GRADE = '/rag/quiz-grade';
export const API_RAG_QUIZ_GRADE_RESULT = '/rag/quiz-grade-result';

/** Create Unit：POST /rag/create-unit；僅建立一筆 Rag；body 必填 rag_tab_id、person_id、rag_name，選填 local（預設 false；本機前端可傳 true）；system_prompt_instruction 請於 POST /rag/build-rag-zip 傳入；回傳 rag_id、rag_tab_id、person_id、rag_name、local、created_at */
export const API_CREATE_UNIT = '/rag/create-unit';
/** 列出 RAG：GET /rag/rags；query 可選 local（須與 Rag.local 相符；未傳時後端依連線判定）；僅 deleted=false；每筆含表欄位（含 for_exam）、quizzes（每題含 answers）、頂層 answers */
export const API_RAG_LIST = '/rag/rags';
/** 上傳教材檔：POST /rag/upload-zip，需先 create-unit；Form: file、rag_tab_id、person_id（必填）；file 可為 .zip、.pdf、.doc、.docx、.ppt、.pptx 等後端可解析格式；不需 llm_api_key；回傳 file_metadata */
export const API_UPLOAD_ZIP = '/rag/upload-zip';
/** 刪除 RAG：POST /rag/delete/{rag_tab_id}；Header X-Person-Id */
export const API_RAG_DELETE = '/rag/delete';
/** 建 RAG ZIP：POST /rag/build-rag-zip；body: rag_tab_id, person_id, rag_list, chunk_size, chunk_overlap, system_prompt_instruction；不需 llm_api_key */
export const API_BUILD_RAG_ZIP = '/rag/build-rag-zip';
/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
export const API_RAG_APPLIED = '/rag/applied';
/** 試題頁用 RAG：GET /rag/for-exam 取得試題用 RAG（for_exam=true 且 deleted=false，0 或 1 筆），無 parameters；回傳格式同 /rag/build-rag-zip。設為試題用改由 PUT system-settings（見下方 rag-for-exam-*） */
export const API_RAG_FOR_EXAM = '/rag/for-exam';
/** 設為試題用 RAG（本機前端）：PUT body { rag_id }；System_Setting key=rag_localhost */
export const API_PUT_RAG_FOR_EXAM_LOCALHOST = '/system-settings/rag-for-exam-localhost';
/** 設為試題用 RAG（非本機前端）：PUT body { rag_id }；System_Setting key=rag_deploy */
export const API_PUT_RAG_FOR_EXAM_DEPLOY = '/system-settings/rag-for-exam-deploy';

/** 個人答題分析：GET /person-analysis/quizzes/{person_id}；query 可選 language（en/zh）；回傳 { exams: [{ exam_id, exam_tab_id, person_id, exam_name, deleted, quizzes, answers }], count, weakness_report? } */
export const API_QUIZZES_BY_PERSON = '/person-analysis/quizzes';
/** 學生測驗分析：GET /course-analysis/quizzes；回傳格式同 List Quizzes By Person（exams、count、weakness_report 固定 null） */
export const API_COURSE_ANALYSIS_QUIZZES = '/course-analysis/quizzes';

/** Exam API：GET /exam/exams List Exams（deleted=false；Exam.local 須與 query local 相符；未傳 local 時後端依連線判定；query: person_id 可選、local 建議與 create-unit 一致） */
export const API_EXAM_TESTS = '/exam/exams';
/** Exam：POST /exam/create-exam；body 可選 exam_tab_id、person_id、exam_name、local（預設 false；本機前端應傳 true 與 create-unit 一致）；回傳含 local、created_at 等 */
export const API_CREATE_EXAM = '/exam/create-exam';
/** Exam：POST /exam/delete/{exam_tab_id} Delete Exam */
export const API_EXAM_DELETE = '/exam/delete';
/** Exam：POST /exam/create-quiz（Exam Create Quiz）；body 對齊 RAG 的 POST /rag/create-quiz：exam_id 或 exam_tab_id（二擇一；可 ""／0 搭配另一欄）、quiz_level（「基礎」或「進階」）、unit_name（選填可 ""）；LLM Key 由系統設定；試題 RAG 依連線讀 rag_localhost／rag_deploy。回傳對應 Exam_Quiz 等欄位 */
export const API_EXAM_CREATE_QUIZ = '/exam/create-quiz';
/** @deprecated 使用 API_EXAM_CREATE_QUIZ */
export const API_EXAM_GENERATE_QUIZ = API_EXAM_CREATE_QUIZ;
/** @deprecated 使用 API_EXAM_CREATE_QUIZ */
export const API_TEST_GENERATE_QUIZ = API_EXAM_CREATE_QUIZ;
/** Exam：POST /exam/quiz-grade；body: exam_id, exam_tab_id, exam_quiz_id, quiz_content, quiz_answer, quiz_answer_reference（選填可 ""）；後端由系統設定取 llm_api_key；回傳 202 + job_id；GET /exam/quiz-grade-result/{job_id} 輪詢；ready 時 result 含 quiz_score、quiz_comments（與 RAG 輪詢 result 對齊） */
export const API_EXAM_QUIZ_GRADE = '/exam/quiz-grade';
/** Exam：GET /exam/quiz-grade-result/{job_id}（Get Grade Result）；ready 時 result 含 quiz_score、quiz_comments 等，對齊 RAG */
export const API_EXAM_QUIZ_GRADE_RESULT = '/exam/quiz-grade-result';

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
