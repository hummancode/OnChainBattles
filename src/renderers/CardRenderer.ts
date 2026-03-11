// ============================================================
// CardRenderer.ts — Thin facade
// Delegates to CardFullRenderer, CardThumbnailRenderer,
// CardDetailRenderer, and CardBackRenderer.
// Consumers can import this for polymorphic render(mode) calls,
// or import sub-renderers directly for type-specific work.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData, CardRenderMode } from '../game/types/UITypes';
import { CardFullRenderer } from './CardFullRenderer';
import { CardThumbnailRenderer } from './CardThumbnailRenderer';
import { CardDetailRenderer } from './CardDetailRenderer';
import { CardBackRenderer } from './CardBackRenderer';

export class CardRenderer {
  private fullRenderer: CardFullRenderer;
  private thumbnailRenderer: CardThumbnailRenderer;
  private detailRenderer: CardDetailRenderer;
  private backRenderer: CardBackRenderer;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.fullRenderer = new CardFullRenderer(scene, layout, theme);
    this.thumbnailRenderer = new CardThumbnailRenderer(scene, layout, theme);
    this.detailRenderer = new CardDetailRenderer(scene, layout, theme);
    this.backRenderer = new CardBackRenderer(scene, layout, theme);
  }

  render(data: CardRenderData, mode: CardRenderMode, x: number, y: number): Phaser.GameObjects.Container {
    switch (mode) {
      case 'full':      return this.fullRenderer.render(data, x, y);
      case 'thumbnail': return this.thumbnailRenderer.render(data, x, y);
      case 'detail':    return this.detailRenderer.render(data, x, y);
    }
  }

  updateState(container: Phaser.GameObjects.Container, data: CardRenderData, mode: CardRenderMode): void {
    if (mode === 'thumbnail') {
      this.thumbnailRenderer.applyState(container, data);
    } else {
      this.fullRenderer.applyState(container, data);
    }
  }

  updateThumbnailBadges(
    container: Phaser.GameObjects.Container,
    atk: number | undefined,
    currentHP: number | undefined,
    maxHP: number | undefined,
    canAct: boolean,
  ): void {
    this.thumbnailRenderer.updateBadges(container, atk, currentHP, maxHP, canAct);
  }

  renderBack(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
    return this.backRenderer.render(x, y, width, height);
  }
}
