import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateTailoredContent } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Atomically deduct a token (prevents race conditions with concurrent requests)
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('deduct_token', { p_user_id: user.id });

    if (rpcError || rpcResult === -1) {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
    }

    const body = await request.json();
    const { resumeText, jobDescription } = body as { resumeText: string; jobDescription: string };

    if (!jobDescription || jobDescription.trim().length < 10) {
      return NextResponse.json({ error: 'Job description is too short.' }, { status: 400 });
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json({ error: 'Resume text is too short or empty.' }, { status: 400 });
    }

    // Call Gemini
    const { tailored_resume, cover_letter, ats_score, matched_keywords, job_title, company_name } = await generateTailoredContent(resumeText, jobDescription);

    // Save generation to DB
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        job_description: jobDescription,
        tailored_resume: tailored_resume,
        cover_letter: cover_letter,
        job_title: job_title,
        company_name: company_name,
      })
      .select()
      .single();

    if (genError || !generation) {
      console.error('DB insert error:', genError);
      return NextResponse.json({ error: 'Failed to save generation.' }, { status: 500 });
    }

    return NextResponse.json({ generation, ats_score, matched_keywords });
  } catch (error) {
    console.error('generate error:', error);
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 });
  }
}
