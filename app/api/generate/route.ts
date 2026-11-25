import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateTailoredContent } from '@/lib/gemini';
import { extractJDKeywords, scoreResume } from '@/lib/ats-score';
import { rateLimit } from '@/lib/rateLimit';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

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

    // 2. Rate limit: 5 generations per user per 10 minutes
    const rl = rateLimit(`generate:${user.id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: 'generate',
        limit: 5,
        resetInMs: rl.resetInMs,
      });
      const waitSec = Math.ceil(rl.resetInMs / 1000);
      return NextResponse.json(
        { error: `Too many requests. Please wait ${waitSec}s before trying again.` },
        { status: 429 }
      );
    }

    // 3. Validate inputs (lower & upper bounds to prevent Gemini token-exhaustion DoS)
    const body = await request.json();
    const { resumeText, jobDescription } = body as { resumeText: string; jobDescription: string };

    if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length < 10) {
      return NextResponse.json({ error: 'Job description is too short.' }, { status: 400 });
    }
    if (jobDescription.length > 30000) {
      return NextResponse.json({ error: 'Job description exceeds maximum allowed length (30,000 characters).' }, { status: 400 });
    }
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length < 50) {
      return NextResponse.json({ error: 'Resume text is too short or empty.' }, { status: 400 });
    }
    if (resumeText.length > 50000) {
      return NextResponse.json({ error: 'Resume text exceeds maximum allowed length (50,000 characters).' }, { status: 400 });
    }

    // Use privileged server client for DB/RPC calls (direct public DB access is revoked)
    const serviceClient = await createServiceClient();

    // 4. Check token balance (read-only, no deduction yet)
    const { data: userData, error: balanceError } = await serviceClient
      .from('users')
      .select('tokens_balance')
      .eq('id', user.id)
      .single();

    if (balanceError || !userData || userData.tokens_balance <= 0) {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
    }

    // 5. Run tailoring + JD keyword extraction IN PARALLEL
    const [tailoredResult, jdKeywords] = await Promise.all([
      generateTailoredContent(resumeText, jobDescription),
      extractJDKeywords(jobDescription).catch((e) => {
        logApiError(request, ROUTE, e, { userId: user.id, statusCode: 200, context: 'jd_keyword_extraction_nonblocking' });
        return null;
      }),
    ]);

    const { tailored_resume, cover_letter, job_title, company_name } = tailoredResult;

    // 6. Compute before/after scores using the already-extracted keywords
    let scoreBefore = null;
    let scoreAfter = null;
    if (jdKeywords) {
      try {
        const rawBefore = scoreResume(resumeText, jdKeywords);
        const rawAfter = scoreResume(tailored_resume, jdKeywords);
        if (!rawBefore.insufficientData) scoreBefore = rawBefore;
        if (!rawAfter.insufficientData) scoreAfter = rawAfter;
      } catch (scoreErr) {
        logApiError(request, ROUTE, scoreErr, { userId: user.id, statusCode: 200, context: 'ats_scoring_nonblocking' });
      }
    }

    // 7. Atomically deduct token via server-only RPC
    const { data: rpcResult, error: rpcError } = await serviceClient
      .rpc('deduct_token', { p_user_id: user.id });

    if (rpcError || rpcResult === -1) {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
    }

    // 8. Save generation to DB (with persistent scores)
    const basePayload = {
      user_id: user.id,
      job_description: jobDescription,
      tailored_resume,
      cover_letter,
      job_title,
      company_name,
    };

    const fullPayload = {
      ...basePayload,
      ats_score: scoreAfter?.score ?? null,
      score_before: scoreBefore?.score ?? null,
      score_breakdown: scoreAfter?.breakdown ?? null,
      matched_keywords: scoreAfter?.matchedKeywords ?? [],
      missed_keywords: scoreAfter?.missedKeywords ?? [],
    };

    let { data: generation, error: genError } = await serviceClient
      .from('generations')
      .insert(fullPayload)
      .select()
      .single();

    // Fallback if score columns have not been added yet in Supabase
    if (genError && (genError.message?.includes('column') || genError.code === '42703')) {
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

    return NextResponse.json({
      generation: {
        ...generation,
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
    });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 });
  }
}
