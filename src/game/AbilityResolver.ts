// ============================================================
// AbilityResolver.ts
// Routes every ability type to its resolution logic.
// CRITICAL RULE: Never mutates board, player state, or
// modifiers directly. Returns GameEvent[] + optionally
// a PendingInteraction when player input is required.
// GameEngine applies the events and stores the pending.
// ============================================================

import { AbilityType, PendingInteraction } from './types/AbilityTypes';
import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import type { PlayerState } from './PlayerState';
import type { GameModifiers } from './GameModifiers';
import { getCard } from './data/CardDefinitions';
import { applyDamage, applyFullHeal, applyReform, applyEarthquakeDamage } from './CombatResolver';
import type { GameEvent } from './types/EventTypes';

export interface AbilityResult {
  events: GameEvent[];
  pending?: PendingInteraction;
}

// ─────────────────────────────────────────────
// MAIN ROUTER
// ─────────────────────────────────────────────

/**
 * Resolve all abilities on a card when it is played.
 * Called by GameEngine.playCard() after LEG cost is spent.
 *
 * @param cardId       The card being played
 * @param owner        The playing player
 * @param position     Deploy position (for units/structures); undefined for spells
 * @param board        Current board (read-only — do not mutate)
 * @param ps           Player states [P1, P2] (read-only)
 * @param mods         Modifiers [P1, P2] (read-only)
 * @param unitInstance The placed unit, if already on board (for on-deploy abilities)
 */
export function resolveOnDeploy(
  cardId: string,
  owner: Player,
  position: Position | undefined,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers],
  unitInstance?: Unit
): AbilityResult {
  const def = getCard(cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    if (ability.type === 'CUSTOM') {
      const result = resolveCustomHandler(ability.handler as string, cardId, owner, position, board, ps, mods, unitInstance);
      combined.events.push(...result.events);
      if (result.pending && !combined.pending) combined.pending = result.pending;
      continue;
    }

    const result = resolveCommonAbility(
      ability.type as AbilityType,
      ability.params,
      cardId, owner, position, board, ps, mods, unitInstance
    );
    combined.events.push(...result.events);
    if (result.pending && !combined.pending) combined.pending = result.pending;
  }

  return combined;
}

/**
 * Resolve ON_DEATH abilities for a unit that just died.
 * Called by GameEngine after applying a UNIT_DIED event.
 */
export function resolveOnDeath(
  unit: Unit,
  cause: string,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(unit.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    if (ability.type === AbilityType.ON_DEATH_DRAW) {
      // Foot Soldier: draw 1 card — but NOT on Reform (checked by caller)
      if (cause !== 'REFORM') {
        const { count } = ability.params as { count: number };
        combined.events.push({
          type:           'CARD_DRAWN',
          player:         unit.owner,
          cardId:         '__DRAW__', // Placeholder — GameEngine resolves actual card
          handIndex:      -1,
          deckRemaining:  -1,
        });
      }
    }
  }

  return combined;
}

/**
 * Resolve ON_KILL abilities for the attacker after confirming a kill.
 */
export function resolveOnKill(
  attacker: Unit,
  victim: Unit,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(attacker.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    if (ability.type === AbilityType.ON_KILL_LEG_DRAIN) {
      const { minTargetCost, amount } = ability.params as { minTargetCost: number; amount: number };
      const victimCost = getCard(victim.cardId).cost;
      if (victimCost > minTargetCost) {
        const victim_player = victim.owner;
        const old_rate = mods[victim_player].getEffectiveLEGRate();
        combined.events.push({
          type:     'LEG_RATE_CHANGED',
          player:   victim_player,
          oldRate:  old_rate,
          newRate:  Math.max(1, old_rate - amount),
          reason:   'INQUISITOR',
        });
      }
    }
  }

  return combined;
}

// ─────────────────────────────────────────────
// COMMON ABILITY SWITCH
// ─────────────────────────────────────────────

function resolveCommonAbility(
  type: AbilityType,
  params: Record<string, any>,
  cardId: string,
  owner: Player,
  position: Position | undefined,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers],
  unit?: Unit
): AbilityResult {

  switch (type) {

    // ─── ON_DEPLOY_DRAW ───────────────────────────────────────
    case AbilityType.ON_DEPLOY_DRAW: {
      const { count, filter } = params as { count: number; filter?: string };
      const events: GameEvent[] = [];
      // Signal GameEngine to draw N cards (with optional filter)
      for (let i = 0; i < count; i++) {
        events.push({
          type:           'CARD_DRAWN',
          player:          owner,
          cardId:          filter ? `__DRAW_FILTERED_${filter}__` : '__DRAW__',
          handIndex:       -1,
          deckRemaining:   -1,
        });
      }
      return { events };
    }

    // ─── ON_DEPLOY_SCOUT_DECK ─────────────────────────────────
    case AbilityType.ON_DEPLOY_SCOUT_DECK: {
      const { count } = params as { count: number };
      const opponentPs = ps[owner === Player.P1 ? Player.P2 : Player.P1];
      const topCards = opponentPs.peekTop(count);
      return {
        events: [{
          type:     'SCOUT_RESULT',
          player:   owner,
          topCards,
        }]
      };
    }

    // ─── ON_DEPLOY_HEAL_FRIENDLY ──────────────────────────────
    case AbilityType.ON_DEPLOY_HEAL_FRIENDLY: {
      // Priest: pause and let player choose a target
      const friendlyUnits = board.getUnitsOf(owner);
      const validTargetIds = friendlyUnits.map(u => u.instanceId);

      if (validTargetIds.length === 0) return { events: [] };

      const pending: PendingInteraction = {
        kind:           'TARGET',
        reason:         'Choose a friendly unit to fully restore HP.',
        validTargetIds,
        resumeCallback: () => {}, // Filled in by GameEngine
      };
      return { events: [], pending };
    }

    // ─── ON_DEPLOY_REVIVE ─────────────────────────────────────
    case AbilityType.ON_DEPLOY_REVIVE: {
      // Mystic: pause and let player choose a graveyard unit
      const graveIds = ps[owner].getGraveyard();
      if (graveIds.length === 0) {
        // Nothing to revive — still apply LEG drain
        return {
          events: [{
            type:    'LEG_RATE_CHANGED',
            player:   owner,
            oldRate:  mods[owner].getEffectiveLEGRate(),
            newRate:  Math.max(1, mods[owner].getEffectiveLEGRate() - 1),
            reason:   'MYSTIC',
          }]
        };
      }

      const pending: PendingInteraction = {
        kind:           'TARGET',
        reason:         'Choose a unit from your graveyard to revive.',
        validTargetIds: graveIds,
        resumeCallback: () => {},
      };
      // LEG drain will be emitted after interaction resolves (GameEngine handles)
      return { events: [], pending };
    }

    // ─── SPELL_DAMAGE_STRUCTURE_ADJ ───────────────────────────
    case AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ: {
      // Disease: player selects a structure to afflict
      const structures = board.getStructures();
      const validTargetIds = structures.map(u => u.instanceId);

      if (validTargetIds.length === 0) return { events: [] };

      const pending: PendingInteraction = {
        kind:           'TARGET',
        reason:         'Choose an enemy structure to afflict with Disease.',
        validTargetIds,
        resumeCallback: () => {},
      };
      return { events: [], pending };
    }

    // ─── SPELL_FREEZE_LEG_RATE ────────────────────────────────
    case AbilityType.SPELL_FREEZE_LEG_RATE: {
      const { duration } = params as { duration: number };
      // Civil War: both players frozen
      const p1Rate = mods[Player.P1].getEffectiveLEGRate();
      const p2Rate = mods[Player.P2].getEffectiveLEGRate();
      return {
        events: [
          { type: 'LEG_RATE_CHANGED', player: Player.P1, oldRate: p1Rate, newRate: 0, reason: 'CIVIL_WAR' },
          { type: 'LEG_RATE_CHANGED', player: Player.P2, oldRate: p2Rate, newRate: 0, reason: 'CIVIL_WAR' },
        ]
      };
    }

    // ─── SPELL_DRAIN_LEG_RATE_PERM ────────────────────────────
    case AbilityType.SPELL_DRAIN_LEG_RATE_PERM: {
      const { amount } = params as { amount: number; target: string };
      const opp = owner === Player.P1 ? Player.P2 : Player.P1;
      const oldRate = mods[opp].getEffectiveLEGRate();
      return {
        events: [{
          type:    'LEG_RATE_CHANGED',
          player:   opp,
          oldRate,
          newRate:  Math.max(1, oldRate - amount),
          reason:   'CASUS_BELLI',
        }]
      };
    }

    // ─── SPELL_FORWARD_DEPLOY ─────────────────────────────────
    case AbilityType.SPELL_FORWARD_DEPLOY: {
      // Casus Belli: deploy a hand card to opponent's front row
      const opp = owner === Player.P1 ? Player.P2 : Player.P1;
      const frontRow = owner === Player.P1 ? board.rows - 1 : 0; // Opposite half front row
      const validPositions: Position[] = [];
      for (let c = 0; c < board.cols; c++) {
        if (board.isEmpty(c, frontRow)) validPositions.push({ col: c, row: frontRow });
      }
      if (validPositions.length === 0 || ps[owner].hand.length === 0) return { events: [] };

      const pending: PendingInteraction = {
        kind:           'POSITION',
        reason:         'Choose an empty square in the enemy front row to deploy a card.',
        validPositions,
        resumeCallback: () => {},
      };
      return { events: [], pending };
    }

    // ─── SPELL_TRANSFORM_ALL ──────────────────────────────────
    case AbilityType.SPELL_TRANSFORM_ALL: {
      const { fromCardId, toCardId } = params as { fromCardId: string; toCardId: string };
      const events = applyReform(fromCardId, toCardId, board);
      return { events };
    }

    // ─── SPELL_EARTHQUAKE ─────────────────────────────────────
    case AbilityType.SPELL_EARTHQUAKE: {
      const pending: PendingInteraction = {
        kind:           'COLUMN',
        reason:         'Choose a column (A–F) to strike with the Earthquake.',
        resumeCallback: () => {},
      };
      return { events: [], pending };
    }

    // ─── SPELL_DRAW_STRUCTURES ────────────────────────────────
    case AbilityType.SPELL_DRAW_STRUCTURES: {
      const { overflow } = params as { overflow: boolean };
      const ownStructures = board.getStructures(owner);
      const count = ownStructures.length;
      const events: GameEvent[] = [];
      for (let i = 0; i < count; i++) {
        events.push({
          type:          'CARD_DRAWN',
          player:         owner,
          cardId:         overflow ? '__DRAW_OVERFLOW__' : '__DRAW__',
          handIndex:      -1,
          deckRemaining:  -1,
        });
      }
      return { events };
    }

    // ─── PASSIVE_* and AURA_* ─────────────────────────────────
    // Passive abilities are not resolved on deploy — they are
    // handled by AuraSystem (auras) or GameEngine LEG phase (build delay, spawn).
    case AbilityType.PASSIVE_BUILD_DELAY:
    case AbilityType.PASSIVE_SPAWN:
    case AbilityType.PASSIVE_LANCER_CHARGE:
    case AbilityType.AURA_ROYAL_DISCOUNT:
    case AbilityType.AURA_LEG_BONUS:
    case AbilityType.AURA_ADJ_DEF:
    case AbilityType.AURA_BOARD_HALF_DEF:
    case AbilityType.AURA_BOARD_HALF_ATK:
    case AbilityType.AURA_VILLAGE_SLOW:
    case AbilityType.AURA_CAVALRY_COUNTER:
    case AbilityType.AURA_PIKEMAN_FLANK:
    case AbilityType.AURA_AUTO_HEAL:
    case AbilityType.ON_DEATH_DRAW:
    case AbilityType.ON_KILL_LEG_DRAIN:
      return { events: [] }; // Not on-deploy

    default:
      console.warn(`[AbilityResolver] Unhandled ability type: ${type}`);
      return { events: [] };
  }
}

// ─────────────────────────────────────────────
// CUSTOM HANDLERS
// Cards with compound or multi-step logic.
// Each handler is a pure function returning AbilityResult.
// ─────────────────────────────────────────────

function resolveCustomHandler(
  handlerKey: string,
  cardId: string,
  owner: Player,
  position: Position | undefined,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers],
  unit?: Unit
): AbilityResult {

  switch (handlerKey) {

    case 'mysticDeployHandler':
      return mysticHandler(owner, board, ps, mods);

    case 'militiaDeployHandler':
      return militiaHandler(owner, board, ps);

    case 'warHornHandler':
      return warHornHandler(owner, board, ps);

    case 'coupHandler':
      return coupHandler(owner, board, ps, mods);

    case 'treasonHandler':
      return treasonHandler(owner, board);

    case 'peasantRevoltHandler':
      return peasantRevoltHandler(owner, board, mods);

    case 'motherlandHandler':
      return motherlandHandler(owner, board, ps);

    case 'earthquakeColumnHandler':
      // This variant receives the chosen column directly
      return { events: [] }; // Resolved inline by GameEngine.selectColumn()

    default:
      console.warn(`[AbilityResolver] Unknown custom handler: ${handlerKey}`);
      return { events: [] };
  }
}

// ─── Mystic ───────────────────────────────────────────────────
// Step 1: pause for revive target. Step 2: auto-drain LEG rate.
function mysticHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const graveIds = ps[owner].getGraveyard();

  // LEG drain is automatic regardless of whether revive is available
  const drainEvent: GameEvent = {
    type:    'LEG_RATE_CHANGED',
    player:   owner,
    oldRate:  mods[owner].getEffectiveLEGRate(),
    newRate:  Math.max(1, mods[owner].getEffectiveLEGRate() - 1),
    reason:   'MYSTIC',
  };

  if (graveIds.length === 0) return { events: [drainEvent] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Mystic: choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    resumeCallback: () => {}, // GameEngine replaces this
  };

  // Drain applied after resolve — GameEngine emits it after interact resolves
  return { events: [], pending };
}

// ─── Militia ──────────────────────────────────────────────────
// Pull next Militia from deck, place in own half. Non-recursive.
function militiaHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState]
): AbilityResult {
  const hasMilitiaInDeck = ps[owner].deck.includes('militia');
  if (!hasMilitiaInDeck) return { events: [] };

  const freeSquares = board.getFreeSquaresInHalf(owner);
  if (freeSquares.length === 0) return { events: [] };

  // Pick the first free square (GameEngine applies the pull and placement)
  const pos = freeSquares[0];
  return {
    events: [{
      type:        'UNIT_PLACED',
      instanceId:  `militia_summoned_${Date.now()}`,
      cardId:      'militia',
      owner,
      col:         pos.col,
      row:         pos.row,
      isActive:    true,
    }]
  };
}

// ─── War Horn ─────────────────────────────────────────────────
// Draw 2 → discard 1 → all friendlies +1 move this turn.
function warHornHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState]
): AbilityResult {
  // Signal draw 2 first
  const drawEvents: GameEvent[] = [
    { type: 'CARD_DRAWN', player: owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
    { type: 'CARD_DRAWN', player: owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
  ];

  // After draws resolve, ask player to discard 1
  const pending: PendingInteraction = {
    kind:           'DISCARD',
    reason:         'War Horn: discard 1 card from your hand.',
    count:          1,
    resumeCallback: () => {},
  };

  return { events: drawEvents, pending };
}

// ─── Coup ─────────────────────────────────────────────────────
// Target enemy Royal (not King) → compare LEG to capture or banish.
function coupHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const opp = owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance === 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Coup: choose an enemy Royal unit to capture or banish.',
    validTargetIds: targets.map(u => u.instanceId),
    resumeCallback: () => {},
  };

  return { events: [], pending };
}

// ─── Treason ──────────────────────────────────────────────────
// Target enemy non-Royal → take control for this turn.
function treasonHandler(
  owner: Player,
  board: Board
): AbilityResult {
  const opp = owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance !== 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Treason: choose an enemy non-Royal unit to control this turn.',
    validTargetIds: targets.map(u => u.instanceId),
    resumeCallback: () => {},
  };

  return { events: [], pending };
}

// ─── Peasant Revolt ───────────────────────────────────────────
// Count all structures on board → summon that many Militia to own half.
// Apply permanent penalties: -1 leg rate + +2 royal cost.
function peasantRevoltHandler(
  owner: Player,
  board: Board,
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const allStructures = board.getStructures();
  const count = allStructures.length;

  const events: GameEvent[] = [];

  // Summon Militia to free squares
  const freeSquares = board.getFreeSquaresInHalf(owner);
  const toSummon = Math.min(count, freeSquares.length);
  for (let i = 0; i < toSummon; i++) {
    events.push({
      type:       'UNIT_PLACED',
      instanceId: `militia_revolt_${i}_${Date.now()}`,
      cardId:     'militia',
      owner,
      col:        freeSquares[i].col,
      row:        freeSquares[i].row,
      isActive:   true,
    });
  }

  // Permanent penalties
  const oldRate = mods[owner].getEffectiveLEGRate();
  events.push({
    type:    'LEG_RATE_CHANGED',
    player:   owner,
    oldRate,
    newRate:  Math.max(1, oldRate - 1),
    reason:   'REVOLT',
  });

  return { events };
}

// ─── Motherland ───────────────────────────────────────────────
// Draw 1 per owned structure (overflow allowed).
function motherlandHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState]
): AbilityResult {
  const count = board.getStructures(owner).length;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         owner,
      cardId:         '__DRAW_OVERFLOW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}
