// ============================================================
// CardBackRenderer.ts
// Renders a face-down card back for opponent hand display.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class CardBackRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const r = this.layout.cards.full.cornerRadius;

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(this.theme.colors.BG_DEEP), 1);
    bg.fillRoundedRect(0, 0, width, height, r);

    const border = this.scene.add.graphics();
    border.lineStyle(2, 0x2C4A8A, 1);
    border.strokeRoundedRect(0, 0, width, height, r);

    const backKey = 'card_back';
    if (this.scene.textures.exists(backKey)) {
      const back = this.scene.add.image(width / 2, height / 2, backKey)
        .setDisplaySize(width - 4, height - 4);
      container.add([bg, border, back]);
    } else {
      const pattern = this.scene.add.graphics();
      pattern.lineStyle(1, 0x2C4A8A, 0.3);
      for (let i = 4; i < Math.min(width, height) / 2; i += 8) {
        pattern.strokeRoundedRect(i, i, width - i * 2, height - i * 2, r);
      }
      const logoText = this.scene.add.text(width / 2, height / 2, 'OCB', {
        fontFamily: this.theme.fonts.heading.family,
        fontSize: `${Math.round(width * 0.2)}px`,
        color: '#4FC3F799',
      }).setOrigin(0.5, 0.5);
      container.add([bg, border, pattern, logoText]);
    }

    return container;
  }
}
