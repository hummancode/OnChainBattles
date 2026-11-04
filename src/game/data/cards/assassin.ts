import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, STD } from './_aliases.js';
export const ASSASSIN_DEF: CardDefinition = {
  id: 'assassin', name: 'Assassin',
  flavorText: 'The shadow moves. Then it\'s over.',
  class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
  stats: { atk: 4, def: 1, movement: MovementType.JUMP_DIAGONAL_1, attackPattern: AtkPattern.ON_JUMP,
      customAttack: {
        offsets: [
          { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
        ],
        canJump: true,
      },
      // Diagonal step, or a 2-square diagonal jump over anything; a jump landing on an
      // enemy attacks it (MovementRules.getJumpAttackLandings / ActPhase.executeMove).
      customMove: {
        offsets: [
          { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
          { dx: -2, dy: -2 }, { dx: 2, dy: -2 }, { dx: -2, dy: 2 }, { dx: 2, dy: 2 },
        ],
        canJump: true,
      },},
  flags: [],
  ambushBonus: 1,
  abilities: [],
  abilityText: 'Jumps 1–2 squares diagonally, over units. A 2-square jump onto an enemy attacks it (no counter). Ambush: +1 ATK from rear arc.',
};
