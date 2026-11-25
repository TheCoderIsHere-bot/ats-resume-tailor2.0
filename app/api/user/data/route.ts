import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { rateLimit, buildRateLimitHeaders } from '@/lib/rateLimit';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/user/data';

export async function GET(request: NextRequest) {
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

    // Rate limit: 60 profile refreshes per user per 5 minutes
    const rl = rateLimit(`user-data:${user.id}`, { limit: 60, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: 'user-data',
        limit: 60,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    // Server-side privileged DB read strictly scoped to verified user.id
    const serviceClient = await createServiceClient();
    const [{ data: userData, error: userErr }, { data: genData, error: genErr }] =
      await Promise.all([
        serviceClient
          .from('users')
          .select('tokens_balance, master_resume_filename, master_resume_text')
          .eq('id', user.id)
          .single(),
        serviceClient
          .from('generations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

    if (userErr && userErr.code !== 'PGRST116') {
      logApiError(request, ROUTE, userErr, { userId: user.id, statusCode: 500, context: 'users_select' });
    }
    if (genErr) {
      logApiError(request, ROUTE, genErr, { userId: user.id, statusCode: 500, context: 'generations_select' });
    }

    return NextResponse.json({
      userData: userData ?? null,
      generations: genData ?? [],
    });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to load user data.' }, { status: 500 });
  }
}
