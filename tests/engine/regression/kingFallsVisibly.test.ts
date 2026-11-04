/**
 * A finished game left the dead King on the board (shown with 0 HP), and an Assassin whose
 * jump killed the King stayed on its start square (the King still occupied the landing).
 */
import { describe, it, expect } from 'vitest';
import { ScenarioRunner } from '../../../src/game/scenarios/ScenarioRunner';
import { SCENARIOS } from '../../../src/game/scenarios/scenarios';
import { wireEngineToEventBus } from '../../../src/scenes/battle/EngineEventBridge';
import { EventBus } from '../../../src/events/EventBus';
import '../helpers/TestHarness';

const nightblade = () => SCENARIOS.find(s => s.id === 'nightblade')!;
function solveNightblade(r: ScenarioRunner) {
  for (const a of nightblade().solution) { r.play(a); r.runOpponent(); }
}

describe('the fallen King', () => {
  it("an Assassin's killing jump onto the King lands on the King's square", () => {
    const r = new ScenarioRunner(nightblade());
    solveNightblade(r);
    expect(r.status).toBe('won');
    const st = r.engine.getState();
    expect(st.board.find(c => c.col === 3 && c.row === 6)!.unit?.cardId).toBe('assassin');
  });

  it('GAME_OVER tells the UI the dead King died (death animation, no 0-HP King left)', () => {
    const r = new ScenarioRunner(nightblade());
    const died: any[] = [];
    const unwire = wireEngineToEventBus(r.engine, 0);
    const off = EventBus.on('UNIT_DIED' as any, (p: any) => died.push(p));
    solveNightblade(r);
    off(); unwire();
    const king = died.find(d => d.col === 3 && d.row === 6);
    expect(king).toBeTruthy();
  });

  it('a King killed by a normal attack is also reported as died', () => {
    const r = new ScenarioRunner(SCENARIOS.find(s => s.id === 'breach')!);
    const died: any[] = [];
    const unwire = wireEngineToEventBus(r.engine, 0);
    const off = EventBus.on('UNIT_DIED' as any, (p: any) => died.push(p));
    for (const a of r.scenario.solution) r.play(a);
    off(); unwire();
    expect(r.status).toBe('won');
    expect(died.some(d => d.col === 3 && d.row === 6)).toBe(true);
  });
});
