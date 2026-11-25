import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { rateLimitMulti, buildRateLimitHeaders } from '@/lib/rateLimit';
import { parseResumeFile } from '@/lib/parseResume';
import {
  getClientIp,
  getRequestId,
  logAuthEvent,
  logRateLimitExceeded,
  logApiError,
  logSecurityEvent,
} from '@/lib/securityLogger';

const ROUTE = '/api/user/master-resume';

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

    // Rate limit: 10 / 10min & 30 / 24h per user
    const rl = rateLimitMulti([
      {
        key: `master-resume:10m:${user.id}`,
        name: 'user_10m',
        limit: 10,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: `master-resume:24h:${user.id}`,
        name: 'user_24h',
        limit: 30,
        windowMs: 24 * 60 * 60 * 1000,
      },
    ]);
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: rl.blockedBy ?? 'master-resume',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many uploads. Please wait a moment.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const parsed = await parseResumeFile(file);
    if (!parsed.ok) {
      if (parsed.securityViolation) {
        logSecurityEvent({
          eventType: 'SECURITY_VIOLATION',
          severity: 'warn',
          route: ROUTE,
          method: request.method,
          ip: getClientIp(request.headers),
          userId: user.id,
          userAgent: request.headers.get('user-agent'),
          requestId: getRequestId(request.headers),
          statusCode: parsed.status,
          details: { violation: parsed.securityViolation },
        });
      }
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const serviceClient = await createServiceClient();
    const storagePath = `${user.id}/master_resume${parsed.ext}`;

    // Clean up stale master resume file if extension changed (e.g. .pdf -> .docx)
    const { data: existingUser } = await serviceClient
      .from('users')
      .select('master_resume_path')
      .eq('id', user.id)
      .single();

    if (
      existingUser?.master_resume_path &&
      existingUser.master_resume_path !== storagePath &&
      existingUser.master_resume_path.startsWith(`${user.id}/`)
    ) {
      await serviceClient.storage.from('resumes').remove([existingUser.master_resume_path]);
    }

    const { error: uploadError } = await serviceClient.storage
      .from('resumes')
      .upload(storagePath, parsed.buffer, {
        contentType: parsed.contentType,
        upsert: true,
      });

    if (uploadError) {
      logApiError(request, ROUTE, uploadError, {
        userId: user.id,
        statusCode: 500,
        context: 'storage_upload',
      });
      return NextResponse.json({ error: 'Failed to store resume file.' }, { status: 500 });
    }

    const { error: updateError } = await serviceClient
      .from('users')
      .update({
        master_resume_filename: parsed.safeFilename,
        master_resume_text: parsed.text,
        master_resume_path: storagePath,
      })
      .eq('id', user.id);

    if (updateError) {
      logApiError(request, ROUTE, updateError, {
        userId: user.id,
        statusCode: 500,
        context: 'users_update',
      });
      return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
    }

    return NextResponse.json({
      filename: parsed.safeFilename,
      text: parsed.text,
    });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to save master resume.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    const serviceClient = await createServiceClient();
    const { data: ud } = await serviceClient
      .from('users')
      .select('master_resume_path')
      .eq('id', user.id)
      .single();

    if (ud?.master_resume_path && ud.master_resume_path.startsWith(`${user.id}/`)) {
      await serviceClient.storage.from('resumes').remove([ud.master_resume_path]);
    }

    const { error: updateError } = await serviceClient
      .from('users')
      .update({
        master_resume_filename: null,
        master_resume_text: null,
        master_resume_path: null,
      })
      .eq('id', user.id);

    if (updateError) {
      logApiError(request, ROUTE, updateError, {
        userId: user.id,
        statusCode: 500,
        context: 'users_clear_master_resume',
      });
      return NextResponse.json({ error: 'Failed to remove master resume.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to remove master resume.' }, { status: 500 });
  }
}
