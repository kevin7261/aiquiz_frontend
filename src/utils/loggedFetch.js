/**
 * 與原生 fetch 相同介面；每次取得回應後在 console 輸出 method、URL、status 與 body（可解析為 JSON 則顯示物件）。
 */
/* eslint-disable no-console */

/**
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function loggedFetch(input, init) {
  const res = await fetch(input, init);
  const method = (init && init.method) || 'GET';
  const url = typeof input === 'string' ? input : String(input.url);
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
