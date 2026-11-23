import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';
import Razorpay from 'razorpay';

const TOKENS_PER_BUNDLE = 10;
const PRICE_INR = 25000; // ₹250 in paise

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit order creation (max 10 orders per 10 minutes per user)
    const rl = rateLimit(`order:${user.id}`, { limit: 10, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret || keyId.startsWith('your_')) {
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
    });
  } catch (error) {
    console.error('create-order error:', error);
    return NextResponse.json({ error: 'Could not create payment order.' }, { status: 500 });
  }
}
