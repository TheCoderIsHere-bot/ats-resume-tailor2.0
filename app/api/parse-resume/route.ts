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

    // 1. Enforce strict max file size (5 MB limit prevents memory DOS / serverless crash)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File is too large. Maximum allowed size is 5MB.' },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 2. Validate file magic bytes to prevent disguised or malicious files
    const isPdfByExt = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isDocxByExt =
      file.name.toLowerCase().endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    const hasPdfMagic = buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    // DOCX / ZIP magic bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
    const hasDocxMagic =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;

    let text = '';

    if (isPdfByExt) {
      if (!hasPdfMagic) {
        return NextResponse.json(
          { error: 'Invalid PDF file. The file content does not match the PDF standard.' },
          { status: 400 }
        );
      }
      // unpdf: serverless-safe PDF parser (no canvas/native deps, works on Vercel)
      const { extractText } = await import('unpdf');
      const { text: extractedText } = await extractText(new Uint8Array(buffer), { mergePages: true });
      text = extractedText;
    } else if (isDocxByExt) {
      if (!hasDocxMagic) {
        return NextResponse.json(
          { error: 'Invalid DOCX file. The file content does not match the DOCX standard.' },
          { status: 400 }
        );
      }
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a valid PDF or .docx file.' },
        { status: 400 }
      );
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
