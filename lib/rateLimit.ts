import { getClientIp } from './securityLogger';

/**
 * Multi-tier sliding-window rate limiter & in-flight concurrency guard.
 * Works in both Edge and Node.js runtimes.
 * For multi-region/high-scale deployments, back this interface with Upstash/Redis.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface LockEntry {
  count: number;
  expiresAt: number;
}

const store = new Map<string, RateLimitEntry>();
const lockStore = new Map<string, LockEntry>();
const MAX_STORE_SIZE = 10000;

function pruneExpiredEntries(now: number) {
  if (store.size >= MAX_STORE_SIZE) {
    for (const [key, entry] of store.entries()) {
      // Keep daily windows up to 24 hours; prune stale entries
      if (now - entry.windowStart > 24 * 60 * 60 * 1000) {
        store.delete(key);
      }
    }
    // If still full after age pruning, drop oldest 10%
    if (store.size >= MAX_STORE_SIZE) {
      let deleted = 0;
      const target = Math.floor(MAX_STORE_SIZE * 0.1);
      for (const key of store.keys()) {
        store.delete(key);
        deleted++;
        if (deleted >= target) break;
      }
    }
  }

  if (lockStore.size >= MAX_STORE_SIZE) {
    for (const [key, lock] of lockStore.entries()) {
      if (now > lock.expiresAt) {
        lockStore.delete(key);
      }
    }
  }
}

export interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitTier extends RateLimitOptions {
  key: string;
  name: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInMs: number;
  blockedBy?: string;
}

function peekTier(tier: RateLimitTier, now: number): { allowed: boolean; remaining: number; resetInMs: number } {
  const entry = store.get(tier.key);
  if (!entry || now - entry.windowStart > tier.windowMs) {
    return { allowed: true, remaining: tier.limit - 1, resetInMs: tier.windowMs };
  }
  if (entry.count >= tier.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: Math.max(1000, tier.windowMs - (now - entry.windowStart)),
    };
  }
  return {
    allowed: true,
    remaining: tier.limit - (entry.count + 1),
    resetInMs: Math.max(1000, tier.windowMs - (now - entry.windowStart)),
  };
}

function consumeTier(tier: RateLimitTier, now: number): void {
  const entry = store.get(tier.key);
  if (!entry || now - entry.windowStart > tier.windowMs) {
    store.set(tier.key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  return rateLimitMulti([{ key, name: 'default', ...options }]);
}

/**
 * Evaluate multiple rate-limit tiers (e.g. per-user burst + per-user daily + per-IP cap).
 * Only increments counters if ALL tiers pass, preventing blocked probes from distorting other buckets.
 */
export function rateLimitMulti(tiers: RateLimitTier[]): RateLimitResult {
  const now = Date.now();
  pruneExpiredEntries(now);

  let tightestRemaining = Infinity;
  let tightestLimit = 0;
  let tightestReset = 0;

  for (const tier of tiers) {
    const check = peekTier(tier, now);
    if (!check.allowed) {
      return {
        allowed: false,
        limit: tier.limit,
        remaining: 0,
        resetInMs: check.resetInMs,
        blockedBy: tier.name,
      };
    }
    if (check.remaining < tightestRemaining) {
      tightestRemaining = check.remaining;
      tightestLimit = tier.limit;
      tightestReset = check.resetInMs;
    }
  }

  for (const tier of tiers) {
    consumeTier(tier, now);
  }

  return {
    allowed: true,
    limit: tightestLimit,
    remaining: tightestRemaining === Infinity ? 0 : tightestRemaining,
    resetInMs: tightestReset,
  };
}

/**
 * Standard HTTP headers for rate-limited responses.
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const resetSec = Math.max(1, Math.ceil(result.resetInMs / 1000));
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(resetSec),
  };
  if (!result.allowed) {
    headers['Retry-After'] = String(resetSec);
  }
  return headers;
}

/**
 * Acquire an in-flight concurrency lock for expensive operations (e.g. Gemini AI generation).
 * Prevents parallel burst scripts from firing multiple simultaneous AI requests before balances/limits update.
 */
export function acquireConcurrencyLock(
  key: string,
  maxConcurrent = 1,
  ttlMs = 120 * 1000
): { acquired: boolean; release: () => void } {
  const now = Date.now();
  pruneExpiredEntries(now);

  const existing = lockStore.get(key);
  if (existing && now <= existing.expiresAt && existing.count >= maxConcurrent) {
    return { acquired: false, release: () => {} };
  }

  const nextCount = existing && now <= existing.expiresAt ? existing.count + 1 : 1;
  lockStore.set(key, { count: nextCount, expiresAt: now + ttlMs });

  let released = false;
  return {
    acquired: true,
    release: () => {
      if (released) return;
      released = true;
      const current = lockStore.get(key);
      if (!current) return;
      if (current.count <= 1) {
        lockStore.delete(key);
      } else {
        current.count -= 1;
      }
    },
  };
}

/** Derive a stable key from a Next.js request (IP + optional path suffix) */
export function getRateLimitKey(request: Request, suffix = ''): string {
  const ip = getClientIp(request.headers);
  return `${ip}${suffix}`;
}
