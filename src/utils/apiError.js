/**
 * API 錯誤解析工具
 *
 * 從 fetch 的 Response 與 response body 文字解析出可顯示的錯誤訊息，
 * 供各 API 呼叫處統一使用，避免重複 try/catch 與 JSON 解析邏輯。
 */

/**
 * 從 fetch Response 與 response text 解析錯誤訊息
 *
 * 優先使用後端 JSON 的 detail 或 error 欄位；
 * detail 為物件時會 JSON.stringify；若無 JSON 或解析失敗則使用 text 或 statusText。
 *
 * @param {Response | undefined} res - fetch 回傳的 Response（可能為 undefined）
 * @param {string} [text] - response body 字串（通常為 await res.text()）
 * @returns {string} 可顯示給使用者的錯誤訊息
 */
export function parseFetchError(res, text) {
  let msg = res?.statusText ?? 'Request failed';
  if (text && typeof text === 'string') {
    try {
      const err = JSON.parse(text);
      const d = err.detail;
      const e = err.error;
      if (d != null) {
        msg = typeof d === 'string' ? d : JSON.stringify(d);
      } else if (e != null) {
        msg = typeof e === 'string' ? e : String(e);
      } else if (msg === (res?.statusText ?? 'Request failed')) {
        msg = text;
      }
    } catch (_) {
      msg = text;
    }
  }
  return msg;
}
