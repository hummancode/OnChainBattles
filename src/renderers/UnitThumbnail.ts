// ============================================================
// UnitThumbnail.ts — Self-contained board unit visual.
//
// Each thumbnail OWNS its Phaser container and mutable children.
// Direct field references — no string-based lookups.
//
// v0.5.1:
//   - Added mutable col/row fields. BoardRenderer sets these on
//     creation and updates them on move. Pointer event closures
//     read thumb.col/thumb.row instead of captured constants,
//     so clicks always report the current logical position.
//   - instanceId enables identity-based lookup during tweens.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class UnitThumbnail {
  readonly container: Phaser.GameObjects.Container;
  readonly instanceId: string;

  // Mutable logical board position — updated by BoardRenderer on move.
  // Pointer event closures read from these instead of captured values.
  col: number = 0;
  row: number = 0;

  /** Cell map key — maintained by BoardRenderer for O(1) reverse lookup. */
  cellKey: string = '';

  // Direct references to mutable children — never string lookups
  private atkBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private atkBadgeText: Phaser.GameObjects.Text | null = null;
  private defBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private defBadgeText: Phaser.GameObjects.Text | null = null;
  private canActGlow: Phaser.GameObjects.Graphics | null = null;

  // Cached layout/theme for badge positioning
  private readonly scene: Phaser.Scene;
  private readonly w: number;
  private readonly h: number;
  private readonly bandHeight: number;
  private readonly badgeFontSize: number;
  private readonly badgeWidth: number;
  private readonly badgeHeight: number;
  private readonly atkBadgeColor: string;
  private readonly defBadgeColor: string;
  private readonly hpMidColor: string;
  private readonly hpLowColor: string;
  private readonly fontFamily: string;

  constructor(
    scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON,
    data: CardRenderData, x: number, y: number,
  ) {
    this.scene = scene;
    this.instanceId = data.id;

    const L = layout.cards.thumbnail;
    const BT = theme.board;
    this.w = L.width;
    this.h = L.height;
    this.bandHeight = BT.unitBandHeight;
    this.badgeFontSize = L.badgeFontSize;
    this.badgeWidth = L.badgeWidth;
    this.badgeHeight = L.badgeHeight;
    this.atkBadgeColor = theme.cards.atkBadgeColor;
    this.defBadgeColor = theme.cards.defBadgeColor;
    this.hpMidColor = BT.hpBarMid;
    this.hpLowColor = BT.hpBarLow;
    this.fontFamily = theme.fonts.cardStat.family;

    this.container = scene.add.container(x, y);

    // ── Art (immutable) ──
    const baseArtKey = data.artKey ?? `art_${data.id}`;
    const thumbKey = baseArtKey.replace(/^art_/, 'thumb_');
    const textureKey = scene.textures.exists(thumbKey) ? thumbKey
                     : scene.textures.exists(baseArtKey) ? baseArtKey
                     : null;
    if (textureKey) {
      this.container.add(scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(this.w, this.h));
    } else {
      const ph = scene.add.graphics();
      ph.fillStyle(0x333355, 1);
      ph.fillRect(0, 0, this.w, this.h);
      this.container.add(ph);
    }

    // ── Team border + band (immutable) ──
    const borderColor = data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer;
    const border = scene.add.graphics();
    border.lineStyle(2, ThemeLoader.hexToNum(borderColor), 1);
    border.strokeRect(0, 0, this.w, this.h);
    this.container.add(border);

    const band = scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(borderColor), 0.9);
    band.fillRect(0, this.h - this.bandHeight, this.w, this.bandHeight);
    this.container.add(band);

    // ── Mutable badges ──
    this.setAtk(data.atk);
    this.setDef(data.currentHP, data.maxHP);
    this.setCanAct(data.canAct ?? false);
  }

  // ─────────────────────────────────────────────
  // TARGETED STAT UPDATES — safe during tweens
  // ─────────────────────────────────────────────

  setAtk(atk: number | undefined): void {
    if (atk === undefined) {
      if (this.atkBadgeBg) this.atkBadgeBg.setVisible(false);
      if (this.atkBadgeText) this.atkBadgeText.setVisible(false);
      return;
    }

    const bx = 2, by = this.h - this.bandHeight - 2;
    if (!this.atkBadgeBg) {
      this.atkBadgeBg = this.scene.add.graphics();
      this.container.add(this.atkBadgeBg);
    }
    this.atkBadgeBg.clear();
    this.atkBadgeBg.fillStyle(ThemeLoader.hexToNum(this.atkBadgeColor), 1);
    this.atkBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 4);
    this.atkBadgeBg.setVisible(true);

    if (!this.atkBadgeText) {
      this.atkBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(atk), {
        fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, color: '#FFFFFF',
      }).setOrigin(0.5, 0.5);
      this.container.add(this.atkBadgeText);
    } else {
      this.atkBadgeText.setText(String(atk));
      this.atkBadgeText.setVisible(true);
    }
  }

  setDef(currentHP: number | undefined, maxHP: number | undefined): void {
    if (currentHP === undefined) {
      if (this.defBadgeBg) this.defBadgeBg.setVisible(false);
      if (this.defBadgeText) this.defBadgeText.setVisible(false);
      return;
    }

    const bx = this.w - 2 - this.badgeWidth, by = this.h - this.bandHeight - 2;
    const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
    const fillColor = hpPct > 0.5 ? this.defBadgeColor : hpPct > 0.25 ? this.hpMidColor : this.hpLowColor;

    if (!this.defBadgeBg) {
      this.defBadgeBg = this.scene.add.graphics();
      this.container.add(this.defBadgeBg);
    }
    this.defBadgeBg.clear();
    this.defBadgeBg.fillStyle(ThemeLoader.hexToNum(fillColor), 1);
    this.defBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 4);
    this.defBadgeBg.setVisible(true);

    if (!this.defBadgeText) {
      this.defBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(currentHP), {
        fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, color: '#FFFFFF',
      }).setOrigin(0.5, 0.5);
      this.container.add(this.defBadgeText);
    } else {
      this.defBadgeText.setText(String(currentHP));
      this.defBadgeText.setVisible(true);
    }
  }

  setCanAct(canAct: boolean): void {
    if (!canAct) {
      if (this.canActGlow) this.canActGlow.setVisible(false);
      return;
    }
    if (!this.canActGlow) {
      this.canActGlow = this.scene.add.graphics();
      this.canActGlow.lineStyle(3, 0xF5A623, 0.9);
      this.canActGlow.strokeRect(-1, -1, this.w + 2, this.h + 2);
      this.container.add(this.canActGlow);
    }
    this.canActGlow.setVisible(true);
  }

/** Update only the fields that are provided. undefined = no change. */
  updateStats(atk: number | undefined, currentHP: number | undefined, maxHP: number | undefined, canAct: boolean): void {
    if (atk !== undefined) this.setAtk(atk);
    if (currentHP !== undefined) this.setDef(currentHP, maxHP);
    this.setCanAct(canAct);
  }

  destroy(): void {
    this.container.destroy();
    this.atkBadgeBg = null; this.atkBadgeText = null;
    this.defBadgeBg = null; this.defBadgeText = null;
    this.canActGlow = null;
  }
}