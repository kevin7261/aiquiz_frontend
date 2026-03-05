/**
 * 後端 API 基底網址，全專案統一由此設定。
 */
export const API_BASE = 'http://127.0.0.1:8000';//'https://aiquiz-backend-z4mo.onrender.com';

/** Generate Quiz API：/rag/generate-quiz；回傳 quiz_content, quiz_hint, reference_answer 等 */
export const API_GENERATE_QUIZ = '/rag/generate-quiz';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
/** 評分 API 表單欄位：測驗題目內容（與後端 quiz_content、Quiz 表一致） */
export const API_REQUEST_QUIZ_CONTENT = 'quiz_content';

/** 評分：POST /rag/quiz-grade 回傳 202 + job_id，再以 GET /rag/quiz-grade-result/{job_id} 輪詢 */
export const API_GRADE_SUBMISSION = '/rag/quiz-grade';
export const API_GRADE_RESULT = '/rag/quiz-grade-result';

/** 建立 RAG（建立 tab 時按 +）：POST /rag/create-rag，body 必填 rag_tab_id、person_id、rag_name；回傳 rag_id、rag_tab_id、person_id、rag_name、created_at */
export const API_CREATE_RAG = '/rag/create-rag';
/** 上傳 ZIP：POST /rag/upload-zip，需先 create-rag；Form: file、rag_tab_id、person_id（必填），可選 llm_api_key；回傳 file_metadata */
export const API_UPLOAD_ZIP = '/rag/upload-zip';
/** 建 RAG ZIP：POST /rag/build-rag-zip；body: rag_tab_id, person_id, rag_list, openai_api_key, chunk_size, chunk_overlap, system_prompt_instruction */
export const API_BUILD_RAG_ZIP = '/rag/build-rag-zip';
/** 設為使用中 RAG：PATCH /rag/applied/{rag_tab_id}，Header X-Person-Id；該 rag_tab_id applied=true，同 person 其餘 applied=false */
export const API_RAG_APPLIED = '/rag/applied';

/** 答題分析：GET /quiz/quiz-answers?person_id=xxx，回傳 { items: [{ quiz, answers }], count }，quiz_type=1 */
export const API_QUIZ_ANSWERS = '/quiz/quiz-answers';
