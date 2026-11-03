/**
 * Invalid clicks used to be silently ignored (Roadmap 2.7). SelectionManager now tells the
 * player why, via a UI_TOAST on the EventBus.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { SelectionManager, type IGameEngineAPI } from '../../src/input/SelectionManager';
import { EventBus, EV } from '../../src/events/EventBus';

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

describe('SelectionManager feedback toasts', () => {
  const toasts: string[] = [];
  const unsub = EventBus.on(EV.UI_TOAST, ({ message }) => toasts.push(message));
  let sm: SelectionManager | null = null;
  afterEach(() => { sm?.destroy?.(); toasts.length = 0; });

  it("clicking your unit during the opponent's turn says so", () => {
    sm = new SelectionManager({} as any, adapter({ isMyTurn: () => false, getPhase: () => 'ACT' }));
    sm.onBoardCellClicked(3, 0);
    expect(toasts).toEqual(["It's your opponent's turn"]);
  });

  it('clicking your unit in PLAY explains units act in ACT', () => {
    sm = new SelectionManager({} as any, adapter({ getPhase: () => 'PLAY' }));
    sm.onBoardCellClicked(3, 0);
    expect(toasts[0]).toMatch(/ACT phase/);
  });

  it('a unit that cannot act explains why', () => {
    sm = new SelectionManager({} as any, adapter({ getPhase: () => 'ACT', canAct: () => false }));
    sm.onBoardCellClicked(3, 0);
    expect(toasts[0]).toMatch(/can't act/i);
  });

  it('deploying outside the highlighted squares says where to deploy', () => {
    sm = new SelectionManager({} as any, adapter({ isOccupied: () => false }));
    sm.onHandCardClicked(0);
    sm.onBoardCellClicked(5, 5);
    expect(toasts[0]).toMatch(/highlighted/i);
  });

  it('clicking a hand card outside PLAY explains when cards can be played', () => {
    sm = new SelectionManager({} as any, adapter({ getPhase: () => 'ACT' }));
    sm.onHandCardClicked(0);
    expect(toasts[0]).toMatch(/PLAY phase/);
  });

  it('no toast for a valid selection', () => {
    sm = new SelectionManager({} as any, adapter({ getPhase: () => 'ACT' }));
    sm.onBoardCellClicked(3, 0);
    expect(toasts).toEqual([]);
    unsub;
  });
});

describe('COLUMN pending (Earthquake)', () => {
  it('a board click during a COLUMN pending selects that column', () => {
    const cols: number[] = [];
    const sm = new SelectionManager({} as any, adapter({
      isAwaitingInput: () => true,
      selectColumn: (c: number) => cols.push(c),
      selectTarget: () => { throw new Error('must not route a column pick to selectTarget'); },
    } as any));
    EventBus.emit(EV.PENDING_COLUMN, { reason: 'pick', } as any);
    sm.onBoardCellClicked(4, 2);
    expect(cols).toEqual([4]);
    sm.destroy?.();
  });
});
