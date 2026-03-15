#!/usr/bin/env tsx
/**
 * Generate static stats JSON from the codebase.
 *
 * Counts detection rules, test cases, policy templates, framework adapters,
 * and redteam payloads by scanning source files. Output is written to
 * authensor-site/src/lib/stats.json for static import.
 *
 * Usage: tsx scripts/generate-stats.ts
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function countPattern(dir: string, fileGlob: string, pattern: RegExp): number {
  let count = 0;
  if (!existsSync(dir)) return 0;

  for (const entry of readdirSync(dir, { recursive: true })) {
    const filePath = join(dir, entry.toString());
    if (!statSync(filePath).isFile()) continue;
    if (!filePath.endsWith(fileGlob.replace('*', ''))) continue;

    const content = readFileSync(filePath, 'utf-8');
    const matches = content.match(pattern);
    count += matches?.length ?? 0;
  }
  return count;
}

function countDirs(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
}

// Count Aegis detection rules (objects in rule arrays)
const aegisDir = join(ROOT, 'packages/aegis/src/detectors');
const detectionRules = countPattern(aegisDir, '.ts', /\{\s*id:\s*'/g);

// Count test cases
// Use `pnpm test` output for accurate count; regex overcounts due to
// matches in comments and non-test code. Fallback to regex if pnpm unavailable.
import { execSync } from 'child_process';
let testCases = 0;
try {
  const output = execSync('pnpm test 2>&1', { cwd: ROOT, timeout: 120_000 }).toString();
  const matches = output.matchAll(/Tests\s+(\d+)\s+passed/g);
  for (const m of matches) {
    testCases += parseInt(m[1], 10);
  }
} catch {
  // Fallback: regex count (will overcount slightly)
  const testDirs = ['packages', 'adapters'];
  for (const base of testDirs) {
    testCases += countPattern(join(ROOT, base), '.test.ts', /\b(it|test)\s*\(/g);
  }
}

// Count policy templates
const policyTemplates = countDirs(join(ROOT, 'policies'));

// Count framework adapters
const frameworkAdapters = countDirs(join(ROOT, 'adapters'));

// Count packages
const packages = countDirs(join(ROOT, 'packages'));

// Count redteam seed payloads
const redteamDir = join(ROOT, 'packages/redteam/src');
const redteamPayloads = countPattern(redteamDir, '.ts', /SEED_\d+/g);

const stats = {
  generatedAt: new Date().toISOString(),
  codebase: {
    detectionRules,
    testCases,
    policyTemplates,
    frameworkAdapters,
    packages,
    redteamPayloads,
  },
};

console.log('Generated stats:', JSON.stringify(stats, null, 2));

// Write to site if it exists
const siteLibDir = join(ROOT, 'authensor-site/src/lib');
if (existsSync(siteLibDir)) {
  writeFileSync(join(siteLibDir, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
  console.log(`Written to ${join(siteLibDir, 'stats.json')}`);
}

// Also write to a root-level file for other consumers
writeFileSync(join(ROOT, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
console.log(`Written to ${join(ROOT, 'stats.json')}`);
