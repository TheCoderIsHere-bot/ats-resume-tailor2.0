import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TabStopPosition,
  TabStopType,
} from 'docx';
import { stripHighlightMarkers } from '@/lib/resumeDiff';

interface DocxSection {
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

function parseMarkdownToDocxSections(markdown: string): DocxSection[] {
  const lines = markdown.split('\n');
  const sections: DocxSection[] = [];
  let lastWasName = false;

  for (const raw of lines) {
    const line = stripHighlightMarkers(raw.trim());
    if (!line) { sections.push({ type: 'gap' }); lastWasName = false; continue; }

    if (line.startsWith('# ')) {
      sections.push({ type: 'name', text: line.slice(2).replace(/\*\*(.+?)\*\*/g, '$1') });
      lastWasName = true;
    } else if (line.startsWith('## ')) {
      sections.push({ type: 'heading', text: line.slice(3).replace(/\*\*(.+?)\*\*/g, '$1').toUpperCase() });
      lastWasName = false;
    } else if (line.startsWith('### ')) {
      sections.push({ type: 'subheading', text: line.slice(4).replace(/\*\*(.+?)\*\*/g, '$1') });
      lastWasName = false;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      sections.push({ type: 'bullet', text: line.slice(2).replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '$1') });
      lastWasName = false;
    } else if (line.startsWith('---')) {
      lastWasName = false;
    } else {
      const cleanText = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
      if (lastWasName || isContactLine(cleanText)) {
        sections.push({ type: 'contact', text: cleanText });
      } else {
        sections.push({ type: 'body', text: line.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '$1') });
      }
      lastWasName = false;
    }
  }

  return sections;
}

function buildTextRuns(text: string): TextRun[] {
  // Strip any leftover highlight markers and parse bold markdown (**text**)
  const clean = stripHighlightMarkers(text);
  const runs: TextRun[] = [];
  const parts = clean.split(/(\*\*.+?\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: clean })];
}

export async function generateDocx(markdown: string): Promise<Uint8Array> {
  const sections = parseMarkdownToDocxSections(markdown);
  const paragraphs: Paragraph[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'name':
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: section.text!, bold: true, size: 36, color: '1E1E1E' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
          })
        );
        break;

      case 'contact':
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: section.text!, size: 18, color: '666666' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
          })
        );
        break;

      case 'heading':
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: section.text!, bold: true, size: 20, color: '333333' })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 80 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '8AA694', space: 4 },
            },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          })
        );
        break;

      case 'subheading':
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: section.text!, bold: true, size: 20, color: '282828' })],
            spacing: { before: 120, after: 40 },
          })
        );
        break;

      case 'body':
        paragraphs.push(
          new Paragraph({
            children: buildTextRuns(section.text!),
            spacing: { after: 60 },
            style: 'Normal',
          })
        );
        break;

      case 'bullet':
        paragraphs.push(
          new Paragraph({
            children: buildTextRuns(section.text!),
            bullet: { level: 0 },
            spacing: { after: 40 },
          })
        );
        break;

      case 'gap':
        paragraphs.push(
          new Paragraph({ children: [], spacing: { after: 80 } })
        );
        break;
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20, color: '3C3C3C' },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
