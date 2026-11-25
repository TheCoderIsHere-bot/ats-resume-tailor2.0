import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractJDKeywords, scoreResume } from '@/lib/ats-score';
import { rateLimit } from '@/lib/rateLimit';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/score';

// Lightweight scoring-only endpoint — used to re-score archive items on demand.
// No token deduction; just extracts JD keywords and scores the provided resume text.
export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      logAuthEvent(request, 'AUTH_FAILURE', {
        route: ROUTE,
        reason: authError?.message ?? 'missing_session',
        statusCode: 401,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    userId = user.id;

    // Rate limit: 20 requests per user per 10 minutes
    const rl = rateLimit(`score:${user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: 'score',
        limit: 20,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const { resumeText, jobDescription } = await request.json() as {
      resumeText: string;
      jobDescription: string;
    };

    if (
      !resumeText ||
      typeof resumeText !== 'string' ||
      !jobDescription ||
      typeof jobDescription !== 'string' ||
      jobDescription.trim().length < 10 ||
      jobDescription.length > 30000 ||
      resumeText.length > 50000
    ) {
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
    logApiError(request, ROUTE, err, { userId, statusCode: 200, context: 'score_nonblocking' });
    // Non-blocking — scoring failure should never surface as an error to the user
    return NextResponse.json({ score: null });
  }
}
