import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are an elite technical recruiter and ATS optimization expert. Your task is to tailor a candidate's resume to match a specific job description.

INPUT:
1. Candidate's Master Resume.
2. Target Job Description.

RULES:
- DO NOT invent any new work experience, degrees, or skills the candidate does not actually possess.
- The input resume text may contain garbled characters or symbols (such as \u00d3, \u2122, Q, \u02c6, \u2021, \u00a1, \ufffd, etc.) caused by PDF font extraction. These are usually icons for phone, email, location, LinkedIn, GitHub, etc. Clean them up: remove them entirely or replace with standard text labels (e.g. "Email:", "Phone:", "LinkedIn:", "GitHub:"). Never include garbled or non-standard characters in the output.
- Rewrite the "Professional Summary" to align heavily with the tone and requirements of the Job Description.
- Seamlessly integrate exact keywords from the Job Description into the bullet points.
- If the context of the existing experience supports it, reframe bullet points to emphasize the most relevant skills and outcomes for the target role.
- Format the output in clean Markdown with clear section headers (##).
- Additionally, write a concise, 3-paragraph Cover Letter addressed to the Hiring Manager based on the aligned skills.

OUTPUT FORMAT:
Return ONLY a valid JSON object with exactly these keys:
- "tailored_resume": a string containing the full tailored resume in Markdown
- "cover_letter": a string containing the cover letter in Markdown
- "ats_score": a number from 0 to 100 representing how well the tailored resume matches the job description (consider keyword coverage, experience alignment, and skills match)
- "matched_keywords": an array of strings listing the key terms from the job description that were successfully integrated into the tailored resume
- "job_title": a string containing the job title extracted from the job description
- "company_name": a string containing the company name extracted from the job description

Do not include any text before or after the JSON object.`;

interface GenerationResult {
  tailored_resume: string;
  cover_letter: string;
  ats_score: number;
  matched_keywords: string[];
  job_title: string;
  company_name: string;
}

export async function generateTailoredContent(
  resumeText: string,
  jobDescription: string
): Promise<GenerationResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `${SYSTEM_PROMPT}

---
CANDIDATE'S MASTER RESUME:
${resumeText}

---
TARGET JOB DESCRIPTION:
${jobDescription}
---

Return the JSON object now:`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown code fences if Gemini wraps the JSON
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed: GenerationResult = JSON.parse(cleaned);

  if (!parsed.tailored_resume || !parsed.cover_letter) {
    throw new Error('Invalid response structure from AI');
  }

  // Safe defaults for new fields
  parsed.ats_score = typeof parsed.ats_score === 'number' ? Math.min(100, Math.max(0, Math.round(parsed.ats_score))) : 0;
  parsed.matched_keywords = Array.isArray(parsed.matched_keywords) ? parsed.matched_keywords : [];
  parsed.job_title = parsed.job_title || 'Untitled Role';
  parsed.company_name = parsed.company_name || 'Unknown Company';

  return parsed;
}
