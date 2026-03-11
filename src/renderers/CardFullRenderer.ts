// ============================================================
// CardFullRenderer.ts
// Renders a full in-hand card (140x200 default).
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';
import { safeImage, makeBadge, warnMissingArt } from './helpers/CardRenderHelpers';

export class CardFullRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
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
    safeImage(
      this.scene, container, iconKey,
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
      warnMissingArt(artKey);
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
      const atkBadge = makeBadge(
        this.scene, this.theme,
        4, statY + L.statRowHeight / 2,
        `ATK ${data.atk}`, this.theme.cards.atkBadgeColor, L.statRowHeight - 4,
      );
      const defBadge = makeBadge(
        this.scene, this.theme,
        w - 4, statY + L.statRowHeight / 2,
        `DEF ${data.def}`, this.theme.cards.defBadgeColor, L.statRowHeight - 4, true,
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
    this.applyState(container, data);

    return container;
  }

  applyState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
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
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.8,
      );
      overlay.strokeRoundedRect(
        -this.theme.cards.selectedGlowSize / 2,
        -this.theme.cards.selectedGlowSize / 2,
        L.width + this.theme.cards.selectedGlowSize,
        L.height + this.theme.cards.selectedGlowSize,
        L.cornerRadius,
      );
    }

    container.add(overlay);
  }
}
