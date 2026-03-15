import { jsPDF } from 'jspdf';

interface PdfSection {
  type: 'name' | 'contact' | 'heading' | 'subheading' | 'body' | 'bullet' | 'gap';
  text?: string;
}

function isContactLine(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('@') ||
    lower.includes('linkedin') ||
    lower.includes('github') ||
    lower.includes('phone') ||
    lower.includes('email') ||
    /\+?\d[\d\s\-().]{7,}/.test(text) ||
    /https?:\/\//.test(text)
  );
}

function parseMarkdownToSections(markdown: string): PdfSection[] {
  const lines = markdown.split('\n');
  const sections: PdfSection[] = [];
  let lastWasName = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { sections.push({ type: 'gap' }); lastWasName = false; continue; }

    if (line.startsWith('# ')) {
      sections.push({ type: 'name', text: line.slice(2) });
      lastWasName = true;
    } else if (line.startsWith('## ')) {
      sections.push({ type: 'heading', text: line.slice(3).toUpperCase() });
      lastWasName = false;
    } else if (line.startsWith('### ')) {
      sections.push({ type: 'subheading', text: line.slice(4).replace(/\*\*(.+?)\*\*/g, '$1') });
      lastWasName = false;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      sections.push({ type: 'bullet', text: line.slice(2).replace(/\*\*(.+?)\*\*/g, '$1') });
      lastWasName = false;
    } else if (line.startsWith('---')) {
      // skip dividers
      lastWasName = false;
    } else {
      const cleanText = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
      // Detect contact info lines (right after name, or containing email/phone/links)
      if (lastWasName || isContactLine(cleanText)) {
        sections.push({ type: 'contact', text: cleanText });
      } else {
        sections.push({ type: 'body', text: cleanText });
      }
      lastWasName = false;
    }
  }

  return sections;
}

export function generatePdf(markdown: string, _filename: string): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginL = 50;
  const marginR = 50;
  const contentWidth = pageWidth - marginL - marginR;
  let y = 50;

  const addPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = 50;
    }
  };

  const sections = parseMarkdownToSections(markdown);

  for (const section of sections) {
    switch (section.type) {
      case 'name':
        addPageIfNeeded(36);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(30, 30, 30);
        doc.text(section.text!, pageWidth / 2, y, { align: 'center' });
        y += 24;
        break;

      case 'contact':
        addPageIfNeeded(16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(section.text!, pageWidth / 2, y, { align: 'center' });
        y += 14;
        break;

      case 'heading':
        addPageIfNeeded(24);
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        doc.text(section.text!, marginL, y);
        y += 5;
        // Clean underline
        doc.setDrawColor(138, 166, 148); // sage green accent
        doc.setLineWidth(1);
        doc.line(marginL, y, pageWidth - marginR, y);
        y += 10;
        break;

      case 'subheading':
        addPageIfNeeded(18);
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text(section.text!, marginL, y);
        y += 14;
        break;

      case 'body': {
        const wrapped = doc.splitTextToSize(section.text!, contentWidth);
        addPageIfNeeded(wrapped.length * 14 + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(wrapped, marginL, y);
        y += wrapped.length * 14 + 2;
        break;
      }

      case 'bullet': {
        const bulletIndent = 14;
        const wrapped = doc.splitTextToSize(section.text!, contentWidth - bulletIndent);
        addPageIfNeeded(wrapped.length * 14 + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        // Draw bullet dot
        doc.setFillColor(138, 166, 148); // sage green dot
        doc.circle(marginL + 4, y - 3, 1.8, 'F');
        // Draw wrapped text
        doc.text(wrapped, marginL + bulletIndent, y);
        y += wrapped.length * 14 + 2;
        break;
      }

      case 'gap':
        y += 6;
        break;
    }
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text('Generated by Tailor.ai', pageWidth / 2, pageHeight - 20, { align: 'center' });
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
