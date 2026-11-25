import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateTailoredContent } from '@/lib/gemini';
import { extractJDKeywords, scoreResume } from '@/lib/ats-score';
import { annotateResumeChanges, stripHighlightMarkers } from '@/lib/resumeDiff';
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

const ROUTE = '/api/generate';

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    const supabase = await createClient();

    // 1. Authenticate
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

    // 2. Multi-layer AI Abuse Rate Limiting:
    //    - Per-User Burst: 5 / 10 min
    //    - Per-User Daily Quota: 30 / 24h
    //    - Per-IP Hourly Quota: 15 / 1h (blocks multi-account token farming from one IP)
    //    - Per-IP Daily Quota: 45 / 24h
    const rl = rateLimitMulti([
      {
        key: `generate:user-10m:${user.id}`,
        name: 'user_10m',
        limit: 5,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: `generate:user-24h:${user.id}`,
        name: 'user_24h',
        limit: 30,
        windowMs: 24 * 60 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':generate-ip-1h'),
        name: 'ip_1h',
        limit: 15,
        windowMs: 60 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':generate-ip-24h'),
        name: 'ip_24h',
        limit: 45,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);

    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: rl.blockedBy ?? 'generate',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      const waitSec = Math.ceil(rl.resetInMs / 1000);
      return NextResponse.json(
        { error: `AI generation rate limit reached. Please wait ${waitSec}s before trying again.` },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    // 3. Prevent concurrent parallel AI generation bursts from the same user
    const lock = acquireConcurrencyLock(`gen-lock:${user.id}`, 1, 120 * 1000);
    if (!lock.acquired) {
      return NextResponse.json(
        { error: 'An application generation is already in progress. Please wait for it to finish.' },
        { status: 429, headers: { 'Retry-After': '15' } }
      );
    }

    try {
      // 4. Strict JSON payload, field allowlist, control-char stripping & length validation
      const parsedBody = await parseJsonObject(request);
      if (!parsedBody.ok) {
        return NextResponse.json({ error: parsedBody.error }, { status: 400 });
      }
      if (!hasOnlyAllowedKeys(parsedBody.data, ['resumeText', 'jobDescription'])) {
        return NextResponse.json({ error: 'Unexpected fields in request body.' }, { status: 400 });
      }

      const jdValidation = validateAndSanitizeText(parsedBody.data.jobDescription, {
        minLength: 10,
        maxLength: 30000,
        allowNewlines: true,
        label: 'Job description',
      });
      if (!jdValidation.ok) {
        return NextResponse.json({ error: jdValidation.error }, { status: 400 });
      }

      const resumeValidation = validateAndSanitizeText(parsedBody.data.resumeText, {
        minLength: 50,
        maxLength: 50000,
        allowNewlines: true,
        label: 'Resume text',
      });
      if (!resumeValidation.ok) {
        return NextResponse.json({ error: resumeValidation.error }, { status: 400 });
      }

      const resumeText = resumeValidation.text;
      const jobDescription = jdValidation.text;

      // Use privileged server client for DB/RPC calls (direct public DB access is revoked)
      const serviceClient = await createServiceClient();

      // 5. Check token balance (read-only, no deduction yet)
      const { data: userData, error: balanceError } = await serviceClient
        .from('users')
        .select('tokens_balance')
        .eq('id', user.id)
        .single();

      if (balanceError || !userData || userData.tokens_balance <= 0) {
        return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
      }

      // 6. Run tailoring + JD keyword extraction IN PARALLEL
      const [tailoredResult, jdKeywords] = await Promise.all([
        generateTailoredContent(resumeText, jobDescription),
        extractJDKeywords(jobDescription).catch((e) => {
          logApiError(request, ROUTE, e, { userId: user.id, statusCode: 200, context: 'jd_keyword_extraction_nonblocking' });
          return null;
        }),
      ]);

      const {
        tailored_resume: rawTailoredResume,
        cover_letter,
        job_title,
        company_name,
      } = tailoredResult;

      const cleanTailoredResume = stripHighlightMarkers(rawTailoredResume);

      // 7. Compute before/after scores on clean tailored markdown before diff annotation
      let scoreBefore = null;
      let scoreAfter = null;
      if (jdKeywords) {
        try {
          const rawBefore = scoreResume(resumeText, jdKeywords);
          const rawAfter = scoreResume(cleanTailoredResume, jdKeywords);
          if (!rawBefore.insufficientData) scoreBefore = rawBefore;
          if (!rawAfter.insufficientData) scoreAfter = rawAfter;
        } catch (scoreErr) {
          logApiError(request, ROUTE, scoreErr, { userId: user.id, statusCode: 200, context: 'ats_scoring_nonblocking' });
        }
      }

      // Annotate only genuine AI changes against original resume (excluding Education/Certifications/header)
      const tailored_resume = annotateResumeChanges(resumeText, cleanTailoredResume);

      // 8. Atomically deduct token via server-only RPC
      const { data: rpcResult, error: rpcError } = await serviceClient
        .rpc('deduct_token', { p_user_id: user.id });

      if (rpcError || rpcResult === -1) {
        return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
      }

      // 9. Save generation to DB (with persistent scores and graceful column fallbacks)
      const basePayload = {
        user_id: user.id,
        job_description: jobDescription,
        tailored_resume,
        cover_letter,
        job_title,
        company_name,
      };

      const scorePayload = {
        ...basePayload,
        ats_score: scoreAfter?.score ?? null,
        score_before: scoreBefore?.score ?? null,
        score_breakdown: scoreAfter?.breakdown ?? null,
        matched_keywords: scoreAfter?.matchedKeywords ?? [],
        missed_keywords: scoreAfter?.missedKeywords ?? [],
      };

      const fullPayload = {
        ...scorePayload,
        original_resume: resumeText,
      };

      const isMissingColumnError = (err: { message?: string; code?: string } | null) =>
        !!err && (err.message?.includes('column') || err.code === '42703' || err.code === 'PGRST204');

      let { data: generation, error: genError } = await serviceClient
        .from('generations')
        .insert(fullPayload)
        .select()
        .single();

      // Fallback 1: if original_resume column isn't in DB yet, still preserve ATS score columns
      if (isMissingColumnError(genError)) {
        const retryScores = await serviceClient
          .from('generations')
          .insert(scorePayload)
          .select()
          .single();
        generation = retryScores.data;
        genError = retryScores.error;
      }

      // Fallback 2: if score columns have not been added yet in Supabase
      if (isMissingColumnError(genError)) {
        const fallback = await serviceClient
          .from('generations')
          .insert(basePayload)
          .select()
          .single();
        generation = fallback.data;
        genError = fallback.error;
      }

      if (genError || !generation) {
        logApiError(request, ROUTE, genError, { userId: user.id, statusCode: 500, context: 'generation_insert' });
        await serviceClient.rpc('refund_token', { p_user_id: user.id });
        return NextResponse.json({ error: 'Failed to save generation. Your token has been refunded.' }, { status: 500 });
      }

      return NextResponse.json(
        {
          generation: {
            ...generation,
            original_resume: generation.original_resume ?? resumeText,
            ats_score: scoreAfter?.score ?? null,
            score_before: scoreBefore?.score ?? null,
            score_breakdown: scoreAfter?.breakdown ?? null,
            matched_keywords: scoreAfter?.matchedKeywords ?? [],
            missed_keywords: scoreAfter?.missedKeywords ?? [],
          },
          score_before: scoreBefore?.score ?? null,
          score_after: scoreAfter?.score ?? null,
          score_breakdown: scoreAfter?.breakdown ?? null,
          matched_keywords: scoreAfter?.matchedKeywords ?? [],
          missed_keywords: scoreAfter?.missedKeywords ?? [],
          ats_score: scoreAfter?.score ?? null,
        },
        { headers: buildRateLimitHeaders(rl) }
      );
    } finally {
      lock.release();
    }
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 });
  }
}
