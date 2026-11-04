/**
 * A moved unit used to be re-keyed in `unitsByCell` only when its 220 ms tween finished,
 * so a death / stat event or a click on the destination square in that window found
 * nothing (or the wrong unit). The logical position must update immediately.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/utils/PhaserUtils', () => ({ setContainerHitArea: () => {} }));
import { BoardRenderer } from '../../src/renderers/BoardRenderer';

describe('BoardRenderer.animateUnitMove', () => {
  it('re-keys the unit to its new cell before the tween completes', () => {
    const r: any = Object.create(BoardRenderer.prototype);
    const thumb = { container: {}, col: 3, row: 1, cellKey: '3_1', instanceId: 'u1' };
    const tweens: any[] = [];
    r.unitsByCell = new Map([[ '3_1', thumb ]]);
    r.layout = { grid: { originX: 0, originY: 0, cellSize: 100 }, cards: { thumbnail: { width: 90, height: 90 } } };
    r.scene = { tweens: { add: (cfg: any) => tweens.push(cfg), killTweensOf: () => {} } };
    r.localPlayer = 0; r.localPlayerIndex = 0;
    const key = (c: number, row: number) => r.cellKey(c, row);
    r.animateUnitMove({ col: 3, row: 1 }, { col: 3, row: 2 });
    expect(tweens.length).toBe(1);               // animation still running
    expect(r.unitsByCell.get(key(3, 2))).toBe(thumb);
    expect(r.unitsByCell.has(key(3, 1))).toBe(false);
    expect(thumb.row).toBe(2);
  });
});
