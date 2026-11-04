// ============================================================
// ScenarioCoordinator.ts — story-puzzle UI inside BattleScene:
// intro (story + objective), side panel (moves / turns / hint /
// restart / exit), narration banners, and the result screen.
// Reads ScenarioRunner state; owns its listeners (cleanup()).
// ============================================================

import Phaser from 'phaser';
import { EventBus, EV } from '../../events/EventBus';
import type { ScenarioRunner } from '../../game/scenarios/ScenarioRunner';
import { SCENARIOS } from '../../game/scenarios/scenarios';
import { recordScenarioWin } from '../../ui/scenarioProgress';
import { Player } from '../../game/types/GameTypes';

const FONT = '"Courier New", monospace';
const GOLD = '#FFD54F';

const LOSE_REASON: Record<string, string> = {
  OUT_OF_MOVES: 'You ran out of moves.',
  OUT_OF_TURNS: 'You ran out of time.',
  KING_DIED: 'Your King has fallen.',
};

export interface ScenarioNav {
  restart(): void;
  next(id: string): void;
  exit(): void;
}

export class ScenarioCoordinator {
  /** True while the intro is open — the scene holds the opponent until the player begins. */
  introOpen = true;
  private side?: Phaser.GameObjects.Container;
  private movesText?: Phaser.GameObjects.Text;
  private turnText?: Phaser.GameObjects.Text;
  private extraText?: Phaser.GameObjects.Text;
  private modal?: Phaser.GameObjects.Container;
  private banner?: Phaser.GameObjects.Container;
  private bannerTimer?: Phaser.Time.TimerEvent;
  private unsubs: Array<() => void> = [];
  private lastMoves = 0;
  private resultShown = false;

  constructor(private scene: Phaser.Scene, private runner: ScenarioRunner, private nav: ScenarioNav) {
    this.buildSidePanel();
    this.showIntro();
    this.unsubs.push(runner.onChange(() => this.refresh()));
    this.unsubs.push(EventBus.on(EV.TURN_STARTED, (p: any) => {
      if (p?.activePlayer !== Player.P2 || this.runner.status !== 'playing') return;
      const lines = this.runner.scenario.text.opponentTurn;
      const idx = this.runner.playerTurn - 1;
      this.narrate(lines?.[idx] ?? 'The enemy answers…', '#FF8866');
    }));
    this.refresh();
  }

  // ─── Side panel (bottom-left, under the hand) ───────────────
  private buildSidePanel(): void {
    const s = this.runner.scenario;
    const x = 138, y = 446;
    const bg = this.scene.add.rectangle(0, 0, 250, 200, 0x0b1020, 0.9).setStrokeStyle(2, 0xe67e22, 0.7);
    const title = this.scene.add.text(0, -88, s.title, { fontSize: '15px', fontFamily: FONT, fontStyle: 'bold', color: GOLD }).setOrigin(0.5, 0);
    const obj = this.scene.add.text(0, -66, s.text.objective, {
      fontSize: '11px', fontFamily: FONT, color: '#DDDDDD', align: 'center', wordWrap: { width: 230 },
    }).setOrigin(0.5, 0);
    this.movesText = this.scene.add.text(-110, 0, '', { fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7' });
    this.turnText = this.scene.add.text(-110, 20, '', { fontSize: '12px', fontFamily: FONT, color: '#AAAAAA' });
    this.extraText = this.scene.add.text(-110, 38, '', { fontSize: '12px', fontFamily: FONT, color: '#FF8866' });
    const mk = (bx: number, label: string, color: string, fn: () => void) =>
      this.scene.add.text(bx, 74, label, { fontSize: '12px', fontFamily: FONT, color, backgroundColor: '#00000088', padding: { x: 5, y: 3 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', fn);
    this.side = this.scene.add.container(x, y, [
      bg, title, obj, this.movesText, this.turnText, this.extraText,
      mk(-78, '[ HINT ]', GOLD, () => this.showHint()),
      mk(2, '[ RESTART ]', '#4fc3f7', () => this.nav.restart()),
      mk(80, '[ EXIT ]', '#ff6666', () => this.nav.exit()),
    ]).setDepth(955);
  }

  private refresh(): void {
    const r = this.runner, s = r.scenario;
    this.movesText?.setText(`Moves left: ${r.movesLeft} / ${s.maxMoves}`).setColor(r.movesLeft <= 1 ? '#FF8866' : '#4fc3f7');
    this.turnText?.setText(s.goal.kind === 'SURVIVE'
      ? `Hold until turn ${s.goal.turns + 1}  (turn ${Math.min(r.playerTurn, s.maxTurns + 1)})`
      : `Turn ${Math.min(r.playerTurn, s.maxTurns)} / ${s.maxTurns}`);
    this.extraText?.setText(s.goal.kind === 'KILL_UNITS' ? `Targets left: ${r.targetsLeft}` : '');

    if (r.movesUsed > this.lastMoves) {
      for (let m = this.lastMoves + 1; m <= r.movesUsed; m++) {
        const line = s.text.afterMove?.[m];
        if (line && r.status === 'playing') this.narrate(line, GOLD);
      }
      this.lastMoves = r.movesUsed;
    }
    if (r.status !== 'playing' && !this.resultShown) {
      this.resultShown = true;
      if (r.status === 'won') recordScenarioWin(s.id, r.movesUsed);
      // Let the last attack / death animation play first
      this.scene.time.delayedCall(900, () => this.showResult());
    }
  }

  // ─── Narration banner (top of the board) ────────────────────
  narrate(text: string, color = GOLD): void {
    this.banner?.destroy();
    this.bannerTimer?.remove(false);
    const t = this.scene.add.text(0, 0, text, {
      fontSize: '15px', fontFamily: FONT, color, align: 'center', wordWrap: { width: 600 },
    }).setOrigin(0.5);
    const bg = this.scene.add.rectangle(0, 0, Math.min(660, t.width + 40), t.height + 18, 0x000000, 0.82).setStrokeStyle(1, 0xe67e22, 0.6);
    this.banner = this.scene.add.container(640, 34 + t.height / 2, [bg, t]).setDepth(965).setAlpha(0);
    this.scene.tweens.add({ targets: this.banner, alpha: 1, duration: 200 });
    this.bannerTimer = this.scene.time.delayedCall(Math.max(2800, text.length * 55), () => {
      const b = this.banner;
      if (b) this.scene.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: () => b.destroy() });
      if (this.banner === b) this.banner = undefined;
    });
  }

  // ─── Modals ─────────────────────────────────────────────────
  private openModal(lines: Array<{ text: string; size: number; color: string; bold?: boolean }>,
                    buttons: Array<{ label: string; color: string; fn: () => void }>, border: number): void {
    this.modal?.destroy();
    const parts: Phaser.GameObjects.GameObject[] = [];
    const dim = this.scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.55).setInteractive(); // swallow board clicks
    parts.push(dim);
    const w = 640;
    const texts: Phaser.GameObjects.Text[] = [];
    let y = 0;
    for (const l of lines) {
      const t = this.scene.add.text(0, y, l.text, {
        fontSize: `${l.size}px`, fontFamily: FONT, color: l.color, align: 'center',
        fontStyle: l.bold ? 'bold' : 'normal', wordWrap: { width: w - 60 }, lineSpacing: 4,
      }).setOrigin(0.5, 0);
      texts.push(t);
      y += t.height + 14;
    }
    const h = y + 70;
    const box = this.scene.add.rectangle(0, 0, w, h, 0x0b1020, 0.96).setStrokeStyle(2, border, 0.9);
    parts.push(box);
    for (const t of texts) { t.y -= h / 2 - 24; parts.push(t); }
    const spacing = 170, startX = -((buttons.length - 1) * spacing) / 2;
    buttons.forEach((b, i) => {
      parts.push(this.scene.add.text(startX + i * spacing, h / 2 - 30, b.label, {
        fontSize: '17px', fontFamily: FONT, fontStyle: 'bold', color: b.color, backgroundColor: '#00000088', padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', b.fn));
    });
    this.modal = this.scene.add.container(640, 360, parts).setDepth(980);
    dim.setPosition(0, 0);
  }

  private closeModal(): void { this.modal?.destroy(); this.modal = undefined; }

  private showIntro(): void {
    const s = this.runner.scenario;
    this.openModal([
      { text: s.title, size: 26, color: GOLD, bold: true },
      { text: '★'.repeat(s.difficulty) + '☆'.repeat(3 - s.difficulty), size: 16, color: GOLD },
      ...s.text.intro.map(p => ({ text: p, size: 15, color: '#EEEEEE' })),
      { text: `Goal: ${s.text.objective}`, size: 15, color: '#4fc3f7', bold: true },
      { text: `Moves = playing a card, moving or attacking. Ending a turn is free.`, size: 12, color: '#999999' },
    ], [
      { label: '[ BEGIN ]', color: '#00FF88', fn: () => { this.closeModal(); this.introOpen = false; } },
      { label: '[ BACK ]', color: '#AAAAAA', fn: () => this.nav.exit() },
    ], 0xe67e22);
  }

  private showHint(): void {
    this.narrate(`Hint: ${this.runner.scenario.text.hint}`, '#FFFFFF');
  }

  private showResult(): void {
    const r = this.runner, s = r.scenario;
    const won = r.status === 'won';
    const idx = SCENARIOS.findIndex(x => x.id === s.id);
    const next = SCENARIOS[idx + 1];
    const buttons = [
      { label: '[ RETRY ]', color: '#4fc3f7', fn: () => this.nav.restart() },
      ...(won && next ? [{ label: '[ NEXT ]', color: '#00FF88', fn: () => this.nav.next(next.id) }] : []),
      { label: '[ PUZZLES ]', color: '#AAAAAA', fn: () => this.nav.exit() },
    ];
    this.openModal([
      { text: won ? 'PUZZLE SOLVED' : 'NOT QUITE…', size: 28, color: won ? '#00FF88' : '#FF6666', bold: true },
      { text: won ? s.text.win : s.text.lose, size: 15, color: '#EEEEEE' },
      ...(won ? [{ text: `Solved in ${r.movesUsed} of ${s.maxMoves} moves.`, size: 13, color: '#AAAAAA' }]
              : [{ text: LOSE_REASON[r.loseReason ?? ''] ?? '', size: 13, color: '#FF8866' },
                 { text: `Hint: ${s.text.hint}`, size: 12, color: '#999999' }]),
    ], buttons, won ? 0x00ff88 : 0xff6666);
  }

  cleanup(): void {
    this.unsubs.forEach(u => u());
    this.unsubs = [];
    this.bannerTimer?.remove(false);
    this.banner?.destroy();
    this.modal?.destroy();
    this.side?.destroy();
  }
}
