/**
 * 自 YouTube 網址解析 11 字元影片 id（watch、youtu.be、embed、shorts、live）。
 * @param {unknown} input
 * @returns {string}
 */
export function youtubeVideoIdFromUrl(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return /^[\w-]{11}$/.test(id) ? id : '';
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch' || u.pathname.startsWith('/watch')) {
        const v = u.searchParams.get('v');
        return v && /^[\w-]{11}$/.test(v) ? v : '';
      }
      const embedMatch = u.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embedMatch) return embedMatch[1];
      const shortsMatch = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shortsMatch) return shortsMatch[1];
      const liveMatch = u.pathname.match(/^\/live\/([\w-]{11})/);
      if (liveMatch) return liveMatch[1];
    }
  } catch {
    /* 非絕對 URL 時改走下方 regex */
  }
  const m = s.match(
    /(?:youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/
  );
  return m ? m[1] : '';
}

/**
 * @param {unknown} input
 * @returns {string} 可放進 iframe src 的 embed URL，無法解析時為空字串
 */
export function youtubeEmbedUrlFromInput(input) {
  const id = youtubeVideoIdFromUrl(input);
  return id ? `https://www.youtube.com/embed/${id}` : '';
}
