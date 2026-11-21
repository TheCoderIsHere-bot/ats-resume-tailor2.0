import DOMPurify from 'isomorphic-dompurify';

export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  const raw = markdown
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-[#222222] mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xs font-bold tracking-widest text-gray-400 uppercase mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-semibold tracking-tight text-[#111111] mb-4 text-center">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#222222]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 text-[15px]"><span class="text-gray-300 mt-1">\u2022</span><span>$1</span></li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul class="space-y-2 mb-4">${m}</ul>`)
    .replace(/^---$/gm, '<hr class="border-gray-100 my-6" />')
    .replace(/^(?!<[hul]|<hr|<li)(.+)$/gm, '<p class="text-[15px] text-[#444444] leading-relaxed mb-3">$1</p>')
    .replace(/\n\n/g, '');
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['class'] });
}
