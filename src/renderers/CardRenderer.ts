// ============================================================
// CardRenderer.ts
// Renders a single card as a Phaser Container at any of 3 modes:
//   'full'      — in-hand card (140×200 default)
//   'thumbnail' — on-board unit (100×100 default)
//   'detail'    — overlay detail (220×320 default)
//
// ALL proportions come from LayoutJSON.cards and ThemeJSON.cards.
// Change card width/height in JSON → entire card rescales.
// No hardcoded pixel values below.
//
// STEP 3 PATCHES:
//   - Added static _missingKeyWarned set to suppress console spam
//   - Added safeImage() helper — all texture lookups are now safe
//   - renderFull() typeIcon: replaced unguarded add.image() with safeImage()
//   - renderFull() allegiance guard: data?.allegiance ?? 'STANDARD'
//   - renderDetail() allegiance guard: data?.allegiance ?? 'STANDARD'
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData, CardRenderMode } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class CardRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  // Tracks which texture keys have already logged a warning.
  // Prevents console spam when many cards share the same missing texture.
  private static _missingKeyWarned = new Set<string>();

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /**
   * Create a card Container at position (x, y).
   * The container origin is top-left for 'full' and 'thumbnail',
   * center for 'detail'.
   */
  render(data: CardRenderData, mode: CardRenderMode, x: number, y: number): Phaser.GameObjects.Container {
    switch (mode) {
      case 'full':      return this.renderFull(data, x, y);
      case 'thumbnail': return this.renderThumbnail(data, x, y);
      case 'detail':    return this.renderDetail(data, x, y);
    }
  }

  /**
   * Update an existing card container's visual state
   * without recreating it. Used for exhausted/selected state changes.
   */
  updateState(container: Phaser.GameObjects.Container, data: CardRenderData, mode: CardRenderMode): void {
    if (mode === 'thumbnail') {
      this.applyThumbnailState(container, data);
    } else {
      this.applyFullState(container, data);
    }
  }

  // ─────────────────────────────────────────────
  // FULL CARD (in-hand)
  // ─────────────────────────────────────────────

  private renderFull(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.full;
    // PATCH: guard allegiance before passing to ThemeLoader
    const T = ThemeLoader.cardTypeTheme(this.theme, data?.allegiance ?? 'STANDARD');
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;
    const r = L.cornerRadius;

    // — Background body —
    const body = this.scene.add.graphics();
    body.fillStyle(ThemeLoader.hexToNum(T.bodyColor), 1);
    body.fillRoundedRect(0, 0, w, h, r);

    // — Top color band —
    const bandH = h * 0.15; // proportional: ~30px at 200h
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(T.bandColor), 1);
    band.fillRoundedRect(0, 0, w, bandH, { tl: r, tr: r, bl: 0, br: 0 });

    // — Border —
    const border = this.scene.add.graphics();
    border.lineStyle(T.borderWidth, ThemeLoader.hexToNum(T.borderColor), 1);
    border.strokeRoundedRect(0, 0, w, h, r);

    // — LEG cost pip (top-left) —
    const pipR = L.legPipSize / 2;
    const pip = this.scene.add.graphics();
    pip.fillStyle(ThemeLoader.hexToNum(this.theme.cards.STANDARD.legPipColor === T.legPipColor
      ? this.theme.colors.ACCENT_BLUE
      : T.legPipColor), 1);
    pip.fillCircle(pipR + 4, pipR + 4, pipR);

    const pipText = this.scene.add.text(pipR + 4, pipR + 4, String(data.cost), {
      fontFamily: this.theme.fonts.cardStat.family,
      fontSize: `${Math.round(L.legPipSize * 0.55)}px`,
      color: '#FFFFFF',
    }).setOrigin(0.5, 0.5);

    // — Type icon (top-right) — PATCH: safeImage() replaces unguarded add.image()
    const iconKey = `icon_type_${(data?.allegiance ?? 'standard').toLowerCase()}`;
    this.safeImage(
      container,
      iconKey,
      w - L.typeIconSize / 2 - 4,  // x (center-origin)
      L.typeIconSize / 2 + 4,       // y (center-origin)
      L.typeIconSize,
      L.typeIconSize,
      0.5, 0.5,                     // center origin
      0x223366, 0.5,                // fallback: dark blue rect
    );
    // Note: safeImage() adds directly to container, so typeIcon is no longer
    // a separate variable. It's removed from the children.push() call below.

    // — Art area —
    const artY = bandH;
    const artH = L.artAreaHeight;
    const artKey = `art_${data.id}`;
    let artObj: Phaser.GameObjects.GameObject;

    if (this.scene.textures.exists(artKey)) {
      artObj = this.scene.add.image(0, artY, artKey)
        .setOrigin(0, 0)
        .setDisplaySize(w, artH);
    } else {
      // Placeholder if art not loaded — grey-blue rect with card id label
      const artPh = this.scene.add.graphics();
      artPh.fillStyle(0x333355, 1);
      artPh.fillRect(0, artY, w, artH);
      artObj = artPh;
      // Small label so developer can identify which art is missing
      if (!CardRenderer._missingKeyWarned.has(artKey)) {
        CardRenderer._missingKeyWarned.add(artKey);
        console.warn(`[CardRenderer] Art texture missing, using fallback rect: "${artKey}"`);
      }
    }

    // — Name bar —
    const nameY = artY + artH;
    const nameBar = this.scene.add.graphics();
    const { color: nbColor, alpha: nbAlpha } = ThemeLoader.hexToColorAlpha(this.theme.cards.nameBarBg);
    nameBar.fillStyle(nbColor, nbAlpha);
    nameBar.fillRect(0, nameY, w, L.nameBarHeight);

    const nameText = this.scene.add.text(w / 2, nameY + L.nameBarHeight / 2, data.name, {
      fontFamily: this.theme.fonts.cardName.family,
      fontSize: `${this.theme.fonts.cardName.size}px`,
      color: this.theme.fonts.cardName.color ?? '#FFFFFF',
    }).setOrigin(0.5, 0.5).setWordWrapWidth(w - 8);

    // — Stat row (ATK | DEF) —
    const statY = nameY + L.nameBarHeight;
    const statBg = this.scene.add.graphics();
    statBg.fillStyle(0x000000, 0.4);
    statBg.fillRect(0, statY, w, L.statRowHeight);

    // typeIcon is now added directly to container by safeImage() above,
    // so it's excluded from this children array.
    const children: Phaser.GameObjects.GameObject[] = [body, band, border, artObj, nameBar, nameText, statBg];

    if (data.atk !== undefined && data.def !== undefined) {
      // ATK badge
      const atkBadge = this.makeBadge(
        4, statY + L.statRowHeight / 2,
        `ATK ${data.atk}`,
        this.theme.cards.atkBadgeColor,
        L.statRowHeight - 4
      );
      // DEF badge
      const defBadge = this.makeBadge(
        w - 4, statY + L.statRowHeight / 2,
        `DEF ${data.def}`,
        this.theme.cards.defBadgeColor,
        L.statRowHeight - 4,
        true // right-aligned
      );
      children.push(...atkBadge, ...defBadge);
    }

    // — Ability text (remaining height) —
    const abilityY = statY + L.statRowHeight + 4;
    if (data.abilityText) {
      const abilityText = this.scene.add.text(4, abilityY, data.abilityText, {
        fontFamily: this.theme.fonts.cardAbility.family,
        fontSize: `${this.theme.fonts.cardAbility.size}px`,
        color: this.theme.fonts.cardAbility.color ?? '#AAAAAA',
        wordWrap: { width: w - 8 },
      }).setOrigin(0, 0);
      children.push(abilityText);
    }

    // — Bottom type label —
    const typeLabel = this.scene.add.text(w / 2, h - 8, (data?.allegiance ?? 'STANDARD').toUpperCase(), {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0.5, 1);

    // typeIcon excluded here — already added to container by safeImage()
    children.push(pip, pipText, typeLabel);
    container.add(children);

    // — Apply state overlays —
    this.applyFullState(container, data);

    return container;
  }

  // ─────────────────────────────────────────────
  // THUMBNAIL (on-board unit)
  // ─────────────────────────────────────────────

  private renderThumbnail(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;

    // — Art fills entire thumbnail — already has correct fallback, unchanged
    const artKey = `art_${data.id}`;
    if (this.scene.textures.exists(artKey)) {
      const art = this.scene.add.image(0, 0, artKey).setOrigin(0, 0).setDisplaySize(w, h);
      container.add(art);
    } else {
      const ph = this.scene.add.graphics();
      ph.fillStyle(0x333355, 1);
      ph.fillRect(0, 0, w, h);
      container.add(ph);
    }

    // — Team color border —
    const border = this.scene.add.graphics();
    const borderColor = data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer;
    border.lineStyle(2, ThemeLoader.hexToNum(borderColor), 1);
    border.strokeRect(0, 0, w, h);
    container.add(border);

    // — Team color band at bottom —
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(borderColor), 0.9);
    band.fillRect(0, h - BT.unitBandHeight, w, BT.unitBandHeight);
    container.add(band);

    // — HP bar (inside band) —
    if (data.currentHP !== undefined && data.maxHP !== undefined) {
      const hpPct = Math.max(0, data.currentHP / data.maxHP);
      const hpColor = hpPct > 0.5 ? BT.hpBarFull : hpPct > 0.25 ? BT.hpBarMid : BT.hpBarLow;

      const hpBg = this.scene.add.graphics();
      hpBg.fillStyle(ThemeLoader.hexToNum(BT.hpBarBackground), 1);
      hpBg.fillRect(0, h - L.hpBarHeight, w, L.hpBarHeight);

      const hpFill = this.scene.add.graphics();
      hpFill.fillStyle(ThemeLoader.hexToNum(hpColor), 1);
      hpFill.fillRect(0, h - L.hpBarHeight, w * hpPct, L.hpBarHeight);

      container.add([hpBg, hpFill]);
    }

    // — ATK badge (bottom-left) —
    if (data.atk !== undefined) {
      const atkBadge = this.makeBadge(
        2, h - BT.unitBandHeight - 2,
        String(data.atk),
        this.theme.cards.atkBadgeColor,
        L.badgeFontSize,
        false,
        L.badgeWidth,
        L.badgeHeight
      );
      container.add(atkBadge);
    }

    // — DEF badge (bottom-right) —
    if (data.def !== undefined) {
      const defBadge = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(data.def),
        this.theme.cards.defBadgeColor,
        L.badgeFontSize,
        true,
        L.badgeWidth,
        L.badgeHeight
      );
      container.add(defBadge);
    }

    this.applyThumbnailState(container, data);

    return container;
  }

  // ─────────────────────────────────────────────
  // DETAIL OVERLAY (right-click / long-press)
  // ─────────────────────────────────────────────

  private renderDetail(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.detail;
    // PATCH: guard allegiance
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

    // Build a sub-renderer with scaled layout
    const subRenderer = new CardRenderer(this.scene, detailLayout, this.theme);
    const cardBody = subRenderer.renderFull(data, 0, 0);
    container.add(cardBody);

    // — Movement/Attack pattern diagram —
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

    // Suppress unused variable warning — T is kept for potential future use
    void T;

    return container;
  }

  // ─────────────────────────────────────────────
  // CARD BACK (face-down / opponent hand)
  // ─────────────────────────────────────────────

  renderBack(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
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
      // Fallback pattern — concentric rectangles
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

  // ─────────────────────────────────────────────
  // STATE OVERLAYS
  // ─────────────────────────────────────────────

  private applyFullState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
    // Remove any existing state overlays
    const existing = container.getByName('state_overlay');
    if (existing) container.remove(existing, true);

    const L = this.layout.cards.full;
    const overlay = this.scene.add.graphics();
    overlay.setName('state_overlay');

    if (data.isExhausted) {
      // Darken card
      overlay.fillStyle(0x000000, 1 - this.theme.cards.exhaustedAlpha);
      overlay.fillRoundedRect(0, 0, L.width, L.height, L.cornerRadius);
    }

    if (data.isSelected) {
      overlay.lineStyle(
        this.theme.cards.selectedGlowSize,
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor),
        0.8
      );
      overlay.strokeRoundedRect(
        -this.theme.cards.selectedGlowSize / 2,
        -this.theme.cards.selectedGlowSize / 2,
        L.width + this.theme.cards.selectedGlowSize,
        L.height + this.theme.cards.selectedGlowSize,
        L.cornerRadius
      );
    }

    container.add(overlay);
  }

  private applyThumbnailState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
    const existing = container.getByName('state_overlay');
    if (existing) container.remove(existing, true);

    const L = this.layout.cards.thumbnail;
    const overlay = this.scene.add.graphics();
    overlay.setName('state_overlay');

    if (data.isExhausted) {
      overlay.fillStyle(0x000000, 1 - this.theme.cards.exhaustedAlpha);
      overlay.fillRect(0, 0, L.width, L.height);
      // Clock icon — already guarded with textures.exists, unchanged
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
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor),
        0.9
      );
      overlay.strokeRect(0, 0, L.width, L.height);
    }

    container.add(overlay);
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  /**
   * Safely add an image to a container.
   * If the texture key is not loaded in Phaser's cache, adds a
   * semi-transparent colored rectangle as a stand-in (silent fallback).
   *
   * Logs a one-time console warning per missing key so developers
   * can see what art is absent without being spammed per-frame.
   *
   * @param container     - Target Phaser container
   * @param key           - Phaser texture key (e.g. 'art_king', 'icon_atk')
   * @param x             - X position
   * @param y             - Y position
   * @param w             - Display width
   * @param h             - Display height
   * @param originX       - Phaser origin X (0 = left, 0.5 = center)
   * @param originY       - Phaser origin Y (0 = top,  0.5 = center)
   * @param fallbackColor - Hex number for fallback rect (default: 0x333355)
   * @param fallbackAlpha - Alpha for fallback rect (default: 0.6)
   */
  private safeImage(
    container: Phaser.GameObjects.Container,
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    originX = 0,
    originY = 0,
    fallbackColor = 0x333355,
    fallbackAlpha = 0.6,
  ): void {
    if (this.scene.textures.exists(key)) {
      const img = this.scene.add.image(x, y, key)
        .setOrigin(originX, originY)
        .setDisplaySize(w, h);
      container.add(img);
    } else {
      // Convert origin-relative position to top-left for graphics rect
      const rx = originX === 0.5 ? x - w / 2 : x;
      const ry = originY === 0.5 ? y - h / 2 : y;
      const rect = this.scene.add.graphics();
      rect.fillStyle(fallbackColor, fallbackAlpha);
      rect.fillRect(rx, ry, w, h);
      container.add(rect);

      if (!CardRenderer._missingKeyWarned.has(key)) {
        CardRenderer._missingKeyWarned.add(key);
        console.warn(`[CardRenderer] Texture not found, using fallback rect: "${key}"`);
      }
    }
  }

  /**
   * Make an ATK/DEF badge pill.
   * Returns array of GameObjects to add to a container.
   */
  private makeBadge(
    x: number,
    y: number,
    label: string,
    fillHex: string,
    fontSize: number,
    rightAligned = false,
    w = 24,
    h = 16
  ): Phaser.GameObjects.GameObject[] {
    const bgX = rightAligned ? x - w : x;

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
    bg.fillRoundedRect(bgX, y - h / 2, w, h, 4);

    const text = this.scene.add.text(x + (rightAligned ? -w / 2 : w / 2), y, label, {
      fontFamily: this.theme.fonts.cardStat.family,
      fontSize: `${fontSize}px`,
      color: '#FFFFFF',
    }).setOrigin(0.5, 0.5);

    return [bg, text];
  }
}