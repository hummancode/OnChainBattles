# OnChainBattles — Performance Report & Improvement Suggestions

**Date**: 2026-03-15
**Test Environment**: Chrome 146, Windows 11, AMD Radeon RX 6650 XT, Dev mode (Vite HMR)
**Game State**: Login scene (idle, no active match)

---

## Current Performance Snapshot

| Metric | Value | Budget | Status |
|--------|-------|--------|--------|
| Page Load | 931ms | 3000ms | OK |
| DOM Ready | 898ms | 2000ms | OK |
| FPS | 60 | 55+ | OK |
| Avg Frame Time | 16.62ms | <33ms | OK |
| Max Frame Time | 20.1ms | <100ms | OK |
| Dropped Frames | 0% | <10% | OK |
| JS Heap Used | 41.1 MB | 100 MB | OK |
| JS Heap Total | 67.3 MB | — | — |
| Memory Leak (10s idle) | 0 MB growth | <5 MB | OK |
| DOM Nodes | 326 | 500 | OK |
| Event Listeners | 316 | 1000 | OK |
| Listener Leak (5s idle) | 0 growth | <20 | OK |
| Canvas | 1 (1280x720) | 1 | OK |
| WebGL Context | Healthy | — | OK |
| Console Exceptions | 0 (at capture) | 0 | OK* |
| Resources | 250 files | 500 | OK |
| Total Transfer | 8.0 MB (dev) | 50 MB | OK |

*Note: 23 "Uncaught (in promise)" `glTexture` exceptions were observed during initial connection but cleared after page stabilized. See Issue #1 below.

---

## Issues Found

### Issue #1: Phaser Text `glTexture` Null Reference (HIGH)

**Symptom**: 23 uncaught promise exceptions during page lifecycle:
```
TypeError: Cannot read properties of null (reading 'glTexture')
  at Text2.updateText (phaser.js:47082)
  at TextStyle2.setColor (...)
```

**Root Cause**: Code is calling `.setColor()` (or similar style methods) on a Phaser Text object whose WebGL texture has already been destroyed — typically because the Text belongs to a scene that has been shut down, but a reference still exists (timer, tween, event handler).

**Impact**: No visible crash, but:
- Each exception costs ~0.1-0.5ms of main thread time
- 23 exceptions = unnecessary GC pressure
- Could mask real errors in console

**Suggested Fix**:
1. Audit all `Text.setColor()` / `Text.setText()` calls in scene code
2. Ensure text objects aren't updated after `scene.shutdown()` — check for dangling `time.delayedCall`, `tweens`, or event handlers
3. Add null guards: `if (text.active) text.setColor(...)` or check `text.texture?.glTexture`
4. Most likely in `HUDRenderer` or `OverlayRenderer` during scene transitions

---

### Issue #2: Phaser.js Unminified in Dev (LOW, expected)

**Symptom**: `phaser.js` served at 6,497 KB (6.3 MB) — the single largest resource.

**Impact**: Dev-only. Vite tree-shakes and minifies for production builds.

**Action**: No fix needed. Verify prod build size with `npm run build && du -sh dist/`.

---

## Improvement Suggestions

### Priority 1: Fix the glTexture Exceptions

This is the only active bug found. Steps:
1. Search for `setColor`, `setText`, `setAlpha` calls on Text objects
2. Cross-reference with scene lifecycle — are any called after the scene shuts down?
3. The `HUDRefreshCoordinator` is a likely suspect — it orchestrates HUD text updates and may fire after scene transition
4. Add `this.scene.events.on('shutdown', () => { /* cancel pending updates */ })` to any renderer that schedules deferred text updates

### Priority 2: Image Asset Optimization (MEDIUM)

Background images are the heaviest non-JS assets:

| Asset | Size | Load Time |
|-------|------|-----------|
| bg_menu.png | ~2,374 KB | 351ms |
| board_skin.png | ~2,218 KB | 350ms |
| bg_main_menu.png | ~2,374 KB | 316ms |
| bg_lobby.png | ~2,301 KB | 298ms |
| logo.png | ~1,054 KB | 329ms |

**Suggestions**:
- Convert PNGs to **WebP** format (typically 30-50% smaller with same quality)
- For backgrounds, consider **JPEG at 80-85% quality** (lossy is fine for background art)
- Add `loading="lazy"` or Phaser's lazy-load groups for scenes not immediately visible
- Consider a **texture atlas** for smaller sprites to reduce HTTP requests
- Target: backgrounds under 500KB each → save ~8MB total transfer

### Priority 3: Bundle Size Audit for Production (MEDIUM)

Dev transfer is 8MB across 250 resources. For production:
- Run `npm run build` and check output sizes
- `ethers.js` (781 KB dev) — if only using a few functions, consider importing specific modules:
  ```ts
  // Instead of: import { ethers } from 'ethers';
  // Use: import { BrowserProvider, Contract } from 'ethers';
  ```
- `socket.io-client` (105 KB dev) — already reasonable
- Vite's tree-shaking should handle most of this, but verify with `npx vite-bundle-analyzer`

### Priority 4: Event Listener Hygiene (LOW — currently healthy)

316 listeners is fine, and the leak test shows 0 growth. But as the game adds features:
- Continue enforcing the "every addEventListener needs removeEventListener" rule
- The browser perf test now automatically catches listener leaks
- Consider adding a "during match" version of the leak test (listener count during active gameplay)

### Priority 5: In-Match Performance Testing (FUTURE)

Current browser tests measure the **idle/login state**. For comprehensive coverage, add:
- **Scene transition FPS** — measure FPS drops when switching scenes (e.g., Lobby → Battle)
- **Mid-battle memory** — heap snapshot with 10+ units on board, auras active
- **Animation stress** — FPS during combat animations (attacks, deaths, spells)
- **WebSocket latency** — measure round-trip time for game actions via Socket.IO
- **Long session stability** — memory/listener growth over 5+ minutes of gameplay

This requires Playwright or CDP-driven game interaction (clicking through login, creating a match, etc.).

---

## Test Infrastructure Created

### New Files
- `tests/browser/cdpHelper.ts` — Reusable CDP client for Chrome DevTools Protocol
- `tests/browser/browserPerf.test.ts` — 19 browser performance tests

### New npm Script
```bash
npm run test:browser    # Run browser perf tests (requires Chrome + dev_start.bat)
```

### How It Works
1. `dev_start.bat` launches Chrome with `--remote-debugging-port=9222`
2. Tests connect via WebSocket to Chrome's CDP endpoint
3. Tests use `Runtime.evaluate` to measure FPS, memory, resources in the real browser
4. Tests use `Performance.getMetrics` for Chrome-internal counters
5. Tests auto-skip if Chrome isn't available (safe for CI)

### Performance Budgets
Defined in `browserPerf.test.ts` — adjust as the game grows:
- FPS: 30 min, 55 target
- Heap: 100 MB max, 5 MB idle growth limit
- DOM: 500 nodes, 1000 listeners
- Frame time: 100ms max spike
- Transfer: 50 MB total, 5 MB per asset

---

## Recommendations Summary

| # | Issue | Priority | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | Fix glTexture null exceptions | HIGH | 1-2h | Eliminates 23 errors, cleaner console |
| 2 | Convert background PNGs to WebP | MEDIUM | 30min | ~8MB transfer savings |
| 3 | Production bundle audit | MEDIUM | 1h | Verify tree-shaking, check ethers.js size |
| 4 | Add in-match perf tests | LOW | 2-3h | Catch regressions during gameplay |
| 5 | Lazy-load non-visible scene assets | LOW | 1-2h | Faster initial load |
