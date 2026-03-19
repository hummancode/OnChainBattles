/**
 * Global test setup — runs before every test file.
 * Ensures clean state between test runs.
 */

import { beforeEach } from 'vitest';

// Polyfill localStorage for Node environment (AuthManager uses it at import time)
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

import GameState from '../src/GameState';

beforeEach(() => {
  // Reset global game state to prevent cross-test contamination
  GameState.clearMatchData();
  GameState.gameSeed = 42; // deterministic default
});
