/**
 * Edge & Node Compatible Traffic Pattern & Anomaly Monitor
 *
 * Detects unusual traffic patterns so suspicious behavior can be flagged and throttled:
 * 1. Automated vulnerability scanner & path traversal probes
 * 2. High-frequency API/Auth traffic bursts per IP
 * 3. Repeated security failures (rate-limit hits, invalid signatures, auth brute-force spikes)
 */

interface WindowCounter {
  count: number;
  windowStart: number;
}

const burstStore = new Map<string, WindowCounter>();
const signalStore = new Map<string, WindowCounter>();
const MAX_TRACKED_ENTRIES = 10000;

const BURST_WINDOW_MS = 60 * 1000; // 1 minute
const BURST_WARN_THRESHOLD = 60; // Log anomaly at 60 API/auth requests/min from single IP
const BURST_BLOCK_THRESHOLD = 120; // Hard block at 120 API/auth requests/min from single IP

const SIGNAL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export type SuspiciousSignalType =
  | 'RATE_LIMIT'
  | 'AUTH_FAIL'
  | 'UNAUTHORIZED'
  | 'BAD_SIGNATURE'
  | 'IDOR_PROBE';

const SIGNAL_ESCALATION_THRESHOLDS: Record<SuspiciousSignalType, number> = {
  RATE_LIMIT: 3,
  AUTH_FAIL: 5,
  UNAUTHORIZED: 5,
  BAD_SIGNATURE: 2,
  IDOR_PROBE: 2,
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

const SCANNER_USER_AGENTS = [
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

/**
 * Inspect incoming request path and User-Agent for automated recon, path traversal, or exploit probes.
 * Returns a descriptive reason string if suspicious, or null otherwise.
 */
export function detectSuspiciousProbe(pathname: string, userAgent: string | null): string | null {
  const lowerPath = pathname.toLowerCase();

  // Check path traversal or null-byte injection attempts
  if (
    lowerPath.includes('..') ||
    lowerPath.includes('%2e%2e') ||
    lowerPath.includes('\0') ||
    lowerPath.includes('%00')
  ) {
    return 'PATH_TRAVERSAL_OR_NULL_BYTE_PROBE';
  }

  // Check common recon / CMS / credential file probes
  for (const pattern of SUSPICIOUS_PATH_PATTERNS) {
    if (lowerPath === pattern || lowerPath.startsWith(`${pattern}/`) || lowerPath.endsWith(pattern)) {
      return `RECON_PROBE:${pattern}`;
    }
  }

  // Check known attack/scanner User-Agents on API or Auth routes
  if (userAgent && (lowerPath.startsWith('/api/') || lowerPath.startsWith('/auth/'))) {
    const lowerUa = userAgent.toLowerCase();
    for (const scanner of SCANNER_USER_AGENTS) {
      if (lowerUa.includes(scanner)) {
        return `SCANNER_USER_AGENT:${scanner}`;
      }
    }
  }

  return null;
}

/**
 * Track per-IP request volume to API/Auth routes in a 60-second sliding window.
 * Signals warning at 60 req/min and hard-block at 120 req/min.
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
 * Record repeated suspicious security events per IP (rate-limit hits, failed auth, bad signatures).
 * Returns escalated=true once an IP crosses the anomaly threshold within 10 minutes.
 */
export function recordSuspiciousSignal(
  ip: string,
  signalType: SuspiciousSignalType
): { escalated: boolean; count: number } {
  const now = Date.now();
  pruneOldEntries(signalStore, now, SIGNAL_WINDOW_MS);

  const key = `${signalType}:${ip}`;
  const entry = signalStore.get(key);

  if (!entry || now - entry.windowStart > SIGNAL_WINDOW_MS) {
    signalStore.set(key, { count: 1, windowStart: now });
    return {
      escalated: 1 >= SIGNAL_ESCALATION_THRESHOLDS[signalType],
      count: 1,
    };
  }

  entry.count += 1;
  return {
    escalated: entry.count >= SIGNAL_ESCALATION_THRESHOLDS[signalType],
    count: entry.count,
  };
}
