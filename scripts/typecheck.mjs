#!/usr/bin/env node
// ============================================================
// typecheck.mjs — tsc --noEmit that tolerates the known baseline.
//
// The codebase carries ~16 pre-existing "unused variable" diagnostics
// (TS6133 / TS6196 / TS6192 / TS6198) that are intentionally not fixed
// (see CLAUDE.md). Plain `tsc --noEmit` therefore always exits non-zero,
// which made the CI type-check step useless. This script fails only on
// real type errors.
//
// Usage: node scripts/typecheck.mjs client|server
// ============================================================
import { spawnSync } from 'node:child_process';

const target = process.argv[2] ?? 'client';
const project = target === 'server' ? 'tsconfig.server.json' : 'tsconfig.json';
const BASELINE = /error TS(6133|6196|6192|6198):/;

const res = spawnSync('npx', ['tsc', '--noEmit', '-p', project], { encoding: 'utf8', shell: process.platform === 'win32' });
const lines = `${res.stdout}${res.stderr}`.split('\n');
const errors = lines.filter(l => /error TS\d+:/.test(l) && !BASELINE.test(l));
const baseline = lines.filter(l => BASELINE.test(l)).length;

if (errors.length) {
  console.error(`[typecheck:${target}] ${errors.length} type error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`[typecheck:${target}] OK (${baseline} baseline unused-variable warnings ignored)`);
