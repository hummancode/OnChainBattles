// ============================================================
// phases/LEGPhase.ts
// LEG phase: CROWN growth, LEG gain, passive effects, aura recalc.
//
// Execution order:
//   1. CROWN grows +1 (capped)
//   2. Gain LEG equal to effective CROWN
//   3. Enemy King penalty (−1 LEG if enemy King in own half)
//   4. Auto-heal (King's Guard)
//   5. Disease ticks
//   6. Castle area attacks + spawn check
//   7. Activate BUILD_DELAY units whose timer expired
//   8. Evaluate auras (stat buffs)
//   9. Recalculate modifiers (LEG rate, Royal discount)
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { opponent } from '../GameContext';
import { TurnPhase } from '../types/GameTypes';
import { getCard } from '../data/CardRegistry';
import { resolveCastleAreaAttack, applyDamage, applyAutoHeal } from '../CombatResolver';

const CROWN_CAP = 10;

/**
 * Execute the full LEG phase for the active player.
 */
export function runLEGPhase(ctx: GameContext): void {
  ctx.phase = TurnPhase.LEG;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.LEG, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });

  const ap = ctx.activePlayer;
  const mod = ctx.mods[ap];

  // 1. CROWN grows +1 each turn (capped)
  if (mod.legRateBase < CROWN_CAP) {
    mod.legRateBase += 1;
  }

  // 2. Gain LEG
  const gained = mod.gainLEG();
  ctx.emit({
    type: 'LEG_GAINED',
    player: ap,
    amount: gained,
    total: mod.legPool,
    rate: mod.getEffectiveLEGRate(),
  });

  // 3. Enemy King in own half → −1 LEG penalty
  const enemyKing = ctx.board.getKing(opponent(ap));
  if (enemyKing && ctx.board.isOwnHalf(enemyKing.position.col, enemyKing.position.row, ap)) {
    mod.removeLEG(1);
    ctx.emit({
      type: 'LEG_SPENT',
      player: ap,
      amount: 1,
      remaining: mod.legPool,
      rate: mod.getEffectiveLEGRate(),
    });
  }

  // 4. King's Guard auto-heal (+2 HP)
  runAutoHeals(ctx, ap);

  // 5. Disease ticks
  runDiseaseTicks(ctx, ap);

  // 6. Castle area attacks + spawn
  runCastleEffects(ctx, ap);

  // 7. Activate BUILD_DELAY units
  runBuildDelayActivation(ctx, ap);

  // 8. Evaluate auras (stat buffs from Commander, Pikeman, etc.)
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  if (auraEvent.changes.length > 0) ctx.emit(auraEvent);

  // 9. Recalculate modifiers (LEG rate bonus, Royal discount)
  ctx.auras.recalculateModifiers(ctx.board, ctx.mods);

  // Advance to PLAY phase
  ctx.phase = TurnPhase.PLAY;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.PLAY, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });
}

// ─────────────────────────────────────────────
// SUB-STEPS (private to this module)
// ─────────────────────────────────────────────

function runAutoHeals(ctx: GameContext, ap: number): void {
  const healUnits = ctx.board.getUnitsOf(ap).filter(u =>
    u.isActive && getCard(u.cardId).abilities.some(
      (a: any) => a.type === 'AURA_AUTO_HEAL'
    )
  );

  for (const unit of healUnits) {
    const ability = getCard(unit.cardId).abilities.find(
      (a: any) => a.type === 'AURA_AUTO_HEAL'
    ) as any;
    const amount = ability?.params?.amount ?? 2;
    const healEvents = applyAutoHeal(unit, amount);
    ctx.applyEvents(healEvents);
  }
}

function runDiseaseTicks(ctx: GameContext, ap: number): void {
  const mod = ctx.mods[ap];
  const diseaseEffects = mod.timedEffects.filter(e => e.type === 'DISEASE_TICK');

  for (const effect of diseaseEffects) {
    if (!effect.targetInstanceId) continue;
    const target = ctx.board.getUnitById(effect.targetInstanceId);
    if (!target) continue;

    const dmg = effect.value ?? 2;
    const dmgEvents = applyDamage(target, dmg, 'DISEASE');
    ctx.applyEvents(dmgEvents);

    // Adjacency damage: 1 to neighbors
    const adj = ctx.board.getAdjacentUnits(target.position.col, target.position.row);
    for (const adjUnit of adj) {
      const adjEvents = applyDamage(adjUnit, 1, 'DISEASE');
      ctx.applyEvents(adjEvents);
    }
  }
}

function runCastleEffects(ctx: GameContext, ap: number): void {
  const castles = ctx.board.getUnitsOf(ap).filter(u =>
    u.cardId === 'castle' && u.isActive
  );

  for (const castle of castles) {
    // Area attack
    const atkEvents = resolveCastleAreaAttack(castle, ctx.board);
    ctx.applyEvents(atkEvents);

    // Spawn counter
    castle.spawnCounter++;
    const spawnDef = getCard('castle');
    const spawnAbility = spawnDef.abilities.find(
      (a: any) => a.type === 'PASSIVE_SPAWN'
    ) as any;
    const interval = spawnAbility?.params?.interval ?? 3;

    if (castle.spawnCounter >= interval) {
      castle.spawnCounter = 0;
      const freeSquares = ctx.board.getFreeSquaresInHalf(ap);
      if (freeSquares.length > 0) {
        const spawnPos = freeSquares[0];
        const spawnUnit = ctx.createUnit('foot_soldier', ap, spawnPos);
        ctx.board.placeUnit(spawnUnit);
        ctx.emit({
          type: 'UNIT_PLACED',
          instanceId: spawnUnit.instanceId,
          cardId: 'foot_soldier',
          owner: ap,
          col: spawnPos.col,
          row: spawnPos.row,
          isActive: true,
        });
        ctx.emit({
          type: 'STRUCTURE_SPAWNED',
          structureInstanceId: castle.instanceId,
          spawnedCardId: 'foot_soldier',
          spawnedInstanceId: spawnUnit.instanceId,
          col: spawnPos.col,
          row: spawnPos.row,
          owner: ap,
        });
      }
    }
  }
}

function runBuildDelayActivation(ctx: GameContext, ap: number): void {
  const mod = ctx.mods[ap];
  const readyUnits = mod.timedEffects.filter(
    e => e.type === 'BUILD_DELAY' && e.duration <= 1
  );

  for (const effect of readyUnits) {
    if (!effect.targetInstanceId) continue;
    const unit = ctx.board.getUnitById(effect.targetInstanceId);
    if (unit) {
      unit.isActive = true;
      ctx.emit({
        type: 'UNIT_ACTIVATED',
        instanceId: unit.instanceId,
        col: unit.position.col,
        row: unit.position.row,
      });
    }
  }
}
