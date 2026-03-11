// ============================================================
// CardRenderHelpers.ts
// Shared utility functions for all card renderers.
// ============================================================

import Phaser from 'phaser';
import { ThemeLoader } from '../../config/ThemeLoader';
import type { ThemeJSON } from '../../game/types/UITypes';

const _missingKeyWarned = new Set<string>();

export function safeImage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  key: string, x: number, y: number, w: number, h: number,
  originX = 0, originY = 0,
  fallbackColor = 0x333355, fallbackAlpha = 0.6,
): void {
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key)
      .setOrigin(originX, originY)
      .setDisplaySize(w, h);
    container.add(img);
  } else {
    const rx = originX === 0.5 ? x - w / 2 : x;
    const ry = originY === 0.5 ? y - h / 2 : y;
    const rect = scene.add.graphics();
    rect.fillStyle(fallbackColor, fallbackAlpha);
    rect.fillRect(rx, ry, w, h);
    container.add(rect);

    if (!_missingKeyWarned.has(key)) {
      _missingKeyWarned.add(key);
      console.warn(`[CardRenderer] Texture not found, using fallback rect: "${key}"`);
    }
  }
}

export function makeBadge(
  scene: Phaser.Scene, theme: ThemeJSON,
  x: number, y: number, label: string, fillHex: string,
  fontSize: number, rightAligned = false, w = 24, h = 16,
): Phaser.GameObjects.GameObject[] {
  const bgX = rightAligned ? x - w : x;

  const bg = scene.add.graphics();
  bg.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
  bg.fillRoundedRect(bgX, y - h / 2, w, h, 4);

  const text = scene.add.text(x + (rightAligned ? -w / 2 : w / 2), y, label, {
    fontFamily: theme.fonts.cardStat.family,
    fontSize: `${fontSize}px`,
    color: '#FFFFFF',
  }).setOrigin(0.5, 0.5);

  return [bg, text];
}

export function warnMissingArt(artKey: string): void {
  if (!_missingKeyWarned.has(artKey)) {
    _missingKeyWarned.add(artKey);
    console.warn(`[CardRenderer] Art texture missing, using fallback rect: "${artKey}"`);
  }
}
