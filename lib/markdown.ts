import { escapeHtmlChars, sanitizeResumeHtml } from '@/lib/htmlSanitizer';
import { hasHighlightMarkers, stripHighlightMarkers } from '@/lib/resumeDiff';

const PROTECTED_SECTION_RE =
  /\b(education|academic|qualifications?|degree|coursework|certifications?|certificates?|licenses?|credentials?|accreditations?|honors?|awards?|publications?|patents?|languages?|interests?|hobbies|references?|contact|personal|declaration)\b/i;

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[a-zA-Z0-9_]/.test(ch);
}

/**
 * Case-insensitive whole-word keyword highlighter using linear index scanning
 * (avoids dynamic RegExp construction / ReDoS risks while preserving original casing).
 */
function highlightKeywordInText(text: string, kw: string): string {
  const lowerText = text.toLowerCase();
  const lowerKw = kw.toLowerCase();
  const needStartBoundary = isWordChar(kw[0]);
  const needEndBoundary = isWordChar(kw[kw.length - 1]);

  let out = '';
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerKw, cursor);
    if (idx === -1) {
      out += text.slice(cursor);
      break;
    }

    const before = idx > 0 ? text[idx - 1] : undefined;
    const after = idx + kw.length < text.length ? text[idx + kw.length] : undefined;
    const startOk = !needStartBoundary || !isWordChar(before);
    const endOk = !needEndBoundary || !isWordChar(after);

    if (startOk && endOk) {
      out +=
        text.slice(cursor, idx) +
        '@@HIGHLIGHT@@' +
        text.slice(idx, idx + kw.length) +
        '@@ENDHIGHLIGHT@@';
    } else {
      out += text.slice(cursor, idx + kw.length);
    }

    cursor = idx + kw.length;
  }

  return out;
}

function stripAllInlineMarkers(text: string): string {
  return stripHighlightMarkers(text).replace(/\*\*(.+?)\*\*/g, '$1');
}

export function markdownToHtml(markdown: string, matchedKeywords: string[] = []): string {
  if (!markdown) return '';

  // 1. Escape raw HTML metacharacters upfront to prevent XSS & preserve literal "<", ">" in text
  let processed = escapeHtmlChars(markdown);

  // 2. Fallback keyword highlighting only when callers pass matchedKeywords and no explicit ==...== diff markers exist.
  //    Never run inside the contact header, structural headings, protected sections (Education/Certifications), or **bold** text.
  if (matchedKeywords && matchedKeywords.length > 0 && !hasHighlightMarkers(markdown)) {
    const validKw = matchedKeywords
      .map((k) => escapeHtmlChars(k.trim()))
      .filter((k) => k.length >= 3 && !/^(and|the|for|with|from|that|this)$/i.test(k))
      .sort((a, b) => b.length - a.length);

    if (validKw.length > 0) {
      const lines = processed.split('\n');
      let inHeader = true;
      let inProtectedSection = false;

      processed = lines
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('## ')) {
            inHeader = false;
            inProtectedSection = PROTECTED_SECTION_RE.test(trimmed.slice(3));
            return line;
          }
          if (inHeader || inProtectedSection || trimmed.startsWith('#')) {
            return line;
          }
          const parts = line.split('**');
          for (let i = 0; i < parts.length; i += 2) {
            for (const kw of validKw) {
              parts[i] = highlightKeywordInText(parts[i], kw);
            }
          }
          return parts.join('**');
        })
        .join('\n')
        .replace(/@@HIGHLIGHT@@(.*?)@@ENDHIGHLIGHT@@/g, '==$1==');
    }
  }

  // 3. Render structural markdown tags:
  //    - Headings strip ** and == formatting
  //    - ==change== renders with subtle sage highlight (<mark>)
  //    - **bold** renders strictly as clean dark bold text (<strong>), never highlighted
  const raw = processed
    .replace(/^### (.+)$/gm, (_, m) => `<h3 class="text-base font-bold text-[#222222] mt-6 mb-2">${stripAllInlineMarkers(m)}</h3>`)
    .replace(/^## (.+)$/gm, (_, m) => `<h2 class="text-xs font-bold tracking-widest text-gray-400 uppercase mt-8 mb-3">${stripAllInlineMarkers(m)}</h2>`)
    .replace(/^# (.+)$/gm, (_, m) => `<h1 class="text-3xl font-semibold tracking-tight text-[#111111] mb-4 text-center">${stripAllInlineMarkers(m)}</h1>`)
    .replace(/==(?=[^\s=])([^\n]+?)(?<=[^\s=])==/g, '<mark class="font-medium text-[#1F3629] bg-[#8AA694]/10 rounded-[3px] px-[2px]" title="Tailored change">$1</mark>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#222222]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 text-[15px]"><span class="text-gray-300 mt-1">\u2022</span><span>$1</span></li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul class="space-y-2 mb-4">${m}</ul>`)
    .replace(/^---$/gm, '<hr class="border-gray-100 my-6" />')
    .replace(/^(?!<[hul]|<hr|<li)(.+)$/gm, '<p class="text-[15px] text-[#444444] leading-relaxed mb-3">$1</p>')
    .replace(/\n\n/g, '');

  return sanitizeResumeHtml(raw);
}
