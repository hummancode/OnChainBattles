// ============================================================
// CardDefinitions.ts
// Single source of truth for all cards.
// Adding a card = adding ONE object to CARD_DEFINITIONS.
// No new classes, no new switch cases anywhere else.
//
// Deck: 22 unique cards + King = 23 types, 39 deck copies.
// King is pre-placed, not in deck. Deck = 31 cards.
// ============================================================

import {
  CardClass, Allegiance, SubType, CardFlag,
  MovementType, AtkPattern,
} from '../types/CardTypes.js';
import type { CardDefinition } from '../types/CardTypes.js';
import { AbilityType } from '../types/AbilityTypes';

const U = CardClass.UNIT;
const SP = CardClass.SPELL;
const ST = CardClass.STRUCTURE;
const STD = Allegiance.STANDARD;
const ROY = Allegiance.ROYAL;
const CAV = SubType.CAVALRY;
const STRUC = SubType.STRUCTURE;

export const CARD_DEFINITIONS: CardDefinition[] = [

  // ═══════════════════════════════════════════════════════
  // KING — Pre-placed, not in deck
  // ═══════════════════════════════════════════════════════
  {
    id: 'king', name: 'King',
    flavorText: 'All legitimacy flows from the crown.',
    class: U, allegiance: ROY, subtypes: [], cost: 0, copies: 1,
    stats: { atk: 1, def: 10, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.AURA_LEG_BONUS, params: { amount: 1 } }, // Base LEG generation
    ],
    abilityText: 'Pre-placed. Generates +1 LEG/turn. Enemy King in your half: lose 1 LEG this turn. Win condition.',
  },

  // ═══════════════════════════════════════════════════════
  // STANDARD UNITS
  // ═══════════════════════════════════════════════════════

  {
    id: 'foot_soldier', name: 'Foot Soldier',
    flavorText: 'Cannon fodder with a silver lining.',
    class: U, allegiance: STD, subtypes: [], cost: 1, copies: 3,
    stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEATH_DRAW, params: { count: 1 } },
    ],
    abilityText: 'On Death: draw 1 card. Reform target: becomes Swordsman.',
  },

  {
    id: 'pikeman', name: 'Pikeman',
    flavorText: 'The cavalry\'s nightmare, the footman\'s wall.',
    class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
    stats: { atk: 1, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [CardFlag.CAVALRY_COUNTER],
    abilities: [
      { type: AbilityType.AURA_CAVALRY_COUNTER, params: { multiplier: 3 } },
      { type: AbilityType.AURA_PIKEMAN_FLANK,   params: { bonusAtk: 1, bonusDef: 1 } },
    ],
    abilityText: '×3 ATK vs Cavalry. Flank: if any friendly on left AND right squares, gain +1 ATK +1 DEF this turn.',
  },

  {
    id: 'archer', name: 'Archer',
    flavorText: 'Precision over brute force.',
    class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
    stats: { atk: 3, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.DIAGONAL_RANGED_2 },
    flags: [],
    abilities: [],
    abilityText: 'Ranged attack: targets any unit diagonally within 2 squares. Ignores adjacency.',
  },

  {
    id: 'assassin', name: 'Assassin',
    flavorText: 'The shadow moves. Then it\'s over.',
    class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
    stats: { atk: 4, def: 1, movement: MovementType.JUMP_DIAGONAL_1, attackPattern: AtkPattern.ON_JUMP },
    flags: [],
    abilities: [],
    abilityText: 'Jumps diagonally. Attacks landing square on jump. Ignores units along path.',
  },

  {
    id: 'militia', name: 'Militia',
    flavorText: 'Where one falls, another rises.',
    class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
    stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.CUSTOM, handler: 'militiaDeployHandler' },
    ],
    abilityText: 'On Deploy: pull the next Militia copy from your deck to any free square in your half.',
  },

  {
    id: 'scout', name: 'Scout',
    flavorText: 'Knowledge is the first casualty of ignorance.',
    class: U, allegiance: STD, subtypes: [CAV], cost: 2, copies: 2,
    stats: { atk: 1, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 2 } },
    ],
    abilityText: 'Cavalry. On Deploy: reveal the top 2 cards of opponent\'s deck (visible to you only).',
  },

  {
    id: 'lancer', name: 'Lancer',
    flavorText: 'At full gallop, nothing stops the charge.',
    class: U, allegiance: STD, subtypes: [CAV], cost: 4, copies: 2,
    stats: { atk: 3, def: 2, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV },
    flags: [CardFlag.LANCER_CHARGE],
    abilities: [
      { type: AbilityType.PASSIVE_LANCER_CHARGE, params: {} },
    ],
    abilityText: 'Cavalry. Charge: may MOVE and ATTACK in the same turn. Movement must be toward enemy half.',
  },

  {
    id: 'mystic', name: 'Mystic',
    flavorText: 'She sees beyond death. The cost is paid in kind.',
    class: U, allegiance: STD, subtypes: [], cost: 6, copies: 1,
    stats: { atk: 2, def: 5, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.CUSTOM, handler: 'mysticDeployHandler' },
    ],
    abilityText: 'On Deploy: revive one unit from your graveyard to any free square in your half. Permanently −1 your LEG rate (min 1).',
  },

  {
    id: 'messenger', name: 'Messenger',
    flavorText: 'Swift enough to carry news before it matters.',
    class: U, allegiance: STD, subtypes: [], cost: 1, copies: 2,
    stats: { atk: 0, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.NONE },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_DRAW,       params: { count: 1 } },
      { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 1 } },
    ],
    abilityText: 'On Deploy: draw 1 card. Reveal top 1 card of opponent\'s deck (visible to you only).',
  },

  // ═══════════════════════════════════════════════════════
  // ROYAL UNITS
  // ═══════════════════════════════════════════════════════

  {
    id: 'swordsman', name: 'Swordsman',
    flavorText: 'A knight in all but title.',
    class: U, allegiance: ROY, subtypes: [], cost: 3, copies: 2,
    stats: { atk: 3, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [],
    abilityText: 'Reform result. Requires Royal cost engine to play economically.',
  },

  {
    id: 'princess', name: 'Princess',
    flavorText: 'Her mere presence commands the court.',
    class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 1,
    stats: { atk: 0, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
    flags: [],
    abilities: [
      { type: AbilityType.AURA_LEG_BONUS,      params: { amount: 1 } },
      { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
    ],
    abilityText: '+1 LEG/turn while on board. −1 Royal card cost while on board.',
  },

  {
    id: 'priest', name: 'Priest',
    flavorText: 'The wounded are never truly lost.',
    class: U, allegiance: ROY, subtypes: [], cost: 6, copies: 2,
    stats: { atk: 1, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_HEAL_FRIENDLY, params: { amount: 'FULL' } },
    ],
    abilityText: 'On Deploy: fully restore one friendly unit\'s HP (including King).',
  },

  {
    id: 'commander', name: 'Commander',
    flavorText: 'Every soldier fights harder in his shadow.',
    class: U, allegiance: ROY, subtypes: [CAV], cost: 7, copies: 1,
    stats: { atk: 5, def: 5, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.AURA_BOARD_HALF_DEF, params: { half: 'OWN',   amount: 1 } },
      { type: AbilityType.AURA_BOARD_HALF_ATK, params: { half: 'ENEMY', amount: 1 } },
    ],
    abilityText: 'Cavalry. Aura: all friendly units on your half +1 DEF. All friendly units on enemy half +1 ATK.',
  },

  {
    id: 'inquisitor', name: 'Inquisitor',
    flavorText: 'The guilty always reveal themselves.',
    class: U, allegiance: ROY, subtypes: [], cost: 7, copies: 2,
    stats: { atk: 4, def: 4, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.ON_KILL_LEG_DRAIN, params: { minTargetCost: 4, amount: 1 } },
    ],
    abilityText: 'On Kill: if target\'s base cost >4, permanently −1 opponent\'s LEG rate (min 1).',
  },

  {
    id: 'knight', name: 'Knight',
    flavorText: 'Heavy, fast, devastating.',
    class: U, allegiance: ROY, subtypes: [CAV], cost: 9, copies: 2,
    stats: { atk: 5, def: 8, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [],
    abilityText: 'Cavalry. Requires Royal discount engine to play before late game.',
  },

  {
    id: 'knights_guard', name: "King's Guard",
    flavorText: 'Sworn in blood. Unwavering in duty.',
    class: U, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
    stats: { atk: 6, def: 12, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.AURA_AUTO_HEAL,      params: { amount: 2 } },
      { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
    ],
    abilityText: 'Auto-heal +2 HP at start of your LEG phase. While on board: −1 Royal card cost.',
  },

  {
    id: 'scribe', name: 'Scribe',
    flavorText: 'The pen shapes the future of the crown.',
    class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 2,
    stats: { atk: 0, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_DRAW, params: { count: 2, filter: 'ROYAL' } },
    ],
    abilityText: 'On Deploy: draw 2 Royal cards from your deck (skip non-Royal until count met or deck empty).',
  },

  // ═══════════════════════════════════════════════════════
  // STRUCTURES (STATIC)
  // ═══════════════════════════════════════════════════════

  {
    id: 'castle', name: 'Castle',
    flavorText: 'Stone and mortar, patience and power.',
    class: ST, allegiance: ROY, subtypes: [STRUC], cost: 4, copies: 1,
    stats: { atk: 3, def: 8, movement: MovementType.STATIC, attackPattern: AtkPattern.AREA_ADJ },
    flags: [CardFlag.BUILD_DELAY],
    abilities: [
      { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
      { type: AbilityType.AURA_ADJ_DEF,        params: { amount: 1 } },
      { type: AbilityType.PASSIVE_BUILD_DELAY,  params: {} },
      { type: AbilityType.PASSIVE_SPAWN,        params: { cardId: 'foot_soldier', interval: 3 } },
    ],
    abilityText: 'Build Delay: inactive for 1 turn after placement. Attacks all adjacent enemies each LEG phase. Adjacent friendlies +1 DEF. Spawns 1 Foot Soldier every 3 turns. −1 Royal cost.',
  },

  {
    id: 'temple', name: 'Temple',
    flavorText: 'Legitimacy is granted by the divine.',
    class: ST, allegiance: ROY, subtypes: [STRUC], cost: 3, copies: 2,
    stats: { atk: 0, def: 5, movement: MovementType.STATIC, attackPattern: AtkPattern.NONE },
    flags: [CardFlag.BUILD_DELAY],
    abilities: [
      { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
      { type: AbilityType.PASSIVE_BUILD_DELAY, params: {} },
    ],
    abilityText: 'Build Delay: inactive 1 turn. −1 Royal card cost while on board.',
  },

  {
    id: 'village', name: 'Village',
    flavorText: 'The people tire of marching armies.',
    class: ST, allegiance: STD, subtypes: [STRUC], cost: 2, copies: 2,
    stats: { atk: 0, def: 4, movement: MovementType.STATIC, attackPattern: AtkPattern.NONE },
    flags: [CardFlag.BUILD_DELAY],
    abilities: [
      { type: AbilityType.AURA_VILLAGE_SLOW, params: { amount: 1 } },
      { type: AbilityType.PASSIVE_BUILD_DELAY, params: {} },
    ],
    abilityText: 'Build Delay: inactive 1 turn. Aura: all adjacent enemy units −1 movement (min 0). Immobilized units may still attack this structure.',
  },

  // ═══════════════════════════════════════════════════════
  // SPELLS
  // ═══════════════════════════════════════════════════════

  {
    id: 'disease', name: 'Disease',
    flavorText: 'The rot spreads from stone to stone.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, params: { damage: 2, duration: 3 } },
    ],
    abilityText: 'Target a Structure. It takes 2 damage at the start of your turn for 3 turns. Units adjacent to it take 1 damage per tick.',
  },

  {
    id: 'casus_belli', name: 'Casus Belli',
    flavorText: 'A pretext for war is always found.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_DRAIN_LEG_RATE_PERM, params: { amount: 1, target: 'OPPONENT' } },
      { type: AbilityType.SPELL_FORWARD_DEPLOY,       params: {} },
    ],
    abilityText: 'Permanently −1 opponent\'s LEG rate (min 1). Then deploy one card from your hand to any free square in the front row of enemy half.',
  },

  {
    id: 'reform', name: 'Reform',
    flavorText: 'The soldier becomes the knight he always was.',
    class: SP, allegiance: STD, subtypes: [], cost: 2, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_TRANSFORM_ALL, params: { fromCardId: 'foot_soldier', toCardId: 'swordsman' } },
    ],
    abilityText: 'Transform all Foot Soldiers on the board into Swordsmen. HP scales proportionally. Does not trigger Foot Soldier\'s On Death ability.',
  },

  {
    id: 'civil_war', name: 'Civil War',
    flavorText: 'When the kingdom turns on itself, all suffer.',
    class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_FREEZE_LEG_RATE, params: { duration: 3 } },
    ],
    abilityText: 'Both players\' LEG rates are frozen at 0 for 3 turns. Existing pools are unaffected.',
  },

  {
    id: 'earthquake', name: 'Earthquake',
    flavorText: 'The earth itself takes sides.',
    class: SP, allegiance: STD, subtypes: [], cost: 5, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_EARTHQUAKE, params: {} },
    ],
    abilityText: 'Choose a column (A–F). All units in that column take 3 damage. Triggers Foot Soldier On Death.',
  },

  {
    id: 'war_horn', name: 'War Horn',
    flavorText: 'The sound of destiny.',
    class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_WAR_HORN, params: {} },
    ],
    abilityText: 'Draw 2 cards, then discard 1. All your units gain +1 movement this turn.',
  },

  {
    id: 'coup', name: 'Coup',
    flavorText: 'Power seized in a single night.',
    class: SP, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_COUP, params: {} },
    ],
    abilityText: 'Target an enemy Royal unit (not King). If your remaining LEG ≥ target\'s base cost: capture it (it joins your side). Otherwise: banish it from the game.',
  },

  {
    id: 'treason', name: 'Treason',
    flavorText: 'Even loyal men have a price.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_TREASON, params: {} },
    ],
    abilityText: 'Target an enemy non-Royal unit. It fights for you this turn only. At end of turn: returns to original position, exhausted.',
  },

  {
    id: 'motherland', name: 'Motherland',
    flavorText: 'The homeland always gives more.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_DRAW_STRUCTURES, params: { overflow: true } },
    ],
    abilityText: 'Draw 1 card per Structure you control. Can overflow hand limit this turn. Overflow cards are lost at end of turn.',
  },

  {
    id: 'peasant_revolt', name: 'Peasant Revolt',
    flavorText: 'The masses have little to lose.',
    class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_REVOLT, params: {} },
    ],
    abilityText: 'Summon 1 Militia to any free square in your half per Structure on the board (both sides). Permanent penalty to you: −1 LEG rate (min 1) and +2 Royal cost for the rest of the game.',
  },

];

// ─────────────────────────────────────────────
// LOOKUP MAP — O(1) by card id
// ─────────────────────────────────────────────

export const CARD_MAP: Map<string, CardDefinition> = new Map(
  CARD_DEFINITIONS.map(c => [c.id, c])
);

export function getCard(id: string): CardDefinition {
  const c = CARD_MAP.get(id);
  if (!c) throw new Error(`[CardDefinitions] Unknown card id: "${id}"`);
  return c;
}

// ─────────────────────────────────────────────
// DEMO DECK — 31 cards (King pre-placed, not included)
// Both players use identical deck, independently shuffled.
// ─────────────────────────────────────────────

export const DEMO_DECK_IDS: string[] = [
  // Standard units — 3 copies
  'foot_soldier', 'foot_soldier', 'foot_soldier',
  // Standard units — 2 copies
  'pikeman', 'pikeman',
  'archer', 'archer',
  'assassin', 'assassin',
  'militia', 'militia',
  'scout', 'scout',
  'lancer', 'lancer',
  'messenger', 'messenger',
  // Standard units — 1 copy
  'mystic',
  // Royal units — 2 copies
  'swordsman', 'swordsman',
  'priest', 'priest',
  'inquisitor', 'inquisitor',
  'knight', 'knight',
  'scribe', 'scribe',
  // Royal units — 1 copy
  'princess',
  'commander',
  'knights_guard',
  // Structures — 2 copies
  'temple', 'temple',
  'village', 'village',
  // Structures — 1 copy
  'castle',
  // Spells — 2 copies
  'disease', 'disease',
  'reform', 'reform',
  'war_horn', 'war_horn',
  'treason', 'treason',
  // Spells — 1 copy
  'casus_belli',
  'civil_war',
  'earthquake',
  'motherland',
  'coup',
  'peasant_revolt',
];

// Sanity check — 31 cards
if (DEMO_DECK_IDS.length !== 31) {
  console.error(`[CardDefinitions] DEMO_DECK_IDS has ${DEMO_DECK_IDS.length} entries, expected 31`);
}
