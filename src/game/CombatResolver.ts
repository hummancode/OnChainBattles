// ============================================================
// CombatResolver.ts
// Pure functions — never mutates board or player state.
// Returns GameEvent[] arrays that GameEngine applies to state.
// All combat math lives here.
//
// PATCH v0.5 (dying blow):
//   - Counter-attack now fires even if defender dies from primary attack.
//     A dying melee unit still retaliates before falling. Uses defender's
//     pre-damage ATK for counter damage calculation.
//   - Assassin jump still immune to counter-attack.
//   - Event order: primary attack → defender death → counter-attack → attacker death
// ============================================================

import type { Unit } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardDefinitions';
import { CombatTag, AtkPattern } from './types/CardTypes';
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

  // Death check (King doesn't die from combat — game over handled separately)
  if (newHP <= 0 && defender.cardId !== 'king') {
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

// ─────────────────────────────────────────────
// COUNTER-ATTACK RESOLUTION (with dying blow)
// ─────────────────────────────────────────────

/**
 * Resolve attack WITH counter-attack logic (v0.5 — dying blow).
 *
 * A melee defender always retaliates if adjacent, EVEN IF the
 * primary attack killed them. This represents a "dying blow" —
 * the defender strikes back as they fall.
 *
 * Counter-attack uses defender's PRE-DAMAGE ATK value.
 *
 * Assassin jump attacks remain immune to counter-attack.
 *
 * Event order:
 *   1. Primary attack (attacker → defender)
 *   2. Defender death (if killed by primary)
 *   3. Counter-attack (defender → attacker, even if dying)
 *   4. Attacker death (if killed by counter)
 */
export function resolveAttackWithCounter(
  attacker: Unit,
  defender: Unit,
  board: Board,
  isAssassinJump: boolean = false,
): GameEvent[] {
  const events: GameEvent[] = [];

  // ── Capture defender's pre-damage state for counter-attack ──
  const defenderPreDamageAtk = defender.currentAtk;
  const defenderCombatTag = defender.combatTag;
  const defenderPos = { ...defender.position };
  const attackerPos = { ...attacker.position };

  // ── 1. Primary attack: attacker → defender ──
  const primaryEvents = resolveAttack(attacker, defender, board);
  events.push(...primaryEvents);

  // ── 2. Counter-attack eligibility ──
  //    Assassin jumps: always immune
  if (isAssassinJump) return events;
  //    Defender must be MELEE and adjacent (Chebyshev ≤ 1)
  if (defenderCombatTag !== CombatTag.MELEE) return events;
  if (!isAdjacent(attackerPos, defenderPos)) return events;
  //    Defender must have positive ATK to deal counter damage
  if (defenderPreDamageAtk <= 0) return events;

  // ── 3. Counter-attack: defender → attacker (dying blow) ──
  const counterDamage = Math.max(0, defenderPreDamageAtk);
  const attackerNewHP = Math.max(0, attacker.currentDef - counterDamage);

  const counterEvent: EvUnitAttacked = {
    type: 'UNIT_ATTACKED',
    attackerInstanceId: defender.instanceId,
    targetInstanceId:   attacker.instanceId,
    attackerCol: defenderPos.col,
    attackerRow: defenderPos.row,
    targetCol:   attackerPos.col,
    targetRow:   attackerPos.row,
    damage:       counterDamage,
    targetNewHP:  attackerNewHP,
    targetPlayer: attacker.owner,
    isKingHit:    attacker.cardId === 'king',
    newHP:  attacker.cardId === 'king' ? attackerNewHP : undefined,
    maxHP:  attacker.cardId === 'king' ? attacker.maxDef : undefined,
  };
  events.push(counterEvent);

  // ── 4. Attacker death from counter-attack ──
  if (attackerNewHP <= 0 && attacker.cardId !== 'king') {
    events.push({
      type: 'UNIT_DIED',
      instanceId: attacker.instanceId,
      cardId:     attacker.cardId,
      owner:      attacker.owner,
      col:        attackerPos.col,
      row:        attackerPos.row,
      cause:      'COMBAT',
    } as EvUnitDied);
  }

  return events;
}

// ─────────────────────────────────────────────
// CASTLE AREA ATTACK
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// DIRECT DAMAGE / HEAL (abilities, effects)
// ─────────────────────────────────────────────

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

export function applyFullHeal(unit: Unit): GameEvent[] {
  return applyHeal(unit, unit.maxDef - unit.currentDef);
}

export function applyAutoHeal(unit: Unit, amount: number): GameEvent[] {
  return applyHeal(unit, amount);
}

export function applyReform(
  fromCardId: string, toCardId: string, board: Board
): GameEvent[] {
  const events: GameEvent[] = [];
  const toDef = getCard(toCardId);
  const newMaxHP = toDef.stats?.def ?? 1;
  const units = board.getAllUnits().filter(u => u.cardId === fromCardId);

  for (const unit of units) {
    const hpRatio = unit.maxDef > 0 ? unit.currentDef / unit.maxDef : 1;
    const newHP = Math.max(1, Math.ceil(hpRatio * newMaxHP));
    const event: EvUnitTransformed = {
      type: 'UNIT_TRANSFORMED',
      oldInstanceId: unit.instanceId,
      newInstanceId: unit.instanceId + '_reformed',
      fromCardId, toCardId,
      col: unit.position.col, row: unit.position.row,
      owner: unit.owner,
      newHP, newMaxHP,
    };
    events.push(event);
  }
  return events;
}

export function applyEarthquakeDamage(col: number, damage: number, board: Board): GameEvent[] {
  const events: GameEvent[] = [];
  for (const unit of board.getUnitsInColumn(col)) {
    events.push(...applyDamage(unit, damage, 'EARTHQUAKE'));
  }
  return events;
}

// ─────────────────────────────────────────────
// DAMAGE CALCULATION
// ─────────────────────────────────────────────

function calculateDamage(attacker: Unit, defender: Unit): number {
  let atk = attacker.currentAtk;
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

function isAdjacent(a: { col: number; row: number }, b: { col: number; row: number }): boolean {
  return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}
