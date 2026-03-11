// ============================================================
// CardRegistry.ts
// Frozen card lookup map + getCard() accessor.
// Flyweight pattern: all definitions are Object.freeze'd.
// ============================================================

import type { CardDefinition } from '../types/CardTypes';
import { CARD_DEFINITIONS } from './CardDefinitions';

export const CARD_MAP: ReadonlyMap<string, Readonly<CardDefinition>> = new Map(
  CARD_DEFINITIONS.map(c => [c.id, Object.freeze(c)])
);

export function getCard(id: string): Readonly<CardDefinition> {
  const c = CARD_MAP.get(id);
  if (!c) throw new Error(`[CardRegistry] Unknown card id: "${id}"`);
  return c;
}
