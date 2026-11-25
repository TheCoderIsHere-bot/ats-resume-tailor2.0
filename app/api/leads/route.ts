import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, getRateLimitKey } from '@/lib/rateLimit';
import { isValidEmail, canonicalizeEmail } from '@/lib/auth/security';
import { logRateLimitExceeded, logApiError } from '@/lib/securityLogger';

const ROUTE = '/api/leads';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 lead submissions per IP per 15 minutes
    const rl = rateLimit(getRateLimitKey(request, ':leads'), { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        limitKey: 'leads',
        limit: 5,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { email: rawEmail } = await request.json();

    if (!rawEmail || !isValidEmail(rawEmail)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const email = canonicalizeEmail(rawEmail);
    const supabase = await createServiceClient();
    const { error } = await supabase.from('leads').insert({ email });

    // 23505 = unique_violation — email already exists, treat as success
    if (error && error.code !== '23505') {
      logApiError(request, ROUTE, error, { statusCode: 500, context: 'leads_insert' });
      return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logApiError(request, ROUTE, err, { statusCode: 500 });
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
