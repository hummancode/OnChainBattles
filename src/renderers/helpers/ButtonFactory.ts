// ============================================================
// ButtonFactory.ts
// Shared button creation for HUDRenderer and OverlayRenderer.
// Unifies makeButton() and makePanelButton() into one function.
// ============================================================

import Phaser from 'phaser';
import { ThemeLoader } from '../../config/ThemeLoader';
import type { ButtonStyle } from '../../game/types/UITypes';

export interface ButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  style: ButtonStyle;
  fontFamily: string;
  onClick: () => void;
  /** If true, button origin is center (draws at -w/2, -h/2). Default: false (top-left). */
  centered?: boolean;
}

/**
 * Create a themed button container with hover/press states.
 * Supports both top-left origin (HUD) and centered origin (overlay panels).
 */
export function createButton(
  scene: Phaser.Scene,
  opts: ButtonOptions
): Phaser.GameObjects.Container {
  const { x, y, w, h, label, style, fontFamily, onClick, centered = false } = opts;

  const container = scene.add.container(x, y);
  const ox = centered ? -w / 2 : 0;
  const oy = centered ? -h / 2 : 0;
  const textX = centered ? 0 : w / 2;
  const textY = centered ? 0 : h / 2;

  const bg = scene.add.graphics();

  function drawBg(fillColor: string): void {
    bg.clear();
    bg.fillStyle(ThemeLoader.hexToNum(fillColor), 1);
    bg.fillRoundedRect(ox, oy, w, h, style.cornerRadius);
    bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
    bg.strokeRoundedRect(ox, oy, w, h, style.cornerRadius);
  }

  drawBg(style.fillColor);

  const txt = scene.add.text(textX, textY, label, {
    fontFamily,
    fontSize: `${style.fontSize}px`,
    color: style.textColor,
  }).setOrigin(0.5, 0.5);

  container.add([bg, txt]);
  container.setInteractive(
    new Phaser.Geom.Rectangle(ox, oy, w, h),
    Phaser.Geom.Rectangle.Contains
  );

  container.on('pointerover', () => {
    drawBg(style.hoverFillColor);
    txt.setColor(style.hoverTextColor);
  });

  container.on('pointerout', () => {
    drawBg(style.fillColor);
    txt.setColor(style.textColor);
  });

  container.on('pointerdown', onClick);

  return container;
}
