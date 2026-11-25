import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { rateLimit, buildRateLimitHeaders } from '@/lib/rateLimit';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/user/transactions';

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

    // Rate limit: 30 billing history checks per user per 10 minutes
    const rl = rateLimit(`user-tx:${user.id}`, { limit: 30, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: 'user-tx',
        limit: 30,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    // Server-side privileged DB read strictly scoped to verified user.id
    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('transactions')
      .select('id, amount_inr, tokens_added, created_at')
      .eq('user_id', user.id)
      .eq('status', 'Success')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      logApiError(request, ROUTE, error, { userId: user.id, statusCode: 500, context: 'transactions_select' });
      return NextResponse.json({ error: 'Failed to load transactions.' }, { status: 500 });
    }

    return NextResponse.json({ transactions: data ?? [] });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Failed to load transactions.' }, { status: 500 });
  }
}
