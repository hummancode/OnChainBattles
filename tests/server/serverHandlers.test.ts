/**
 * The server bundles the engine WITHOUT src/main.ts, which is where registerAll was imported.
 * The authoritative server engine therefore ran with (almost) no ability handlers: every
 * ability that resolved differently produced a STATE MISMATCH → endless resync in real games
 * (found by the two-browser end-to-end match). Bundle exactly what MatchSimulation imports, in a
 * clean Node process, and require the same handler set the client has.
 */
import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import '../../src/game/abilities/registerAll';
import { AbilityHandlerRegistry } from '../../src/game/abilities/AbilityHandlerRegistry';

describe('server engine bundle', () => {
  it('registers every ability handler without the client entry point', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ocb-handlers-'));
    const entry = join(dir, 'entry.ts');
    const root = resolve('.');
    writeFileSync(entry, `
      import { MatchSimulation } from ${JSON.stringify(join(root, 'server/game/MatchSimulation.ts'))};
      import { AbilityHandlerRegistry } from ${JSON.stringify(join(root, 'src/game/abilities/AbilityHandlerRegistry.ts'))};
      void MatchSimulation;
      console.log(JSON.stringify(AbilityHandlerRegistry.listKeys().sort()));
    `);
    const out = join(dir, 'out.mjs');
    await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out, logLevel: 'silent', absWorkingDir: root });
    const serverKeys: string[] = JSON.parse(execFileSync('node', [out], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop()!);
    expect(serverKeys).toEqual(AbilityHandlerRegistry.listKeys().sort());
  }, 60_000);
});
