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
  let msg = res?.statusText ?? '無法完成請求';
  if (text && typeof text === 'string') {
    try {
      const err = JSON.parse(text);
      const d = err.detail;
      const e = err.error;
      if (d != null) {
        msg = typeof d === 'string' ? d : JSON.stringify(d);
      } else if (e != null) {
        msg = typeof e === 'string' ? e : String(e);
      } else if (msg === (res?.statusText ?? '無法完成請求')) {
        msg = text;
      }
    } catch (_) {
      msg = text;
    }
  }
  return msg;
}

/**
 * 將 POST /rag/tab/build-rag-zip 的 FastAPI `detail` 轉成可顯示的多行訊息。
 * - `detail` 為字串：原樣回傳（較早階段錯誤，例如未上傳 ZIP）。
 * - RAG 打包失敗物件：顯示 `message`，並列出 `outputs` 中帶 `rag_error` 的單元；末尾附 `source_rag_tab_id`／`unit_list` 供除錯。
 *
 * @param {unknown} detail
 * @returns {string}
 */
export function formatBuildRagZipErrorDetail(detail) {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail !== 'object' || Array.isArray(detail)) {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  const overview =
    detail.message != null && String(detail.message).trim() !== ''
      ? String(detail.message).trim()
      : '';
  const outputs = detail.outputs;
  const lines = [];
  if (overview) lines.push(overview);

  if (Array.isArray(outputs)) {
    const bullets = [];
    for (const o of outputs) {
      if (!o || o.rag_error == null || String(o.rag_error).trim() === '') continue;
      const unit = o.unit_name != null && String(o.unit_name).trim() !== '' ? String(o.unit_name).trim() : '（單元）';
      bullets.push(`• ${unit}：${String(o.rag_error).trim()}`);
    }
    if (bullets.length) lines.push(bullets.join('\n'));
  }

  if (lines.length === 0) {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  const debug = [];
  if (detail.source_rag_tab_id != null && String(detail.source_rag_tab_id).trim() !== '') {
    debug.push(`rag_tab_id=${String(detail.source_rag_tab_id).trim()}`);
  }
  if (detail.unit_list != null && String(detail.unit_list).trim() !== '') {
    debug.push(`unit_list=${String(detail.unit_list).trim()}`);
  }
  const body = lines.join('\n\n');
  if (debug.length === 0) return body;
  return `${body}\n\n（${debug.join('｜')}）`;
}

/**
 * 建 RAG ZIP 專用：400 且 `detail` 為物件時用 {@link formatBuildRagZipErrorDetail}，其餘沿用 {@link parseFetchError}。
 *
 * @param {Response | undefined} res
 * @param {string} [text]
 * @returns {string}
 */
export function parseBuildRagZipError(res, text) {
  if (text && typeof text === 'string' && res?.status === 400) {
    try {
      const err = JSON.parse(text);
      const d = err.detail;
      if (d != null && typeof d === 'object' && !Array.isArray(d)) {
        return formatBuildRagZipErrorDetail(d);
      }
      if (typeof d === 'string') {
        return d;
      }
    } catch (_) {
      /* fall through */
    }
  }
  return parseFetchError(res, text);
}
