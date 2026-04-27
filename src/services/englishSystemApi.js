/**
 * English System：tab 建立等 API
 */
import {
  API_BASE,
  API_ENGLISH_SYSTEM_TAB_CREATE,
  API_ENGLISH_SYSTEM_TAB_BUILD_SYSTEM,
  API_ENGLISH_SYSTEM_TAB_PHASE_CREATE,
  API_ENGLISH_SYSTEM_TAB_PHASE_QUIZ_CREATE,
  API_ENGLISH_TRANSCRIPT_AUDIO,
  API_ENGLISH_TRANSCRIPT_YOUTUBE,
  isFrontendLocalHost,
} from '../constants/api.js';
import { parseFetchError } from '../utils/apiError.js';
import { loggedFetch } from '../utils/loggedFetch.js';

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * POST /english_system/tab/create（對齊 OpenAPI：建立 English_System；與 POST /rag/tab/create 成對使用）
 *
 * @param {{ personId: string, system_tab_id: string, tab_name: string, local?: boolean }} params
 * @param {{ personId?: string | null }} [opts] - loggedFetch query person_id
 * @returns {Promise<object>}
 */
export async function apiCreateEnglishSystemTab(params, opts = {}) {
  const personId = String(params.personId ?? '').trim();
  const system_tab_id = String(params.system_tab_id ?? '').trim();
  const tab_name = String(params.tab_name ?? '').trim() || system_tab_id;
  if (!personId || !system_tab_id) {
    throw new Error('缺少 person_id 或 system_tab_id');
  }
  const body = {
    system_tab_id,
    tab_name,
    person_id: personId,
    local: params.local !== undefined && params.local !== null ? !!params.local : isFrontendLocalHost(),
  };
  const res = await loggedFetch(`${API_BASE}${API_ENGLISH_SYSTEM_TAB_CREATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { personId: opts.personId ?? personId });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * rag/tab/create 成功後呼叫 english_system/tab/create；列已存在時忽略重複類錯誤（避免重試或雙重建立時整段失敗）。
 *
 * @param {{ personId: string, system_tab_id: string, tab_name: string, local?: boolean }} params
 * @param {{ personId?: string | null }} [opts]
 */
export async function ensureEnglishSystemTab(params, opts = {}) {
  try {
    await apiCreateEnglishSystemTab(params, opts);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (
      /已存在|already exists|duplicate|unique|conflict|409|重複/i.test(msg) ||
      /English_System.*存在|無須重複|same.*tab/i.test(msg)
    ) {
      return;
    }
    throw err;
  }
}

/**
 * POST /english_system/tab/build-system
 * 更新 English_System：quiz_type、quiz_text、quiz_mp3_filename、quiz_youtube_url（query person_id 由 loggedFetch 附加）。
 *
 * @param {{
 *   system_tab_id: string,
 *   person_id: string,
 *   quiz_type: number,
 *   quiz_text: string,
 *   quiz_mp3_filename: string,
 *   quiz_youtube_url: string,
 * }} body
 * @param {{ personId?: string | null }} [opts]
 * @returns {Promise<object>}
 */
export async function apiEnglishSystemTabBuildSystem(body, opts = {}) {
  const res = await loggedFetch(`${API_BASE}${API_ENGLISH_SYSTEM_TAB_BUILD_SYSTEM}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_tab_id: String(body.system_tab_id ?? '').trim(),
      person_id: String(body.person_id ?? '').trim(),
      quiz_type: Number(body.quiz_type),
      quiz_text: body.quiz_text != null ? String(body.quiz_text) : '',
      quiz_mp3_filename: body.quiz_mp3_filename != null ? String(body.quiz_mp3_filename) : '',
      quiz_youtube_url: body.quiz_youtube_url != null ? String(body.quiz_youtube_url) : '',
    }),
  }, { personId: opts.personId });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * POST /english_system/tab/phase/quiz/create — 僅**新增**測驗階段（無 LLM）：`system_quiz_phase_id` 固定 0；題目／出題欄位皆空。
 * person_id 僅 query（opts.personId 或 body.person_id）。
 */
export async function apiCreateEnglishSystemPhase(body, opts = {}) {
  const system_id = Number(body.english_system_id ?? body.system_id);
  if (!Number.isFinite(system_id) || system_id < 1) {
    throw new Error('缺少或無效的 english_system_id');
  }
  const system_tab_id = String(body.english_system_tab_id ?? body.system_tab_id ?? '').trim();
  if (!system_tab_id) {
    throw new Error('缺少 system_tab_id');
  }
  const personId = String(opts.personId ?? body.person_id ?? '').trim();
  if (!personId) {
    throw new Error('缺少 person_id（query）');
  }
  const quiz_phase_name =
    body.quiz_phase_name != null && String(body.quiz_phase_name).trim() !== ''
      ? String(body.quiz_phase_name).trim()
      : '';
  const res = await loggedFetch(`${API_BASE}${API_ENGLISH_SYSTEM_TAB_PHASE_QUIZ_CREATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_id,
      system_tab_id,
      system_quiz_phase_id: 0,
      quiz_phase_name,
      quiz_content: '',
      content_text: '',
      quiz_text: '',
      quiz_user_prompt_instruction: '',
      quiz_answer_reference: '',
    }),
  }, { personId });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * POST /english_system/tab/phase/create — **LLM 出題**（教材為 content_text，使用者指令為 quiz_user_prompt_instruction）。
 * person_id 僅 query；body 不含 person_id。
 *
 * @param {{
 *   system_id: number,
 *   system_tab_id: string,
 *   system_quiz_phase_id: number,
 *   quiz_phase_name?: string,
 *   content_text: string,
 *   quiz_user_prompt_instruction?: string,
 *   person_id?: string,
 * }} body
 * @param {{ personId?: string | null }} [opts]
 * @returns {Promise<object>}
 */
export async function apiCreateEnglishSystemPhaseQuiz(body, opts = {}) {
  const system_id = Number(body.system_id);
  if (!Number.isFinite(system_id) || system_id < 1) {
    throw new Error('缺少或無效的 system_id');
  }
  const system_tab_id = String(body.system_tab_id ?? '').trim();
  const system_quiz_phase_id = Number(body.system_quiz_phase_id);
  if (!system_tab_id) {
    throw new Error('缺少 system_tab_id');
  }
  if (!Number.isFinite(system_quiz_phase_id) || system_quiz_phase_id < 1) {
    throw new Error('缺少或無效的 system_quiz_phase_id（出題須為已建立階段之主鍵）');
  }
  const personId = String(opts.personId ?? body.person_id ?? '').trim();
  if (!personId) {
    throw new Error('缺少 person_id（query）');
  }
  const quiz_phase_name =
    body.quiz_phase_name != null && String(body.quiz_phase_name).trim() !== ''
      ? String(body.quiz_phase_name).trim()
      : '';
  const content_text = body.content_text != null ? String(body.content_text) : '';
  const quiz_user_prompt_instruction =
    body.quiz_user_prompt_instruction != null ? String(body.quiz_user_prompt_instruction) : '';
  const res = await loggedFetch(`${API_BASE}${API_ENGLISH_SYSTEM_TAB_PHASE_CREATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_id,
      system_tab_id,
      system_quiz_phase_id,
      quiz_phase_name,
      content_text,
      quiz_user_prompt_instruction,
    }),
  }, { personId });
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * MP3／音訊轉逐字稿：POST /english_system/transcript/audio
 * multipart：`file`、`system_tab_id`（English_System.system_tab_id；尚無列時後端可自動建立）；query `person_id` 由 loggedFetch 併入。
 * 後端：寫入 Supabase english bucket（路徑同 rag upload）後以 Deepgram 轉錄。
 *
 * @param {File | Blob} file
 * @param {{ systemTabId: string, personId?: string | null }} opts
 * @returns {Promise<{ text?: string, bucket?: string, storage_path?: string, elapsed_seconds?: number }>}
 */
export async function apiEnglishTranscriptAudio(file, opts = {}) {
  if (file == null || (typeof Blob !== 'undefined' && !(file instanceof Blob))) {
    throw new Error('請先選擇音訊檔');
  }
  const systemTabId =
    opts.systemTabId != null && String(opts.systemTabId).trim() !== ''
      ? String(opts.systemTabId).trim()
      : opts.system_tab_id != null && String(opts.system_tab_id).trim() !== ''
        ? String(opts.system_tab_id).trim()
        : '';
  if (!systemTabId) {
    throw new Error('缺少 system_tab_id');
  }
  const pathOnly =
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    String(API_BASE).replace(/\/$/, '') === window.location.origin;
  const urlString = pathOnly
    ? API_ENGLISH_TRANSCRIPT_AUDIO
    : `${String(API_BASE).replace(/\/$/, '')}${API_ENGLISH_TRANSCRIPT_AUDIO}`;
  const formData = new FormData();
  const name = file && file.name != null ? String(file.name) : 'audio';
  formData.append('file', file, name);
  formData.append('system_tab_id', systemTabId);
  const res = await loggedFetch(
    urlString,
    {
      method: 'POST',
      body: formData,
    },
    { personId: opts.personId }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}

/**
 * YouTube 公開字幕 → 單一純文字：GET /english_system/transcript/youtube（與 Colab youtube-transcript-api 範例行為一致；不依賴 Whisper）。
 * Query：video_id（必填）、person_id（必填，由 loggedFetch 併入）、languages（選填；未帶則由後端預設 en）
 *
 * @param {string} videoIdOrUrl - 11 字元 video_id 或完整影片網址
 * @param {{ languages?: string, personId?: string | null }} [opts] - 已登入時可省略 personId，由 store 帶出
 * @returns {Promise<{ text?: string, elapsed_seconds?: number, video_id?: string }>}
 */
export async function apiEnglishTranscriptYoutube(videoIdOrUrl, opts = {}) {
  const vid = String(videoIdOrUrl).trim();
  if (!vid) {
    throw new Error('缺少 video_id');
  }
  const lang = opts.languages != null ? String(opts.languages).trim() : '';
  const pathOnly =
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    String(API_BASE).replace(/\/$/, '') === window.location.origin;
  const urlString = pathOnly
    ? (() => {
        const qs = new URLSearchParams();
        qs.set('video_id', vid);
        if (lang) qs.set('languages', lang);
        return `${API_ENGLISH_TRANSCRIPT_YOUTUBE}?${qs.toString()}`;
      })()
    : (() => {
        const base = String(API_BASE).replace(/\/$/, '');
        const u = new URL(`${base}${API_ENGLISH_TRANSCRIPT_YOUTUBE}`);
        u.searchParams.set('video_id', vid);
        if (lang) u.searchParams.set('languages', lang);
        return u.toString();
      })();
  const res = await loggedFetch(
    urlString,
    { method: 'GET' },
    { personId: opts.personId }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(parseFetchError(res, text));
  return parseJson(text);
}
