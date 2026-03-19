/**
 * cdpHelper.ts — Chrome DevTools Protocol helper for browser performance tests.
 *
 * Connects to a running Chrome instance via --remote-debugging-port=9222.
 * Provides typed wrappers for common CDP domains: Runtime, Performance, Network, DOM.
 *
 * Prerequisites:
 *   - Chrome launched with: --remote-debugging-port=9222 --user-data-dir=<temp>
 *   - Game running at http://localhost:8080
 *   - dev_start.bat does both automatically
 */

import WebSocket from 'ws';

// ── Types ──────────────────────────────────────────────────────────────

export interface CDPResponse {
  id: number;
  result?: Record<string, any>;
  error?: { code: number; message: string };
}

export interface CDPEvent {
  method: string;
  params: Record<string, any>;
}

export interface ChromeTab {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

export interface PerfMetrics {
  JSHeapUsedSize: number;
  JSHeapTotalSize: number;
  Nodes: number;
  Documents: number;
  Frames: number;
  LayoutCount: number;
  RecalcStyleCount: number;
  ScriptDuration: number;
  TaskDuration: number;
  JSEventListeners: number;
  [key: string]: number;
}

export interface FPSResult {
  fps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  droppedFrames: number;
  sampleMs: number;
}

export interface MemorySnapshot {
  usedHeapMB: number;
  totalHeapMB: number;
  limitMB: number;
}

export interface ConsoleEntry {
  type: 'error' | 'warning' | 'exception' | 'log';
  text: string;
  url?: string;
  line?: number;
}

export interface ResourceEntry {
  name: string;
  transferSizeKB: number;
  durationMs: number;
  type: string;
}

// ── CDP Client ─────────────────────────────────────────────────────────

export class CDPClient {
  private ws!: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private eventHandlers = new Map<string, ((params: any) => void)[]>();
  private consoleEntries: ConsoleEntry[] = [];

  /** Discover Chrome tabs via the JSON API. */
  static async getTabs(port = 9222): Promise<ChromeTab[]> {
    const resp = await fetch(`http://localhost:${port}/json`);
    return resp.json();
  }

  /** Find the game tab (localhost:8080). */
  static async findGameTab(port = 9222): Promise<ChromeTab | undefined> {
    const tabs = await CDPClient.getTabs(port);
    return tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
  }

  /** Check if Chrome debugging port is reachable. */
  static async isAvailable(port = 9222): Promise<boolean> {
    try {
      const resp = await fetch(`http://localhost:${port}/json/version`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Connect to a specific tab's WebSocket debugger URL. */
  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());
        // Response to a command
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
        // Event
        if (msg.method) {
          this.collectConsoleEvent(msg);
          const handlers = this.eventHandlers.get(msg.method) ?? [];
          handlers.forEach(h => h(msg.params));
        }
      });
    });
  }

  /** Send a CDP command and await its result. */
  async send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate a JS expression in the page context. */
  async evaluate<T = any>(expression: string, awaitPromise = false): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value as T;
  }

  /** Subscribe to a CDP event. */
  on(method: string, handler: (params: any) => void): void {
    const list = this.eventHandlers.get(method) ?? [];
    list.push(handler);
    this.eventHandlers.set(method, list);
  }

  /** Enable common CDP domains. */
  async enableDomains(): Promise<void> {
    await Promise.all([
      this.send('Runtime.enable'),
      this.send('Performance.enable'),
      this.send('Log.enable'),
    ]);
  }

  /** Close the WebSocket connection. */
  close(): void {
    this.ws?.close();
  }

  // ── Convenience methods ────────────────────────────────────────────

  /** Get Chrome Performance.getMetrics as a typed object. */
  async getPerformanceMetrics(): Promise<PerfMetrics> {
    const { metrics } = await this.send('Performance.getMetrics');
    const result: Record<string, number> = {};
    for (const m of metrics) result[m.name] = m.value;
    return result as PerfMetrics;
  }

  /** Measure FPS over a given duration (ms) using requestAnimationFrame. */
  async measureFPS(durationMs = 2000): Promise<FPSResult> {
    const json = await this.evaluate<string>(`
      new Promise(resolve => {
        const frameTimes = [];
        let lastTime = performance.now();
        const start = lastTime;
        function tick() {
          const now = performance.now();
          frameTimes.push(now - lastTime);
          lastTime = now;
          if (now - start < ${durationMs}) requestAnimationFrame(tick);
          else resolve(JSON.stringify({
            fps: Math.round(frameTimes.length / ((now - start) / 1000)),
            avgFrameMs: +(frameTimes.reduce((a,b)=>a+b,0) / frameTimes.length).toFixed(2),
            maxFrameMs: +Math.max(...frameTimes).toFixed(2),
            droppedFrames: frameTimes.filter(t => t > 33.33).length,
            sampleMs: Math.round(now - start)
          }));
        }
        requestAnimationFrame(tick);
      })
    `, true);
    return JSON.parse(json);
  }

  /** Get JS heap memory snapshot. */
  async getMemory(): Promise<MemorySnapshot> {
    const json = await this.evaluate<string>(`JSON.stringify({
      usedHeapMB: +(performance.memory?.usedJSHeapSize / 1048576).toFixed(1),
      totalHeapMB: +(performance.memory?.totalJSHeapSize / 1048576).toFixed(1),
      limitMB: Math.round(performance.memory?.jsHeapSizeLimit / 1048576)
    })`);
    return JSON.parse(json);
  }

  /** Get page navigation timing. */
  async getNavigationTiming(): Promise<{ loadTimeMs: number; domReadyMs: number }> {
    const json = await this.evaluate<string>(`JSON.stringify({
      loadTimeMs: performance.timing.loadEventEnd - performance.timing.navigationStart,
      domReadyMs: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
    })`);
    return JSON.parse(json);
  }

  /** Get resource loading stats. */
  async getResourceStats(): Promise<{
    count: number;
    totalTransferKB: number;
    slowest: ResourceEntry[];
    byType: Record<string, { count: number; sizeKB: number }>;
  }> {
    const json = await this.evaluate<string>(`JSON.stringify((() => {
      const resources = performance.getEntriesByType('resource');
      const byType = {};
      resources.forEach(r => {
        const ext = r.name.split('.').pop()?.split('?')[0] || 'other';
        if (!byType[ext]) byType[ext] = { count: 0, sizeKB: 0 };
        byType[ext].count++;
        byType[ext].sizeKB += Math.round(r.transferSize / 1024);
      });
      return {
        count: resources.length,
        totalTransferKB: Math.round(resources.reduce((s,r) => s + r.transferSize, 0) / 1024),
        slowest: resources.sort((a,b) => b.duration - a.duration).slice(0, 10)
          .map(r => ({
            name: r.name.split('/').pop()?.split('?')[0],
            transferSizeKB: Math.round(r.transferSize / 1024),
            durationMs: Math.round(r.duration),
            type: r.initiatorType
          })),
        byType
      };
    })())`);
    return JSON.parse(json);
  }

  /** Collect console errors/warnings captured since enableDomains(). */
  getConsoleEntries(): ConsoleEntry[] {
    return [...this.consoleEntries];
  }

  /** Clear collected console entries. */
  clearConsoleEntries(): void {
    this.consoleEntries = [];
  }

  /** Take a heap snapshot delta — returns heap growth after running an action. */
  async measureHeapDelta(actionExpression: string): Promise<{ beforeMB: number; afterMB: number; deltaMB: number }> {
    const json = await this.evaluate<string>(`
      new Promise(async resolve => {
        if (window.gc) window.gc();
        const before = performance.memory.usedJSHeapSize;
        ${actionExpression}
        await new Promise(r => setTimeout(r, 100));
        if (window.gc) window.gc();
        const after = performance.memory.usedJSHeapSize;
        resolve(JSON.stringify({
          beforeMB: +(before / 1048576).toFixed(2),
          afterMB: +(after / 1048576).toFixed(2),
          deltaMB: +((after - before) / 1048576).toFixed(2)
        }));
      })
    `, true);
    return JSON.parse(json);
  }

  /** Get DOM node count. */
  async getDOMNodeCount(): Promise<number> {
    return this.evaluate<number>('document.querySelectorAll("*").length');
  }

  /** Get canvas count and dimensions. */
  async getCanvasInfo(): Promise<{ count: number; canvases: { width: number; height: number }[] }> {
    const json = await this.evaluate<string>(`JSON.stringify({
      count: document.querySelectorAll('canvas').length,
      canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height }))
    })`);
    return JSON.parse(json);
  }

  // ── Internal ───────────────────────────────────────────────────────

  private collectConsoleEvent(msg: CDPEvent): void {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const { type, args } = msg.params;
      if (type === 'error' || type === 'warning') {
        this.consoleEntries.push({
          type,
          text: args.map((a: any) => a.value || a.description || '').join(' ').substring(0, 500),
        });
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const ex = msg.params.exceptionDetails;
      this.consoleEntries.push({
        type: 'exception',
        text: (ex.exception?.description || ex.text || '').substring(0, 500),
        url: ex.url,
        line: ex.lineNumber,
      });
    }
  }
}
