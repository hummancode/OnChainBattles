// ============================================================
// ScenarioSelectScene.ts — list of story puzzles (offline).
// Hub → PUZZLES → here → BattleScene { scenario: { id } }.
// Server-hosted placement puzzles stay reachable via "Community".
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import { MenuButton } from '../ui/MenuButton';
import { SCENARIOS } from '../game/scenarios/scenarios';
import { getScenarioProgress } from '../ui/scenarioProgress';

const FONT = '"Courier New", monospace';
const CX = 640;

export default class ScenarioSelectScene extends Phaser.Scene {
  private transitioning = false;
  private keys?: AbortController;

  constructor() { super('ScenarioSelectScene'); }

  create(): void {
    this.transitioning = false;
    const { width, height } = this.scale;
    if (this.textures.exists('bg_main_menu')) this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    else this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.92);
    panel.fillRoundedRect(140, 20, 1000, 680, 10);
    panel.lineStyle(2, 0xe67e22, 0.5);
    panel.strokeRoundedRect(140, 20, 1000, 680, 10);

    this.add.text(CX, 52, 'STORY PUZZLES', { fontSize: '28px', fontFamily: FONT, fontStyle: 'bold', color: '#e67e22' }).setOrigin(0.5);
    this.add.text(CX, 86, 'A few moves, a clever plan. The enemy answers every turn.', {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }).setOrigin(0.5);
    new MenuButton(this, 210, 52, '[ BACK ]', { color: '#ff4444', fontSize: '16px', onPointerDown: () => this.go('HubScene') });

    const solved = SCENARIOS.filter(s => getScenarioProgress(s.id)?.solved).length;
    this.add.text(1070, 52, `${solved}/${SCENARIOS.length} solved`, { fontSize: '13px', fontFamily: FONT, color: '#00ff88' }).setOrigin(1, 0.5);

    const rowH = 86, top = 120;
    SCENARIOS.forEach((s, i) => {
      const y = top + i * rowH;
      const prog = getScenarioProgress(s.id);
      const bg = this.add.rectangle(CX, y + rowH / 2 - 6, 940, rowH - 12, 0x0a0f1e, 0.7)
        .setStrokeStyle(1, prog?.solved ? 0x00ff88 : 0x334466, 0.8)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x1b2a4a, 0.9));
      bg.on('pointerout', () => bg.setFillStyle(0x0a0f1e, 0.7));
      bg.on('pointerdown', () => this.start(s.id));

      this.add.text(190, y + 8, `${i + 1}. ${s.title}`, { fontSize: '20px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF' });
      this.add.text(190, y + 38, s.text.objective, { fontSize: '13px', fontFamily: FONT, color: '#BBBBBB', wordWrap: { width: 640 } });
      this.add.text(1090, y + 10, '★'.repeat(s.difficulty) + '☆'.repeat(3 - s.difficulty), { fontSize: '18px', color: '#FFD54F' }).setOrigin(1, 0);
      this.add.text(1090, y + 38, `${s.maxMoves} moves`, { fontSize: '13px', fontFamily: FONT, color: '#4fc3f7' }).setOrigin(1, 0);
      if (prog?.solved) {
        this.add.text(1090, y + 56, `✔ solved (${prog.bestMoves} moves)`, { fontSize: '11px', fontFamily: FONT, color: '#00ff88' }).setOrigin(1, 0);
      }
    });

    new MenuButton(this, CX, 672, '[ Community puzzles ]', {
      color: '#777777', fontSize: '13px', onPointerDown: () => this.go('PuzzleScene'),
    });

    this.keys = new AbortController();
    window.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') this.go('HubScene'); }, { signal: this.keys.signal });
    this.events.once('shutdown', () => { this.keys?.abort(); this.keys = undefined; });
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private start(id: string): void {
    const s = SCENARIOS.find(x => x.id === id)!;
    this.go('BattleScene', {
      playerName: GameState.playerName || 'You', opponentName: s.title,
      isCryptoMode: false, roomCode: '', scenario: { id },
    });
  }

  private go(key: string, data?: object): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key, data));
  }
}
