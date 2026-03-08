/**
 * 後端 API 基底網址，全專案統一由此設定。
 */
export const API_BASE = 'http://127.0.0.1:8000';//'https://aiquiz-backend-z4mo.onrender.com';

/** 修改個資：PATCH /user/profile；以 person_id 識別（Header X-Person-Id），body 可傳 name、llm_api_key（擇一或兩者）；回傳更新後使用者資訊（不含 password） */
export const API_UPDATE_PROFILE = '/user/profile';

/** Generate Quiz API：/rag/generate-quiz；body: llm_api_key, rag_id, rag_tab_id, quiz_level（number）；回傳 quiz_content, quiz_hint, reference_answer 等 */
export const API_GENERATE_QUIZ = '/rag/generate-quiz';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
/** 評分 API 表單欄位：測驗題目內容（與後端 quiz_content、Quiz 表一致） */
export const API_REQUEST_QUIZ_CONTENT = 'quiz_content';

/** 評分：POST /rag/quiz-grade；body: llm_api_key, rag_id, rag_tab_id, rag_quiz_id, quiz_content, answer（皆 string）；回傳 202 + job_id，再以 GET /rag/quiz-grade-result/{job_id} 輪詢 */
export const API_GRADE_SUBMISSION = '/rag/quiz-grade';
export const API_GRADE_RESULT = '/rag/quiz-grade-result';

/** 建立 RAG（建立 tab 時按 +）：POST /rag/create-rag，body 必填 rag_tab_id、person_id、rag_name；回傳 rag_id、rag_tab_id、person_id、rag_name、created_at */
export const API_CREATE_RAG = '/rag/create-rag';
/** 上傳 ZIP：POST /rag/upload-zip，需先 create-rag；Form: file、rag_tab_id、person_id（必填），可選 llm_api_key；回傳 file_metadata */
export const API_UPLOAD_ZIP = '/rag/upload-zip';
/** 建 RAG ZIP：POST /rag/build-rag-zip；body: rag_tab_id, person_id, rag_list, llm_api_key, chunk_size, chunk_overlap, system_prompt_instruction */
export const API_BUILD_RAG_ZIP = '/rag/build-rag-zip';
/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
export const API_RAG_APPLIED = '/rag/applied';
/** 試題頁用 RAG：GET /rag/for-exam 取得 for_exam=true 且 deleted=false（0 或 1 筆），回傳格式同 /rag/build-rag-zip；PATCH /rag/for-exam/{rag_tab_id} Set Rag For Exam */
export const API_RAG_FOR_EXAM = '/rag/for-exam';

/** 答題分析：GET /analysis/quizzes-by-person/{person_id}；query 可選 language（en/zh）、llm_api_key；有 llm_api_key 時回傳含 weakness_report。回傳 { quizzes, count, weakness_report? } */
export const API_QUIZZES_BY_PERSON = '/analysis/quizzes-by-person';

/** Exam API：GET /exam/exams List Exams（僅 deleted=false；每筆含 quizzes、answers，格式同 GET /rag/rags；query: person_id 可選） */
export const API_EXAM_TESTS = '/exam/exams';
/** Exam：POST /exam/create-exam Create Exam，body 可選 exam_tab_id、person_id、exam_name；回傳 exam_id、exam_tab_id、person_id、exam_name、created_at */
export const API_CREATE_EXAM = '/exam/create-exam';
/** Exam：POST /exam/delete/{exam_tab_id} Delete Exam */
export const API_EXAM_DELETE = '/exam/delete';
/** Exam：POST /exam/generate-quiz；body: llm_api_key, exam_id, exam_tab_id, quiz_level（number）；回傳 quiz_content, quiz_hint, reference_answer, exam_quiz_id 等 */
export const API_TEST_GENERATE_QUIZ = '/exam/generate-quiz';
/** Exam：POST /exam/quiz-grade；body: llm_api_key, exam_id, exam_tab_id, exam_quiz_id, quiz_content, answer（皆 string） */
export const API_TEST_QUIZ_GRADE = '/exam/quiz-grade';
/** Exam：GET /exam/quiz-grade-result/{job_id} Get Exam Grade Result */
export const API_TEST_QUIZ_GRADE_RESULT = '/exam/quiz-grade-result';

/** 系統設定：GET /system-settings/llm-api-key 取得目前使用者的 LLM API Key（Header X-Person-Id）；無資料時回傳 llm_api_key 等為 null */
export const API_GET_LLM_API_KEY = '/system-settings/llm-api-key';
/** 系統設定：PUT /system-settings/llm-api-key 寫入或更新 LLM API Key（Header X-Person-Id）；body: { llm_api_key }，空字串表示清除 */
export const API_PUT_LLM_API_KEY = '/system-settings/llm-api-key';
