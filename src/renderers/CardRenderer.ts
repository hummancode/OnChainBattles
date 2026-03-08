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
// PATCH v0.3.2:
//   - renderThumbnail: badge groups wrapped in named containers
//     ('atk_badge', 'def_badge') for in-place updates
//   - NEW: updateThumbnailBadges() — updates ATK/DEF/canAct
//     in-place without destroying the parent container.
//     This eliminates tween race conditions entirely.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData, CardRenderMode } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class CardRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  private static _missingKeyWarned = new Set<string>();

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  render(data: CardRenderData, mode: CardRenderMode, x: number, y: number): Phaser.GameObjects.Container {
    switch (mode) {
      case 'full':      return this.renderFull(data, x, y);
      case 'thumbnail': return this.renderThumbnail(data, x, y);
      case 'detail':    return this.renderDetail(data, x, y);
    }
  }

  updateState(container: Phaser.GameObjects.Container, data: CardRenderData, mode: CardRenderMode): void {
    if (mode === 'thumbnail') {
      this.applyThumbnailState(container, data);
    } else {
      this.applyFullState(container, data);
    }
  }

  /**
   * Update ATK/DEF badges and canAct glow IN-PLACE on an existing thumbnail container.
   * Does NOT destroy or recreate the container — only swaps named child elements.
   * Safe to call while tweens are animating the container position.
   */
  updateThumbnailBadges(
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

    // ── Update ATK badge ──
    const oldAtk = container.getByName('atk_badge');
    if (oldAtk) container.remove(oldAtk, true);
    if (atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = this.makeBadge(
        2, h - BT.unitBandHeight - 2,
        String(atk),
        this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // ── Update DEF/HP badge ──
    const oldDef = container.getByName('def_badge');
    if (oldDef) container.remove(oldDef, true);
    if (currentHP !== undefined) {
      const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(currentHP),
        defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // ── Update canAct glow ──
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

  // ─────────────────────────────────────────────
  // FULL CARD (in-hand)
  // ─────────────────────────────────────────────

  private renderFull(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.full;
    const T = ThemeLoader.cardTypeTheme(this.theme, data?.allegiance ?? 'STANDARD');
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;
    const r = L.cornerRadius;

    const body = this.scene.add.graphics();
    body.fillStyle(ThemeLoader.hexToNum(T.bodyColor), 1);
    body.fillRoundedRect(0, 0, w, h, r);

    const bandH = h * 0.15;
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(T.bandColor), 1);
    band.fillRoundedRect(0, 0, w, bandH, { tl: r, tr: r, bl: 0, br: 0 });

    const border = this.scene.add.graphics();
    border.lineStyle(T.borderWidth, ThemeLoader.hexToNum(T.borderColor), 1);
    border.strokeRoundedRect(0, 0, w, h, r);

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

    const iconKey = `icon_type_${(data?.allegiance ?? 'standard').toLowerCase()}`;
    this.safeImage(
      container, iconKey,
      w - L.typeIconSize / 2 - 4, L.typeIconSize / 2 + 4,
      L.typeIconSize, L.typeIconSize,
      0.5, 0.5, 0x223366, 0.5,
    );

    const artY = bandH;
    const artH = L.artAreaHeight;
    const artKey = data.artKey ?? `art_${data.id}`;
    let artObj: Phaser.GameObjects.GameObject;

    if (this.scene.textures.exists(artKey)) {
      artObj = this.scene.add.image(0, artY, artKey)
        .setOrigin(0, 0)
        .setDisplaySize(w, artH);
    } else {
      const artPh = this.scene.add.graphics();
      artPh.fillStyle(0x333355, 1);
      artPh.fillRect(0, artY, w, artH);
      artObj = artPh;
      if (!CardRenderer._missingKeyWarned.has(artKey)) {
        CardRenderer._missingKeyWarned.add(artKey);
        console.warn(`[CardRenderer] Art texture missing, using fallback rect: "${artKey}"`);
      }
    }

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

    const statY = nameY + L.nameBarHeight;
    const statBg = this.scene.add.graphics();
    statBg.fillStyle(0x000000, 0.4);
    statBg.fillRect(0, statY, w, L.statRowHeight);

    const children: Phaser.GameObjects.GameObject[] = [body, band, border, artObj, nameBar, nameText, statBg];

    if (data.atk !== undefined && data.def !== undefined) {
      const atkBadge = this.makeBadge(
        4, statY + L.statRowHeight / 2,
        `ATK ${data.atk}`, this.theme.cards.atkBadgeColor, L.statRowHeight - 4
      );
      const defBadge = this.makeBadge(
        w - 4, statY + L.statRowHeight / 2,
        `DEF ${data.def}`, this.theme.cards.defBadgeColor, L.statRowHeight - 4, true
      );
      children.push(...atkBadge, ...defBadge);
    }

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

    const typeLabel = this.scene.add.text(w / 2, h - 8, (data?.allegiance ?? 'STANDARD').toUpperCase(), {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0.5, 1);

    children.push(pip, pipText, typeLabel);
    container.add(children);
    this.applyFullState(container, data);

    return container;
  }

  // ─────────────────────────────────────────────
  // THUMBNAIL (on-board unit)
  // Named children: 'atk_badge', 'def_badge', 'can_act_glow'
  // These can be swapped in-place by updateThumbnailBadges()
  // ─────────────────────────────────────────────

  private renderThumbnail(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;

    // — Art —
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

    // — ATK badge (named container for in-place updates) —
    if (data.atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = this.makeBadge(
        2, h - BT.unitBandHeight - 2,
        String(data.atk), this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // — DEF/HP badge (named container for in-place updates) —
    if (data.currentHP !== undefined) {
      const hpPct = (data.maxHP && data.maxHP > 0) ? data.currentHP / data.maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(data.currentHP), defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight
      );
      defGroup.add(defParts);
      container.add(defGroup);
    } else if (data.def !== undefined) {
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(data.def), this.theme.cards.defBadgeColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // — "Can Act" gold glow (named for in-place toggle) —
    if (data.canAct) {
      const glow = this.scene.add.graphics();
      glow.lineStyle(3, 0xF5A623, 0.9);
      glow.strokeRect(-1, -1, w + 2, h + 2);
      glow.setName('can_act_glow');
      container.add(glow);
    }

    this.applyThumbnailState(container, data);
    return container;
  }

  // ─────────────────────────────────────────────
  // DETAIL OVERLAY
  // ─────────────────────────────────────────────

  private renderDetail(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
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

    const subRenderer = new CardRenderer(this.scene, detailLayout, this.theme);
    const cardBody = subRenderer.renderFull(data, 0, 0);
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

  // ─────────────────────────────────────────────
  // CARD BACK
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
    const existing = container.getByName('state_overlay');
    if (existing) container.remove(existing, true);

    const L = this.layout.cards.full;
    const overlay = this.scene.add.graphics();
    overlay.setName('state_overlay');

    if (data.isExhausted) {
      overlay.fillStyle(0x000000, 1 - this.theme.cards.exhaustedAlpha);
      overlay.fillRoundedRect(0, 0, L.width, L.height, L.cornerRadius);
    }

    if (data.isSelected) {
      overlay.lineStyle(
        this.theme.cards.selectedGlowSize,
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.8
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
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.9
      );
      overlay.strokeRect(0, 0, L.width, L.height);
    }

    container.add(overlay);
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private safeImage(
    container: Phaser.GameObjects.Container,
    key: string, x: number, y: number, w: number, h: number,
    originX = 0, originY = 0,
    fallbackColor = 0x333355, fallbackAlpha = 0.6,
  ): void {
    if (this.scene.textures.exists(key)) {
      const img = this.scene.add.image(x, y, key)
        .setOrigin(originX, originY)
        .setDisplaySize(w, h);
      container.add(img);
    } else {
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

  private makeBadge(
    x: number, y: number, label: string, fillHex: string,
    fontSize: number, rightAligned = false, w = 24, h = 16
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