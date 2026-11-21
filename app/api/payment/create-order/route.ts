import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Razorpay from 'razorpay';

const TOKENS_PER_BUNDLE = 10;
const PRICE_INR = 25000; // ₹250 in paise

export async function POST(request: NextRequest) {
  try {
    // Initialize inside handler so env vars are available at runtime, not build time
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const tokens: number = body.tokens ?? TOKENS_PER_BUNDLE;

    // Only support the fixed bundle for now
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
