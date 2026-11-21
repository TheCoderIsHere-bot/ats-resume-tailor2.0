import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePdf } from '@/lib/pdf';
import { generateDocx } from '@/lib/docx';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { generationId, type, format = 'pdf' } = body as {
      generationId: string;
      type: 'resume' | 'cover_letter';
      format?: 'pdf' | 'docx';
    };

    if (!generationId || !type) {
      return NextResponse.json({ error: 'Missing generationId or type' }, { status: 400 });
    }

    // Fetch generation — RLS ensures user can only access their own
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .select('tailored_resume, cover_letter, user_id')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (genError || !generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const markdown = type === 'resume'
      ? generation.tailored_resume
      : generation.cover_letter;

    const filename = type === 'resume' ? 'tailored_resume' : 'cover_letter';

    if (format === 'docx') {
      const docxBytes = await generateDocx(markdown);
      return new NextResponse(Buffer.from(docxBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filename}.docx"`,
        },
      });
    }

    const pdfBytes = await generatePdf(markdown);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (error) {
    console.error('download error:', error);
    return NextResponse.json({ error: 'Failed to generate file.' }, { status: 500 });
  }
}
