/**
 * gameModifiers.test.ts — LEG economy and timed effects.
 */

import { describe, it, expect } from 'vitest';
import { GameModifiers } from '../../../src/game/GameModifiers';
import { Player } from '../../../src/game/types/GameTypes';

describe('GameModifiers', () => {
  describe('LEG economy', () => {
    it('LEG rate grows with CROWN base', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 3;
      expect(mod.getEffectiveLEGRate()).toBe(3);
    });

    it('gainLEG adds rate to pool capped at CROWN', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 5;
      mod.legPool = 2;
      const gained = mod.gainLEG();
      // Pool was 2, rate is 5, cap is 5 → pool = min(2+5, 5) = 5
      expect(mod.legPool).toBe(5);
      expect(gained).toBe(3);
    });

    it('spendLEG reduces pool and returns true', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 10;
      mod.legPool = 5;
      expect(mod.spendLEG(3)).toBe(true);
      expect(mod.legPool).toBe(2);
    });

    it('spendLEG with insufficient funds returns false', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legPool = 2;
      expect(mod.spendLEG(5)).toBe(false);
      expect(mod.legPool).toBe(2); // unchanged
    });

    it('LEG cap enforcement clamps pool', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 3;
      mod.legPool = 10;
      // Adding a penalty lowers the cap and clamps
      mod.addLEGRatePenalty(1);
      // Effective rate: max(1, 3+0-1) = 2, cap = 2
      expect(mod.legPool).toBeLessThanOrEqual(mod.getLEGCap());
    });

    it('minimum LEG rate is 1 (never negative)', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 1;
      mod.addLEGRatePenalty(10);
      expect(mod.getEffectiveLEGRate()).toBe(1);
    });
  });

  describe('Royal discount', () => {
    it('reduces cost of Royal cards', () => {
      const mod = new GameModifiers(Player.P1);
      mod.royalCostDiscount = 3;
      expect(mod.getEffectiveCardCost(8, true)).toBe(5);
    });

    it('does not affect Standard cards', () => {
      const mod = new GameModifiers(Player.P1);
      mod.royalCostDiscount = 3;
      expect(mod.getEffectiveCardCost(5, false)).toBe(5);
    });

    it('cost floors at 0', () => {
      const mod = new GameModifiers(Player.P1);
      mod.royalCostDiscount = 20;
      expect(mod.getEffectiveCardCost(5, true)).toBe(0);
    });

    it('penalty increases Royal cost', () => {
      const mod = new GameModifiers(Player.P1);
      mod.royalCostDiscount = 2;
      mod.royalCostPenalty = 3;
      // 8 - 2 + 3 = 9
      expect(mod.getEffectiveCardCost(8, true)).toBe(9);
    });
  });

  describe('LEG freeze (Civil War)', () => {
    it('legRateFrozen blocks LEG gain', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 5;
      mod.legRateFrozen = true;
      expect(mod.getEffectiveLEGRate()).toBe(0);
    });

    it('frozen still allows existing pool to be spent', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 5;
      mod.legPool = 3;
      mod.legRateFrozen = true;
      expect(mod.spendLEG(2)).toBe(true);
      expect(mod.legPool).toBe(1);
    });
  });

  describe('timed effects', () => {
    it('tickEffects decrements duration and returns expired', () => {
      const mod = new GameModifiers(Player.P1);
      mod.addTimedEffect({ type: 'MOVEMENT_BUFF', duration: 2 });
      const expired1 = mod.tickEffects();
      expect(expired1).toHaveLength(0);
      const expired2 = mod.tickEffects();
      expect(expired2).toHaveLength(1);
      expect(expired2[0].type).toBe('MOVEMENT_BUFF');
    });

    it('permanent effects (duration -1) never expire', () => {
      const mod = new GameModifiers(Player.P1);
      mod.addTimedEffect({ type: 'LEG_DRAIN', duration: -1 });
      for (let i = 0; i < 10; i++) mod.tickEffects();
      expect(mod.hasEffect('LEG_DRAIN')).toBe(true);
    });

    it('Civil War freeze resolves after duration', () => {
      const mod = new GameModifiers(Player.P1);
      mod.addTimedEffect({ type: 'CIVIL_WAR_FREEZE', duration: 2 });
      mod.tickEffects(); // dur 2→1
      expect(mod.legRateFrozen).toBe(true);
      mod.tickEffects(); // dur 1→0, expired
      expect(mod.legRateFrozen).toBe(false);
    });

    it('overflow clears and clamps pool', () => {
      const mod = new GameModifiers(Player.P1);
      mod.legRateBase = 3;
      mod.legOverflow = true;
      mod.legPool = 10; // way over cap
      expect(mod.getLEGCap()).toBe(Infinity);
      mod.clearOverflow();
      expect(mod.legPool).toBe(3); // clamped to cap
    });
  });
});
