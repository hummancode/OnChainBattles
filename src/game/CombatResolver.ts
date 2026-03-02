// ============================================================
// CombatResolver.ts
// Pure functions — never mutates board or player state.
// Returns GameEvent[] arrays that GameEngine applies to state.
// All combat math lives here.
// ============================================================

import type { Unit } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardDefinitions';
import {
  EvUnitAttacked, EvUnitDied, EvUnitHealed, EvUnitTransformed,
  GameEvent
} from './types/EventTypes';

// ─────────────────────────────────────────────
// COMBAT RESOLUTION
// ─────────────────────────────────────────────

/**
 * Resolve a single attack from attacker → defender.
 * Returns GameEvent[] — caller applies these to state.
 * Never mutates board or units directly.
 */
export function resolveAttack(
  attacker: Unit,
  defender: Unit,
  board: Board
): GameEvent[] {
  const events: GameEvent[] = [];

  let damage = calculateDamage(attacker, defender);

  // King HP tracking
  const isKingHit = defender.cardId === 'king';

  const newHP = Math.max(0, defender.currentDef - damage);
  const targetPlayer = defender.owner;
  const maxHP = defender.maxDef;

  const attackEvent: EvUnitAttacked = {
    type: 'UNIT_ATTACKED',
    attackerInstanceId: attacker.instanceId,
    targetInstanceId:   defender.instanceId,
    attackerCol: attacker.position.col,
    attackerRow: attacker.position.row,
    targetCol:   defender.position.col,
    targetRow:   defender.position.row,
    damage,
    targetNewHP: newHP,
    targetPlayer,
    isKingHit,
    newHP:  isKingHit ? newHP : undefined,
    maxHP:  isKingHit ? maxHP : undefined,
  };
  events.push(attackEvent);

  // Death check
  if (newHP <= 0 && defender.cardId !== 'king') {
    // King doesn't "die" from combat events — game over handled separately
    const dieEvent: EvUnitDied = {
      type: 'UNIT_DIED',
      instanceId: defender.instanceId,
      cardId:     defender.cardId,
      owner:      defender.owner,
      col:        defender.position.col,
      row:        defender.position.row,
      cause:      'COMBAT',
    };
    events.push(dieEvent);
  }

  return events;
}

/**
 * Resolve Castle area attack: damages all adjacent enemies simultaneously.
 * Called during LEG phase, not ACT phase.
 */
export function resolveCastleAreaAttack(castle: Unit, board: Board): GameEvent[] {
  const events: GameEvent[] = [];

  const adjacent = board.getAdjacentUnits(castle.position.col, castle.position.row);
  const enemies = adjacent.filter(u => u.owner !== castle.owner);

  for (const enemy of enemies) {
    const subEvents = resolveAttack(castle, enemy, board);
    events.push(...subEvents);
  }

  return events;
}

/**
 * Apply N damage to a unit (Earthquake, Disease, etc.).
 * Returns GameEvent[].
 */
export function applyDamage(
  unit: Unit,
  damage: number,
  cause: EvUnitDied['cause']
): GameEvent[] {
  const events: GameEvent[] = [];
  const newHP = Math.max(0, unit.currentDef - damage);

  events.push({
    type: 'UNIT_ATTACKED',
    attackerInstanceId: 'EFFECT',
    targetInstanceId:   unit.instanceId,
    attackerCol: -1, attackerRow: -1,
    targetCol:   unit.position.col,
    targetRow:   unit.position.row,
    damage,
    targetNewHP:  newHP,
    targetPlayer: unit.owner,
    isKingHit:    unit.cardId === 'king',
    newHP:  unit.cardId === 'king' ? newHP : undefined,
    maxHP:  unit.cardId === 'king' ? unit.maxDef : undefined,
  });

  if (newHP <= 0 && unit.cardId !== 'king') {
    events.push({
      type: 'UNIT_DIED',
      instanceId: unit.instanceId,
      cardId:     unit.cardId,
      owner:      unit.owner,
      col:        unit.position.col,
      row:        unit.position.row,
      cause,
    });
  }

  return events;
}

/**
 * Heal a unit by amount (capped at maxDef).
 * Returns GameEvent[].
 */
export function applyHeal(unit: Unit, amount: number): GameEvent[] {
  const healed = Math.min(amount, unit.maxDef - unit.currentDef);
  if (healed <= 0) return [];

  return [{
    type: 'UNIT_HEALED',
    instanceId: unit.instanceId,
    cardId:     unit.cardId,
    col:        unit.position.col,
    row:        unit.position.row,
    amount:     healed,
    newHP:      unit.currentDef + healed,
    maxHP:      unit.maxDef,
    player:     unit.owner,
    isKing:     unit.cardId === 'king',
  }];
}

/**
 * Full heal: restore to maxDef.
 */
export function applyFullHeal(unit: Unit): GameEvent[] {
  return applyHeal(unit, unit.maxDef - unit.currentDef);
}

/**
 * Auto-heal: Kings Guard +2 per turn.
 */
export function applyAutoHeal(unit: Unit, amount: number): GameEvent[] {
  return applyHeal(unit, amount);
}

/**
 * Reform: transform all matching units on board.
 * Returns GameEvent[] with UNIT_TRANSFORMED events.
 * HP scales proportionally: newHP = (currentHP / maxHP) * newMaxHP, rounded up.
 */
export function applyReform(
  fromCardId: string,
  toCardId: string,
  board: Board
): GameEvent[] {
  const events: GameEvent[] = [];
  const toDef = getCard(toCardId);
  const newMaxHP = toDef.stats?.def ?? 1;

  const units = board.getAllUnits().filter(u => u.cardId === fromCardId);

  for (const unit of units) {
    const hpRatio = unit.maxDef > 0 ? unit.currentDef / unit.maxDef : 1;
    const newHP = Math.max(1, Math.ceil(hpRatio * newMaxHP));

    const event: EvUnitTransformed = {
      type:            'UNIT_TRANSFORMED',
      oldInstanceId:   unit.instanceId,
      newInstanceId:   unit.instanceId + '_reformed',
      fromCardId,
      toCardId,
      col:     unit.position.col,
      row:     unit.position.row,
      owner:   unit.owner,
      newHP,
      newMaxHP,
    };
    events.push(event);
  }

  return events;
}

/**
 * Earthquake: all units in a column take damage.
 */
export function applyEarthquakeDamage(
  col: number,
  damage: number,
  board: Board
): GameEvent[] {
  const events: GameEvent[] = [];
  const unitsInCol = board.getUnitsInColumn(col);

  for (const unit of unitsInCol) {
    events.push(...applyDamage(unit, damage, 'EARTHQUAKE'));
  }

  return events;
}

// ─────────────────────────────────────────────
// DAMAGE CALCULATION
// ─────────────────────────────────────────────

/**
 * Calculate raw damage before any special effects.
 * Applies: cavalry counter (Pikeman ×3 vs cavalry).
 */
function calculateDamage(attacker: Unit, defender: Unit): number {
  let atk = attacker.currentAtk;

  // Pikeman cavalry counter
  const isCavalry = isUnitCavalry(defender);
  if (isCavalry && hasFlag(attacker, 'CAVALRY_COUNTER')) {
    atk *= 3;
  }

  return Math.max(0, atk);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function isUnitCavalry(unit: Unit): boolean {
  const def = getCard(unit.cardId);
  return def.subtypes.includes('CAVALRY' as any);
}

function hasFlag(unit: Unit, flag: string): boolean {
  const def = getCard(unit.cardId);
  return def.flags.includes(flag as any);
}
