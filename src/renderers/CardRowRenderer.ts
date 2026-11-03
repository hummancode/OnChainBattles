// ============================================================
// CardRowRenderer.ts — compact one-line hand card.
//
// [cost] [art] Name                      ATK 2 · DEF 3
//              Unit · Royal
//
// Readable at a glance (the stacked full cards only showed their top
// strip). The full card is shown as a hover preview by HandRenderer.
// ============================================================

import Phaser from 'phaser';
import type { ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export const ROW = { width: 250, height: 54, gap: 4, art: { w: 64, h: 46 } } as const;

export class CardRowRenderer {
  constructor(private scene: Phaser.Scene, private theme: ThemeJSON) {}

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const T = ThemeLoader.cardTypeTheme(this.theme, data?.allegiance ?? 'STANDARD');
    const c = this.scene.add.container(x, y);
    const W = ROW.width, H = ROW.height;

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(T.bodyColor), 1);
    bg.fillRoundedRect(0, 0, W, H, 6);
    bg.lineStyle(1, ThemeLoader.hexToNum(T.borderColor), 0.9);
    bg.strokeRoundedRect(0, 0, W, H, 6);
    c.add(bg);

    // Art thumbnail (or a tinted block)
    const artKey = data.artKey ?? `art_${data.id}`;
    const ax = 4, ay = (H - ROW.art.h) / 2;
    if (this.scene.textures.exists(artKey)) {
      c.add(this.scene.add.image(ax, ay, artKey).setOrigin(0, 0).setDisplaySize(ROW.art.w, ROW.art.h));
    } else {
      const ph = this.scene.add.graphics();
      ph.fillStyle(ThemeLoader.hexToNum(T.bandColor), 1);
      ph.fillRect(ax, ay, ROW.art.w, ROW.art.h);
      c.add(ph);
    }

    // Cost pip over the art's corner
    const pip = this.scene.add.graphics();
    pip.fillStyle(ThemeLoader.hexToNum(this.theme.colors.ACCENT_BLUE), 1);
    pip.fillCircle(ax + 10, ay + 10, 11);
    c.add(pip);
    c.add(this.scene.add.text(ax + 10, ay + 10, String(data.cost), {
      fontFamily: this.theme.fonts.cardStat.family, fontSize: '13px', fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    const tx = ax + ROW.art.w + 8;
    c.add(this.scene.add.text(tx, 7, data.name, {
      fontFamily: this.theme.fonts.cardName.family, fontSize: '14px', fontStyle: 'bold',
      color: this.theme.fonts.cardName.color ?? '#FFFFFF',
    }).setOrigin(0, 0));

    const kind = data.cardClass === 'SPELL' ? 'Spell' : data.cardClass === 'STRUCTURE' ? 'Structure' : 'Unit';
    const allegiance = (data.allegiance ?? 'STANDARD') === 'ROYAL' ? ' · Royal' : '';
    c.add(this.scene.add.text(tx, 30, `${kind}${allegiance}`, {
      fontFamily: this.theme.fonts.small.family, fontSize: '11px', color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0, 0));

    if (data.atk !== undefined && data.def !== undefined) {
      c.add(this.scene.add.text(W - 8, 30, `⚔ ${data.atk}  ⛨ ${data.def}`, {
        fontFamily: this.theme.fonts.cardStat.family, fontSize: '12px', color: '#FFFFFF',
      }).setOrigin(1, 0));
    }

    this.applyState(c, data);
    return c;
  }

  /** Selection glow + "can't afford" dimming. */
  applyState(c: Phaser.GameObjects.Container, data: CardRenderData & { unaffordable?: boolean }): void {
    const old = c.getByName('row_state');
    if (old) c.remove(old, true);
    const g = this.scene.add.graphics().setName('row_state');
    if (data.isSelected) {
      g.lineStyle(3, ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 1);
      g.strokeRoundedRect(-1, -1, ROW.width + 2, ROW.height + 2, 7);
    }
    c.add(g);
    c.setAlpha(data.unaffordable && !data.isSelected ? 0.5 : 1);
  }
}
