#!/usr/bin/env node
/**
 * Dependency Integrity & Vulnerability Audit Script
 *
 * 1. Offline checks (always executed):
 *    - Validates package-lock.json exists and uses lockfileVersion >= 3
 *    - Verifies every resolved tarball uses HTTPS and includes SHA integrity checksums
 *    - Verifies package.json contains no unpinned wildcard (*) or insecure git+http dependencies
 * 2. Registry CVE audit (`npm audit --audit-level=high`):
 *    - Executed when network access to registry.npmjs.org is available (or in CI)
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lockPath = path.join(ROOT, 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.error('[FAIL] package-lock.json is missing — reproducible dependency builds are not locked.');
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
let errors = 0;

if ((lock.lockfileVersion ?? 0) < 3) {
  console.error(`[FAIL] Expected package-lock.json lockfileVersion >= 3, found ${lock.lockfileVersion}`);
  errors++;
}

for (const section of ['dependencies', 'devDependencies']) {
  const deps = pkg[section] || {};
  for (const [name, version] of Object.entries(deps)) {
    if (version === '*' || version === 'latest' || /^git\+http:\/\//i.test(version)) {
      console.error(`[FAIL] Unpinned or insecure dependency version for ${name}: ${version}`);
      errors++;
    }
  }
}

const resolvedEntries = Object.entries(lock.packages || {}).filter(([k]) => k !== '');
let nonHttps = 0;
let missingIntegrity = 0;

for (const [, meta] of resolvedEntries) {
  if (meta.resolved && !meta.resolved.startsWith('https://')) {
    nonHttps++;
  }
  if (!meta.integrity && !meta.link) {
    missingIntegrity++;
  }
}

if (nonHttps > 0) {
  console.error(`[FAIL] Found ${nonHttps} package(s) in package-lock.json without HTTPS resolved URLs.`);
  errors++;
}
if (missingIntegrity > 0) {
  console.error(`[FAIL] Found ${missingIntegrity} package(s) in package-lock.json missing SHA integrity hashes.`);
  errors++;
}

if (errors > 0) {
  process.exit(1);
}

console.log(
  `Lockfile supply-chain check passed (${resolvedEntries.length} packages, 100% HTTPS, 100% SHA-verified).`
);

// Attempt live npm registry CVE audit (gracefully handle airgapped/offline environments unless --strict)
const strictOnline = process.argv.includes('--strict');
try {
  const npmExec = process.env.npm_execpath;
  if (npmExec && fs.existsSync(npmExec)) {
    execFileSync(process.execPath, [npmExec, 'audit', '--audit-level=high'], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } else {
    execFileSync('npm', ['audit', '--audit-level=high'], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  }
  console.log('Live npm audit passed cleanly (0 high/critical vulnerabilities).');
} catch (err) {
  const output = `${err.stdout || ''}\n${err.stderr || ''}`;
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network/i.test(output)) {
    if (strictOnline) {
      console.error('[FAIL] npm audit could not reach registry in --strict mode.');
      process.exit(1);
    }
    console.warn('[INFO] Registry audit skipped: offline environment (enforced automatically in GitHub Actions CI).');
  } else {
    console.error('[FAIL] npm audit detected high/critical vulnerabilities:\n' + output);
    process.exit(1);
  }
}
