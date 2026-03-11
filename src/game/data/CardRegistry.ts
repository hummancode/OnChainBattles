// ============================================================
// CardRegistry.ts
// Frozen card lookup map + getCard() accessor.
// Flyweight pattern: all definitions are Object.freeze'd.
// ============================================================

import type { CardDefinition } from '../types/CardTypes';
import { CARD_DEFINITIONS } from './CardDefinitions';

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export const CARD_MAP: ReadonlyMap<string, Readonly<CardDefinition>> = new Map(
  CARD_DEFINITIONS.map(c => [c.id, deepFreeze(c)])
);

export function getCard(id: string): Readonly<CardDefinition> {
  const c = CARD_MAP.get(id);
  if (!c) throw new Error(`[CardRegistry] Unknown card id: "${id}"`);
  return c;
}
