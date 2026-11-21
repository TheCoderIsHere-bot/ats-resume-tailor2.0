import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 20 parses per user per 10 minutes
    const rl = rateLimit(`parse:${user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // unpdf: serverless-safe PDF parser (no canvas/native deps, works on Vercel)
      const { extractText } = await import('unpdf');
      const { text: extractedText } = await extractText(new Uint8Array(buffer), { mergePages: true });
      text = extractedText;
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a PDF or .docx file.' }, { status: 400 });
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: 'Could not extract text from the file. Please ensure it is not image-only.' }, { status: 422 });
    }

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error('parse-resume error:', error);
    return NextResponse.json({ error: 'Failed to parse resume.' }, { status: 500 });
  }
}
