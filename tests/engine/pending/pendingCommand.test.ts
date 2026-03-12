import { describe, it, expect } from 'vitest';
import type { PendingCommand } from '../../../src/game/pending/PendingCommand';
import { Player } from '../../../src/game/types/GameTypes';

describe('PendingCommand — serialization', () => {
  it('TARGET variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'TARGET',
      owner: Player.P1,
      sourceCardId: 'priest',
      sourceAbility: 'ON_DEPLOY_HEAL_FRIENDLY',
      reason: 'Choose a friendly unit to heal',
      validTargetIds: ['foot_soldier_1', 'king_0'],
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('TARGET');
    expect(parsed.owner).toBe(Player.P1);
    expect(parsed.sourceCardId).toBe('priest');
    if (parsed.kind === 'TARGET') {
      expect(parsed.validTargetIds).toHaveLength(2);
      expect(parsed.validTargetIds).toContain('foot_soldier_1');
    }
  });

  it('POSITION variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'POSITION',
      owner: Player.P1,
      sourceCardId: 'militia',
      sourceAbility: 'CUSTOM',
      reason: 'Choose where to summon',
      validPositions: [{ col: 2, row: 1 }, { col: 3, row: 0 }],
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('POSITION');
    if (parsed.kind === 'POSITION') {
      expect(parsed.validPositions).toHaveLength(2);
    }
  });

  it('COLUMN variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'COLUMN',
      owner: Player.P2,
      sourceCardId: 'earthquake',
      sourceAbility: 'SPELL_EARTHQUAKE',
      reason: 'Choose a column',
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('COLUMN');
    expect(parsed.owner).toBe(Player.P2);
  });

  it('DISCARD variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'DISCARD',
      owner: Player.P1,
      sourceCardId: 'war_horn',
      sourceAbility: 'SPELL_WAR_HORN',
      count: 1,
      reason: 'Discard 1 card',
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('DISCARD');
    if (parsed.kind === 'DISCARD') {
      expect(parsed.count).toBe(1);
    }
  });

  it('contains no function properties', () => {
    const cmd: PendingCommand = {
      kind: 'TARGET',
      owner: Player.P1,
      sourceCardId: 'priest',
      sourceAbility: 'ON_DEPLOY_HEAL_FRIENDLY',
      reason: 'test',
      validTargetIds: ['a'],
      deferredEvents: [],
    };

    for (const key of Object.keys(cmd)) {
      expect(typeof (cmd as any)[key]).not.toBe('function');
    }
  });

  it('deferredEvents array serializes correctly', () => {
    const cmd: PendingCommand = {
      kind: 'TARGET',
      owner: Player.P1,
      sourceCardId: 'mystic',
      sourceAbility: 'CUSTOM',
      reason: 'test',
      validTargetIds: ['a'],
      deferredEvents: [
        { type: 'LEG_RATE_CHANGED', player: Player.P2, oldRate: 2, newRate: 1, reason: 'Mystic drain' } as any,
      ],
    };

    const parsed: PendingCommand = JSON.parse(JSON.stringify(cmd));
    expect(parsed.deferredEvents).toHaveLength(1);
    expect((parsed.deferredEvents[0] as any).type).toBe('LEG_RATE_CHANGED');
  });
});
