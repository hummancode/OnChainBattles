/** Board readability: each unit is drawn as ready (glow), spent (dimmed) or idle. */
import { describe, it, expect } from 'vitest';
import { unitVisualState } from '../../src/scenes/battle/EngineEventBridge';

const u = (o: Partial<any>) => ({ owner: 0, hasMoved: false, hasActed: false, isJustPlaced: false, isActive: true, ...o });

describe('unitVisualState', () => {
  it('ready: active side, has not acted', () => expect(unitVisualState(u({}), 0)).toBe('ready'));
  it('spent: active side, already moved or attacked', () => {
    expect(unitVisualState(u({ hasMoved: true }), 0)).toBe('spent');
    expect(unitVisualState(u({ hasActed: true }), 0)).toBe('spent');
  });
  it('idle: the other side, or freshly deployed / inactive', () => {
    expect(unitVisualState(u({}), 1)).toBe('idle');
    expect(unitVisualState(u({ isJustPlaced: true }), 0)).toBe('idle');
    expect(unitVisualState(u({ isActive: false }), 0)).toBe('idle');
  });
});
