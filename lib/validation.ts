/**
 * Centralized Input Validation & Sanitization Module
 *
 * Enforces strict runtime type checking, schema allowlists, UUID validation,
 * open-redirect safety, and control-character/prototype-pollution sanitization
 * across all APIs and query parameters.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Strips null bytes, ASCII control chars (preserving \t, \n, \r), DEL, and Unicode BiDi override controls
const UNSAFE_CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u202A-\u202E\u2066-\u2069]/g;
const INLINE_CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F\u202A-\u202E\u2066-\u2069]/g;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Safely parse a JSON request body into a plain object, checking for malformed JSON
 * and rejecting prototype-pollution keys (__proto__, constructor, prototype).
 */
export async function parseJsonObject(
  request: Request
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const raw: unknown = await request.json();
    if (!isPlainObject(raw)) {
      return { ok: false, error: 'Request body must be a valid JSON object.' };
    }

    for (const key of Object.keys(raw)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return { ok: false, error: 'Forbidden property name in request payload.' };
      }
    }

    return { ok: true, data: raw };
  } catch {
    return { ok: false, error: 'Malformed JSON request body.' };
  }
}

/**
 * Enforce strict field allowlist on JSON objects to prevent parameter tampering / mass assignment.
 */
export function hasOnlyAllowedKeys(
  obj: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(obj).every((k) => allowed.has(k));
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function validateRazorpayId(value: unknown, prefix: 'order_' | 'pay_'): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const pattern = new RegExp(`^${prefix}[A-Za-z0-9]{6,48}$`);
  return pattern.test(trimmed) ? trimmed : null;
}

export interface TextValidationOptions {
  minLength: number;
  maxLength: number;
  allowNewlines?: boolean;
  label?: string;
}

/**
 * Validate and sanitize plain text input (strip null bytes, control chars, BiDi overrides)
 * and enforce strict lower/upper bounds.
 */
export function validateAndSanitizeText(
  value: unknown,
  options: TextValidationOptions
): { ok: true; text: string } | { ok: false; error: string } {
  const label = options.label ?? 'Input';

  if (typeof value !== 'string') {
    return { ok: false, error: `${label} must be a string.` };
  }

  const sanitized = (
    options.allowNewlines
      ? value.replace(UNSAFE_CONTROL_CHARS_REGEX, '')
      : value.replace(INLINE_CONTROL_CHARS_REGEX, '')
  ).trim();

  if (sanitized.length < options.minLength) {
    return {
      ok: false,
      error: `${label} is too short (minimum ${options.minLength} characters).`,
    };
  }

  if (sanitized.length > options.maxLength) {
    return {
      ok: false,
      error: `${label} exceeds maximum allowed length (${options.maxLength.toLocaleString()} characters).`,
    };
  }

  return { ok: true, text: sanitized };
}

/**
 * Strict same-origin relative path validator for redirect parameters (e.g. ?next=).
 * Rejects protocol-relative URLs (//), backslashes, encoded slashes, control chars, and external hosts.
 */
export function sanitizeRelativeRedirectPath(rawNext: unknown, allowedOrigin: string): string {
  if (typeof rawNext !== 'string' || !rawNext.trim()) return '/';
  const trimmed = rawNext.trim();

  if (
    trimmed.length > 256 ||
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    /%2f|%5c|[\x00-\x1F\x7F]/i.test(trimmed)
  ) {
    return '/';
  }

  try {
    const base = new URL(allowedOrigin);
    const resolved = new URL(trimmed, base);
    if (resolved.origin !== base.origin) {
      return '/';
    }
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return '/';
  }
}

/**
 * Inspect URL query strings for obvious script/SQL/prototype injection payloads.
 */
export function detectUnsafeQueryString(search: string): string | null {
  if (!search) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(search);
    } catch {
      return search;
    }
  })().toLowerCase();

  if (
    decoded.includes('<script') ||
    decoded.includes('javascript:') ||
    decoded.includes('\0') ||
    decoded.includes('__proto__') ||
    decoded.includes('constructor[')
  ) {
    return 'UNSAFE_QUERY_PARAMETER';
  }

  return null;
}
