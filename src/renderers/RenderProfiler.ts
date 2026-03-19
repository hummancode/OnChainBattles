// ============================================================
// RenderProfiler.ts
// Lightweight performance profiler for the rendering pipeline.
//
// Measures time spent processing each event type through the
// EventBus → renderer chain. Call begin()/end() around each
// event emission to capture timing.
//
// Data is accumulated per event type and can be queried at any
// time for a summary. Periodic snapshots feed into GameLogger
// and server state reports for post-game analysis.
//
// Pure TypeScript — no Phaser dependency.
// ============================================================

export interface EventTimingEntry {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

export interface RenderPerfSnapshot {
  /** ms since profiler was created or last reset */
  uptimeMs: number;
  /** Total events processed */
  totalEvents: number;
  /** Total ms spent in event handlers */
  totalRenderMs: number;
  /** Per-event-type breakdown */
  byEvent: Record<string, { count: number; totalMs: number; avgMs: number; maxMs: number }>;
  /** Longest single event processing (ms) */
  worstMs: number;
  /** Which event type had the worst single call */
  worstEvent: string;
  /** Events processed per second (rolling) */
  eventsPerSec: number;
  /** Frame budget usage: % of 16.67ms (60fps) used by avg event */
  avgFrameBudgetPct: number;
}

export class RenderProfiler {
  private timings = new Map<string, EventTimingEntry>();
  private startTime: number;
  private totalEvents = 0;
  private pendingStart = 0;
  private pendingType = '';
  private worstMs = 0;
  private worstEvent = '';

  constructor() {
    this.startTime = performance.now();
  }

  /** Call before emitting an event. */
  begin(eventType: string): void {
    this.pendingType = eventType;
    this.pendingStart = performance.now();
  }

  /** Call after all handlers for the event have finished. */
  end(): void {
    const elapsed = performance.now() - this.pendingStart;
    const type = this.pendingType;
    if (!type) return;

    let entry = this.timings.get(type);
    if (!entry) {
      entry = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
      this.timings.set(type, entry);
    }

    entry.count++;
    entry.totalMs += elapsed;
    entry.lastMs = elapsed;
    if (elapsed > entry.maxMs) entry.maxMs = elapsed;

    this.totalEvents++;
    if (elapsed > this.worstMs) {
      this.worstMs = elapsed;
      this.worstEvent = type;
    }

    // Warn on slow events (>8ms = half a frame budget)
    if (elapsed > 8) {
      console.warn(`[RenderProfiler] Slow event: ${type} took ${elapsed.toFixed(2)}ms`);
    }

    this.pendingType = '';
  }

  /** Get a performance snapshot for logging. */
  snapshot(): RenderPerfSnapshot {
    const uptimeMs = performance.now() - this.startTime;
    const byEvent: RenderPerfSnapshot['byEvent'] = {};
    let totalRenderMs = 0;

    for (const [type, entry] of this.timings) {
      totalRenderMs += entry.totalMs;
      byEvent[type] = {
        count: entry.count,
        totalMs: +entry.totalMs.toFixed(2),
        avgMs: +(entry.totalMs / entry.count).toFixed(3),
        maxMs: +entry.maxMs.toFixed(3),
      };
    }

    const avgMs = this.totalEvents > 0 ? totalRenderMs / this.totalEvents : 0;

    return {
      uptimeMs: +uptimeMs.toFixed(0),
      totalEvents: this.totalEvents,
      totalRenderMs: +totalRenderMs.toFixed(2),
      byEvent,
      worstMs: +this.worstMs.toFixed(3),
      worstEvent: this.worstEvent,
      eventsPerSec: uptimeMs > 0 ? +(this.totalEvents / (uptimeMs / 1000)).toFixed(1) : 0,
      avgFrameBudgetPct: +((avgMs / 16.67) * 100).toFixed(1),
    };
  }

  /** Reset all counters (e.g., at scene start after setup noise). */
  reset(): void {
    this.timings.clear();
    this.totalEvents = 0;
    this.worstMs = 0;
    this.worstEvent = '';
    this.startTime = performance.now();
  }

  /** Get a compact summary string for console output. */
  summary(): string {
    const snap = this.snapshot();
    const lines = [
      `Render Perf: ${snap.totalEvents} events in ${(snap.uptimeMs / 1000).toFixed(1)}s (${snap.eventsPerSec} evt/s)`,
      `  Total render time: ${snap.totalRenderMs.toFixed(1)}ms | Avg frame budget: ${snap.avgFrameBudgetPct}%`,
      `  Worst: ${snap.worstEvent} @ ${snap.worstMs.toFixed(2)}ms`,
    ];

    // Sort by total time descending
    const sorted = Object.entries(snap.byEvent)
      .sort(([, a], [, b]) => b.totalMs - a.totalMs)
      .slice(0, 10);

    for (const [type, data] of sorted) {
      lines.push(`  ${type.padEnd(22)} ${String(data.count).padStart(5)}× | total ${data.totalMs.toFixed(1).padStart(7)}ms | avg ${data.avgMs.toFixed(3).padStart(7)}ms | max ${data.maxMs.toFixed(3).padStart(7)}ms`);
    }

    return lines.join('\n');
  }
}
