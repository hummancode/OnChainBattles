// ============================================================
// Logger.ts — Lightweight structured logging.
//
// Usage:
//   const log = new Logger('SocketManager');
//   log.info('Connected');     // [SocketManager] Connected
//   log.debug('Payload:', x);  // Only shows when level ≤ DEBUG
//
// Level is set globally from VITE_LOG_LEVEL env var or
// Logger.setGlobalLevel(). Defaults to INFO in prod, DEBUG in dev.
// ============================================================

export enum LogLevel {
  DEBUG = 0,
  INFO  = 1,
  WARN  = 2,
  ERROR = 3,
  NONE  = 4,
}

const LEVEL_NAMES: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info:  LogLevel.INFO,
  warn:  LogLevel.WARN,
  error: LogLevel.ERROR,
  none:  LogLevel.NONE,
};

function resolveEnvLevel(): LogLevel {
  // Works in both Vite (import.meta.env) and Node (process.env)
  let raw: string | undefined;
  try { raw = (import.meta as any)?.env?.VITE_LOG_LEVEL; } catch { /* ignore */ }
  if (!raw) {
    try { raw = process?.env?.LOG_LEVEL; } catch { /* ignore */ }
  }
  if (raw && LEVEL_NAMES[raw.toLowerCase()] !== undefined) {
    return LEVEL_NAMES[raw.toLowerCase()];
  }
  // Default: DEBUG in dev, WARN in prod
  try {
    if ((import.meta as any)?.env?.MODE === 'production') return LogLevel.WARN;
  } catch { /* ignore */ }
  return LogLevel.DEBUG;
}

let globalLevel: LogLevel = resolveEnvLevel();

export class Logger {
  constructor(private tag: string) {}

  static setGlobalLevel(level: LogLevel): void {
    globalLevel = level;
  }

  static getGlobalLevel(): LogLevel {
    return globalLevel;
  }

  debug(...args: unknown[]): void {
    if (globalLevel <= LogLevel.DEBUG) console.log(`[${this.tag}]`, ...args);
  }

  info(...args: unknown[]): void {
    if (globalLevel <= LogLevel.INFO) console.log(`[${this.tag}]`, ...args);
  }

  warn(...args: unknown[]): void {
    if (globalLevel <= LogLevel.WARN) console.warn(`[${this.tag}]`, ...args);
  }

  error(...args: unknown[]): void {
    if (globalLevel <= LogLevel.ERROR) console.error(`[${this.tag}]`, ...args);
  }
}
