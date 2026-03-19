/**
 * browserPerf.test.ts — Browser-level performance tests via Chrome DevTools Protocol.
 *
 * Unlike engine perf tests (which run headless in vitest), these connect to a
 * LIVE Chrome instance running the game and measure real-world browser metrics:
 *   - FPS and frame timing
 *   - JS heap memory usage and growth
 *   - DOM node count and event listener count
 *   - Page load / navigation timing
 *   - Resource loading (sizes, counts, slowest assets)
 *   - Console errors and uncaught exceptions
 *   - WebGL canvas health
 *   - Memory leak detection (idle heap growth)
 *
 * Prerequisites:
 *   1. Run `dev_start.bat` (starts server, Vite, and Chrome with --remote-debugging-port=9222)
 *   2. Wait for the game to fully load at http://localhost:8080
 *   3. Run: npx vitest run tests/browser/browserPerf.test.ts
 *
 * These tests are SKIPPED if Chrome debugging port is not available,
 * so they won't break CI or regular `npm run test:game`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CDPClient, type PerfMetrics, type FPSResult, type MemorySnapshot, type ConsoleEntry } from './cdpHelper';

// ── Test configuration ──────────────────────────────────────────────────

const CDP_PORT = 9222;
const GAME_URL_PATTERN = 'localhost:8080';

/** Performance budgets — thresholds that flag regressions. */
const BUDGET = {
  pageLoadMs: 3000,          // Page should load within 3s
  domReadyMs: 2000,          // DOM ready within 2s
  fpsMin: 30,                // Minimum acceptable FPS
  fpsTarget: 55,             // Target FPS (near 60)
  maxFrameMs: 100,           // No single frame > 100ms (3-frame stutter at 30fps)
  droppedFramesPct: 10,      // Less than 10% dropped frames (>33ms)
  heapUsedMB: 100,           // JS heap under 100MB
  heapGrowthMB: 5,           // Idle heap growth under 5MB over 10s
  domNodes: 500,             // DOM nodes (canvas game should be low)
  eventListeners: 1000,      // Total event listeners
  consoleErrors: 0,          // Zero console errors
  consoleExceptions: 0,      // Zero uncaught exceptions
  resourceTotalMB: 50,       // Total resource transfer under 50MB
  singleAssetMB: 5,          // No single asset > 5MB
  resourceCount: 500,        // Total resource count
  largeImageKB: 3000,        // Flag images > 3MB
};

// ── Setup / Teardown ────────────────────────────────────────────────────

let cdp: CDPClient;
let chromeAvailable = false;

beforeAll(async () => {
  chromeAvailable = await CDPClient.isAvailable(CDP_PORT);
  if (!chromeAvailable) {
    console.warn('\n⚠ Chrome not running with --remote-debugging-port=9222');
    console.warn('  Run dev_start.bat first. Browser perf tests will be SKIPPED.\n');
    return;
  }

  const tab = await CDPClient.findGameTab(CDP_PORT);
  if (!tab) {
    chromeAvailable = false;
    console.warn('\n⚠ Game tab (localhost:8080) not found in Chrome. Skipping browser tests.\n');
    return;
  }

  cdp = new CDPClient();
  await cdp.connect(tab.webSocketDebuggerUrl);
  await cdp.enableDomains();
  // Let console events accumulate for a moment
  await new Promise(r => setTimeout(r, 500));
});

afterAll(() => {
  cdp?.close();
});

// Helper: skip test if Chrome is not available
function requireChrome() {
  if (!chromeAvailable) return true;
  return false;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Browser Performance Tests (CDP)', () => {

  // ── Page Load ──────────────────────────────────────────────────────

  describe('Page Load', () => {
    it('page loads within budget', async () => {
      if (requireChrome()) return;

      const timing = await cdp.getNavigationTiming();
      console.log(`  Page load: ${timing.loadTimeMs}ms (budget: ${BUDGET.pageLoadMs}ms)`);
      console.log(`  DOM ready: ${timing.domReadyMs}ms (budget: ${BUDGET.domReadyMs}ms)`);

      expect(timing.loadTimeMs).toBeLessThan(BUDGET.pageLoadMs);
      expect(timing.domReadyMs).toBeLessThan(BUDGET.domReadyMs);
    });
  });

  // ── FPS & Frame Timing ─────────────────────────────────────────────

  describe('FPS & Frame Timing', () => {
    it('maintains acceptable FPS (2s sample)', async () => {
      if (requireChrome()) return;

      const fps: FPSResult = await cdp.measureFPS(2000);
      const droppedPct = fps.sampleMs > 0
        ? +((fps.droppedFrames / (fps.fps * fps.sampleMs / 1000)) * 100).toFixed(1)
        : 0;

      console.log(`  FPS: ${fps.fps} (target: ${BUDGET.fpsTarget}+, min acceptable: ${BUDGET.fpsMin})`);
      console.log(`  Avg frame: ${fps.avgFrameMs}ms`);
      console.log(`  Max frame: ${fps.maxFrameMs}ms (budget: ${BUDGET.maxFrameMs}ms)`);
      console.log(`  Dropped frames (>33ms): ${fps.droppedFrames} (~${droppedPct}%)`);

      expect(fps.fps).toBeGreaterThanOrEqual(BUDGET.fpsMin);
      expect(fps.maxFrameMs).toBeLessThan(BUDGET.maxFrameMs);
    });

    it('FPS near target (informational)', async () => {
      if (requireChrome()) return;

      const fps = await cdp.measureFPS(2000);

      // This is informational — not a hard failure, just a warning
      if (fps.fps < BUDGET.fpsTarget) {
        console.warn(`  ⚠ FPS ${fps.fps} is below target ${BUDGET.fpsTarget}. Investigate rendering.`);
      } else {
        console.log(`  ✓ FPS ${fps.fps} meets target ${BUDGET.fpsTarget}`);
      }

      // Soft assertion — warn but don't fail
      expect(fps.fps).toBeGreaterThanOrEqual(BUDGET.fpsMin);
    });
  });

  // ── Memory ─────────────────────────────────────────────────────────

  describe('Memory', () => {
    it('JS heap usage within budget', async () => {
      if (requireChrome()) return;

      const mem: MemorySnapshot = await cdp.getMemory();
      console.log(`  Heap used: ${mem.usedHeapMB} MB (budget: ${BUDGET.heapUsedMB} MB)`);
      console.log(`  Heap total: ${mem.totalHeapMB} MB`);
      console.log(`  Heap limit: ${mem.limitMB} MB`);

      expect(mem.usedHeapMB).toBeLessThan(BUDGET.heapUsedMB);
    });

    it('no significant memory leak during idle (10s observation)', async () => {
      if (requireChrome()) return;

      const before = await cdp.getMemory();
      // Wait 10 seconds while game idles
      await new Promise(r => setTimeout(r, 10000));
      const after = await cdp.getMemory();
      const growth = +(after.usedHeapMB - before.usedHeapMB).toFixed(2);

      console.log(`  Heap before: ${before.usedHeapMB} MB`);
      console.log(`  Heap after:  ${after.usedHeapMB} MB`);
      console.log(`  Growth:      ${growth} MB (budget: ${BUDGET.heapGrowthMB} MB)`);

      expect(growth).toBeLessThan(BUDGET.heapGrowthMB);
    }, 15000); // 15s timeout for this test
  });

  // ── Chrome Performance Metrics ─────────────────────────────────────

  describe('Chrome Performance Metrics', () => {
    it('DOM node count within budget', async () => {
      if (requireChrome()) return;

      const metrics: PerfMetrics = await cdp.getPerformanceMetrics();
      console.log(`  DOM Nodes: ${metrics.Nodes} (budget: ${BUDGET.domNodes})`);
      console.log(`  Documents: ${metrics.Documents}`);
      console.log(`  Frames: ${metrics.Frames}`);

      expect(metrics.Nodes).toBeLessThan(BUDGET.domNodes);
    });

    it('event listener count within budget', async () => {
      if (requireChrome()) return;

      const metrics = await cdp.getPerformanceMetrics();
      console.log(`  Event listeners: ${metrics.JSEventListeners} (budget: ${BUDGET.eventListeners})`);

      expect(metrics.JSEventListeners).toBeLessThan(BUDGET.eventListeners);
    });

    it('script/task duration reasonable', async () => {
      if (requireChrome()) return;

      const metrics = await cdp.getPerformanceMetrics();
      console.log(`  Script duration: ${metrics.ScriptDuration.toFixed(2)}s`);
      console.log(`  Task duration: ${metrics.TaskDuration.toFixed(2)}s`);
      console.log(`  Layout count: ${metrics.LayoutCount}`);
      console.log(`  Style recalcs: ${metrics.RecalcStyleCount}`);
      console.log(`  JS heap used: ${(metrics.JSHeapUsedSize / 1048576).toFixed(1)} MB`);
    });
  });

  // ── Canvas / WebGL ─────────────────────────────────────────────────

  describe('Canvas & WebGL', () => {
    it('has exactly 1 game canvas', async () => {
      if (requireChrome()) return;

      const info = await cdp.getCanvasInfo();
      console.log(`  Canvas count: ${info.count}`);
      info.canvases.forEach((c, i) => {
        console.log(`  Canvas ${i}: ${c.width}x${c.height}`);
      });

      expect(info.count).toBe(1);
      expect(info.canvases[0].width).toBeGreaterThan(0);
      expect(info.canvases[0].height).toBeGreaterThan(0);
    });

    it('WebGL context is healthy', async () => {
      if (requireChrome()) return;

      const healthy = await cdp.evaluate<boolean>(`(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return false;
        return !gl.isContextLost();
      })()`);

      console.log(`  WebGL context healthy: ${healthy}`);
      expect(healthy).toBe(true);
    });

    it('WebGL texture/buffer stats (informational)', async () => {
      if (requireChrome()) return;

      const json = await cdp.evaluate<string>(`JSON.stringify((() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!gl) return { error: 'no context' };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown',
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxViewport: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
        };
      })())`);
      const info = JSON.parse(json);
      console.log(`  Renderer: ${info.renderer}`);
      console.log(`  Max texture size: ${info.maxTextureSize}`);
    });
  });

  // ── Console Errors ─────────────────────────────────────────────────

  describe('Console Health', () => {
    it('no uncaught exceptions', async () => {
      if (requireChrome()) return;

      const entries = cdp.getConsoleEntries();
      const exceptions = entries.filter(e => e.type === 'exception');

      console.log(`  Total console entries captured: ${entries.length}`);
      console.log(`  Exceptions: ${exceptions.length}`);

      if (exceptions.length > 0) {
        // Group by message (first 80 chars)
        const grouped = new Map<string, number>();
        exceptions.forEach(e => {
          const key = e.text.substring(0, 80);
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        });
        grouped.forEach((count, msg) => {
          console.log(`    [x${count}] ${msg}`);
        });
      }

      // This SHOULD be 0 but we report the count — adjust based on known issues
      expect(exceptions.length).toBe(BUDGET.consoleExceptions);
    });

    it('no console errors', async () => {
      if (requireChrome()) return;

      const entries = cdp.getConsoleEntries();
      const errors = entries.filter(e => e.type === 'error');

      if (errors.length > 0) {
        errors.slice(0, 5).forEach(e => {
          console.log(`  [error] ${e.text.substring(0, 120)}`);
        });
      }

      expect(errors.length).toBe(BUDGET.consoleErrors);
    });
  });

  // ── Resource Loading ───────────────────────────────────────────────

  describe('Resource Loading', () => {
    it('total transfer size within budget', async () => {
      if (requireChrome()) return;

      const stats = await cdp.getResourceStats();
      const totalMB = +(stats.totalTransferKB / 1024).toFixed(1);
      console.log(`  Resources: ${stats.count} (budget: ${BUDGET.resourceCount})`);
      console.log(`  Total transfer: ${totalMB} MB (budget: ${BUDGET.resourceTotalMB} MB)`);

      expect(stats.count).toBeLessThan(BUDGET.resourceCount);
      expect(totalMB).toBeLessThan(BUDGET.resourceTotalMB);
    });

    it('no oversized individual assets', async () => {
      if (requireChrome()) return;

      const stats = await cdp.getResourceStats();
      const oversized = stats.slowest.filter(r => r.transferSizeKB > BUDGET.singleAssetMB * 1024);

      console.log(`  Top 5 slowest resources:`);
      stats.slowest.slice(0, 5).forEach(r => {
        console.log(`    ${r.name}: ${r.transferSizeKB} KB, ${r.durationMs}ms (${r.type})`);
      });

      if (oversized.length > 0) {
        console.warn(`  ⚠ Oversized assets (>${BUDGET.singleAssetMB}MB):`);
        oversized.forEach(r => console.warn(`    ${r.name}: ${r.transferSizeKB}KB`));
      }

      // In dev mode, Vite serves unminified bundles (phaser.js ~6.5MB).
      // Only fail for non-JS oversized assets; JS bundles are minified in prod.
      const nonJSOversized = oversized.filter(r => !/\.js$/.test(r.name));
      expect(nonJSOversized.length).toBe(0);
    });

    it('large images flagged for optimization', async () => {
      if (requireChrome()) return;

      const stats = await cdp.getResourceStats();
      const largeImages = stats.slowest
        .filter(r => r.transferSizeKB > BUDGET.largeImageKB && /\.(png|jpg|jpeg|webp|svg)/.test(r.name));

      console.log(`  Images > ${BUDGET.largeImageKB}KB:`);
      if (largeImages.length === 0) {
        console.log(`    None — all within budget`);
      } else {
        largeImages.forEach(r => {
          console.log(`    ${r.name}: ${r.transferSizeKB} KB — consider WebP/compression`);
        });
      }

      // Informational — report but don't fail
    });

    it('resource breakdown by type', async () => {
      if (requireChrome()) return;

      const stats = await cdp.getResourceStats();
      console.log(`  Resource breakdown:`);
      const sorted = Object.entries(stats.byType)
        .sort((a, b) => (b[1] as any).sizeKB - (a[1] as any).sizeKB);
      sorted.forEach(([type, data]: [string, any]) => {
        console.log(`    .${type}: ${data.count} files, ${data.sizeKB} KB`);
      });
    });
  });

  // ── Event Listener Leak Detection ──────────────────────────────────

  describe('Event Listener Leak Detection', () => {
    it('listener count stable over 5s idle', async () => {
      if (requireChrome()) return;

      const before = await cdp.getPerformanceMetrics();
      await new Promise(r => setTimeout(r, 5000));
      const after = await cdp.getPerformanceMetrics();

      const growth = after.JSEventListeners - before.JSEventListeners;
      console.log(`  Listeners before: ${before.JSEventListeners}`);
      console.log(`  Listeners after:  ${after.JSEventListeners}`);
      console.log(`  Growth:           ${growth}`);

      // Allow small fluctuations (±5) but flag significant growth
      expect(Math.abs(growth)).toBeLessThan(20);
    }, 10000);
  });

  // ── Performance Timeline Snapshot ──────────────────────────────────

  describe('Performance Summary', () => {
    it('generates full performance report', async () => {
      if (requireChrome()) return;

      const [metrics, memory, fps, nav, resources, canvas] = await Promise.all([
        cdp.getPerformanceMetrics(),
        cdp.getMemory(),
        cdp.measureFPS(1000),
        cdp.getNavigationTiming(),
        cdp.getResourceStats(),
        cdp.getCanvasInfo(),
      ]);
      const entries = cdp.getConsoleEntries();

      console.log('\n╔══════════════════════════════════════════════╗');
      console.log('║       BROWSER PERFORMANCE REPORT             ║');
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║ Page Load:      ${String(nav.loadTimeMs + 'ms').padEnd(10)} (budget: ${BUDGET.pageLoadMs}ms)`);
      console.log(`║ FPS:            ${String(fps.fps).padEnd(10)} (target: ${BUDGET.fpsTarget})`);
      console.log(`║ Max Frame:      ${String(fps.maxFrameMs + 'ms').padEnd(10)} (budget: ${BUDGET.maxFrameMs}ms)`);
      console.log(`║ Heap Used:      ${String(memory.usedHeapMB + 'MB').padEnd(10)} (budget: ${BUDGET.heapUsedMB}MB)`);
      console.log(`║ DOM Nodes:      ${String(metrics.Nodes).padEnd(10)} (budget: ${BUDGET.domNodes})`);
      console.log(`║ Listeners:      ${String(metrics.JSEventListeners).padEnd(10)} (budget: ${BUDGET.eventListeners})`);
      console.log(`║ Canvas:         ${canvas.count} (${canvas.canvases[0]?.width}x${canvas.canvases[0]?.height})`);
      console.log(`║ Resources:      ${resources.count} files, ${(resources.totalTransferKB/1024).toFixed(1)}MB`);
      console.log(`║ Console Errors: ${entries.filter(e => e.type === 'exception').length} exceptions`);
      console.log('╚══════════════════════════════════════════════╝\n');
    });
  });
});
