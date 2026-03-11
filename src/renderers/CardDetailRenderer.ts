// ============================================================
// CardDetailRenderer.ts
// Renders the detail overlay card (220x320 default).
// Uses CardFullRenderer internally for the scaled card body.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';
import { CardFullRenderer } from './CardFullRenderer';

export class CardDetailRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.detail;
    const T = ThemeLoader.cardTypeTheme(this.theme, data?.allegiance ?? 'STANDARD');
    const container = this.scene.add.container(x - L.width / 2, y - L.height / 2);

    const w = L.width;
    const r = 8;
    const scaleFactor = L.width / this.layout.cards.full.width;

    const detailLayout: BattleLayoutJSON = {
      ...this.layout,
      cards: {
        ...this.layout.cards,
        full: {
          ...this.layout.cards.full,
          width:         L.width,
          height:        L.height,
          artAreaHeight: Math.round(this.layout.cards.full.artAreaHeight * scaleFactor),
          nameBarHeight: Math.round(this.layout.cards.full.nameBarHeight * scaleFactor),
          statRowHeight: Math.round(this.layout.cards.full.statRowHeight * scaleFactor),
          legPipSize:    Math.round(this.layout.cards.full.legPipSize * scaleFactor),
          typeIconSize:  Math.round(this.layout.cards.full.typeIconSize * scaleFactor),
          cornerRadius:  r,
        },
      },
    };

    const subRenderer = new CardFullRenderer(this.scene, detailLayout, this.theme);
    const cardBody = subRenderer.render(data, 0, 0);
    container.add(cardBody);

    const diagY = L.height + 10;
    const diagSize = L.patternDiagramSize;
    if (data.id) {
      const diagBg = this.scene.add.graphics();
      diagBg.fillStyle(ThemeLoader.hexToNum(this.theme.colors.BG_MID), 0.9);
      diagBg.strokeRoundedRect(0, diagY, w, diagSize + 16, 6);
      diagBg.fillRoundedRect(0, diagY, w, diagSize + 16, 6);

      const diagLabel = this.scene.add.text(w / 2, diagY + 4, 'MOVE / ATTACK PATTERN', {
        fontFamily: this.theme.fonts.small.family,
        fontSize: `${this.theme.fonts.small.size}px`,
        color: this.theme.colors.TEXT_SECONDARY,
      }).setOrigin(0.5, 0);

      container.add([diagBg, diagLabel]);
    }

    void T;
    return container;
  }
}
