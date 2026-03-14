// ============================================================
// CardDefinitions.ts
// Aggregator — imports individual card files from cards/ and
// re-exports the CARD_DEFINITIONS array in canonical order.
// ============================================================

import type { CardDefinition } from '../types/CardTypes.js';

// King
import { KING_DEF } from './cards/king.js';

// Standard Units
import { FOOT_SOLDIER_DEF } from './cards/foot_soldier.js';
import { PIKEMAN_DEF } from './cards/pikeman.js';
import { ARCHER_DEF } from './cards/archer.js';
import { ASSASSIN_DEF } from './cards/assassin.js';
import { MILITIA_DEF } from './cards/militia.js';
import { SCOUT_DEF } from './cards/scout.js';
import { LANCER_DEF } from './cards/lancer.js';
import { MYSTIC_DEF } from './cards/mystic.js';
import { MESSENGER_DEF } from './cards/messenger.js';

// Royal Units
import { SWORDSMAN_DEF } from './cards/swordsman.js';
import { PRINCESS_DEF } from './cards/princess.js';
import { PRIEST_DEF } from './cards/priest.js';
import { COMMANDER_DEF } from './cards/commander.js';
import { INQUISITOR_DEF } from './cards/inquisitor.js';
import { KNIGHT_DEF } from './cards/knight.js';
import { KNIGHTS_GUARD_DEF } from './cards/knights_guard.js';
import { SCRIBE_DEF } from './cards/scribe.js';

// Structures
import { CASTLE_DEF } from './cards/castle.js';
import { TEMPLE_DEF } from './cards/temple.js';
import { VILLAGE_DEF } from './cards/village.js';

// Spells
import { DISEASE_DEF } from './cards/disease.js';
import { CASUS_BELLI_DEF } from './cards/casus_belli.js';
import { REFORM_DEF } from './cards/reform.js';
import { CIVIL_WAR_DEF } from './cards/civil_war.js';
import { EARTHQUAKE_DEF } from './cards/earthquake.js';
import { WAR_HORN_DEF } from './cards/war_horn.js';
import { COUP_DEF } from './cards/coup.js';
import { TREASON_DEF } from './cards/treason.js';
import { MOTHERLAND_DEF } from './cards/motherland.js';
import { PEASANT_REVOLT_DEF } from './cards/peasant_revolt.js';

export const CARD_DEFINITIONS: CardDefinition[] = [
  // King
  KING_DEF,

  // Standard Units
  FOOT_SOLDIER_DEF,
  PIKEMAN_DEF,
  ARCHER_DEF,
  ASSASSIN_DEF,
  MILITIA_DEF,
  SCOUT_DEF,
  LANCER_DEF,
  MYSTIC_DEF,
  MESSENGER_DEF,

  // Royal Units
  SWORDSMAN_DEF,
  PRINCESS_DEF,
  PRIEST_DEF,
  COMMANDER_DEF,
  INQUISITOR_DEF,
  KNIGHT_DEF,
  KNIGHTS_GUARD_DEF,
  SCRIBE_DEF,

  // Structures
  CASTLE_DEF,
  TEMPLE_DEF,
  VILLAGE_DEF,

  // Spells
  DISEASE_DEF,
  CASUS_BELLI_DEF,
  REFORM_DEF,
  CIVIL_WAR_DEF,
  EARTHQUAKE_DEF,
  WAR_HORN_DEF,
  COUP_DEF,
  TREASON_DEF,
  MOTHERLAND_DEF,
  PEASANT_REVOLT_DEF,
];
