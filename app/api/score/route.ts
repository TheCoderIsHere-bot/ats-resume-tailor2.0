import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractJDKeywords, scoreResume } from '@/lib/ats-score';
import {
  rateLimitMulti,
  buildRateLimitHeaders,
  acquireConcurrencyLock,
  getRateLimitKey,
} from '@/lib/rateLimit';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';
import {
  parseJsonObject,
  hasOnlyAllowedKeys,
  validateAndSanitizeText,
} from '@/lib/validation';

const ROUTE = '/api/score';

// Lightweight scoring-only endpoint — calls Gemini for JD keyword extraction.
// Protected by strict burst + daily + IP quotas to prevent free Gemini spend abuse.
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

    // Multi-layer AI Scoring Rate Limit (burst + daily + IP cap)
    const rl = rateLimitMulti([
      {
        key: `score:user-10m:${user.id}`,
        name: 'user_10m',
        limit: 10,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: `score:user-24h:${user.id}`,
        name: 'user_24h',
        limit: 30,
        windowMs: 24 * 60 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':score-ip-1h'),
        name: 'ip_1h',
        limit: 20,
        windowMs: 60 * 60 * 1000,
      },
    ]);

    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: rl.blockedBy ?? 'score',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many scoring requests. Please wait a moment.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const lock = acquireConcurrencyLock(`score-lock:${user.id}`, 2, 30 * 1000);
    if (!lock.acquired) {
      return NextResponse.json(
        { error: 'Too many concurrent scoring requests.' },
        { status: 429, headers: { 'Retry-After': '10' } }
      );
    }

    try {
      const parsedBody = await parseJsonObject(request);
      if (!parsedBody.ok || !hasOnlyAllowedKeys(parsedBody.data, ['resumeText', 'jobDescription'])) {
        return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
      }

      const resumeValidation = validateAndSanitizeText(parsedBody.data.resumeText, {
        minLength: 50,
        maxLength: 50000,
        allowNewlines: true,
        label: 'Resume text',
      });
      const jdValidation = validateAndSanitizeText(parsedBody.data.jobDescription, {
        minLength: 10,
        maxLength: 30000,
        allowNewlines: true,
        label: 'Job description',
      });

      if (!resumeValidation.ok || !jdValidation.ok) {
        return NextResponse.json({ score: null }, { headers: buildRateLimitHeaders(rl) });
      }

      const jdKeywords = await extractJDKeywords(jdValidation.text);
      const result = scoreResume(resumeValidation.text, jdKeywords);

      if (result.insufficientData) {
        return NextResponse.json({ score: null }, { headers: buildRateLimitHeaders(rl) });
      }

      return NextResponse.json(
        {
          score: result.score,
          breakdown: result.breakdown,
          matchedKeywords: result.matchedKeywords,
          missedKeywords: result.missedKeywords,
        },
        { headers: buildRateLimitHeaders(rl) }
      );
    } finally {
      lock.release();
    }
  } catch (err) {
    logApiError(request, ROUTE, err, { userId, statusCode: 200, context: 'score_nonblocking' });
    return NextResponse.json({ score: null });
  }
}
