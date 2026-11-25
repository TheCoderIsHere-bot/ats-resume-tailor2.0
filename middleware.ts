import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { detectSuspiciousProbe, trackApiTrafficBurst } from '@/lib/trafficMonitor';
import { getClientIp, getRequestId, logSecurityEvent } from '@/lib/securityLogger';

/**
 * Security, HTTPS Enforcement, Traffic Monitoring & Session Refresh Middleware
 *
 * Responsibilities:
 * 1. Redirects insecure HTTP traffic to HTTPS in production (non-localhost).
 * 2. Detects & blocks automated recon/path-traversal probes before rendering.
 * 3. Monitors API/Auth traffic bursts and throttles extreme single-IP floods.
 * 4. Validates and refreshes Supabase session tokens via getUser() with secure cookies.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');
  const requestId = getRequestId(request.headers);

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

  // 2. Detect & block recon, path traversal, and vulnerability scanner probes
  const probeReason = detectSuspiciousProbe(pathname, userAgent);
  if (probeReason) {
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

  // 3. Detect unusual API/Auth traffic bursts per IP
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
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
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Webhooks authenticate via HMAC signatures, not Supabase browser session cookies
  if (pathname.startsWith('/api/webhooks/')) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase environment is unconfigured (e.g. during build or initial setup), continue
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

  // IMPORTANT: supabase.auth.getUser() sends a request to the Supabase Auth server
  // to revalidate the auth token and refresh it if necessary.
  // Never use getSession() inside middleware because it does not verify the JWT.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public static assets: svg, png, jpg, jpeg, gif, webp, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
