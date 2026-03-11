// ============================================================
// CardThumbnailRenderer.ts
// Renders an on-board unit thumbnail (100x100 default).
// Named children enable in-place badge updates.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';
import { makeBadge } from './helpers/CardRenderHelpers';

export class CardThumbnailRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;

    // Art
    const baseArtKey = data.artKey ?? `art_${data.id}`;
    const thumbKey = baseArtKey.replace(/^art_/, 'thumb_');
    const textureKey = this.scene.textures.exists(thumbKey) ? thumbKey
                     : this.scene.textures.exists(baseArtKey) ? baseArtKey
                     : null;

    if (textureKey) {
      const art = this.scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(w, h);
      container.add(art);
    } else {
      const ph = this.scene.add.graphics();
      ph.fillStyle(0x333355, 1);
      ph.fillRect(0, 0, w, h);
      container.add(ph);
    }

    // Team color border
    const border = this.scene.add.graphics();
    const borderColor = data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer;
    border.lineStyle(2, ThemeLoader.hexToNum(borderColor), 1);
    border.strokeRect(0, 0, w, h);
    container.add(border);

    // Team color band at bottom
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(borderColor), 0.9);
    band.fillRect(0, h - BT.unitBandHeight, w, BT.unitBandHeight);
    container.add(band);

    // ATK badge (named container)
    if (data.atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = makeBadge(
        this.scene, this.theme,
        2, h - BT.unitBandHeight - 2,
        String(data.atk), this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight,
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // DEF/HP badge (named container)
    if (data.currentHP !== undefined) {
      const hpPct = (data.maxHP && data.maxHP > 0) ? data.currentHP / data.maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = makeBadge(
        this.scene, this.theme,
        w - 2, h - BT.unitBandHeight - 2,
        String(data.currentHP), defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight,
      );
      defGroup.add(defParts);
      container.add(defGroup);
    } else if (data.def !== undefined) {
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = makeBadge(
        this.scene, this.theme,
        w - 2, h - BT.unitBandHeight - 2,
        String(data.def), this.theme.cards.defBadgeColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight,
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // "Can Act" gold glow (named)
    if (data.canAct) {
      const glow = this.scene.add.graphics();
      glow.lineStyle(3, 0xF5A623, 0.9);
      glow.strokeRect(-1, -1, w + 2, h + 2);
      glow.setName('can_act_glow');
      container.add(glow);
    }

    this.applyState(container, data);
    return container;
  }

  applyState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
    const existing = container.getByName('state_overlay');
    if (existing) container.remove(existing, true);

    const L = this.layout.cards.thumbnail;
    const overlay = this.scene.add.graphics();
    overlay.setName('state_overlay');

    if (data.isExhausted) {
      overlay.fillStyle(0x000000, 1 - this.theme.cards.exhaustedAlpha);
      overlay.fillRect(0, 0, L.width, L.height);
      if (this.scene.textures.exists('icon_clock')) {
        const clock = this.scene.add.image(L.width / 2, L.height / 2, 'icon_clock')
          .setDisplaySize(20, 20)
          .setAlpha(0.8)
          .setName('exhausted_icon');
        container.add(clock);
      }
    }

    if (data.isSelected) {
      overlay.lineStyle(
        this.theme.cards.selectedGlowSize,
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.9,
      );
      overlay.strokeRect(0, 0, L.width, L.height);
    }

    container.add(overlay);
  }

  updateBadges(
    container: Phaser.GameObjects.Container,
    atk: number | undefined,
    currentHP: number | undefined,
    maxHP: number | undefined,
    canAct: boolean,
  ): void {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const w = L.width;
    const h = L.height;

    // Update ATK badge
    const oldAtk = container.getByName('atk_badge');
    if (oldAtk) container.remove(oldAtk, true);
    if (atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = makeBadge(
        this.scene, this.theme,
        2, h - BT.unitBandHeight - 2,
        String(atk), this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight,
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // Update DEF/HP badge
    const oldDef = container.getByName('def_badge');
    if (oldDef) container.remove(oldDef, true);
    if (currentHP !== undefined) {
      const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = makeBadge(
        this.scene, this.theme,
        w - 2, h - BT.unitBandHeight - 2,
        String(currentHP), defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight,
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // Update canAct glow
    const oldGlow = container.getByName('can_act_glow');
    if (oldGlow) container.remove(oldGlow, true);
    if (canAct) {
      const glow = this.scene.add.graphics();
      glow.lineStyle(3, 0xF5A623, 0.9);
      glow.strokeRect(-1, -1, w + 2, h + 2);
      glow.setName('can_act_glow');
      container.add(glow);
    }
  }
}
