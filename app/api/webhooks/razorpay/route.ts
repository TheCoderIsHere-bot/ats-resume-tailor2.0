import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { getOptionalServerEnv } from '@/lib/env';
import {
  getClientIp,
  getRequestId,
  logApiError,
  logSecurityEvent,
} from '@/lib/securityLogger';
import { recordSuspiciousSignal } from '@/lib/trafficMonitor';
import { isPlainObject, isValidUuid, validateRazorpayId } from '@/lib/validation';

const ROUTE = '/api/webhooks/razorpay';
const TOKENS_PER_BUNDLE = 10;
const PRICE_INR = 250;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');
  const requestId = getRequestId(request.headers);

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      logSecurityEvent({
        eventType: 'SECURITY_VIOLATION',
        severity: 'warn',
        route: ROUTE,
        method: request.method,
        ip,
        userAgent,
        requestId,
        statusCode: 400,
        details: { violation: 'MISSING_WEBHOOK_SIGNATURE' },
      });
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const webhookSecret = getOptionalServerEnv('RAZORPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      logApiError(request, ROUTE, new Error('RAZORPAY_WEBHOOK_SECRET is unconfigured'), { statusCode: 500 });
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
      const signal = recordSuspiciousSignal(ip, 'BAD_SIGNATURE');
      logSecurityEvent({
        eventType: signal.escalated ? 'TRAFFIC_ANOMALY' : 'SECURITY_VIOLATION',
        severity: signal.escalated ? 'critical' : 'warn',
        route: ROUTE,
        method: request.method,
        ip,
        userAgent,
        requestId,
        statusCode: 401,
        details: {
          violation: 'INVALID_WEBHOOK_SIGNATURE',
          badSignatureAttempts10m: signal.count,
        },
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!isPlainObject(parsed)) {
        return NextResponse.json({ error: 'Invalid webhook payload shape' }, { status: 400 });
      }
      payload = parsed;
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const event = typeof payload.event === 'string' ? payload.event : '';

    if (event === 'payment.captured') {
      const paymentWrapper = isPlainObject(payload.payload) ? payload.payload : null;
      const paymentContainer = paymentWrapper && isPlainObject(paymentWrapper.payment) ? paymentWrapper.payment : null;
      const payment = paymentContainer && isPlainObject(paymentContainer.entity) ? paymentContainer.entity : null;
      const notes = payment && isPlainObject(payment.notes) ? payment.notes : null;

      const orderId = validateRazorpayId(payment?.order_id, 'order_');
      const paymentId = validateRazorpayId(payment?.id, 'pay_');
      const userId = isValidUuid(notes?.user_id) ? notes.user_id.trim() : null;
      const rawTokens = notes?.tokens_to_add;
      const tokensToAdd =
        typeof rawTokens === 'number'
          ? rawTokens
          : typeof rawTokens === 'string'
            ? Number.parseInt(rawTokens, 10)
            : TOKENS_PER_BUNDLE;
      const amountPaise = payment?.amount;

      if (
        !userId ||
        !orderId ||
        !paymentId ||
        !Number.isInteger(tokensToAdd) ||
        tokensToAdd <= 0 ||
        tokensToAdd > 1000 ||
        typeof amountPaise !== 'number' ||
        !Number.isFinite(amountPaise) ||
        amountPaise < 100
      ) {
        logApiError(request, ROUTE, new Error('Invalid or missing payment metadata'), { statusCode: 400 });
        return NextResponse.json({ error: 'Invalid payment metadata' }, { status: 400 });
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
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        razorpay_payment_id: paymentId,
        amount_inr: Math.round(amountPaise / 100) || PRICE_INR,
        tokens_added: tokensToAdd,
        status: 'Success',
      });

      if (txError) {
        logApiError(request, ROUTE, txError, { userId, statusCode: 500, context: 'transaction_insert' });
      }

      // Atomically add tokens (prevents race conditions with concurrent webhooks)
      const { error: rpcError } = await supabase
        .rpc('add_tokens', { p_user_id: userId, p_amount: tokensToAdd });

      if (rpcError) {
        logApiError(request, ROUTE, rpcError, { userId, statusCode: 500, context: 'add_tokens_rpc' });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logApiError(request, ROUTE, error, { statusCode: 500 });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
