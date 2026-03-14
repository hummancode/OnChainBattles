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
      customMove: {
        offsets: [
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -2, dy: 0 },
          { dx: 2, dy: 0 }, { dx: 0, dy: 2 },
        ],
        canJump: true,
      },},
  flags: [],
  ambushBonus: 1,
  abilities: [],
  abilityText: 'Jumps diagonally. Attacks landing square on jump. Ambush: +1 ATK from rear arc.',
};
