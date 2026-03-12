import { AbilityHandlerRegistry } from './AbilityHandlerRegistry';
import type { AbilityResult, AbilityContext } from './types';
import type { Unit, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { Board } from '../Board';
import type { PlayerState } from '../PlayerState';
import type { GameModifiers } from '../GameModifiers';
import { getCard } from '../data/CardRegistry';
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
    const key = ability.type === 'CUSTOM'
      ? (ability as any).handler as string
      : ability.type;

    const handler = AbilityHandlerRegistry.get(key);
    if (!handler) {
      console.warn(`[AbilityDispatcher] No handler for: ${key}`);
      continue;
    }

    const ctx: AbilityContext = {
      cardId,
      owner,
      position,
      board,
      players: ps,
      mods,
      unit: unitInstance,
      params: (ability as any).params ?? {},
    };

    try {
      const result = handler(ctx);
      combined.events.push(...result.events);
      if (result.pending && !combined.pending) combined.pending = result.pending;
    } catch (err) {
      console.error(`[AbilityDispatcher] Handler "${key}" threw for card "${cardId}":`, err);
    }
  }

  return combined;
}

export function resolveOnDeath(
  unit: Unit,
  cause: string,
  _board: Board,
  _ps: [PlayerState, PlayerState],
  _mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(unit.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    try {
      if (ability.type === 'ON_DEATH_DRAW') {
        if (cause !== 'REFORM') {
          combined.events.push({
            type:          'CARD_DRAWN',
            player:         unit.owner,
            cardId:         '__DRAW__',
            handIndex:      -1,
            deckRemaining:  -1,
          });
        }
      }
    } catch (err) {
      console.error(`[AbilityDispatcher] onDeath handler threw for "${unit.cardId}":`, err);
    }
  }

  return combined;
}

export function resolveOnKill(
  attacker: Unit,
  victim: Unit,
  _board: Board,
  _ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(attacker.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    try {
      if (ability.type === 'ON_KILL_LEG_DRAIN') {
        const { minTargetCost, amount } = (ability as any).params as { minTargetCost: number; amount: number };
        const victimCost = getCard(victim.cardId).cost;
        if (victimCost > minTargetCost) {
          const victimPlayer = victim.owner;
          const oldRate = mods[victimPlayer].getEffectiveLEGRate();
          combined.events.push({
            type:     'LEG_RATE_CHANGED',
            player:   victimPlayer,
            oldRate,
            newRate:  Math.max(1, oldRate - amount),
            reason:   'INQUISITOR',
          });
        }
      }
    } catch (err) {
      console.error(`[AbilityDispatcher] onKill handler threw for "${attacker.cardId}":`, err);
    }
  }

  return combined;
}
