// ============================================================
// BattleLogRenderer.ts — the last few battle events, bottom-right.
// Lines come from EngineEventBridge (BATTLE_LOG, built by battleLog.ts).
// Card previews (hand / board hover) render on top of this area.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';

const TONE: Record<string, string> = { you: '#7CF0B0', enemy: '#FF9A8A', turn: '#F5C542', neutral: '#C8D0E0' };
const MAX_LINES = 16;

export class BattleLogRenderer {
  private lines: Array<{ text: string; tone: string }> = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private unsub: () => void;
  private title?: Phaser.GameObjects.Text;

  private area?: { x: number; y: number; width: number; height: number };

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    const G = layout.battleLog;
    this.area = G;
    const family = theme.fonts.body.family;
    if (G) {
      this.title = scene.add.text(G.x + 14, G.y + 12, 'BATTLE LOG', {
        fontFamily: family, fontSize: '12px', fontStyle: 'bold', color: '#8A96B0',
      });
      for (let i = 0; i < MAX_LINES; i++) {
        this.texts.push(scene.add.text(G.x + 14, 0, '', {
          fontFamily: family, fontSize: '13px', color: '#C8D0E0', wordWrap: { width: G.width - 28 }, lineSpacing: 1,
        }).setVisible(false));
      }
    }
    this.unsub = EventBus.on(EV.BATTLE_LOG, ({ text, tone }) => this.push(text, tone));
  }

  private push(text: string, tone: string): void {
    this.lines.push({ text, tone });
    if (this.lines.length > MAX_LINES) this.lines.shift();
    const G = this.area;
    if (!G) return;
    // Newest at the bottom, stacked upward by real (wrapped) height; older lines fade
    let y = G.y + G.height - 10;
    const top = G.y + 32;
    this.texts.forEach(t => t.setVisible(false));
    for (let k = this.lines.length - 1, slot = 0; k >= 0; k--, slot++) {
      const line = this.lines[k], t = this.texts[slot];
      t.setText(line.tone === 'turn' ? `— ${line.text} —` : line.text)
        .setColor(TONE[line.tone] ?? '#C8D0E0')
        .setFontStyle(line.tone === 'turn' ? 'bold' : 'normal')
        .setAlpha(Math.max(0.4, 1 - slot * 0.06));
      y -= t.height;
      if (y < top) break;
      t.setY(y).setVisible(true);
      y -= line.tone === 'turn' ? 8 : 4;
    }
  }

  destroy(): void {
    this.unsub();
    this.texts.forEach(t => t.destroy());
    this.title?.destroy();
  }
}
