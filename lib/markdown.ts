import { escapeHtmlChars, sanitizeResumeHtml } from '@/lib/htmlSanitizer';

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

export function markdownToHtml(markdown: string, matchedKeywords: string[] = []): string {
  if (!markdown) return '';

  // 1. Escape raw HTML metacharacters upfront to prevent XSS & preserve literal "<", ">" in text
  let processed = escapeHtmlChars(markdown);

  // 2. Highlight matched keywords safely outside existing **bold** markers
  if (matchedKeywords && matchedKeywords.length > 0) {
    const validKw = matchedKeywords
      .map((k) => escapeHtmlChars(k.trim()))
      .filter((k) => k.length >= 3 && !/^(and|the|for|with|from|that|this)$/i.test(k))
      .sort((a, b) => b.length - a.length);

    if (validKw.length > 0) {
      const lines = processed.split('\n');
      processed = lines
        .map((line) => {
          if (line.startsWith('#')) return line;
          const parts = line.split('**');
          for (let i = 0; i < parts.length; i += 2) {
            for (const kw of validKw) {
              parts[i] = highlightKeywordInText(parts[i], kw);
            }
          }
          return parts.join('**');
        })
        .join('\n')
        .replace(/@@HIGHLIGHT@@(.*?)@@ENDHIGHLIGHT@@/g, '**$1**');
    }
  }

  // 3. Render structural markdown tags
  const raw = processed
    .replace(/^### (.+)$/gm, (_, m) => `<h3 class="text-base font-bold text-[#222222] mt-6 mb-2">${m.replace(/\*\*(.+?)\*\*/g, '$1')}</h3>`)
    .replace(/^## (.+)$/gm, (_, m) => `<h2 class="text-xs font-bold tracking-widest text-gray-400 uppercase mt-8 mb-3">${m.replace(/\*\*(.+?)\*\*/g, '$1')}</h2>`)
    .replace(/^# (.+)$/gm, (_, m) => `<h1 class="text-3xl font-semibold tracking-tight text-[#111111] mb-4 text-center">${m.replace(/\*\*(.+?)\*\*/g, '$1')}</h1>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#1C4B35] bg-[#EAF5EF] border border-[#CFE6D8] px-1.5 py-0.5 rounded-md mx-0.5 inline-block" title="Tailored tweak / keyword">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 text-[15px]"><span class="text-gray-300 mt-1">\u2022</span><span>$1</span></li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul class="space-y-2 mb-4">${m}</ul>`)
    .replace(/^---$/gm, '<hr class="border-gray-100 my-6" />')
    .replace(/^(?!<[hul]|<hr|<li)(.+)$/gm, '<p class="text-[15px] text-[#444444] leading-relaxed mb-3">$1</p>')
    .replace(/\n\n/g, '');

  return sanitizeResumeHtml(raw);
}
