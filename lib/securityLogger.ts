import { recordSuspiciousSignal } from './trafficMonitor';

/**
 * Structured Security & Audit Logger (Edge & Node Runtime Compatible)
 *
 * Emits structured JSON log events for ingestion by Vercel Runtime Logs / SIEM tools:
 * - Authentication attempts, successes, failures, and sign-outs
 * - API errors with request correlation IDs
 * - Rate-limit breaches and traffic anomalies (bursts, probes, repeated auth failures)
 *
 * Strictly avoids logging sensitive credentials, JWTs, cookies, or full PII.
 */

export type SecurityEventType =
  | 'AUTH_ATTEMPT'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'AUTH_SIGNOUT'
  | 'API_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'TRAFFIC_ANOMALY'
  | 'SECURITY_VIOLATION';

export type SecuritySeverity = 'info' | 'warn' | 'error' | 'critical';

interface SecurityLogPayload {
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  route: string;
  method?: string;
  ip?: string;
  userId?: string;
  userAgent?: string | null;
  requestId?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

const alertCooldownStore = new Map<string, number>();

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip')?.trim();
  return realIp || 'unknown';
}

export function getRequestId(headers: Headers): string {
  const existing = headers.get('x-vercel-id') || headers.get('x-request-id');
  if (existing) return existing.slice(0, 64);
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now()}`;
}

/**
 * Mask email addresses in audit logs (e.g. "ya***@gmail.com") so incidents can be
 * correlated without exposing full user PII in log aggregators.
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

function dispatchSecurityAlert(record: Record<string, unknown>) {
  // Optional out-of-band alerting webhook (Slack, Discord, SIEM, PagerDuty)
  const webhookUrl = typeof process !== 'undefined' ? process.env?.SECURITY_ALERT_WEBHOOK_URL?.trim() : undefined;
  if (!webhookUrl || !webhookUrl.startsWith('https://')) return;

  const alertKey = `${String(record.eventType)}:${String(record.ip)}:${String(record.route)}`;
  const now = Date.now();
  const lastAlert = alertCooldownStore.get(alertKey) ?? 0;

  // Throttle identical alerts to once per 60 seconds to prevent alert storms
  if (now - lastAlert < 60 * 1000) return;
  if (alertCooldownStore.size > 1000) alertCooldownStore.clear();
  alertCooldownStore.set(alertKey, now);

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `[SECURITY ${String(record.severity).toUpperCase()}] ${String(record.eventType)} on ${String(record.route)} from ${String(record.ip)}`,
      event: record,
    }),
  }).catch(() => {
    // Non-blocking alerting; never throw inside logging
  });
}

export function logSecurityEvent(payload: SecurityLogPayload): void {
  const record = {
    timestamp: new Date().toISOString(),
    service: 'ats-resume-tailor',
    eventType: payload.eventType,
    severity: payload.severity,
    route: payload.route,
    method: payload.method ?? 'UNKNOWN',
    ip: payload.ip ?? 'unknown',
    userId: payload.userId ?? 'anonymous',
    requestId: payload.requestId,
    statusCode: payload.statusCode,
    userAgent: payload.userAgent ? payload.userAgent.slice(0, 160) : undefined,
    details: payload.details,
  };

  const line = JSON.stringify(record);
  if (payload.severity === 'critical' || payload.severity === 'error') {
    console.error(line);
  } else if (payload.severity === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }

  if (payload.severity === 'critical') {
    dispatchSecurityAlert(record);
  }
}

export function logAuthEvent(
  request: Request,
  eventType: 'AUTH_ATTEMPT' | 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'AUTH_SIGNOUT',
  options: {
    route?: string;
    userId?: string;
    email?: string;
    provider?: string;
    reason?: string;
    statusCode?: number;
  } = {}
): void {
  const ip = getClientIp(request.headers);
  const route = options.route ?? new URL(request.url).pathname;
  const userAgent = request.headers.get('user-agent');
  const requestId = getRequestId(request.headers);

  const severity: SecuritySeverity = eventType === 'AUTH_FAILURE' ? 'warn' : 'info';

  logSecurityEvent({
    eventType,
    severity,
    route,
    method: request.method,
    ip,
    userId: options.userId,
    userAgent,
    requestId,
    statusCode: options.statusCode,
    details: {
      ...(options.email ? { maskedEmail: maskEmail(options.email) } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.reason ? { reason: options.reason } : {}),
    },
  });

  if (eventType === 'AUTH_FAILURE') {
    const signal = recordSuspiciousSignal(ip, options.statusCode === 401 ? 'UNAUTHORIZED' : 'AUTH_FAIL');
    if (signal.escalated) {
      logSecurityEvent({
        eventType: 'TRAFFIC_ANOMALY',
        severity: 'critical',
        route,
        method: request.method,
        ip,
        userId: options.userId,
        userAgent,
        requestId,
        details: {
          anomaly: 'REPEATED_AUTH_FAILURES',
          failureCount10m: signal.count,
          reason: options.reason,
        },
      });
    }
  }
}

export function logRateLimitExceeded(
  request: Request,
  route: string,
  options: {
    userId?: string;
    limitKey?: string;
    limit?: number;
    resetInMs?: number;
  } = {}
): void {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');
  const requestId = getRequestId(request.headers);

  logSecurityEvent({
    eventType: 'RATE_LIMIT_EXCEEDED',
    severity: 'warn',
    route,
    method: request.method,
    ip,
    userId: options.userId,
    userAgent,
    requestId,
    statusCode: 429,
    details: {
      limitKey: options.limitKey,
      limit: options.limit,
      resetInSec: options.resetInMs ? Math.ceil(options.resetInMs / 1000) : undefined,
    },
  });

  const signal = recordSuspiciousSignal(ip, 'RATE_LIMIT');
  if (signal.escalated) {
    logSecurityEvent({
      eventType: 'TRAFFIC_ANOMALY',
      severity: 'critical',
      route,
      method: request.method,
      ip,
      userId: options.userId,
      userAgent,
      requestId,
      details: {
        anomaly: 'REPEATED_RATE_LIMIT_BREACHES',
        breachCount10m: signal.count,
      },
    });
  }
}

export function logApiError(
  request: Request,
  route: string,
  error: unknown,
  options: {
    userId?: string;
    statusCode?: number;
    context?: string;
  } = {}
): void {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');
  const requestId = getRequestId(request.headers);

  const errName = error instanceof Error ? error.name : 'UnknownError';
  const errMessage = error instanceof Error ? error.message : String(error);

  logSecurityEvent({
    eventType: 'API_ERROR',
    severity: (options.statusCode ?? 500) >= 500 ? 'error' : 'warn',
    route,
    method: request.method,
    ip,
    userId: options.userId,
    userAgent,
    requestId,
    statusCode: options.statusCode ?? 500,
    details: {
      errorName: errName,
      message: errMessage.slice(0, 300),
      ...(options.context ? { context: options.context } : {}),
    },
  });
}
