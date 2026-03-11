// ============================================================
// MovementPresets.ts
// Custom movement and attack pattern offset constants.
// Used by CardDefinitions for Archer, Assassin, and others.
// ============================================================

import type { CustomPattern } from '../types/CardTypes';

// Archer: diagonal ranged 2 squares
export const PATTERN_ARCHER_ATTACK: CustomPattern = {
  offsets: [
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
    { dx: 2, dy: -2 }, { dx: -2, dy: -2 }, { dx: 2, dy: 2 }, { dx: -2, dy: 2 },
  ],
  range: 1,
};

// Assassin: attacks diagonally adjacent
export const PATTERN_ASSASSIN_ATTACK: CustomPattern = {
  offsets: [
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
  ],
  range: 1,
};

// Assassin: jumps 2 squares in HV direction
export const PATTERN_ASSASSIN_MOVE: CustomPattern = {
  offsets: [
    { dx: 2, dy: 0 }, { dx: -2, dy: 0 }, { dx: 0, dy: 2 }, { dx: 0, dy: -2 },
  ],
  range: 1,
};
