/**
 * 後端 API 基底網址，全專案統一由此設定。
 */
export const API_BASE = 'http://127.0.0.1:8000';//'https://aiquiz-backend-z4mo.onrender.com';

/** 修改個資：PATCH /user/profile；以 person_id 識別（Header X-Person-Id），body 可傳 name；回傳更新後使用者資訊（不含 password）；llm_api_key 改由 PUT /system-settings/llm-api-key 設定 */
export const API_UPDATE_PROFILE = '/user/profile';

/** Generate Quiz API：/rag/generate-quiz；body: rag_id, rag_tab_id, quiz_level（number）；不需 llm_api_key；回傳 quiz_content, quiz_hint, reference_answer 等 */
export const API_GENERATE_QUIZ = '/rag/generate-quiz';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
/** 評分 API 表單欄位：測驗題目內容（與後端 quiz_content、Quiz 表一致） */
export const API_REQUEST_QUIZ_CONTENT = 'quiz_content';

/** 評分：POST /rag/quiz-grade；body: rag_id, rag_tab_id, rag_quiz_id, quiz_content, answer（皆 string）；不需 llm_api_key；回傳 202 + job_id，再以 GET /rag/quiz-grade-result/{job_id} 輪詢 */
export const API_GRADE_SUBMISSION = '/rag/quiz-grade';
export const API_GRADE_RESULT = '/rag/quiz-grade-result';

/** 建立 RAG（建立 tab 時按 +）：POST /rag/create-rag，body 必填 rag_tab_id、person_id、rag_name；回傳 rag_id、rag_tab_id、person_id、rag_name、created_at */
export const API_CREATE_RAG = '/rag/create-rag';
/** 上傳 ZIP：POST /rag/upload-zip，需先 create-rag；Form: file、rag_tab_id、person_id（必填）；不需 llm_api_key；回傳 file_metadata */
export const API_UPLOAD_ZIP = '/rag/upload-zip';
/** 建 RAG ZIP：POST /rag/build-rag-zip；body: rag_tab_id, person_id, rag_list, chunk_size, chunk_overlap, system_prompt_instruction；不需 llm_api_key */
export const API_BUILD_RAG_ZIP = '/rag/build-rag-zip';
/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
export const API_RAG_APPLIED = '/rag/applied';
/** 試題頁用 RAG：GET /rag/for-exam 取得試題用 RAG（for_exam=true 且 deleted=false，0 或 1 筆），無 parameters；回傳格式同 /rag/build-rag-zip。PATCH /rag/for-exam/{rag_tab_id} Set Rag For Exam */
export const API_RAG_FOR_EXAM = '/rag/for-exam';

/** 個人答題分析：GET /person-analysis/quizzes-by-person/{person_id}；query 可選 language（en/zh）；LLM 依 person 從 system-settings 取；回傳 { quizzes, count, weakness_report? } */
export const API_QUIZZES_BY_PERSON = '/person-analysis/quizzes-by-person';

/** Exam API：GET /exam/exams List Exams（僅 deleted=false；每筆含 quizzes、answers，格式同 GET /rag/rags；query: person_id 可選） */
export const API_EXAM_TESTS = '/exam/exams';
/** Exam：POST /exam/create-exam Create Exam，body 可選 exam_tab_id、person_id、exam_name；回傳 exam_id、exam_tab_id、person_id、exam_name、created_at */
export const API_CREATE_EXAM = '/exam/create-exam';
/** Exam：POST /exam/delete/{exam_tab_id} Delete Exam */
export const API_EXAM_DELETE = '/exam/delete';
/** Exam：POST /exam/generate-quiz；body: exam_id, exam_tab_id, quiz_level（number）；回傳 quiz_content, quiz_hint, reference_answer, exam_quiz_id 等；後端由系統設定取 llm_api_key */
export const API_TEST_GENERATE_QUIZ = '/exam/generate-quiz';
/** Exam：POST /exam/quiz-grade；body: exam_id, exam_tab_id, exam_quiz_id, quiz_content, answer（皆 string）；後端由系統設定取 llm_api_key */
export const API_TEST_QUIZ_GRADE = '/exam/quiz-grade';
/** Exam：GET /exam/quiz-grade-result/{job_id} Get Exam Grade Result */
export const API_TEST_QUIZ_GRADE_RESULT = '/exam/quiz-grade-result';

/** 系統設定：GET /system-settings/llm-api-key 取用 LLM API Key。資料庫只會有一筆，不需傳 person_id。若尚無資料，回傳 llm_api_key_id 等皆為 null。 */
export const API_GET_LLM_API_KEY = '/system-settings/llm-api-key';
/** 系統設定：PUT /system-settings/llm-api-key 寫入或更新 LLM API Key；body 必填: { llm_api_key }，空字串表示清除；不需傳 person_id。 */
export const API_PUT_LLM_API_KEY = '/system-settings/llm-api-key';
