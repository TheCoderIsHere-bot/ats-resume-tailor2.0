import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, getRateLimitKey } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 lead submissions per IP per 15 minutes
    const rl = rateLimit(getRateLimitKey(request, ':leads'), { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from('leads').insert({ email });

    // 23505 = unique_violation — email already exists, treat as success
    if (error && error.code !== '23505') {
      return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
