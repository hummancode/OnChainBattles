// ============================================================
// ToastNotification.ts
// Displays a temporary notification on the Phaser canvas.
// Auto-dismisses after a configurable duration.
//
// USAGE:
//   ToastNotification.show(scene, 'Copied!', { color: '#00ff88' });
//   ToastNotification.show(scene, 'Error!', { color: '#ff4444', y: 600 });
// ============================================================

import Phaser from 'phaser';

export interface ToastConfig {
  /** Text color (hex) */
  color?: string;
  /** Font size */
  fontSize?: string;
  /** Duration in ms before auto-dismiss */
  duration?: number;
  /** Y position (default: scene height - 80) */
  y?: number;
  /** X position (default: center) */
  x?: number;
}

const TOAST_DEFAULTS = {
  color: '#ff4444',
  fontSize: '16px',
  duration: 2500,
} as const;

export class ToastNotification {
  /**
   * Show a temporary text notification on screen.
   * Returns the text object in case caller needs to destroy early.
   */
  static show(
    scene: Phaser.Scene,
    message: string,
    config?: ToastConfig,
  ): Phaser.GameObjects.Text {
    const cfg = { ...TOAST_DEFAULTS, ...config };
    const x = cfg.x ?? scene.scale.width / 2;
    const y = cfg.y ?? scene.scale.height - 80;

    const text = scene.add.text(x, y, message, {
      fontSize: cfg.fontSize,
      fontFamily: '"Courier New", monospace',
      color: cfg.color,
    }).setOrigin(0.5).setAlpha(0);

    // Fade in
    scene.tweens.add({
      targets: text,
      alpha: 1,
      duration: 150,
    });

    // Fade out and destroy
    scene.time.delayedCall(cfg.duration!, () => {
      scene.tweens.add({
        targets: text,
        alpha: 0,
        duration: 300,
        onComplete: () => text.destroy(),
      });
    });

    return text;
  }
}
