import type { NextRequest } from 'next/server';

/**
 * Edge & Node Compatible Abuse Protection, Bot Mitigation & Anomaly Monitor
 *
 * Detects & stops abusive automated behavior:
 * 1. Automated vulnerability scanner, path traversal, and exploit probes
 * 2. Automated HTTP scripting / scraping tools & headless browsers on API/Auth routes
 * 3. AI/Bulk web scrapers across public routes
 * 4. High-frequency API/Auth bursts and HTML scraping spikes
 * 5. Repeated security violations escalating to temporary IP bans
 * 6. Form honeypots & impossible-fast submission timing
 * 7. Cross-site / untrusted-origin mutating API calls
 */

interface WindowCounter {
  count: number;
  windowStart: number;
}

const burstStore = new Map<string, WindowCounter>();
const pageScrapeStore = new Map<string, WindowCounter>();
const signalStore = new Map<string, WindowCounter>();
const banStore = new Map<string, number>(); // ip -> bannedUntil timestamp

const MAX_TRACKED_ENTRIES = 10000;

const BURST_WINDOW_MS = 60 * 1000; // 1 minute
const BURST_WARN_THRESHOLD = 60;
const BURST_BLOCK_THRESHOLD = 120;

const PAGE_SCRAPE_WINDOW_MS = 60 * 1000; // 1 minute
const PAGE_SCRAPE_LIMIT = 100;

const SIGNAL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_BAN_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export type SuspiciousSignalType =
  | 'RATE_LIMIT'
  | 'AUTH_FAIL'
  | 'UNAUTHORIZED'
  | 'BAD_SIGNATURE'
  | 'IDOR_PROBE'
  | 'BOT_PROBE';

const SIGNAL_ESCALATION_THRESHOLDS: Record<SuspiciousSignalType, number> = {
  RATE_LIMIT: 3,
  AUTH_FAIL: 5,
  UNAUTHORIZED: 5,
  BAD_SIGNATURE: 2,
  IDOR_PROBE: 2,
  BOT_PROBE: 2,
};

function pruneOldEntries(store: Map<string, WindowCounter>, now: number, maxAgeMs: number) {
  if (store.size < MAX_TRACKED_ENTRIES) return;
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > maxAgeMs) {
      store.delete(key);
    }
  }
}

const SUSPICIOUS_PATH_PATTERNS = [
  '/.env',
  '/.git',
  '/.htaccess',
  '/.htpasswd',
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/phpmyadmin',
  '/xmlrpc.php',
  '/actuator',
  '/cgi-bin',
  '/vendor/phpunit',
  '/server-status',
  '/.aws/credentials',
];

const VULNERABILITY_SCANNER_UAS = [
  'sqlmap',
  'nikto',
  'nessus',
  'masscan',
  'zgrab',
  'nuclei',
  'gobuster',
  'dirbuster',
  'wfuzz',
  'hydra',
];

const BULK_SCRAPER_BOT_UAS = [
  'gptbot',
  'chatgpt-user',
  'ccbot',
  'bytespider',
  'claudebot',
  'anthropic-ai',
  'scrapy',
  'httrack',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'dotbot',
  'petalbot',
  'dataforseobot',
];

const SCRIPTING_CLIENT_UAS = [
  'curl/',
  'wget/',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'httpx/',
  'go-http-client',
  'axios/',
  'node-fetch',
  'undici',
  'libwww-perl',
  'java/',
  'postmanruntime',
  'insomnia/',
  'headlesschrome',
  'phantomjs',
  'playwright',
  'puppeteer',
  'selenium',
];

/**
 * Inspect incoming request path and User-Agent for automated recon, path traversal, or exploit probes.
 */
export function detectSuspiciousProbe(pathname: string, userAgent: string | null): string | null {
  const lowerPath = pathname.toLowerCase();

  if (
    lowerPath.includes('..') ||
    lowerPath.includes('%2e%2e') ||
    lowerPath.includes('\0') ||
    lowerPath.includes('%00')
  ) {
    return 'PATH_TRAVERSAL_OR_NULL_BYTE_PROBE';
  }

  for (const pattern of SUSPICIOUS_PATH_PATTERNS) {
    if (lowerPath === pattern || lowerPath.startsWith(`${pattern}/`) || lowerPath.endsWith(pattern)) {
      return `RECON_PROBE:${pattern}`;
    }
  }

  if (userAgent) {
    const lowerUa = userAgent.toLowerCase();
    for (const scanner of VULNERABILITY_SCANNER_UAS) {
      if (lowerUa.includes(scanner)) {
        return `SCANNER_USER_AGENT:${scanner}`;
      }
    }
  }

  return null;
}

/**
 * Detect automated bots, CLI scripts, headless browsers, and bulk scrapers.
 * Note: Never invoke on /api/webhooks/* so third-party payment webhooks (Razorpay) are never blocked.
 */
export function detectBotOrScriptRequest(pathname: string, userAgent: string | null): string | null {
  const lowerPath = pathname.toLowerCase();
  const isInteractiveApi = lowerPath.startsWith('/api/') || lowerPath.startsWith('/auth/');

  if (userAgent) {
    const lowerUa = userAgent.toLowerCase();
    for (const scraper of BULK_SCRAPER_BOT_UAS) {
      if (lowerUa.includes(scraper)) {
        return `BULK_SCRAPER_UA:${scraper}`;
      }
    }

    if (isInteractiveApi) {
      for (const client of SCRIPTING_CLIENT_UAS) {
        if (lowerUa.includes(client)) {
          return `AUTOMATED_SCRIPT_UA:${client}`;
        }
      }
    }
  }

  // Interactive API & auth endpoints require a realistic browser User-Agent
  if (isInteractiveApi && (!userAgent || userAgent.trim().length < 8)) {
    return 'MISSING_OR_MALFORMED_USER_AGENT';
  }

  return null;
}

/**
 * Enforce same-origin / Fetch-Metadata protections on mutating API calls to block
 * cross-site scripting abuse and automated external script invocations.
 */
export function detectCrossSiteApiAbuse(request: NextRequest): string | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  const pathname = request.nextUrl.pathname.toLowerCase();
  if (!pathname.startsWith('/api/') || pathname.startsWith('/api/webhooks/')) {
    return null;
  }

  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site') {
    return 'CROSS_SITE_FETCH_METADATA';
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      const requestHost = request.nextUrl.hostname.toLowerCase();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
      let configuredHost = '';
      if (appUrl) {
        try {
          configuredHost = new URL(appUrl).hostname.toLowerCase();
        } catch {
          configuredHost = '';
        }
      }

      if (originHost !== requestHost && (!configuredHost || originHost !== configuredHost)) {
        return `UNTRUSTED_ORIGIN:${originHost}`;
      }
    } catch {
      return 'MALFORMED_ORIGIN_HEADER';
    }
  }

  return null;
}

/**
 * Track per-IP request volume to API/Auth routes in a 60-second sliding window.
 */
export function trackApiTrafficBurst(ip: string): {
  isBurstWarn: boolean;
  shouldBlock: boolean;
  count: number;
} {
  const now = Date.now();
  pruneOldEntries(burstStore, now, BURST_WINDOW_MS * 2);

  const key = `burst:${ip}`;
  const entry = burstStore.get(key);

  if (!entry || now - entry.windowStart > BURST_WINDOW_MS) {
    burstStore.set(key, { count: 1, windowStart: now });
    return { isBurstWarn: false, shouldBlock: false, count: 1 };
  }

  entry.count += 1;
  return {
    isBurstWarn: entry.count === BURST_WARN_THRESHOLD,
    shouldBlock: entry.count > BURST_BLOCK_THRESHOLD,
    count: entry.count,
  };
}

/**
 * Rate limit page scraping on HTML/App Router routes per IP (100 requests/min).
 */
export function trackPageTraffic(ip: string): {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
} {
  const now = Date.now();
  pruneOldEntries(pageScrapeStore, now, PAGE_SCRAPE_WINDOW_MS * 2);

  const key = `page:${ip}`;
  const entry = pageScrapeStore.get(key);

  if (!entry || now - entry.windowStart > PAGE_SCRAPE_WINDOW_MS) {
    pageScrapeStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, count: 1, retryAfterSec: 60 };
  }

  entry.count += 1;
  const resetInMs = Math.max(1000, PAGE_SCRAPE_WINDOW_MS - (now - entry.windowStart));
  return {
    allowed: entry.count <= PAGE_SCRAPE_LIMIT,
    count: entry.count,
    retryAfterSec: Math.ceil(resetInMs / 1000),
  };
}

export function banIpTemporarily(ip: string, durationMs = DEFAULT_BAN_DURATION_MS): void {
  if (!ip || ip === 'unknown') return;
  const now = Date.now();
  if (banStore.size >= MAX_TRACKED_ENTRIES) {
    for (const [k, until] of banStore.entries()) {
      if (now > until) banStore.delete(k);
    }
  }
  banStore.set(ip, now + durationMs);
}

export function isIpTemporarilyBanned(ip: string): {
  banned: boolean;
  retryAfterSec: number;
} {
  if (!ip || ip === 'unknown') return { banned: false, retryAfterSec: 0 };
  const until = banStore.get(ip);
  if (!until) return { banned: false, retryAfterSec: 0 };

  const now = Date.now();
  if (now >= until) {
    banStore.delete(ip);
    return { banned: false, retryAfterSec: 0 };
  }

  return {
    banned: true,
    retryAfterSec: Math.max(1, Math.ceil((until - now) / 1000)),
  };
}

/**
 * Record repeated suspicious security events per IP.
 * Automatically imposes a temporary IP ban once an attacker crosses the escalation threshold.
 */
export function recordSuspiciousSignal(
  ip: string,
  signalType: SuspiciousSignalType
): { escalated: boolean; count: number } {
  const now = Date.now();
  pruneOldEntries(signalStore, now, SIGNAL_WINDOW_MS);

  const key = `${signalType}:${ip}`;
  const entry = signalStore.get(key);

  let count = 1;
  if (!entry || now - entry.windowStart > SIGNAL_WINDOW_MS) {
    signalStore.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
    count = entry.count;
  }

  const escalated = count >= SIGNAL_ESCALATION_THRESHOLDS[signalType];
  if (escalated) {
    banIpTemporarily(ip);
  }

  return { escalated, count };
}

/**
 * Validate hidden honeypot & minimum human interaction timing on public forms.
 * Returns a violation code if automated submission is detected, or null otherwise.
 */
export function detectFormBotSubmission(body: Record<string, unknown> | null | undefined): string | null {
  if (!body || typeof body !== 'object') return null;

  // 1. Honeypot trap: hidden input expected to remain empty for human users
  const honeypot = body._hp;
  if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
    return 'HONEYPOT_FILLED';
  }

  // 2. Minimum interaction timing trap: bots submit instantaneously (< 600ms after mount)
  const formLoadedAt = body._ts;
  if (typeof formLoadedAt === 'number' && Number.isFinite(formLoadedAt)) {
    const elapsed = Date.now() - formLoadedAt;
    if (elapsed >= 0 && elapsed < 600) {
      return 'SUBMISSION_TOO_FAST';
    }
  }

  return null;
}
