import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

const TOKENS_PER_BUNDLE = 10;
const PRICE_INR = 250;

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret || webhookSecret.startsWith('your_')) {
      console.error('RAZORPAY_WEBHOOK_SECRET is unconfigured');
      return NextResponse.json({ error: 'Webhook secret unconfigured' }, { status: 500 });
    }

    // Verify HMAC-SHA256 signature using timing-safe comparison to prevent side-channel leaks
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (
      expectedBuf.length !== signatureBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event as string;

    if (event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      const orderId = payment?.order_id as string;
      const paymentId = payment?.id as string;
      const userId = payment?.notes?.user_id as string;
      const tokensToAdd = parseInt(payment?.notes?.tokens_to_add ?? String(TOKENS_PER_BUNDLE), 10);
      const amountPaise = payment?.amount as number;

      if (!userId || !orderId || !paymentId) {
        return NextResponse.json({ error: 'Missing payment metadata' }, { status: 400 });
      }

      const supabase = await createServiceClient();

      // Idempotency: skip if payment already recorded
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('razorpay_payment_id', paymentId)
        .single();

      if (existing) {
        return NextResponse.json({ status: 'already_processed' });
      }

      // Insert transaction record
      await supabase.from('transactions').insert({
        user_id: userId,
        razorpay_payment_id: paymentId,
        amount_inr: Math.round(amountPaise / 100) || PRICE_INR,
        tokens_added: tokensToAdd,
        status: 'Success',
      });

      // Atomically add tokens (prevents race conditions with concurrent webhooks)
      const { error: rpcError } = await supabase
        .rpc('add_tokens', { p_user_id: userId, p_amount: tokensToAdd });

      if (rpcError) {
        console.error('Token credit error:', rpcError);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
