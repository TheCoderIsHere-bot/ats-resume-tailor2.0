/**
 * Authentication & Password Security Module
 * 
 * Enforces security controls aligned with OWASP Authentication Guidelines:
 * 1. Password complexity & entropy enforcement (min 10 chars, mixed character sets, common dictionary check)
 * 2. Strict email validation & canonicalization (RFC 5321 length limits)
 * 3. Token & Session TTL standards (Access token: 1h, OTP/Reset: 15m)
 */

const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password123', 'admin', 'admin123', '12345678', '1234567890',
  'qwerty1234', 'letmein123', 'welcome123', 'changeme', 'iloveyou'
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
  // Standard RFC 5322 simplified pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Canonicalize email address to prevent duplicate account creation / aliasing bypass
 */
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Recommended security thresholds for Supabase GoTrue Auth configuration
 */
export const AUTH_SECURITY_STANDARDS = {
  // Passwords hashed with bcrypt (work factor 10+) or argon2id in GoTrue
  PASSWORD_HASH_ALGORITHM: 'bcrypt (work_factor=10) / argon2id',
  // Session Access Token (JWT) validity: 3600 seconds (1 hour)
  ACCESS_TOKEN_TTL_SECONDS: 3600,
  // Refresh Token inactivity timeout: 7 days
  REFRESH_TOKEN_INACTIVITY_TIMEOUT_SECONDS: 7 * 24 * 3600,
  // Password reset & email OTP validity: 15 minutes (900 seconds)
  OTP_EXPIRATION_SECONDS: 900,
  // Email verification required before login: true
  EMAIL_CONFIRMATION_REQUIRED: true,
} as const;
