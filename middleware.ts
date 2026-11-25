import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  detectBotOrScriptRequest,
  detectCrossSiteApiAbuse,
  detectSuspiciousProbe,
  isIpTemporarilyBanned,
  recordSuspiciousSignal,
  trackApiTrafficBurst,
  trackPageTraffic,
  banIpTemporarily,
} from '@/lib/trafficMonitor';
import { getClientIp, getRequestId, logSecurityEvent } from '@/lib/securityLogger';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB (covers 5 MB file + multipart boundary overhead)
const MAX_DOC_API_BYTES = 512 * 1024; // 512 KB (covers max 50k resume + 30k JD + 200k editedHtml)
const MAX_SMALL_API_BYTES = 128 * 1024; // 128 KB for auth/leads/payment/score

function getPayloadLimitBytes(pathname: string): number {
  if (pathname.startsWith('/api/parse-resume') || pathname.startsWith('/api/user/master-resume')) {
    return MAX_UPLOAD_BYTES;
  }
  if (pathname.startsWith('/api/generate') || pathname.startsWith('/api/download')) {
    return MAX_DOC_API_BYTES;
  }
  return MAX_SMALL_API_BYTES;
}

/**
 * Abuse Protection, Bot Mitigation, HTTPS Enforcement & Session Middleware
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');
  const requestId = getRequestId(request.headers);
  const isWebhook = pathname.startsWith('/api/webhooks/');

  // 1. Enforce HTTPS in production (behind TLS-terminating reverse proxies)
  if (process.env.NODE_ENV === 'production') {
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const hostname = request.nextUrl.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

    if (!isLocal && forwardedProto === 'http') {
      const httpsUrl = request.nextUrl.clone();
      httpsUrl.protocol = 'https:';
      httpsUrl.port = '';
      return NextResponse.redirect(httpsUrl, 308);
    }
  }

  // 2. Immediately reject temporarily banned abusive IPs (skipping external payment webhooks)
  if (!isWebhook) {
    const banStatus = isIpTemporarilyBanned(ip);
    if (banStatus.banned) {
      return NextResponse.json(
        { error: 'Temporarily blocked due to unusual or abusive traffic. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(banStatus.retryAfterSec) },
        }
      );
    }
  }

  // 3. Detect & block recon, path traversal, and vulnerability scanner probes
  const probeReason = detectSuspiciousProbe(pathname, userAgent);
  if (probeReason) {
    recordSuspiciousSignal(ip, 'BOT_PROBE');
    logSecurityEvent({
      eventType: 'TRAFFIC_ANOMALY',
      severity: 'warn',
      route: pathname,
      method: request.method,
      ip,
      userAgent,
      requestId,
      statusCode: 404,
      details: { anomaly: probeReason },
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 4. Block automated scripts, scrapers, and missing User-Agent bots (never block external webhooks)
  if (!isWebhook) {
    const botReason = detectBotOrScriptRequest(pathname, userAgent);
    if (botReason) {
      const signal = recordSuspiciousSignal(ip, 'BOT_PROBE');
      logSecurityEvent({
        eventType: 'TRAFFIC_ANOMALY',
        severity: signal.escalated ? 'critical' : 'warn',
        route: pathname,
        method: request.method,
        ip,
        userAgent,
        requestId,
        statusCode: 403,
        details: { anomaly: botReason, probeCount10m: signal.count },
      });
      return NextResponse.json({ error: 'Automated access is not permitted.' }, { status: 403 });
    }
  }

  // 5. Block cross-site / untrusted-origin mutating API calls
  const crossSiteAbuse = detectCrossSiteApiAbuse(request);
  if (crossSiteAbuse) {
    logSecurityEvent({
      eventType: 'SECURITY_VIOLATION',
      severity: 'warn',
      route: pathname,
      method: request.method,
      ip,
      userAgent,
      requestId,
      statusCode: 403,
      details: { violation: crossSiteAbuse },
    });
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  // 6. Early payload size guard on API routes
  if (pathname.startsWith('/api/') && !isWebhook) {
    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      const maxBytes = getPayloadLimitBytes(pathname);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        return NextResponse.json({ error: 'Request payload too large.' }, { status: 413 });
      }
    }
  }

  // 7. Traffic rate limiting (API bursts + public page scraping protection)
  if ((pathname.startsWith('/api/') && !isWebhook) || pathname.startsWith('/auth/')) {
    const burst = trackApiTrafficBurst(ip);
    if (burst.isBurstWarn || burst.shouldBlock) {
      logSecurityEvent({
        eventType: 'TRAFFIC_ANOMALY',
        severity: burst.shouldBlock ? 'critical' : 'warn',
        route: pathname,
        method: request.method,
        ip,
        userAgent,
        requestId,
        statusCode: burst.shouldBlock ? 429 : undefined,
        details: {
          anomaly: burst.shouldBlock ? 'EXTREME_TRAFFIC_FLOOD' : 'API_TRAFFIC_SPIKE',
          requestsIn60s: burst.count,
        },
      });
    }

    if (burst.shouldBlock) {
      banIpTemporarily(ip);
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  } else if (!isWebhook) {
    const pageLimit = trackPageTraffic(ip);
    if (!pageLimit.allowed) {
      logSecurityEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        severity: 'warn',
        route: pathname,
        method: request.method,
        ip,
        userAgent,
        requestId,
        statusCode: 429,
        details: { anomaly: 'PAGE_SCRAPE_RATE_LIMIT', requestsIn60s: pageLimit.count },
      });
      return NextResponse.json(
        { error: 'Too many page requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(pageLimit.retryAfterSec) } }
      );
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Webhooks authenticate via HMAC signatures, not Supabase browser session cookies
  if (isWebhook) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            })
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
