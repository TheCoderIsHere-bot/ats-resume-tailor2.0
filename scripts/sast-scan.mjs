#!/usr/bin/env node
/**
 * Automated Static Application Security Testing (SAST) & Policy Guardrail Scanner
 *
 * Scans source files and Next.js configuration for:
 * 1. Dangerous execution / XSS / weak-crypto sinks (eval, new Function, child_process, raw innerHTML, getSession, MD5/SHA1)
 * 2. Direct browser database/storage access regressions inside client components
 * 3. Missing auth, rate limiting, logging, or schema checks on API route handlers
 * 4. Missing HTTP security headers in next.config.ts
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');
const LIB_DIR = path.join(ROOT, 'lib');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (CODE_EXTS.has(path.extname(entry.name).toLowerCase())) acc.push(full);
  }
  return acc;
}

let errors = 0;
function fail(msg) {
  console.error(`[SAST FAIL] ${msg}`);
  errors++;
}

const sourceFiles = [...walk(APP_DIR), ...walk(LIB_DIR), path.join(ROOT, 'middleware.ts')].filter((p) =>
  fs.existsSync(p)
);

// 1. Dangerous sink & insecure API pattern checks
for (const filePath of sourceFiles) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const ln = `${rel}:${idx + 1}`;
    if (/\beval\s*\(/.test(line) || /\bnew\s+Function\s*\(/.test(line)) {
      fail(`Dynamic code execution detected at ${ln}`);
    }
    if (/['"]child_process['"]/.test(line)) {
      fail(`OS command execution module imported in app/lib at ${ln}`);
    }
    if (/document\.write(ln)?\s*\(/.test(line)) {
      fail(`Unsafe document.write sink at ${ln}`);
    }
    if (/createHash\(\s*['"](md5|sha1)['"]\s*\)/i.test(line)) {
      fail(`Weak hash algorithm (MD5/SHA1) at ${ln}`);
    }
    if (/\.auth\.getSession\s*\(/.test(line)) {
      fail(`Insecure auth.getSession() used instead of auth.getUser() at ${ln}`);
    }
    if (/dangerouslySetInnerHTML/.test(line) && rel !== 'app/components/workspace/ReviewView.tsx') {
      fail(`Unvetted dangerouslySetInnerHTML usage at ${ln}`);
    }
    if (/\.innerHTML\s*=/.test(line)) {
      fail(`Direct innerHTML assignment detected at ${ln}`);
    }
  });

  // Prevent browser code from directly querying Supabase tables/buckets
  if (rel.startsWith('app/components/') || rel.startsWith('app/context/')) {
    if (/supabase\.from\s*\(/.test(content) || /supabase\.storage\./.test(content)) {
      fail(`Direct browser Supabase DB/storage access found in ${rel}`);
    }
  }
}

// 2. Enforce security controls across every Next.js API route handler
const PUBLIC_OR_EXEMPT_AUTH_ROUTES = new Set([
  'app/api/leads/route.ts',
  'app/api/auth/send-magic-link/route.ts',
  'app/api/auth/oauth/google/route.ts',
  'app/api/auth/signout/route.ts',
  'app/api/webhooks/razorpay/route.ts',
]);

const EXEMPT_RATE_LIMIT_ROUTES = new Set([
  'app/api/auth/signout/route.ts',
  'app/api/webhooks/razorpay/route.ts',
]);

const apiRoutes = walk(path.join(APP_DIR, 'api')).filter((p) => path.basename(p) === 'route.ts');

for (const routePath of apiRoutes) {
  const rel = path.relative(ROOT, routePath).replace(/\\/g, '/');
  const content = fs.readFileSync(routePath, 'utf8');

  if (!PUBLIC_OR_EXEMPT_AUTH_ROUTES.has(rel)) {
    if (!/supabase\.auth\.getUser\s*\(/.test(content)) {
      fail(`Protected API route ${rel} is missing supabase.auth.getUser() authentication check`);
    }
  }

  if (!EXEMPT_RATE_LIMIT_ROUTES.has(rel)) {
    if (!/rateLimit(Multi)?\s*\(/.test(content)) {
      fail(`API route ${rel} is missing rate limiting`);
    }
  }

  if (!/(logAuthEvent|logApiError|logRateLimitExceeded|logSecurityEvent)\s*\(/.test(content)) {
    fail(`API route ${rel} is missing structured security/error logging`);
  }

  if (/await\s+request\.json\s*\(/.test(content)) {
    fail(`API route ${rel} calls raw request.json() instead of parseJsonObject() strict validator`);
  }

  if (rel === 'app/api/webhooks/razorpay/route.ts' && !/timingSafeEqual/.test(content)) {
    fail(`Webhook route ${rel} is missing timing-safe signature verification`);
  }
}

// 3. Verify mandatory security headers in next.config.ts
const nextConfigPath = path.join(ROOT, 'next.config.ts');
const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
const requiredHeaders = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
  'Content-Security-Policy',
  'poweredByHeader: false',
];
for (const reqHeader of requiredHeaders) {
  if (!nextConfigContent.includes(reqHeader)) {
    fail(`next.config.ts is missing security configuration: ${reqHeader}`);
  }
}

// 4. Verify GitHub Actions workflows pin third-party actions to 40-char commit SHAs
const workflowsDir = path.join(ROOT, '.github', 'workflows');
const workflowFiles = [];
if (fs.existsSync(workflowsDir)) {
  for (const name of fs.readdirSync(workflowsDir)) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const wfPath = path.join(workflowsDir, name);
    const wfLines = fs.readFileSync(wfPath, 'utf8').split(/\r?\n/);
    wfLines.forEach((line, idx) => {
      const m = line.match(/uses:\s*([^\s#]+)/);
      if (m) {
        const ref = m[1];
        if (!/@[0-9a-f]{40}$/i.test(ref)) {
          fail(`.github/workflows/${name}:${idx + 1} action "${ref}" is not pinned to a 40-char commit SHA`);
        }
      }
    });
    workflowFiles.push(wfPath);
  }
}

if (errors > 0) {
  console.error(`\nSAST scan failed with ${errors} issue(s).`);
  process.exit(1);
}

console.log(
  `SAST scan passed cleanly (${sourceFiles.length} source files, ${apiRoutes.length} API routes & ${workflowFiles.length} workflows verified, 0 issues).`
);
