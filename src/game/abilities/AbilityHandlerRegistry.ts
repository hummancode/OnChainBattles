import type { AbilityHandlerFn } from './types';

class Registry {
  private readonly handlers = new Map<string, AbilityHandlerFn>();

  register(key: string, handler: AbilityHandlerFn): void {
    if (this.handlers.has(key)) {
      console.warn(`[AbilityRegistry] Overwriting handler: ${key}`);
    }
    this.handlers.set(key, handler);
  }

  get(key: string): AbilityHandlerFn | undefined {
    return this.handlers.get(key);
  }

  has(key: string): boolean {
    return this.handlers.has(key);
  }

  listKeys(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const AbilityHandlerRegistry = new Registry();
