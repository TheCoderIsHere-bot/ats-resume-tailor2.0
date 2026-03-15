import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText({ pageJoiner: '' });
      text = result.text;
      await parser.destroy();
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
