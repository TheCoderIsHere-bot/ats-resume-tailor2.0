import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

// ─── Register a clean sans-serif font from a CDN-hosted source ───────────────
// We use the bundled Helvetica fallback; react-pdf handles proper kerning/metrics.
// If you want a custom font later, call Font.register({ family, src }) here.

// ─── Palette ─────────────────────────────────────────────────────────────────
const SAGE = '#6B8F78';
const DARK = '#1A1A1A';
const MID = '#3C3C3C';
const SUBTLE = '#6B7280';
const LINE_COLOR = '#D1D5DB';

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: MID,
    backgroundColor: '#FFFFFF',
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
    lineHeight: 1.45,
  },

  // ── Name / Header ──────────────────────────────────────────────────────────
  name: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    color: DARK,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  contact: {
    fontSize: 9,
    color: SUBTLE,
    textAlign: 'center',
    marginBottom: 2,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 14,
  },

  // ── Section heading (## ) ──────────────────────────────────────────────────
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: DARK,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1.5,
    borderBottomColor: SAGE,
    borderBottomStyle: 'solid',
  },

  // ── Sub-heading (### ) ─────────────────────────────────────────────────────
  subHeading: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginTop: 6,
    marginBottom: 1,
  },

  // ── Body paragraph ────────────────────────────────────────────────────────
  body: {
    fontSize: 9.5,
    color: MID,
    marginBottom: 3,
    lineHeight: 1.5,
  },

  // ── Bullet ────────────────────────────────────────────────────────────────
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 2.5,
    paddingLeft: 2,
  },
  bulletDot: {
    width: 12,
    fontSize: 9.5,
    color: SAGE,
    marginTop: 1.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: MID,
    lineHeight: 1.5,
  },

  // ── Divider line ──────────────────────────────────────────────────────────
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: LINE_COLOR,
    borderBottomStyle: 'solid',
    marginVertical: 6,
  },

  // ── Inline bold run ───────────────────────────────────────────────────────
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  normal: {
    fontFamily: 'Helvetica',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 7,
    color: '#C0C0C0',
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Segment {
  text: string;
  bold: boolean;
}

function parseSegments(raw: string): Segment[] {
  const segs: Segment[] = [];
  const parts = raw.split(/\*\*(.+?)\*\*/g);
  parts.forEach((p, i) => {
    if (p) segs.push({ text: p, bold: i % 2 === 1 });
  });
  return segs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StyledText({ raw, style }: { raw: string; style?: any }) {
  const segs = parseSegments(raw);
  return (
    <Text style={style}>
      {segs.map((seg, i) => (
        <Text key={i} style={seg.bold ? { ...style, fontFamily: 'Helvetica-Bold' } : { ...style, fontFamily: 'Helvetica' }}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

// ─── Document component ──────────────────────────────────────────────────────

interface Section {
  type: 'name' | 'contact' | 'heading' | 'subheading' | 'body' | 'bullet' | 'divider' | 'gap';
  text?: string;
}

function isContactLine(text: string): boolean {
  const l = text.toLowerCase();
  return (
    l.includes('@') ||
    l.includes('linkedin') ||
    l.includes('github') ||
    l.includes('phone') ||
    l.includes('email') ||
    /\+?\d[\d\s\-().]{7,}/.test(text) ||
    /https?:\/\//.test(text)
  );
}

function parseMarkdown(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  // inHeader: true until we hit the first ## section heading
  // Contact detection only applies in the header block to avoid
  // misclassifying lines like "2019 - 2023" in Education as phone numbers.
  let inHeader = true;
  let lastWasName = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      sections.push({ type: 'gap' });
      lastWasName = false;
      continue;
    }
    if (line.startsWith('# ')) {
      sections.push({ type: 'name', text: line.slice(2) });
      lastWasName = true;
    } else if (line.startsWith('## ')) {
      inHeader = false; // leaving the header block
      sections.push({ type: 'heading', text: line.slice(3).toUpperCase() });
      lastWasName = false;
    } else if (line.startsWith('### ')) {
      sections.push({ type: 'subheading', text: line.slice(4) });
      lastWasName = false;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      sections.push({ type: 'bullet', text: line.slice(2) });
      lastWasName = false;
    } else if (line.startsWith('---')) {
      sections.push({ type: 'divider' });
      lastWasName = false;
    } else {
      const plain = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
      // Only classify as contact when inside the header block
      if (inHeader && (lastWasName || isContactLine(plain))) {
        sections.push({ type: 'contact', text: plain });
      } else {
        sections.push({ type: 'body', text: line });
      }
      lastWasName = false;
    }
  }
  return sections;
}

function ResumeDocument({ markdown }: { markdown: string }) {
  const sections = parseMarkdown(markdown);

  // Collect consecutive contact lines so we can join them on one row
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < sections.length) {
    const sec = sections[i];

    if (sec.type === 'name') {
      blocks.push(<Text key={i} style={s.name}>{sec.text}</Text>);
      i++;
      // Collect following contact lines, skipping blank gaps between them
      const contacts: string[] = [];
      while (i < sections.length) {
        if (sections[i].type === 'contact') {
          contacts.push(sections[i].text!);
          i++;
        } else if (sections[i].type === 'gap') {
          // Allow a single gap between name and contacts (common in AI output)
          i++;
        } else {
          break;
        }
      }
      if (contacts.length > 0) {
        blocks.push(
          <View key={`contact-${i}`} style={s.contactRow}>
            {contacts.map((c, ci) => (
              <Text key={ci} style={[s.contact, ...(ci < contacts.length - 1 ? [{ marginRight: 12 }] : [])]}>
                {c}
              </Text>
            ))}
          </View>
        );
      }
    } else if (sec.type === 'heading') {
      blocks.push(<Text key={i} style={s.sectionHeading}>{sec.text}</Text>);
      i++;
    } else if (sec.type === 'subheading') {
      blocks.push(<StyledText key={i} raw={sec.text!} style={s.subHeading} />);
      i++;
    } else if (sec.type === 'body') {
      blocks.push(<StyledText key={i} raw={sec.text!} style={s.body} />);
      i++;
    } else if (sec.type === 'bullet') {
      blocks.push(
        <View key={i} style={s.bulletRow}>
          <Text style={s.bulletDot}>{'•'}</Text>
          <StyledText raw={sec.text!} style={s.bulletText} />
        </View>
      );
      i++;
    } else if (sec.type === 'divider') {
      blocks.push(<View key={i} style={s.divider} />);
      i++;
    } else if (sec.type === 'contact') {
      // Orphaned contact section (shouldn't happen after fix, but safety net)
      blocks.push(<StyledText key={i} raw={sec.text!} style={s.body} />);
      i++;
    } else {
      // gap or unknown — skip
      i++;
    }
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {blocks}
        <Text style={s.footer} fixed>Generated by Tailor.ai</Text>
      </Page>
    </Document>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generatePdf(markdown: string): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<ResumeDocument markdown={markdown} />);
  return new Uint8Array(buffer);
}
