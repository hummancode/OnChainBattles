/**
 * Client review findings: local input must only reach the network when the local engine
 * accepted it, never during the opponent's pending choice, and never in offline matches.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createSelectionManager, dispatchLocal } from '../../src/scenes/battle/InputCoordinator';
import { SelectionManager, type IGameEngineAPI } from '../../src/input/SelectionManager';
import { EventBus, EV } from '../../src/events/EventBus';
import { createTestEngine } from '../engine/helpers/TestHarness';
import type { GameAction } from '../../shared/types/NetworkEvents';

describe('local action dispatch', () => {
  let sm: SelectionManager | null = null;
  afterEach(() => { sm?.destroy(); sm = null; });

  it('does not send an action the engine refused', () => {
    const { engine } = createTestEngine();
    const sent: GameAction[] = [];
    expect(dispatchLocal(engine, { type: 'END_ACT_PHASE' }, a => sent.push(a))).toBe(false); // we're in PLAY
    expect(dispatchLocal(engine, { type: 'END_PLAY_PHASE' }, a => sent.push(a))).toBe(true);
    expect(sent.map(a => a.type)).toEqual(['END_PLAY_PHASE']);
  });

  it('selection callbacks without a pending are not sent', () => {
    const { engine } = createTestEngine();
    const sent: GameAction[] = [];
    sm = createSelectionManager(engine, {} as any, 0, a => sent.push(a));
    const api = (sm as any).engine as IGameEngineAPI;
    api.selectTarget(3, 0);
    api.selectPosition(3, 1);
    api.cancelPending();
    expect(sent).toEqual([]);
  });

  it("selection callbacks do nothing during the opponent's turn", () => {
    const { engine } = createTestEngine();
    const sent: GameAction[] = [];
    sm = createSelectionManager(engine, {} as any, 1, a => sent.push(a)); // we are P2, P1 active
    const api = (sm as any).engine as IGameEngineAPI;
    api.playCard(0, 3, 6);
    api.cancelPending();
    expect(sent).toEqual([]);
  });
});

function adapter(over: Partial<IGameEngineAPI> = {}): IGameEngineAPI {
  return {
    getValidMoves: () => [], getValidAttacks: () => [], getValidDeployPositions: () => [{ col: 0, row: 0 }],
    playCard: () => {}, moveUnit: () => {}, attackUnit: () => {}, selectTarget: () => {}, selectPosition: () => {},
    selectHandCard: () => {}, selectColumn: () => {}, cancelPending: () => {}, isAwaitingInput: () => false,
    canAct: () => true, isPlayerUnit: () => true, isOccupied: () => true,
    getPhase: () => 'PLAY', getAttackRange: () => [], isMyTurn: () => true,
    ...over,
  };
}

describe('SelectionManager review findings', () => {
  let sm: SelectionManager | null = null;
  afterEach(() => { sm?.destroy(); sm = null; });

  it("board clicks during the opponent's pending choice are ignored", () => {
    let targeted = 0;
    sm = new SelectionManager({} as any, adapter({
      isAwaitingInput: () => true, isMyTurn: () => false, selectTarget: () => { targeted++; },
    }));
    EventBus.emit(EV.PENDING_TARGET, {} as any);
    sm.onBoardCellClicked(3, 3);
    sm.onHandCardClicked(0);
    expect(targeted).toBe(0);
  });

  it('deselecting a hand card (index null) disarms it', () => {
    let played = 0;
    sm = new SelectionManager({} as any, adapter({ playCard: () => { played++; } }));
    EventBus.emit(EV.INPUT_HAND_CLICK, { index: 0 });
    expect(sm.getState().mode).toBe('card_selected');
    EventBus.emit(EV.INPUT_HAND_CLICK, { index: null });
    expect(sm.getState().mode).toBe('idle');
    sm.onBoardCellClicked(0, 0);
    expect(played).toBe(0);
  });
});

describe('Assassin jump attack via the board', () => {
  it('clicking an enemy on a jump-landing square sends a MOVE (jump attack), highlighted as an attack', () => {
    const moves: any[] = []; let hl: any = null;
    const off = EventBus.on(EV.HIGHLIGHTS_CHANGED, (h: any) => { hl = h; });
    const sm = new SelectionManager({} as any, adapter({
      getPhase: () => 'ACT',
      getValidMoves: () => [{ col: 5, row: 3 }, { col: 4, row: 2 }],
      getValidAttacks: () => [],
      isOccupied: (c: number, r: number) => (c === 1 && r === 1) || (c === 5 && r === 3),
      isPlayerUnit: (c: number, r: number) => c === 1 && r === 1,
      moveUnit: (...a: any[]) => { moves.push(a); },
    }));
    sm.onBoardCellClicked(1, 1);           // select assassin
    expect(hl.attacks).toEqual([{ col: 5, row: 3 }]);
    expect(hl.moves).toEqual([{ col: 4, row: 2 }]);
    sm.onBoardCellClicked(5, 3);           // enemy on the landing square
    expect(moves).toEqual([[1, 1, 5, 3]]);
    sm.destroy(); off();
  });
});
