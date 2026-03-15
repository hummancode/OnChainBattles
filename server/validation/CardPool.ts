// ============================================================
// CardPool.ts
// Server-side card pool — minimal data for deck validation.
// Costs and copies verified against src/game/data/cards/ definitions.
//
// Future: auto-generate from card definitions via build script.
// ============================================================

export interface CardPoolEntry {
  id: string;
  name: string;
  copies: number;
  cost: number;
}

export const CARD_POOL: readonly CardPoolEntry[] = [
  // King (pre-placed, excluded from decks)
  { id: 'king',           name: 'King',            copies: 1,  cost: 0 },

  // Standard Units
  { id: 'foot_soldier',   name: 'Foot Soldier',    copies: 3,  cost: 1 },
  { id: 'messenger',      name: 'Messenger',       copies: 2,  cost: 1 },
  { id: 'militia',        name: 'Militia',          copies: 2,  cost: 2 },
  { id: 'pikeman',        name: 'Pikeman',          copies: 2,  cost: 2 },
  { id: 'scout',          name: 'Scout',            copies: 2,  cost: 2 },
  { id: 'archer',         name: 'Archer',           copies: 2,  cost: 3 },
  { id: 'assassin',       name: 'Assassin',         copies: 2,  cost: 3 },
  { id: 'lancer',         name: 'Lancer',           copies: 2,  cost: 4 },

  // Royal Units
  { id: 'swordsman',      name: 'Swordsman',        copies: 2,  cost: 3 },
  { id: 'princess',       name: 'Princess',          copies: 1,  cost: 5 },
  { id: 'scribe',         name: 'Scribe',            copies: 2,  cost: 5 },
  { id: 'priest',         name: 'Priest',            copies: 2,  cost: 6 },
  { id: 'mystic',         name: 'Mystic',            copies: 1,  cost: 6 },
  { id: 'commander',      name: 'Commander',         copies: 1,  cost: 7 },
  { id: 'inquisitor',     name: 'Inquisitor',        copies: 2,  cost: 7 },
  { id: 'knight',         name: 'Knight',            copies: 2,  cost: 9 },
  { id: 'knights_guard',  name: "King's Guard",      copies: 1,  cost: 12 },

  // Structures
  { id: 'village',        name: 'Village',            copies: 2,  cost: 2 },
  { id: 'temple',         name: 'Temple',             copies: 2,  cost: 3 },
  { id: 'castle',         name: 'Castle',             copies: 1,  cost: 4 },

  // Spells
  { id: 'reform',         name: 'Reform',             copies: 2,  cost: 2 },
  { id: 'civil_war',      name: 'Civil War',          copies: 1,  cost: 3 },
  { id: 'peasant_revolt', name: 'Peasant Revolt',     copies: 1,  cost: 3 },
  { id: 'war_horn',       name: 'War Horn',           copies: 2,  cost: 3 },
  { id: 'casus_belli',    name: 'Casus Belli',        copies: 1,  cost: 4 },
  { id: 'disease',        name: 'Disease',            copies: 2,  cost: 4 },
  { id: 'motherland',     name: 'Motherland',         copies: 1,  cost: 4 },
  { id: 'treason',        name: 'Treason',            copies: 2,  cost: 4 },
  { id: 'earthquake',     name: 'Earthquake',         copies: 1,  cost: 5 },
  { id: 'coup',           name: 'Coup',               copies: 1,  cost: 12 },
] as const;

const POOL_MAP = new Map<string, CardPoolEntry>(
  CARD_POOL.map(c => [c.id, c])
);

export function getCardFromPool(id: string): CardPoolEntry | undefined {
  return POOL_MAP.get(id);
}
