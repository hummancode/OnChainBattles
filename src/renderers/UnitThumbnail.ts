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

  /** Latest render data (stats kept current by updateStats) — used for the hover preview. */
  data: CardRenderData;

  // Direct references to mutable children — never string lookups
  private atkBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private atkBadgeText: Phaser.GameObjects.Text | null = null;
  private defBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private defBadgeText: Phaser.GameObjects.Text | null = null;
  private canActGlow: Phaser.GameObjects.Graphics | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private art: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | null = null;
  private spentShade: Phaser.GameObjects.Graphics | null = null;
  private spent = false;

  // Cached layout/theme for badge positioning
  private readonly scene: Phaser.Scene;
  private readonly w: number;
  private readonly h: number;
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
    this.data = { ...data };

    const L = layout.cards.thumbnail;
    const BT = theme.board;
    this.w = L.width;
    this.h = L.height;
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
      this.art = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(this.w, this.h);
    } else {
      const ph = scene.add.graphics();
      ph.fillStyle(0x333355, 1);
      ph.fillRect(0, 0, this.w, this.h);
      this.art = ph;
    }
    this.container.add(this.art);

    // ── Team colour (immutable): thick frame + corner ribbon — readable at a glance ──
    const team = ThemeLoader.hexToNum(data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer);
    const frame = scene.add.graphics();
    frame.lineStyle(4, team, 1);
    frame.strokeRect(2, 2, this.w - 4, this.h - 4);
    frame.lineStyle(1, 0x000000, 0.6);
    frame.strokeRect(0, 0, this.w, this.h);
    // Corner ribbon (top-left triangle)
    const r = 22;
    frame.fillStyle(team, 1);
    frame.fillTriangle(0, 0, r, 0, 0, r);
    frame.lineStyle(1, 0x000000, 0.5);
    frame.lineBetween(r, 0, 0, r);
    this.container.add(frame);

    // Spent (already acted this turn): dark veil over the art, under the badges
    this.spentShade = scene.add.graphics();
    this.spentShade.fillStyle(0x000000, 0.5);
    this.spentShade.fillRect(0, 0, this.w, this.h);
    this.spentShade.setVisible(false);
    this.container.add(this.spentShade);

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

    const bx = 3, by = this.h - 3 - this.badgeHeight / 2;
    if (!this.atkBadgeBg) {
      this.atkBadgeBg = this.scene.add.graphics();
      this.container.add(this.atkBadgeBg);
    }
    this.atkBadgeBg.clear();
    this.atkBadgeBg.fillStyle(ThemeLoader.hexToNum(this.atkBadgeColor), 1);
    this.atkBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 5);
    this.atkBadgeBg.lineStyle(2, 0x000000, 0.7);
    this.atkBadgeBg.strokeRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 5);
    this.atkBadgeBg.setVisible(true);

    if (!this.atkBadgeText) {
      this.atkBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(atk), {
        fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, fontStyle: 'bold', color: '#FFFFFF',
        stroke: '#000000', strokeThickness: 3,
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

    const bx = this.w - 3 - this.badgeWidth, by = this.h - 3 - this.badgeHeight / 2;
    const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
    const fillColor = hpPct > 0.5 ? this.defBadgeColor : hpPct > 0.25 ? this.hpMidColor : this.hpLowColor;

    if (!this.defBadgeBg) {
      this.defBadgeBg = this.scene.add.graphics();
      this.container.add(this.defBadgeBg);
    }
    this.defBadgeBg.clear();
    this.defBadgeBg.fillStyle(ThemeLoader.hexToNum(fillColor), 1);
    this.defBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 5);
    this.defBadgeBg.lineStyle(2, 0x000000, 0.7);
    this.defBadgeBg.strokeRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 5);
    this.defBadgeBg.setVisible(true);

    if (!this.defBadgeText) {
      this.defBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(currentHP), {
        fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, fontStyle: 'bold', color: '#FFFFFF',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 0.5);
      this.container.add(this.defBadgeText);
    } else {
      this.defBadgeText.setText(String(currentHP));
      this.defBadgeText.setVisible(true);
    }
  }

  /** Ready to act: soft pulsing gold edge (outside the team frame). */
  setCanAct(canAct: boolean): void {
    if (!canAct) {
      if (this.canActGlow) this.canActGlow.setVisible(false);
      this.glowTween?.pause();
      return;
    }
    if (!this.canActGlow) {
      this.canActGlow = this.scene.add.graphics();
      this.canActGlow.lineStyle(6, 0xFFD54F, 0.35);
      this.canActGlow.strokeRect(-3, -3, this.w + 6, this.h + 6);
      this.canActGlow.lineStyle(2, 0xFFD54F, 1);
      this.canActGlow.strokeRect(-1, -1, this.w + 2, this.h + 2);
      this.container.add(this.canActGlow);
      this.glowTween = this.scene.tweens.add({
        targets: this.canActGlow, alpha: { from: 1, to: 0.45 }, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
    this.canActGlow.setVisible(true);
    this.glowTween?.resume();
  }

  /** Spent this turn (moved / attacked): dimmed so the units still to play stand out. */
  setSpent(spent: boolean): void {
    if (this.spent === spent) return;
    this.spent = spent;
    this.spentShade?.setVisible(spent);
  }

/** Update only the fields that are provided. undefined = no change. */
  updateStats(atk: number | undefined, currentHP: number | undefined, maxHP: number | undefined, canAct: boolean, spent?: boolean): void {
    if (spent !== undefined) this.setSpent(spent);
    if (atk !== undefined) { this.setAtk(atk); this.data.atk = atk; }
    if (currentHP !== undefined) { this.setDef(currentHP, maxHP); this.data.currentHP = currentHP; if (maxHP !== undefined) this.data.maxHP = maxHP; }
    this.setCanAct(canAct);
  }

  destroy(): void {
    this.glowTween?.remove();
    this.glowTween = null;
    this.container.destroy();
    this.atkBadgeBg = null; this.atkBadgeText = null;
    this.defBadgeBg = null; this.defBadgeText = null;
    this.canActGlow = null;
  }
}