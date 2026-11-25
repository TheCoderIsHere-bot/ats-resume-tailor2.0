import DOMPurify from 'isomorphic-dompurify';

const SAFE_HTML_TAGS = [
  'h1', 'h2', 'h3', 'p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'hr', 'div', 'span',
];

const SAFE_HTML_ATTRS = ['class', 'title'];

/**
 * Strict HTML sanitizer for rich-text resume/cover letter content.
 * Strips scripts, event handlers, iframes, SVGs, forms, external media, and data attributes.
 */
export function sanitizeResumeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: SAFE_HTML_TAGS,
    ALLOWED_ATTR: SAFE_HTML_ATTRS,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'img', 'a'],
  });
}

/**
 * Escape raw HTML metacharacters before converting markdown syntax to HTML.
 * Prevents HTML tag injection AND stops legitimate resume text like "< 2 years"
 * or "C++ <T>" from being interpreted as HTML tags.
 */
export function escapeHtmlChars(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
