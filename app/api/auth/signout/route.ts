import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuthEvent, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/auth/signout';

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;

    const { error } = await supabase.auth.signOut();
    if (error) {
      logApiError(request, ROUTE, error, { userId, statusCode: 500 });
      return NextResponse.json({ error: 'Sign out failed.' }, { status: 500 });
    }

    logAuthEvent(request, 'AUTH_SIGNOUT', {
      route: ROUTE,
      userId: userId ?? 'anonymous',
      statusCode: 200,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Sign out failed.' }, { status: 500 });
  }
}
