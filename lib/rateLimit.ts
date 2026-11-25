import { getClientIp } from './securityLogger';

/**
 * Simple in-memory sliding-window rate limiter.
 * Works perfectly for a single Next.js process (dev + single-instance prod).
 * For multi-instance deployments, swap the Map for a Redis store.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10000;

// Periodic cleanup to prevent unbounded memory growth
function pruneExpiredEntries(now: number) {
  if (store.size < MAX_STORE_SIZE) return;
  for (const [key, entry] of store.entries()) {
    // If entry is older than 30 minutes, remove it
    if (now - entry.windowStart > 30 * 60 * 1000) {
      store.delete(key);
    }
  }
}

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneExpiredEntries(now);
  const { limit, windowMs } = options;

  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: windowMs - (now - entry.windowStart),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetInMs: windowMs - (now - entry.windowStart),
  };
}

/** Derive a stable key from a Next.js request (IP + optional path suffix) */
export function getRateLimitKey(request: Request, suffix = ''): string {
  const ip = getClientIp(request.headers);
  return `${ip}${suffix}`;
}
