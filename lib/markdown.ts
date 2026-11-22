import DOMPurify from 'isomorphic-dompurify';

export function markdownToHtml(markdown: string, matchedKeywords: string[] = []): string {
  if (!markdown) return '';

  let processed = markdown;

  // 1. If matchedKeywords are provided, highlight un-bolded occurrences in non-header lines
  if (matchedKeywords && matchedKeywords.length > 0) {
    const validKw = matchedKeywords
      .map((k) => k.trim())
      .filter((k) => k.length >= 3 && !/^(and|the|for|with|from|that|this)$/i.test(k))
      .sort((a, b) => b.length - a.length);

    if (validKw.length > 0) {
      const lines = processed.split('\n');
      processed = lines
        .map((line) => {
          if (line.startsWith('#')) return line;
          // Split by ** so we only match parts outside existing bold tags
          const parts = line.split('**');
          for (let i = 0; i < parts.length; i += 2) {
            for (const kw of validKw) {
              const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
              parts[i] = parts[i].replace(regex, '@@HIGHLIGHT@@$1@@ENDHIGHLIGHT@@');
            }
          }
          return parts.join('**');
        })
        .join('\n')
        .replace(/@@HIGHLIGHT@@(.*?)@@ENDHIGHLIGHT@@/g, '**$1**');
    }
  }

  // 2. Clean headings so heading text itself is not highlighted
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

  return DOMPurify.sanitize(raw, { ADD_ATTR: ['class', 'title'] });
}
