/**
 * 後端 API 基底網址，全專案統一由此設定。
 */
export const API_BASE = 'http://127.0.0.1:8000';//'https://aiquiz-backend-z4mo.onrender.com';

/** Generate Quiz API：/rag/generate-quiz；回傳 quiz_content, quiz_hint, reference_answer 等 */
export const API_GENERATE_QUIZ = '/rag/generate-quiz';
export const API_RESPONSE_QUIZ_CONTENT = 'quiz_content';
export const API_RESPONSE_QUIZ_LEGACY = 'quiz';
export const API_REQUEST_QUIZ_TEXT = 'quiz_text';

/** 評分：POST /rag/grade_submission 回傳 202 + job_id，再以 GET /rag/grade_result/{job_id} 輪詢 */
export const API_GRADE_SUBMISSION = '/rag/grade_submission';
