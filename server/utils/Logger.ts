// ============================================================
// Logger.ts — Server-side structured logging.
// Mirror of src/utils/Logger.ts for server code.
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

let globalLevel: LogLevel = (() => {
  const raw = process.env.LOG_LEVEL;
  if (raw && LEVEL_NAMES[raw.toLowerCase()] !== undefined) {
    return LEVEL_NAMES[raw.toLowerCase()];
  }
  return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
})();

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
