import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateTailoredContent } from '@/lib/gemini';
import { extractJDKeywords, scoreResume } from '@/lib/ats-score';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limit: 5 generations per user per 10 minutes
    const rl = rateLimit(`generate:${user.id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      const waitSec = Math.ceil(rl.resetInMs / 1000);
      return NextResponse.json(
        { error: `Too many requests. Please wait ${waitSec}s before trying again.` },
        { status: 429 }
      );
    }

    // 3. Validate inputs
    const body = await request.json();
    const { resumeText, jobDescription } = body as { resumeText: string; jobDescription: string };

    if (!jobDescription || jobDescription.trim().length < 10) {
      return NextResponse.json({ error: 'Job description is too short.' }, { status: 400 });
    }
    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json({ error: 'Resume text is too short or empty.' }, { status: 400 });
    }

    // 4. Check token balance (read-only, no deduction yet)
    const { data: userData, error: balanceError } = await supabase
      .from('users')
      .select('tokens_balance')
      .eq('id', user.id)
      .single();

    if (balanceError || !userData || userData.tokens_balance <= 0) {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
    }

    // 5. Run tailoring + JD keyword extraction IN PARALLEL
    //    Both are independent — keyword extraction only needs the JD, not the tailored resume.
    //    This saves 10-20 seconds vs running them sequentially.
    const [tailoredResult, jdKeywords] = await Promise.all([
      generateTailoredContent(resumeText, jobDescription),
      extractJDKeywords(jobDescription).catch((e) => {
        console.warn('JD keyword extraction failed:', e);
        return null; // non-blocking
      }),
    ]);

    const { tailored_resume, cover_letter, job_title, company_name } = tailoredResult;

    // 6. Compute before/after scores using the already-extracted keywords (no extra Gemini call)
    let scoreBefore = null;
    let scoreAfter = null;
    if (jdKeywords) {
      try {
        const rawBefore = scoreResume(resumeText, jdKeywords);
        const rawAfter = scoreResume(tailored_resume, jdKeywords);
        if (!rawBefore.insufficientData) scoreBefore = rawBefore;
        if (!rawAfter.insufficientData) scoreAfter = rawAfter;
      } catch (scoreErr) {
        console.warn('ATS scoring failed (non-blocking):', scoreErr);
      }
    }

    // 7. Atomically deduct token
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('deduct_token', { p_user_id: user.id });

    if (rpcError || rpcResult === -1) {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
    }

    // 8. Save generation to DB
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        job_description: jobDescription,
        tailored_resume,
        cover_letter,
        job_title,
        company_name,
      })
      .select()
      .single();

    if (genError || !generation) {
      console.error('DB insert error:', genError);
      await supabase.rpc('refund_token', { p_user_id: user.id });
      return NextResponse.json({ error: 'Failed to save generation. Your token has been refunded.' }, { status: 500 });
    }

    return NextResponse.json({
      generation,
      score_before: scoreBefore?.score ?? null,
      score_after: scoreAfter?.score ?? null,
      score_breakdown: scoreAfter?.breakdown ?? null,
      matched_keywords: scoreAfter?.matchedKeywords ?? [],
      missed_keywords: scoreAfter?.missedKeywords ?? [],
      ats_score: scoreAfter?.score ?? null,
    });
  } catch (error) {
    console.error('generate error:', error);
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 });
  }
}

