import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitMulti, buildRateLimitHeaders, getRateLimitKey } from '@/lib/rateLimit';
import { getOptionalServerEnv } from '@/lib/env';
import { logAuthEvent, logRateLimitExceeded, logApiError } from '@/lib/securityLogger';
import Razorpay from 'razorpay';

const ROUTE = '/api/payment/create-order';
const TOKENS_PER_BUNDLE = 10;
const PRICE_INR = 25000; // ₹250 in paise

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

    // Rate limit order creation: 10 / 10min per user & 20 / 1h per IP
    const rl = rateLimitMulti([
      {
        key: `order:user-10m:${user.id}`,
        name: 'user_10m',
        limit: 10,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: getRateLimitKey(request, ':order-ip-1h'),
        name: 'ip_1h',
        limit: 20,
        windowMs: 60 * 60 * 1000,
      },
    ]);
    if (!rl.allowed) {
      logRateLimitExceeded(request, ROUTE, {
        userId: user.id,
        limitKey: rl.blockedBy ?? 'create-order',
        limit: rl.limit,
        resetInMs: rl.resetInMs,
      });
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const keyId = getOptionalServerEnv('RAZORPAY_KEY_ID') ?? getOptionalServerEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID');
    const keySecret = getOptionalServerEnv('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      logApiError(request, ROUTE, new Error('Payment gateway credentials unconfigured'), {
        userId: user.id,
        statusCode: 503,
      });
      return NextResponse.json({ error: 'Payment gateway is currently unconfigured.' }, { status: 503 });
    }

    // Initialize inside handler so env vars are available at runtime, not build time
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const body = await request.json();
    const tokens: number = body.tokens ?? TOKENS_PER_BUNDLE;

    // Strict validation: positive integer, bounded between 10 and 100, multiple of bundle
    if (
      typeof tokens !== 'number' ||
      !Number.isInteger(tokens) ||
      tokens < TOKENS_PER_BUNDLE ||
      tokens > 100 ||
      tokens % TOKENS_PER_BUNDLE !== 0
    ) {
      return NextResponse.json({ error: 'Invalid token bundle requested.' }, { status: 400 });
    }

    const amount = Math.round((tokens / TOKENS_PER_BUNDLE) * PRICE_INR);

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      notes: {
        user_id: user.id,
        tokens_to_add: String(tokens),
      },
    });

    return NextResponse.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (error) {
    logApiError(request, ROUTE, error, { userId, statusCode: 500 });
    return NextResponse.json({ error: 'Could not create payment order.' }, { status: 500 });
  }
}
