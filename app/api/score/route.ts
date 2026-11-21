import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractJDKeywords, scoreResume } from '@/lib/ats-score';

// Lightweight scoring-only endpoint — used to re-score archive items on demand.
// No token deduction; just extracts JD keywords and scores the provided resume text.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { resumeText, jobDescription } = await request.json() as {
      resumeText: string;
      jobDescription: string;
    };

    if (!resumeText || !jobDescription) {
      return NextResponse.json({ score: null });
    }

    const jdKeywords = await extractJDKeywords(jobDescription);
    const result = scoreResume(resumeText, jdKeywords);

    if (result.insufficientData) {
      return NextResponse.json({ score: null });
    }

    return NextResponse.json({
      score: result.score,
      breakdown: result.breakdown,
      matchedKeywords: result.matchedKeywords,
      missedKeywords: result.missedKeywords,
    });
  } catch (err) {
    console.warn('Scoring archive item error:', err);
    // Non-blocking — scoring failure should never surface as an error to the user
    return NextResponse.json({ score: null });
  }
}
