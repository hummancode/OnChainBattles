// ============================================================
// battleLog.ts — engine event → one short, player-relative log line.
// Pure (no Phaser); EngineEventBridge emits the result as BATTLE_LOG
// and BattleLogRenderer shows the latest lines in the right panel.
// ============================================================

import type { GameEvent } from '../../game/types/EventTypes';
import { getCard } from '../../game/data/CardRegistry';

export type LogTone = 'you' | 'enemy' | 'turn' | 'neutral';
export interface LogLine { text: string; tone: LogTone }

const cardName = (cardId: string | null | undefined): string => {
  if (!cardId) return 'A unit';
  try { return getCard(cardId).name; } catch { return cardId; }
};

/**
 * @param nameOf instanceId → cardId (units on the board / just removed), or null if unknown
 */
export function describeEvent(ev: GameEvent, local: number, nameOf: (instanceId: string) => string | null): LogLine | null {
  const e = ev as any;
  switch (ev.type) {
    case 'TURN_STARTED':
      return { text: `Turn ${e.turn} · ${e.activePlayer === local ? 'you' : 'opponent'}`, tone: 'turn' };
    case 'CARD_PLAYED':
      return {
        text: `${e.player === local ? 'You' : 'Opponent'} played ${cardName(e.cardId)}${e.legCost != null ? ` (${e.legCost} LEG)` : ''}`,
        tone: e.player === local ? 'you' : 'enemy',
      };
    case 'UNIT_ATTACKED': {
      const attacker = cardName(nameOf(e.attackerInstanceId));
      const target = cardName(nameOf(e.targetInstanceId));
      const byLocal = e.targetPlayer !== local; // the side that got hit is not the attacker's
      const tail = e.isKingHit && e.newHP != null ? ` (${Math.max(0, e.newHP)} left)` : '';
      return { text: `${attacker} hits ${target} for ${e.damage}${tail}`, tone: byLocal ? 'you' : 'enemy' };
    }
    case 'UNIT_DIED': {
      const mine = e.owner === local;
      return { text: `${mine ? 'Your' : 'Enemy'} ${cardName(e.cardId)} falls`, tone: mine ? 'enemy' : 'you' };
    }
    case 'UNIT_HEALED':
      return { text: `${cardName(e.cardId)} healed +${e.amount}`, tone: 'neutral' };
    case 'UNIT_CAPTURED':
      return { text: `${cardName(e.cardId)} switches sides${e.permanent ? '' : ' (this turn)'}`, tone: e.to === local ? 'you' : 'enemy' };
    case 'GAME_OVER': {
      const r = e.result;
      return { text: r.isDraw || r.winner == null ? 'Draw' : r.winner === local ? 'Victory!' : 'Defeat', tone: 'turn' };
    }
    default:
      return null;
  }
}
