/**
 * Authentication, Account Creation & Password Security Module
 *
 * Enforces security controls aligned with OWASP Authentication Guidelines:
 * 1. Password complexity & entropy enforcement (min 10 chars, mixed character sets, common dictionary check)
 * 2. Strict email validation & canonicalization (RFC 5321 length limits)
 * 3. Disposable/throwaway email domain blocking & alias-farming normalization
 * 4. Token & Session TTL standards (Access token: 1h, OTP/Reset: 15m)
 */

const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password123', 'admin', 'admin123', '12345678', '1234567890',
  'qwerty1234', 'letmein123', 'welcome123', 'changeme', 'iloveyou',
]);

// Known throwaway email providers commonly abused for automated free-credit / signup farming
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.net',
  'sharklasers.com', 'grr.la', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'yopmail.com', 'yopmail.fr',
  'trashmail.com', 'trashmail.net', 'getnada.com', 'nada.email',
  'throwawaymail.com', 'dispostable.com', 'fakeinbox.com', 'mintemail.com',
  'maildrop.cc', 'burnermail.io', 'mohmal.com', 'emailondeck.com',
  'tempr.email', 'discard.email', 'mailsac.com', 'harakirimail.com',
  'inboxkitten.com', 'mytemp.email', 'anonbox.net', 'spamgourmet.com',
]);

const PLUS_ALIAS_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength against OWASP ASVS v4.0.3 standards:
 * - Minimum 10 characters length
 * - Contains at least one lowercase letter
 * - Contains at least one uppercase letter
 * - Contains at least one digit
 * - Contains at least one special character
 * - Not a commonly breached / trivial password
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required.'] };
  }

  if (password.length < 10) {
    errors.push('Password must be at least 10 characters long.');
  }
  if (password.length > 128) {
    errors.push('Password cannot exceed 128 characters.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must include at least one lowercase letter.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include at least one uppercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must include at least one number.');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must include at least one special character.');
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase().trim())) {
    errors.push('This password is too common and easily guessed.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Strict RFC 5321 email format and length validation
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254 || trimmed.length < 5) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Canonicalize email address to prevent duplicate account creation / casing mismatches
 */
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Reject disposable/temporary email providers to mitigate free-tier account creation abuse
 */
export function isDisposableEmail(email: string): boolean {
  const normalized = canonicalizeEmail(email);
  const atIdx = normalized.lastIndexOf('@');
  if (atIdx === -1) return false;
  const domain = normalized.slice(atIdx + 1);
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  // Also check subdomain matches (e.g. sub.mailinator.com)
  for (const blocked of DISPOSABLE_EMAIL_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

/**
 * Normalize provider-specific alias tricks (+suffix, Gmail dots) into a single
 * rate-limiting key so attackers cannot bypass per-email quotas using user+1@gmail.com.
 */
export function getRateLimitEmailKey(email: string): string {
  const normalized = canonicalizeEmail(email);
  const atIdx = normalized.lastIndexOf('@');
  if (atIdx <= 0) return normalized;

  let local = normalized.slice(0, atIdx);
  let domain = normalized.slice(atIdx + 1);

  if (domain === 'googlemail.com') domain = 'gmail.com';

  if (PLUS_ALIAS_PROVIDERS.has(domain)) {
    const plusIdx = local.indexOf('+');
    if (plusIdx !== -1) {
      local = local.slice(0, plusIdx);
    }
    if (domain === 'gmail.com') {
      local = local.replace(/\./g, '');
    }
  }

  return `${local}@${domain}`;
}

/**
 * Recommended security thresholds for Supabase GoTrue Auth configuration
 */
export const AUTH_SECURITY_STANDARDS = {
  PASSWORD_HASH_ALGORITHM: 'bcrypt (work_factor=10) / argon2id',
  ACCESS_TOKEN_TTL_SECONDS: 3600,
  REFRESH_TOKEN_INACTIVITY_TIMEOUT_SECONDS: 7 * 24 * 3600,
  OTP_EXPIRATION_SECONDS: 900,
  EMAIL_CONFIRMATION_REQUIRED: true,
} as const;
