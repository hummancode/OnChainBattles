// ============================================================
// AbilityTypes.ts
// All ability type strings and ability context interfaces.
// AbilityDispatcher resolves these via handler registry.
// ============================================================

// ─────────────────────────────────────────────
// ABILITY TYPE ENUM
// Every row in the Implementation Plan ability table maps here.
// ─────────────────────────────────────────────

export enum AbilityType {
  // ── On-Deploy ──────────────────────────────
  ON_DEPLOY_DRAW             = 'ON_DEPLOY_DRAW',           // Messenger, Scribe
  ON_DEPLOY_HEAL_FRIENDLY    = 'ON_DEPLOY_HEAL_FRIENDLY',  // Priest
  ON_DEPLOY_REVIVE           = 'ON_DEPLOY_REVIVE',         // Mystic (custom)
  ON_DEPLOY_SUMMON_FROM_DECK = 'ON_DEPLOY_SUMMON_FROM_DECK', // Militia (custom)
  ON_DEPLOY_SCOUT_DECK       = 'ON_DEPLOY_SCOUT_DECK',     // Scout, Messenger

  // ── On-Death ───────────────────────────────
  ON_DEATH_DRAW              = 'ON_DEATH_DRAW',            // Foot Soldier

  // ── On-Kill ────────────────────────────────
  ON_KILL_LEG_DRAIN          = 'ON_KILL_LEG_DRAIN',        // Inquisitor

  // ── Passive Auras (recalc every turn) ──────
  AURA_ROYAL_DISCOUNT        = 'AURA_ROYAL_DISCOUNT',      // Princess, Castle, Temple, Kings Guard
  AURA_LEG_BONUS             = 'AURA_LEG_BONUS',           // Princess
  AURA_ADJ_DEF               = 'AURA_ADJ_DEF',             // Castle
  AURA_BOARD_HALF_DEF        = 'AURA_BOARD_HALF_DEF',      // Commander
  AURA_BOARD_HALF_ATK        = 'AURA_BOARD_HALF_ATK',      // Commander
  AURA_VILLAGE_SLOW          = 'AURA_VILLAGE_SLOW',        // Village
  AURA_CAVALRY_COUNTER       = 'AURA_CAVALRY_COUNTER',     // Pikeman (x3 ATK vs cavalry)
  AURA_PIKEMAN_FLANK         = 'AURA_PIKEMAN_FLANK',       // Pikeman (flank bonus)
  AURA_AUTO_HEAL             = 'AURA_AUTO_HEAL',           // Kings Guard

  // ── Passive Flags ──────────────────────────
  PASSIVE_BUILD_DELAY        = 'PASSIVE_BUILD_DELAY',      // Castle (inactive 1 turn)
  PASSIVE_SPAWN              = 'PASSIVE_SPAWN',            // Castle (foot soldier every 3 turns)
  PASSIVE_LANCER_CHARGE      = 'PASSIVE_LANCER_CHARGE',    // Lancer (move + attack same turn)

  // ── Spell Effects ──────────────────────────
  SPELL_DAMAGE_STRUCTURE_ADJ = 'SPELL_DAMAGE_STRUCTURE_ADJ', // Disease
  SPELL_FREEZE_LEG_RATE      = 'SPELL_FREEZE_LEG_RATE',    // Civil War
  SPELL_DRAIN_LEG_RATE_PERM  = 'SPELL_DRAIN_LEG_RATE_PERM',// Casus Belli
  SPELL_STEAL_LEG            = 'SPELL_STEAL_LEG',          // Bandit Raid (future)
  SPELL_FORWARD_DEPLOY       = 'SPELL_FORWARD_DEPLOY',     // Casus Belli companion
  SPELL_TRANSFORM_ALL        = 'SPELL_TRANSFORM_ALL',      // Reform
  SPELL_DRAW_BY_COST         = 'SPELL_DRAW_BY_COST',       // Reinforcements (future)
  SPELL_DRAW_STRUCTURES      = 'SPELL_DRAW_STRUCTURES',    // Motherland (custom)
  SPELL_EARTHQUAKE           = 'SPELL_EARTHQUAKE',         // Earthquake (custom)
  SPELL_WAR_HORN             = 'SPELL_WAR_HORN',           // War Horn (custom)
  SPELL_COUP                 = 'SPELL_COUP',               // Coup (custom)
  SPELL_TREASON              = 'SPELL_TREASON',            // Treason (custom)
  SPELL_REVOLT               = 'SPELL_REVOLT',             // Peasant Revolt (custom)

  CUSTOM                     = 'CUSTOM',                   // Fallback for multi-step
}

// ─────────────────────────────────────────────
// ABILITY CONTEXT
// Passed to every ability handler. Contains everything
// the resolver needs without importing GameEngine.
// ─────────────────────────────────────────────

export interface AbilityContext {
  cardId: string;
  instanceId?: string;       // Set when unit is already placed
  ownerPlayer: number;       // 0 = P1, 1 = P2
  deployPosition?: { col: number; row: number };
  boardSnapshot: any;        // Board.serialize() — read-only view
  playerStates: any[];       // PlayerState snapshots [P1, P2]
  modifiers: any[];          // GameModifiers [P1, P2]
}

// ─────────────────────────────────────────────
// PENDING COMMAND (type re-export for convenience)
// See src/game/pending/PendingCommand.ts for the canonical definition.
// ─────────────────────────────────────────────

export type { PendingCommand } from '../pending/PendingCommand';
