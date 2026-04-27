/**
 * 與原生 fetch 相同介面；取得最終回應後在 console 輸出 method、URL、status 與 body（可解析為 JSON 則顯示物件）。
 *
 * 所有指向 API_BASE 的 URL 會自動附加 query `person_id`（與後端 OpenAPI 一致）：優先使用 authStore.user.person_id，
 * 缺則 fallback user_id／id（與 ExamPage getCurrentPersonId 一致）。登入前可傳第三參數 `{ personId }` 覆寫。
 *
 * 若回應為 HTTP 500，會間隔延遲後重試同一請求（含 POST body），直到 status 不再是 500（通常為 200）。
 * 注意：開發者工具 Network／Console 仍可能對每次失敗的請求顯示紅字，此為瀏覽器行為，無法由前端關閉。
 */
/* eslint-disable no-console */

import { getActivePinia } from 'pinia';
import { API_BASE } from '../constants/api.js';
import { useAuthStore } from '../stores/authStore.js';

const RETRY_500_DELAY_MS = 2000;

/**
 * @returns {string | null}
 */
function getPersonIdForQuery() {
  try {
    if (!getActivePinia()) return null;
    const u = useAuthStore().user;
    if (!u) return null;
    const pid = u.person_id;
    if (pid != null && String(pid).trim() !== '') return String(pid).trim();
    const uid = u.user_id ?? u.id;
    if (uid != null && String(uid).trim() !== '') return String(uid).trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} urlString
 * @param {string | null | undefined} overridePersonId
 * @returns {string}
 */
function mergePersonIdQuery(urlString, overridePersonId) {
  if (typeof urlString !== 'string' || !API_BASE) return urlString;

  const baseTrim = String(API_BASE).replace(/\/$/, '');
  let baseOrigin;
  try {
    baseOrigin = new URL(baseTrim).origin;
  } catch {
    baseOrigin = null;
  }

  let u;
  let inputWasRelative = false;
  try {
    if (/^https?:\/\//i.test(urlString)) {
      u = new URL(urlString);
    } else if (urlString.startsWith('/')) {
      if (typeof window === 'undefined' || !window.location?.origin) return urlString;
      u = new URL(urlString, window.location.origin);
      inputWasRelative = true;
    } else {
      return urlString;
    }
  } catch {
    return urlString;
  }

  const p = u.pathname;
  const isApiPath =
    p.startsWith('/english_system') ||
    p.startsWith('/rag') ||
    p.startsWith('/user/') ||
    p.startsWith('/exam/') ||
    p.startsWith('/system-settings') ||
    p.startsWith('/person-analysis') ||
    p.startsWith('/course-analysis') ||
    p.startsWith('/log/') ||
    p.startsWith('/api');

  if (!isApiPath) return urlString;

  const abs = u.toString();
  const sameApiHost = baseOrigin != null && u.origin === baseOrigin;
  const sameDevOrigin =
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    inputWasRelative &&
    baseOrigin === window.location.origin;
  const startsWithConfiguredBase = abs.startsWith(baseTrim);

  if (!startsWithConfiguredBase && !sameApiHost && !sameDevOrigin) return urlString;

  let personId = null;
  if (overridePersonId != null && String(overridePersonId).trim() !== '') {
    personId = String(overridePersonId).trim();
  } else {
    personId = getPersonIdForQuery();
  }
  if (!personId) return urlString;

  u.searchParams.set('person_id', personId);
  if (inputWasRelative) {
    return `${u.pathname}${u.search}${u.hash}`;
  }
  return u.toString();
}

/**
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @param {{ personId?: string | null, omitPersonIdQuery?: boolean }} [fetchOptions] - 例如 POST /user/login 時 store 尚無 user，傳表單 person_id；omitPersonIdQuery 為 true 時不自動附加 person_id（例如 GET /log/logs 自行組 query）
 * @returns {Promise<Response>}
 */
export async function loggedFetch(input, init, fetchOptions) {
  const mergedInput =
    typeof input === 'string' && !fetchOptions?.omitPersonIdQuery
      ? mergePersonIdQuery(input, fetchOptions?.personId)
      : input;

  const method = (init && init.method) || 'GET';
  const url = typeof mergedInput === 'string' ? mergedInput : String(mergedInput.url);

  let res;
  try {
    res = await fetch(mergedInput, init);
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (e?.name === 'TypeError' && msg.includes('Failed to fetch')) {
      throw new Error(
        '無法連線至後端。開發預設直連本機 8000；請確認後端已啟動，且 CORS 允許目前頁面 origin。若要改經 dev 代理，請在 .env 設 VUE_APP_API_BASE 與目前頁面 origin 相同（如 http://localhost:8081）並參考 vue.config.js。'
      );
    }
    throw e;
  }
  while (res.status === 500) {
    await new Promise((r) => setTimeout(r, RETRY_500_DELAY_MS));
    res = await fetch(mergedInput, init);
  }

  let bodyLog;
  try {
    const text = await res.clone().text();
    if (text === '') bodyLog = text;
    else {
      try {
        bodyLog = JSON.parse(text);
      } catch {
        bodyLog = text;
      }
    }
  } catch (e) {
    bodyLog = `(無法讀取 body: ${e?.message ?? e})`;
  }
  console.log('[API response]', { method, url, status: res.status, ok: res.ok, body: bodyLog });
  return res;
}
