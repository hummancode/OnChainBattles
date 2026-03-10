import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityResult } from '../types';

const noOp = (): AbilityResult => ({ events: [] });

// Passive abilities are not resolved on deploy — handled by AuraSystem or GameEngine LEG phase.
AbilityHandlerRegistry.register(AbilityType.PASSIVE_BUILD_DELAY, noOp);
AbilityHandlerRegistry.register(AbilityType.PASSIVE_SPAWN, noOp);
AbilityHandlerRegistry.register(AbilityType.PASSIVE_LANCER_CHARGE, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_ROYAL_DISCOUNT, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_LEG_BONUS, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_ADJ_DEF, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_BOARD_HALF_DEF, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_BOARD_HALF_ATK, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_VILLAGE_SLOW, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_CAVALRY_COUNTER, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_PIKEMAN_FLANK, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_AUTO_HEAL, noOp);
AbilityHandlerRegistry.register(AbilityType.ON_DEATH_DRAW, noOp);
AbilityHandlerRegistry.register(AbilityType.ON_KILL_LEG_DRAIN, noOp);
