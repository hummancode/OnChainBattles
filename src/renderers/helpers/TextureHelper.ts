// ============================================================
// TextureHelper.ts
// Null Object pattern for textures — always returns a visual,
// never null. Uses a colored rect fallback if texture is missing.
// ============================================================

import Phaser from 'phaser';

const _warned = new Set<string>();

/**
 * Add an image to a container with automatic fallback.
 * If the texture key doesn't exist, renders a colored rectangle
 * instead — guarantees a visual is always produced.
 */
export function safeImage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  key: string,
  x: number, y: number,
  w: number, h: number,
  originX = 0, originY = 0,
  fallbackColor = 0x333355, fallbackAlpha = 0.6,
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key)
      .setOrigin(originX, originY)
      .setDisplaySize(w, h);
    container.add(img);
    return img;
  }

  const rx = originX === 0.5 ? x - w / 2 : x;
  const ry = originY === 0.5 ? y - h / 2 : y;
  const rect = scene.add.graphics();
  rect.fillStyle(fallbackColor, fallbackAlpha);
  rect.fillRect(rx, ry, w, h);
  container.add(rect);

  if (!_warned.has(key)) {
    _warned.add(key);
    console.warn(`[TextureHelper] Texture missing, using fallback: "${key}"`);
  }
  return rect;
}

/**
 * Check if texture exists, logging a deduplicated warning if not.
 * Returns true if the texture is available.
 */
export function textureExists(scene: Phaser.Scene, key: string): boolean {
  if (scene.textures.exists(key)) return true;
  if (!_warned.has(key)) {
    _warned.add(key);
    console.warn(`[TextureHelper] Texture missing: "${key}"`);
  }
  return false;
}
