/**
 * Markdown 渲染工具
 *
 * 職責：將 Markdown 字串轉成可安全插入至 v-html 的 HTML。
 * - 使用 marked 解析（啟用 GFM 與換行支援）
 * - 使用 DOMPurify 消毒，防止 XSS 注入
 *
 * 供 EnglishExamMarkdownEditor、QuizCard 批改規則預覽等使用。
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** 全域設定 marked：啟用 GitHub Flavored Markdown 與換行自動轉 <br> */
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * 將 Markdown 字串轉成可安全用 v-html 插入的 HTML（DOMPurify 消毒）。
 *
 * @param {unknown} src - Markdown 原始字串（null/undefined 回傳空字串）
 * @returns {string} 消毒後的 HTML 字串，可直接用於 v-html
 */
export function renderMarkdownToSafeHtml(src) {
  if (src == null) return '';
  const s = String(src);
  if (!s.trim()) return '';
  const dirty = marked.parse(s);
  const html = typeof dirty === 'string' ? dirty : String(dirty ?? '');
  return DOMPurify.sanitize(html);
}
