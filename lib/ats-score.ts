/**
 * lib/ats-score.ts
 * ─────────────────────────────────────────────────────────────
 * Deterministic ATS scoring engine.
 *
 * Pipeline:
 *   1. extractJDKeywords()  — Gemini extracts structured data from JD (keywords only, no scoring)
 *   2. scoreResume()        — Pure algorithm: weighted keyword match + bonus checks
 *
 * This is NOT self-referential — the same AI that tailored the resume
 * does NOT score it. Extraction ≠ scoring.
 * ─────────────────────────────────────────────────────────────
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─── Types ────────────────────────────────────────────────────

export interface JDKeywords {
  required: string[];       // Must-have: skills, tools, technologies
  preferred: string[];      // Nice-to-have / preferred qualifications
  jobTitle: string;
  requiredYears: number;    // 0 if not specified
  educationLevel: string;   // e.g. "Bachelor's", "Master's", "" if not specified
}

export interface ATSScoreBreakdown {
  requiredMatched: string[];
  requiredMissed: string[];
  preferredMatched: string[];
  preferredMissed: string[];
  requiredScore: number;   // 0–70 points
  preferredScore: number;  // 0–20 points
  bonusScore: number;      // 0–10 points
  total: number;           // 0–100
}

export interface ATSScoreResult {
  score: number | null;   // null = not enough JD data to score reliably
  insufficientData?: boolean;
  breakdown: ATSScoreBreakdown | null;
  matchedKeywords: string[];
  missedKeywords: string[];
}

// ─── JD Keyword Extraction (Gemini — extraction only, no scoring) ─────────────

const EXTRACTION_PROMPT = `You are a structured data extractor. Extract keyword data from the job description below.

Return ONLY a valid JSON object with exactly these keys:
- "required": array of strings — hard required skills, tools, technologies, and qualifications (e.g. "Python", "AWS", "5+ years", "REST APIs")
- "preferred": array of strings — preferred/nice-to-have skills (from "preferred", "bonus", "nice to have" sections)
- "jobTitle": string — the exact job title
- "requiredYears": number — minimum years of experience required (0 if not stated)
- "educationLevel": string — minimum education (e.g. "Bachelor's", "Master's", "" if not stated)

Rules:
- required and preferred should each have 5–25 items
- Extract specific, concrete terms only (no vague phrases like "good communicator")
- Do not include company name, benefits, or compensation
- Do not score anything
- Return only the JSON object, no other text`;

export async function extractJDKeywords(jdText: string): Promise<JDKeywords> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `${EXTRACTION_PROMPT}\n\nJOB DESCRIPTION:\n${jdText}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(raw);

  return {
    required: Array.isArray(parsed.required) ? parsed.required.map(String) : [],
    preferred: Array.isArray(parsed.preferred) ? parsed.preferred.map(String) : [],
    jobTitle: typeof parsed.jobTitle === 'string' ? parsed.jobTitle : '',
    requiredYears: typeof parsed.requiredYears === 'number' ? parsed.requiredYears : 0,
    educationLevel: typeof parsed.educationLevel === 'string' ? parsed.educationLevel : '',
  };
}

// ─── Text normalization helpers ───────────────────────────────

/** Normalize a string for matching: lowercase, remove punctuation, collapse spaces */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s+#]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Basic stemming: strip common English suffixes */
function stem(word: string): string {
  return word
    .replace(/ing$/, '')
    .replace(/tion$/, '')
    .replace(/tions$/, '')
    .replace(/ed$/, '')
    .replace(/er$/, '')
    .replace(/ment$/, '')
    .replace(/ments$/, '')
    .replace(/s$/, '');
}

/**
 * Common tech synonym groups — if any member of a group is in the resume,
 * we count a keyword from the same group as matched.
 */
const SYNONYM_GROUPS: string[][] = [
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['natural language processing', 'nlp'],
  ['large language model', 'llm', 'llms'],
  ['retrieval augmented generation', 'rag'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['node.js', 'nodejs', 'node'],
  ['react.js', 'reactjs', 'react'],
  ['next.js', 'nextjs', 'next'],
  ['postgresql', 'postgres'],
  ['mongodb', 'mongo'],
  ['kubernetes', 'k8s'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp', 'google cloud'],
  ['microsoft azure', 'azure'],
  ['continuous integration', 'ci/cd', 'ci cd', 'cicd'],
  ['version control', 'git'],
  ['restful api', 'rest api', 'rest apis', 'rest'],
  ['graphql', 'graph ql'],
  ['python', 'py'],
  ['r language', 'r programming'],
  ['data science', 'data scientist'],
  ['deep learning', 'dl'],
  ['computer vision', 'cv'],
  ['bachelor', "bachelor's", 'b.tech', 'b.e', 'be', 'bs', 'b.s'],
  ['master', "master's", 'm.tech', 'm.e', 'me', 'ms', 'm.s'],
];

function getSynonyms(term: string): Set<string> {
  const n = normalize(term);
  const group = SYNONYM_GROUPS.find(g => g.some(s => normalize(s) === n));
  return group ? new Set(group.map(normalize)) : new Set([n]);
}

/** Check if a keyword (possibly multi-word) appears in the resume text */
function keywordInText(keyword: string, resumeNorm: string, resumeWords: string[]): boolean {
  const normKw = normalize(keyword);

  // 1. Direct substring match (handles multi-word like "machine learning")
  if (resumeNorm.includes(normKw)) return true;

  // 2. Synonym match
  const synonyms = getSynonyms(keyword);
  for (const syn of synonyms) {
    if (resumeNorm.includes(syn)) return true;
  }

  // 3. Stemmed single-word match
  const kwWords = normKw.split(' ');
  if (kwWords.length === 1) {
    const stemKw = stem(kwWords[0]);
    if (resumeWords.some(w => stem(w) === stemKw && stemKw.length > 3)) return true;
  }

  return false;
}

// ─── Experience year extraction ───────────────────────────────

function extractYearsFromResume(resumeText: string): number {
  // Look for patterns like "X years of experience" or "X+ years"
  const matches = resumeText.match(/(\d+)\+?\s*years?/gi);
  if (!matches) return 0;
  const nums = matches.map(m => parseInt(m)).filter(n => n > 0 && n < 50);
  return nums.length ? Math.max(...nums) : 0;
}

function educationInResume(resumeText: string, required: string): boolean {
  if (!required) return true; // not specified = give benefit of doubt
  const normResume = normalize(resumeText);
  const synonyms = getSynonyms(required);
  return [...synonyms].some(s => normResume.includes(s));
}

// ─── Scoring algorithm ────────────────────────────────────────

/**
 * Score a resume against extracted JD keywords.
 * Completely deterministic — no AI involvement.
 *
 * Weight distribution:
 *   Required keywords  → 70 points max
 *   Preferred keywords → 20 points max
 *   Bonus (exp + edu)  → 10 points max
 */
export function scoreResume(resumeText: string, keywords: JDKeywords): ATSScoreResult {
  const resumeNorm = normalize(resumeText);
  const resumeWords = resumeNorm.split(' ');

  // ── Guard: too few keywords to score reliably ────────────
  const totalKeywords = keywords.required.length + keywords.preferred.length;
  if (totalKeywords < 3) {
    return {
      score: null,
      insufficientData: true,
      breakdown: null,
      matchedKeywords: [],
      missedKeywords: [],
    };
  }

  // ── Required keyword matching ─────────────────────────────
  const requiredMatched: string[] = [];
  const requiredMissed: string[] = [];

  for (const kw of keywords.required) {
    if (keywordInText(kw, resumeNorm, resumeWords)) {
      requiredMatched.push(kw);
    } else {
      requiredMissed.push(kw);
    }
  }

  // ── Preferred keyword matching ────────────────────────────
  const preferredMatched: string[] = [];
  const preferredMissed: string[] = [];

  for (const kw of keywords.preferred) {
    if (keywordInText(kw, resumeNorm, resumeWords)) {
      preferredMatched.push(kw);
    } else {
      preferredMissed.push(kw);
    }
  }

  // ── Score calculation ─────────────────────────────────────
  // Only compute ratio when denominator > 0; otherwise skip that component
  const requiredScore = keywords.required.length > 0
    ? Math.round((requiredMatched.length / keywords.required.length) * 70)
    : 0;  // No required keywords → 0 pts for that section (not 70)

  const preferredScore = keywords.preferred.length > 0
    ? Math.round((preferredMatched.length / keywords.preferred.length) * 20)
    : 0;  // No preferred keywords → 0 pts for that section (not 20)

  // Bonus: experience years match (5 pts) + education level match (5 pts)
  let bonusScore = 0;
  const resumeYears = extractYearsFromResume(resumeText);
  if (keywords.requiredYears === 0 || resumeYears >= keywords.requiredYears) bonusScore += 5;
  if (educationInResume(resumeText, keywords.educationLevel)) bonusScore += 5;

  const total = Math.min(100, requiredScore + preferredScore + bonusScore);

  // Combine for display (matched = required + preferred matched, capped at 8 for display)
  const allMatched = [...requiredMatched, ...preferredMatched];
  const allMissed = requiredMissed.slice(0, 8); // cap at 8 most important

  return {
    score: total,
    breakdown: {
      requiredMatched, requiredMissed,
      preferredMatched, preferredMissed,
      requiredScore, preferredScore, bonusScore,
      total,
    },
    matchedKeywords: allMatched,
    missedKeywords: allMissed,
  };
}

// ─── Convenience: score both original and tailored in one call ─

export interface BeforeAfterScore {
  scoreBefore: ATSScoreResult;
  scoreAfter: ATSScoreResult;
  keywords: JDKeywords;
}

export async function computeBeforeAfterScore(
  originalResumeText: string,
  tailoredResumeText: string,
  jdText: string
): Promise<BeforeAfterScore> {
  const keywords = await extractJDKeywords(jdText);
  const scoreBefore = scoreResume(originalResumeText, keywords);
  const scoreAfter = scoreResume(tailoredResumeText, keywords);
  return { scoreBefore, scoreAfter, keywords };
}
