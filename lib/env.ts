import type { NextRequest } from 'next/server';

/**
 * Runtime Environment & Secret Validation
 *
 * Ensures:
 * 1. Server-only secrets are never accessed from client/browser bundles.
 * 2. Missing or placeholder secrets fail fast with explicit errors at request time.
 * 3. Production deployments enforce HTTPS URLs for external auth/DB endpoints.
 */

const PLACEHOLDER_PREFIXES = ['your_', 'your-', 'replace_', 'example_'];

function isPlaceholderValue(val: string): boolean {
  const normalized = val.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === 'changeme' ||
    PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

/**
 * Assert code is running on the server before loading server-only modules or secrets.
 */
export function assertServerOnly(scope: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`Security Violation: Server-only module/secret "${scope}" accessed in browser context.`);
  }
}

/**
 * Assert code is running on the server before accessing server-only secrets.
 */
function assertServerContext(varName: string) {
  assertServerOnly(varName);
}

/**
 * Retrieve and validate a mandatory server-only secret environment variable.
 * Throws if missing, placeholder, or accessed from client code.
 */
export function requireServerEnv(name: string): string {
  assertServerContext(name);
  const value = process.env[name];
  if (!value || isPlaceholderValue(value)) {
    throw new Error(`Server configuration error: missing or unconfigured secret "${name}".`);
  }
  return value.trim();
}

/**
 * Retrieve an optional server-only environment variable if configured.
 */
export function getOptionalServerEnv(name: string): string | null {
  assertServerContext(name);
  const value = process.env[name];
  if (!value || isPlaceholderValue(value)) {
    return null;
  }
  return value.trim();
}

/**
 * Validate and return Supabase public configuration.
 * Enforces HTTPS endpoint URLs in production deployments.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!url || isPlaceholderValue(url) || !anonKey || isPlaceholderValue(anonKey)) {
    throw new Error('Supabase configuration missing or contains placeholder values.');
  }

  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
    throw new Error('Security configuration error: NEXT_PUBLIC_SUPABASE_URL must use HTTPS in production.');
  }

  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL scheme.');
  }

  return { url, anonKey };
}

/**
 * Retrieve the Supabase Service Role key and verify it is not mistakenly set to the anon key.
 */
export function getSupabaseServiceRoleKey(): string {
  const serviceKey = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (anonKey && serviceKey === anonKey) {
    throw new Error('Security configuration error: SUPABASE_SERVICE_ROLE_KEY cannot match NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return serviceKey;
}

/**
 * Resolve canonical HTTPS origin for auth callbacks and redirects.
 * Prevents protocol downgrade (http://) behind TLS-terminating reverse proxies in production.
 */
export function getAppOrigin(request: NextRequest): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const reqOrigin = request.nextUrl.origin;

  if (process.env.NODE_ENV === 'production') {
    if (configuredUrl && configuredUrl.startsWith('https://')) {
      try {
        const parsedConfigured = new URL(configuredUrl);
        const parsedReq = new URL(reqOrigin);
        // Prefer configured canonical origin when host matches or when proxy headers differ
        if (parsedConfigured.hostname === parsedReq.hostname) {
          return parsedConfigured.origin;
        }
      } catch {
        // Fall through to upgrading request origin
      }
    }

    // Upgrade http:// to https:// in production unless explicitly running on localhost
    const hostname = request.nextUrl.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
      return reqOrigin.replace(/^http:\/\//i, 'https://');
    }
  }

  return reqOrigin;
}
