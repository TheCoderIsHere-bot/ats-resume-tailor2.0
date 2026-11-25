#!/usr/bin/env node
/**
 * Automated Secret & Server-Boundary Security Scanner
 *
 * Verifies:
 * 1. Zero hardcoded API keys, JWTs, service keys, private keys, or DB URLs in tracked/source files.
 * 2. Local .env* secret files (e.g. .env.local) are ignored by git and not tracked.
 * 3. Client components ('use client') never import server-only modules and only access strictly allowlisted public env vars.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();

const SECRET_PATTERNS = [
  { name: 'Google / Gemini API Key', regex: /AIza[0-9A-Za-z\-_]{20,}/ },
  { name: 'Razorpay Key', regex: /rzp_(?:live|test)_[0-9A-Za-z]{8,}/ },
  { name: 'Secret Key (sk_)', regex: /sk_(?:live|test)_[0-9A-Za-z]{10,}/ },
  { name: 'Supabase Secret Key', regex: /(?:sb_secret_|sbp_)[0-9A-Za-z_\-]{10,}/ },
  { name: 'JWT / Service Token', regex: /eyJ[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Token', regex: /ghp_[0-9A-Za-z]{20,}/ },
  { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Database Connection URI', regex: /(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis):\/\/[^\s"']+/ },
];

const ALLOWED_CLIENT_ENV_VARS = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NODE_ENV',
]);

const SERVER_ONLY_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SECURITY_ALERT_WEBHOOK_URL',
  'RAZORPAY_KEY_ID',
];

const SERVER_ONLY_IMPORTS = [
  '@/lib/env',
  '@/lib/supabase/server',
  '@/lib/gemini',
  '@/lib/ats-score',
  '@/lib/securityLogger',
  '@/lib/trafficMonitor',
  '@/lib/parseResume',
  '@/lib/pdf',
  '@/lib/docx',
];

const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);
const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.sql', '.md', '.env', '.example']);

function walkFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

let failures = 0;

// 1. Verify .env* files are ignored in git
try {
  const trackedFiles = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const rel of trackedFiles) {
    if (/^\.env/.test(path.basename(rel)) && path.basename(rel) !== '.env.example') {
      console.error(`[FAIL] Sensitive env file is tracked in git: ${rel}`);
      failures++;
    }
  }
} catch {
  console.warn('[WARN] Could not inspect git tracked files.');
}

// 2. Scan files for hardcoded secrets & client boundary leaks
const allFiles = walkFiles(ROOT);
for (const filePath of allFiles) {
  const base = path.basename(filePath);
  const rel = path.relative(ROOT, filePath);

  // Skip local secret env files themselves (intentionally untracked & gitignored)
  if (/^\.env(?!\.example$)/.test(base)) continue;

  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTS.has(ext) && !base.startsWith('.env')) continue;

  if (rel.replace(/\\/g, '/') === 'scripts/scan-secrets.mjs') continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    for (const pat of SECRET_PATTERNS) {
      if (pat.regex.test(line)) {
        console.error(`[FAIL] Potential ${pat.name} found in ${rel}:${idx + 1}`);
        failures++;
      }
    }
  });

  // Check client component isolation
  const isClientFile = /^\s*['"]use client['"]\s*;?/.test(content);
  if (isClientFile) {
    for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const envName = match[1];
      if (!ALLOWED_CLIENT_ENV_VARS.has(envName)) {
        console.error(`[FAIL] Client component ${rel} reads non-allowlisted env var "${envName}"`);
        failures++;
      }
    }
    for (const secretName of SERVER_ONLY_SECRETS) {
      const rawRefRegex = new RegExp(`(?<!NEXT_PUBLIC_)\\b${secretName}\\b`);
      if (rawRefRegex.test(content)) {
        console.error(`[FAIL] Client component ${rel} references server-only secret "${secretName}"`);
        failures++;
      }
    }
    for (const serverImport of SERVER_ONLY_IMPORTS) {
      const importRegex = new RegExp(`from\\s+['"]${serverImport.replace('/', '\\/')}['"]`);
      if (importRegex.test(content)) {
        console.error(`[FAIL] Client component ${rel} imports server-only module "${serverImport}"`);
        failures++;
      }
    }
  }
}

if (failures > 0) {
  console.error(`\nSecret scan failed with ${failures} violation(s).`);
  process.exit(1);
}

console.log(`Secret & boundary scan passed cleanly (${allFiles.length} files inspected, 0 violations).`);
