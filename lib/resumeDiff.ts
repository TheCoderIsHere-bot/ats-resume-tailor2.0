/**
 * lib/resumeDiff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic original-vs-tailored resume diff highlighter.
 *
 * Design principles (Option A):
 * 1. Separate normal Markdown bold (**...**) from AI change highlights (==...==).
 * 2. Never highlight the contact header, structural headings (# / ## / ###),
 *    or protected factual sections (Education, Certifications, Awards, etc.).
 * 3. Match each tailored line against original lines, reconstructed wrapped PDF
 *    bullets, and original paragraphs using word LCS + token-budget checks
 *    (handles reordered clauses, punctuation cleanup, pluralization, and
 *    wrapped lines without false positives).
 * 4. Apply an original N-gram guard and Skills-vocabulary guard so existing
 *    skills or copied phrases are never falsely highlighted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const HIGHLIGHT_GLOBAL_RE = /==(?=[^\s=])([^\n]+?)(?<=[^\s=])==/g;
const HIGHLIGHT_TEST_RE = /==(?=[^\s=])([^\n]+?)(?<=[^\s=])==/;

const PROTECTED_SECTION_RE =
  /\b(education|academic|qualifications?|degree|coursework|certifications?|certificates?|licenses?|credentials?|accreditations?|honors?|awards?|publications?|patents?|languages?|interests?|hobbies|references?|contact|personal|declaration)\b/i;

const SKILLS_SECTION_RE =
  /\b(skills?|competencies|competency|technologies|tech\s+stack|tools|proficiencies|core\s+strengths)\b/i;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'as', 'from', 'into', 'onto', 'upon', 'per', 'via',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
  'do', 'does', 'did', 'that', 'this', 'these', 'those', 'it', 'its', 'their',
  'through', 'using', 'across', 'within', 'between', 'while', 'where',
]);

const CANONICAL_SYNONYMS = new Map<string, string>([
  ['postgresql', 'postgres'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['kubernetes', 'k8s'],
  ['nodejs', 'node'],
  ['node.js', 'node'],
  ['reactjs', 'react'],
  ['react.js', 'react'],
  ['nextjs', 'next'],
  ['next.js', 'next'],
  ['mongodb', 'mongo'],
  ['&', 'and'],
]);

const GARBLED_CHAR_RE = /[\u00d3\u2122\u02c6\u2021\u00a1\ufffd•●▪▫◦‣⁃]/g;

/** Remove ==...== diff highlight markers, leaving clean text. */
export function stripHighlightMarkers(markdown: string): string {
  if (!markdown) return '';
  return markdown.replace(HIGHLIGHT_GLOBAL_RE, '$1');
}

/** Check whether markdown text already contains valid ==...== highlight markers. */
export function hasHighlightMarkers(markdown: string): boolean {
  if (!markdown) return false;
  return HIGHLIGHT_TEST_RE.test(markdown);
}

function normalizeUnit(raw: string): string {
  const lower = raw
    .toLowerCase()
    .replace(/['’]s$/i, '')
    .replace(/['’]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  if (!lower) return '';
  return CANONICAL_SYNONYMS.get(lower) ?? lower;
}

function canonicalStem(norm: string): string {
  const mapped = CANONICAL_SYNONYMS.get(norm) ?? norm;
  if (mapped.length <= 3) return mapped;
  // Light inflection folding for matching within the same bullet (queries <-> query, pipelines <-> pipeline)
  if (mapped.endsWith('ies') && mapped.length > 4) {
    return mapped.slice(0, -3) + 'y';
  }
  const stripped = mapped.replace(/(?:ization|ising|izing|izes?|ized|tions?|ing|ed|s)$/i, '');
  return stripped.length >= 3 ? stripped : mapped;
}

function unitsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (STOPWORDS.has(a) || STOPWORDS.has(b)) return a === b;
  // Only plural/suffix match when reasonably descriptive words (len >= 4)
  if (a.length >= 4 && b.length >= 4 && canonicalStem(a) === canonicalStem(b)) {
    return true;
  }
  return false;
}

interface SplitUnit {
  norm: string;
  visualTokenIndex: number;
}

interface VisualToken {
  segIdx: number;
  startInSeg: number;
  endInSeg: number;
  raw: string;
  units: string[];
  isStopwordOnly: boolean;
}

interface InlineSegment {
  text: string;
  delim: '' | '**' | '*';
}

interface OrigChunk {
  units: string[];
  contentUnits: Set<string>;
  unitCounts: Map<string, number>;
  stemCounts: Map<string, number>;
}

const VISUAL_TOKEN_RE =
  /[A-Za-z0-9][A-Za-z0-9+#./_'’\-]*[A-Za-z0-9+#%]|[A-Za-z0-9][+#]*|&/g;

function splitVisualToUnits(raw: string): string[] {
  const out: string[] = [];
  const parts = raw.split(/[-/]+/);
  for (const part of parts) {
    const u = normalizeUnit(part);
    if (u) out.push(u);
  }
  if (out.length === 0) {
    const fallback = normalizeUnit(raw);
    if (fallback) out.push(fallback);
  }
  return out;
}

function extractUnitsFromPlain(text: string): string[] {
  const cleaned = text.replace(GARBLED_CHAR_RE, ' ');
  const units: string[] = [];
  const re = new RegExp(VISUAL_TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    for (const u of splitVisualToUnits(m[0])) {
      units.push(u);
    }
  }
  return units;
}

function buildOrigChunk(text: string): OrigChunk | null {
  const units = extractUnitsFromPlain(text);
  if (units.length === 0) return null;
  const contentUnits = new Set<string>();
  const unitCounts = new Map<string, number>();
  const stemCounts = new Map<string, number>();
  for (const u of units) {
    unitCounts.set(u, (unitCounts.get(u) ?? 0) + 1);
    const st = canonicalStem(u);
    stemCounts.set(st, (stemCounts.get(st) ?? 0) + 1);
    if (!STOPWORDS.has(u) && u.length >= 2) {
      contentUnits.add(u);
    }
  }
  return { units, contentUnits, unitCounts, stemCounts };
}

interface OriginalIndex {
  chunks: OrigChunk[];
  fullStream: string[];
  threeGrams: Set<string>;
  allContentSet: Set<string>;
  allStemSet: Set<string>;
}

function looksLikeHeadingOrRoleStart(line: string): boolean {
  if (/^[•●▪▫◦‣⁃\-*]\s+/.test(line)) return true;
  if (/^\d+\.\s+/.test(line)) return true;
  // Short uppercase headings (e.g. EXPERIENCE, TECHNICAL SKILLS)
  if (line.length <= 45 && line === line.toUpperCase() && /[A-Z]{3,}/.test(line)) return true;
  return false;
}

function indexOriginalResume(originalResumeText: string): OriginalIndex {
  const rawLines = originalResumeText.split(/\r?\n/);
  const cleanedLines = rawLines.map((l) => l.trim());
  const candidateStrings: string[] = [];

  // 1. Individual non-empty lines
  for (const line of cleanedLines) {
    if (line) candidateStrings.push(line);
  }

  // 2. Reconstructed wrapped PDF bullets & paragraph blocks
  let currentPara: string[] = [];
  let currentBullet: string[] = [];

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    if (!line) {
      if (currentBullet.length > 1) candidateStrings.push(currentBullet.join(' '));
      if (currentPara.length > 1) candidateStrings.push(currentPara.join(' '));
      currentBullet = [];
      currentPara = [];
      continue;
    }

    // 2-line and 3-line sliding windows handle awkward PDF line wraps within the same block
    // without bleeding across bullet or section boundaries.
    if (i + 1 < cleanedLines.length && cleanedLines[i + 1] && !looksLikeHeadingOrRoleStart(cleanedLines[i + 1])) {
      candidateStrings.push(`${line} ${cleanedLines[i + 1]}`);
      if (i + 2 < cleanedLines.length && cleanedLines[i + 2] && !looksLikeHeadingOrRoleStart(cleanedLines[i + 2])) {
        candidateStrings.push(`${line} ${cleanedLines[i + 1]} ${cleanedLines[i + 2]}`);
      }
    }

    if (/^[•●▪▫◦‣⁃\-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (currentBullet.length > 1) candidateStrings.push(currentBullet.join(' '));
      if (currentPara.length > 1) candidateStrings.push(currentPara.join(' '));
      currentBullet = [line];
      currentPara = [];
      continue;
    } else if (looksLikeHeadingOrRoleStart(line)) {
      if (currentBullet.length > 1) candidateStrings.push(currentBullet.join(' '));
      if (currentPara.length > 1) candidateStrings.push(currentPara.join(' '));
      currentBullet = [];
      currentPara = [];
      continue;
    } else if (currentBullet.length > 0) {
      currentBullet.push(line);
      continue;
    }

    currentPara.push(line);
    if (currentPara.join(' ').length > 900) {
      candidateStrings.push(currentPara.join(' '));
      currentPara = [line];
    }
  }
  if (currentBullet.length > 1) candidateStrings.push(currentBullet.join(' '));
  if (currentPara.length > 1) candidateStrings.push(currentPara.join(' '));

  const seenStrings = new Set<string>();
  const chunks: OrigChunk[] = [];
  for (const s of candidateStrings) {
    const key = s.replace(/\s+/g, ' ');
    if (seenStrings.has(key)) continue;
    seenStrings.add(key);
    const chunk = buildOrigChunk(key);
    if (chunk) chunks.push(chunk);
  }

  const fullStream = extractUnitsFromPlain(originalResumeText);
  const threeGrams = new Set<string>();
  for (let i = 0; i + 2 < fullStream.length; i++) {
    threeGrams.add(`${fullStream[i]}\0${fullStream[i + 1]}\0${fullStream[i + 2]}`);
  }

  const allContentSet = new Set<string>();
  const allStemSet = new Set<string>();
  for (const u of fullStream) {
    if (!STOPWORDS.has(u) && u.length >= 2) {
      allContentSet.add(u);
      allStemSet.add(canonicalStem(u));
    }
  }

  return { chunks, fullStream, threeGrams, allContentSet, allStemSet };
}

function splitMarkdownSegments(lineBody: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let pos = 0;
  let plainStart = 0;

  while (pos < lineBody.length) {
    // Check paired **bold**
    if (lineBody.startsWith('**', pos)) {
      const closeIdx = lineBody.indexOf('**', pos + 2);
      if (closeIdx > pos + 2) {
        if (pos > plainStart) {
          segments.push({ text: lineBody.slice(plainStart, pos), delim: '' });
        }
        segments.push({ text: lineBody.slice(pos + 2, closeIdx), delim: '**' });
        pos = closeIdx + 2;
        plainStart = pos;
        continue;
      }
    }

    // Check paired *italic* (skip isolated list/multiplication asterisks with spaces on both sides)
    if (lineBody[pos] === '*' && !lineBody.startsWith('**', pos)) {
      const afterOpen = lineBody[pos + 1];
      if (afterOpen && !/\s/.test(afterOpen)) {
        const closeIdx = lineBody.indexOf('*', pos + 1);
        if (closeIdx > pos + 1 && lineBody[closeIdx - 1] && !/\s/.test(lineBody[closeIdx - 1])) {
          if (pos > plainStart) {
            segments.push({ text: lineBody.slice(plainStart, pos), delim: '' });
          }
          segments.push({ text: lineBody.slice(pos + 1, closeIdx), delim: '*' });
          pos = closeIdx + 1;
          plainStart = pos;
          continue;
        }
      }
    }

    pos++;
  }

  if (plainStart < lineBody.length) {
    segments.push({ text: lineBody.slice(plainStart), delim: '' });
  }

  return segments.length > 0 ? segments : [{ text: lineBody, delim: '' }];
}

function tokenizeSegments(segments: InlineSegment[]): {
  tokens: VisualToken[];
  units: SplitUnit[];
} {
  const tokens: VisualToken[] = [];
  const units: SplitUnit[] = [];

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segText = segments[segIdx].text;
    const re = new RegExp(VISUAL_TOKEN_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(segText)) !== null) {
      const raw = m[0];
      const uList = splitVisualToUnits(raw);
      const isStopwordOnly = uList.every((u) => STOPWORDS.has(u));
      const tokenIdx = tokens.length;
      tokens.push({
        segIdx,
        startInSeg: m.index,
        endInSeg: m.index + raw.length,
        raw,
        units: uList,
        isStopwordOnly,
      });
      for (const u of uList) {
        units.push({ norm: u, visualTokenIndex: tokenIdx });
      }
    }
  }

  return { tokens, units };
}

function computeLcsMatches(origUnits: string[], targetUnits: string[]): boolean[] {
  const n = Math.min(origUnits.length, 180);
  const m = Math.min(targetUnits.length, 180);
  const matched = new Array<boolean>(targetUnits.length).fill(false);

  if (n === 0 || m === 0) return matched;

  // DP table (m+1) x (n+1) using Uint16Array for speed & low memory
  const rows: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = 1; i <= m; i++) {
    const tUnit = targetUnits[i - 1];
    const row = rows[i];
    const prevRow = rows[i - 1];
    for (let j = 1; j <= n; j++) {
      if (unitsMatch(tUnit, origUnits[j - 1])) {
        row[j] = prevRow[j - 1] + 1;
      } else {
        row[j] = prevRow[j] >= row[j - 1] ? prevRow[j] : row[j - 1];
      }
    }
  }

  // Backtrack aligned pairs
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (unitsMatch(targetUnits[i - 1], origUnits[j - 1])) {
      matched[i - 1] = true;
      i--;
      j--;
    } else if (rows[i - 1][j] >= rows[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matched;
}

function findBestOriginalChunk(targetUnits: SplitUnit[], index: OriginalIndex): OrigChunk | null {
  const targetContent: string[] = [];
  for (const u of targetUnits) {
    if (!STOPWORDS.has(u.norm) && u.norm.length >= 2) {
      targetContent.push(u.norm);
    }
  }
  if (targetContent.length === 0) return null;

  const targetContentSet = new Set(targetContent);
  let best: OrigChunk | null = null;
  let bestScore = 0;

  for (const chunk of index.chunks) {
    if (chunk.contentUnits.size === 0) continue;

    let hitCount = 0;
    for (const tc of targetContent) {
      if (chunk.contentUnits.has(tc) || chunk.stemCounts.has(canonicalStem(tc))) {
        hitCount++;
      }
    }
    if (hitCount === 0) continue;

    let reverseHits = 0;
    for (const cc of chunk.contentUnits) {
      if (targetContentSet.has(cc)) reverseHits++;
    }

    const recall = hitCount / targetContent.length;
    const precision = reverseHits / chunk.contentUnits.size;
    // Favor chunks that cover most of the tailored line while breaking ties toward tight line matches
    const score = 0.7 * recall + 0.3 * precision;

    const minHitsRequired = targetContent.length <= 3 ? 1 : 2;
    if (hitCount >= minHitsRequired && score > bestScore && score >= 0.25) {
      bestScore = score;
      best = chunk;
    }
  }

  return best;
}

function hasConsecutive3GramMatch(units: string[], threeGrams: Set<string>): boolean[] {
  const matched = new Array<boolean>(units.length).fill(false);
  for (let i = 0; i + 2 < units.length; i++) {
    const key = `${units[i]}\0${units[i + 1]}\0${units[i + 2]}`;
    if (threeGrams.has(key)) {
      matched[i] = true;
      matched[i + 1] = true;
      matched[i + 2] = true;
    }
  }
  return matched;
}

function annotateBodyLine(
  lineBody: string,
  origIndex: OriginalIndex,
  isSkillsSection: boolean
): string {
  const segments = splitMarkdownSegments(lineBody);
  const { tokens, units } = tokenizeSegments(segments);
  if (tokens.length === 0 || units.length === 0) return lineBody;

  const targetNorms = units.map((u) => u.norm);

  // Full verbatim check against original wrapped 3+ word streams:
  // If every unit is covered by contiguous original text and matches chunk tightly, zero highlights needed.
  const bestChunk = findBestOriginalChunk(units, origIndex);
  const matchedUnitFlags = new Array<boolean>(units.length).fill(false);

  if (bestChunk) {
    const lcsFlags = computeLcsMatches(bestChunk.units, targetNorms);
    const remainingCounts = new Map<string, number>(bestChunk.unitCounts);
    const remainingStems = new Map<string, number>(bestChunk.stemCounts);

    // 1. Consume LCS-aligned tokens
    for (let i = 0; i < units.length; i++) {
      if (lcsFlags[i]) {
        matchedUnitFlags[i] = true;
        const u = units[i].norm;
        const st = canonicalStem(u);
        remainingCounts.set(u, Math.max(0, (remainingCounts.get(u) ?? 0) - 1));
        remainingStems.set(st, Math.max(0, (remainingStems.get(st) ?? 0) - 1));
      }
    }

    // 2. Intra-bullet reordered clause tolerance (unused multiset + stem budget from the same original chunk)
    for (let i = 0; i < units.length; i++) {
      if (matchedUnitFlags[i]) continue;
      const u = units[i].norm;
      if (STOPWORDS.has(u) || u.length < 2) continue;

      const cLeft = remainingCounts.get(u) ?? 0;
      const st = canonicalStem(u);
      const sLeft = remainingStems.get(st) ?? 0;

      if (cLeft > 0) {
        matchedUnitFlags[i] = true;
        remainingCounts.set(u, cLeft - 1);
        remainingStems.set(st, Math.max(0, sLeft - 1));
      } else if (u.length >= 4 && sLeft > 0) {
        matchedUnitFlags[i] = true;
        remainingStems.set(st, sLeft - 1);
      }
    }
  }

  // 3. Protect copied 3+ word stretches anywhere in the original resume
  const gramFlags = hasConsecutive3GramMatch(targetNorms, origIndex.threeGrams);
  for (let i = 0; i < units.length; i++) {
    if (gramFlags[i]) matchedUnitFlags[i] = true;
  }

  // 4. Skills section / categorized list guard:
  //    Never highlight skills that already existed anywhere in the original resume,
  //    nor bold category labels like "**Languages & Databases:**" at the start of a line.
  const isCategoryPrefixLine =
    isSkillsSection ||
    /^(?:\*\*[^*]{1,45}:\*\*|[A-Za-z][A-Za-z0-9 &/,-]{1,35}:)\s+/.test(lineBody);

  // Map unit-level decisions cleanly back to whole visual tokens
  const tokenChanged = new Array<boolean>(tokens.length).fill(false);
  for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
    const tok = tokens[tIdx];
    const subUnits = units.filter((u) => u.visualTokenIndex === tIdx);
    const unitStartIdx = units.findIndex((u) => u.visualTokenIndex === tIdx);
    if (tok.isStopwordOnly) {
      tokenChanged[tIdx] = false;
      continue;
    }

    // Skip structural category label inside bold/first segment before ":" on skills/category lines
    if (isCategoryPrefixLine && tok.segIdx === 0) {
      const colonIdx = segments[0].text.indexOf(':');
      if (
        (segments[0].delim === '**' && segments[0].text.trim().endsWith(':')) ||
        (colonIdx !== -1 && tok.endInSeg <= colonIdx)
      ) {
        tokenChanged[tIdx] = false;
        continue;
      }
    }

    let hasChangedNonStopwordSub = false;
    for (let k = 0; k < subUnits.length; k++) {
      const subU = subUnits[k].norm;
      if (STOPWORDS.has(subU)) continue;

      const isMatched = matchedUnitFlags[unitStartIdx + k];
      if (!isMatched) {
        if (isSkillsSection) {
          const alreadyInOrig =
            origIndex.allContentSet.has(subU) ||
            (subU.length >= 4 && origIndex.allStemSet.has(canonicalStem(subU)));
          if (!alreadyInOrig) {
            hasChangedNonStopwordSub = true;
            break;
          }
        } else {
          hasChangedNonStopwordSub = true;
          break;
        }
      }
    }
    tokenChanged[tIdx] = hasChangedNonStopwordSub;
  }

  // 5. Within each inline formatting segment, bridge short stopword-only gaps between changed tokens
  //    so phrases like "designing scalable ETL and observability pipelines" stay one smooth span.
  //    Never bridge across different formatting segments (**bold** / plain boundaries).
  const spansBySeg = new Map<number, Array<{ startToken: number; endToken: number }>>();

  let idx = 0;
  while (idx < tokens.length) {
    if (!tokenChanged[idx]) {
      idx++;
      continue;
    }
    const segIdx = tokens[idx].segIdx;
    const spanStart = idx;
    let spanEnd = idx;

    let probe = idx + 1;
    while (probe < tokens.length && tokens[probe].segIdx === segIdx) {
      if (tokenChanged[probe]) {
        spanEnd = probe;
        probe++;
        continue;
      }
      // Check whether gap [spanEnd+1 .. nextChanged-1] consists solely of stopwords within this segment
      let lookahead = probe;
      let gapValid = true;
      let gapStopCount = 0;
      while (lookahead < tokens.length && tokens[lookahead].segIdx === segIdx && !tokenChanged[lookahead]) {
        if (!tokens[lookahead].isStopwordOnly || gapStopCount >= 2) {
          gapValid = false;
          break;
        }
        // Do not bridge across sentence boundaries (. ; :)
        const prevTok = tokens[lookahead - 1];
        const between = segments[segIdx].text.slice(prevTok.endInSeg, tokens[lookahead].startInSeg);
        if (/[.;:!?]/.test(between)) {
          gapValid = false;
          break;
        }
        gapStopCount++;
        lookahead++;
      }

      if (
        gapValid &&
        lookahead < tokens.length &&
        tokens[lookahead].segIdx === segIdx &&
        tokenChanged[lookahead]
      ) {
        const prevTok = tokens[lookahead - 1];
        const between = segments[segIdx].text.slice(prevTok.endInSeg, tokens[lookahead].startInSeg);
        if (!/[.;:!?]/.test(between)) {
          spanEnd = lookahead;
          probe = lookahead + 1;
          continue;
        }
      }
      break;
    }

    const list = spansBySeg.get(segIdx) ?? [];
    list.push({ startToken: spanStart, endToken: spanEnd });
    spansBySeg.set(segIdx, list);
    idx = spanEnd + 1;
  }

  // 6. Reconstruct line segments wrapping only confirmed changed spans in ==...==
  let output = '';
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const spans = spansBySeg.get(sIdx);
    if (!spans || spans.length === 0) {
      output += `${seg.delim}${seg.text}${seg.delim}`;
      continue;
    }

    let rebuilt = '';
    let cursor = 0;
    for (const sp of spans) {
      const startOffset = tokens[sp.startToken].startInSeg;
      const endOffset = tokens[sp.endToken].endInSeg;
      const inner = seg.text.slice(startOffset, endOffset);
      // Safety guard: never wrap text containing "==" or leading/trailing whitespace
      if (inner.includes('==') || !inner.trim()) {
        rebuilt += seg.text.slice(cursor, endOffset);
      } else {
        rebuilt += `${seg.text.slice(cursor, startOffset)}==${inner}==`;
      }
      cursor = endOffset;
    }
    rebuilt += seg.text.slice(cursor);
    output += `${seg.delim}${rebuilt}${seg.delim}`;
  }

  return output;
}

/**
 * Annotate genuine AI changes in `tailoredMarkdown` relative to `originalResumeText`
 * using `==...==` highlight markers, while excluding headers, headings, protected
 * sections (Education, Certifications, Awards, etc.), and unchanged resume content.
 */
export function annotateResumeChanges(
  originalResumeText: string,
  tailoredMarkdown: string
): string {
  if (!tailoredMarkdown) return '';
  const cleanTailored = stripHighlightMarkers(tailoredMarkdown);
  if (!originalResumeText || !originalResumeText.trim()) {
    return cleanTailored;
  }

  const origIndex = indexOriginalResume(originalResumeText);
  if (origIndex.fullStream.length === 0) {
    return cleanTailored;
  }

  const lines = cleanTailored.split(/\r?\n/);
  const resultLines: string[] = [];

  let inHeader = true;
  let isProtectedSection = false;
  let isSkillsSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      resultLines.push(rawLine);
      continue;
    }

    // Track ## sections
    if (trimmed.startsWith('## ')) {
      inHeader = false;
      const headingText = trimmed.slice(3).replace(/\*\*(.+?)\*\*/g, '$1').trim();
      isProtectedSection = PROTECTED_SECTION_RE.test(headingText);
      isSkillsSection = !isProtectedSection && SKILLS_SECTION_RE.test(headingText);
      resultLines.push(rawLine);
      continue;
    }

    // Never highlight header block, # / ### headings, or horizontal rules
    if (
      inHeader ||
      isProtectedSection ||
      trimmed.startsWith('# ') ||
      trimmed.startsWith('### ') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('===')
    ) {
      resultLines.push(rawLine);
      continue;
    }

    // Preserve indentation + bullet list marker ("- ", "* ", or "1. ")
    const listMatch = rawLine.match(/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/);
    if (listMatch) {
      const annotatedBody = annotateBodyLine(listMatch[2], origIndex, isSkillsSection);
      resultLines.push(`${listMatch[1]}${annotatedBody}`);
    } else {
      const leadingWsMatch = rawLine.match(/^(\s*)(.+)$/);
      if (leadingWsMatch) {
        const annotatedBody = annotateBodyLine(leadingWsMatch[2], origIndex, isSkillsSection);
        resultLines.push(`${leadingWsMatch[1]}${annotatedBody}`);
      } else {
        resultLines.push(rawLine);
      }
    }
  }

  return resultLines.join('\n');
}
