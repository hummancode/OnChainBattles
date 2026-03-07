// ============================================================
// MenuButton.ts
// Reusable Phaser text button with hover, press, and disabled states.
//
// Encapsulates interactive text with consistent styling so scenes
// don't repeat pointer event wiring for every button.
//
// USAGE:
//   const btn = new MenuButton(scene, 640, 450, '[ PLAY FREE ]', {
//     color: '#00ff88', fontSize: '28px',
//     onPointerDown: () => doSomething(),
//   });
//   btn.setDisabled(true);   // grey out
//   btn.destroy();           // cleanup
// ============================================================

import Phaser from 'phaser';

export interface MenuButtonConfig {
  /** Base text color (hex string) */
  color?: string;
  /** Hover text color */
  hoverColor?: string;
  /** Disabled text color */
  disabledColor?: string;
  /** Font size string e.g. '28px' */
  fontSize?: string;
  /** Font style e.g. 'bold' */
  fontStyle?: string;
  /** Font family */
  fontFamily?: string;
  /** Callback on click */
  onPointerDown?: () => void;
}

const BTN_DEFAULTS: Required<Omit<MenuButtonConfig, 'onPointerDown'>> = {
  color: '#00ff88',
  hoverColor: '#ffffff',
  disabledColor: '#555555',
  fontSize: '24px',
  fontStyle: 'bold',
  fontFamily: '"Courier New", monospace',
};

export class MenuButton {
  readonly text: Phaser.GameObjects.Text;
  private config: Required<Omit<MenuButtonConfig, 'onPointerDown'>>;
  private callback: (() => void) | undefined;
  private _disabled: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    cfg?: MenuButtonConfig,
  ) {
    this.config = { ...BTN_DEFAULTS, ...cfg };
    this.callback = cfg?.onPointerDown;

    this.text = scene.add.text(x, y, label, {
      fontSize: this.config.fontSize,
      fontStyle: this.config.fontStyle,
      fontFamily: this.config.fontFamily,
      color: this.config.color,
    }).setOrigin(0.5);

    this.text.setInteractive({ useHandCursor: true });

    this.text.on('pointerover', () => {
      if (!this._disabled) this.text.setColor(this.config.hoverColor);
    });

    this.text.on('pointerout', () => {
      if (!this._disabled) this.text.setColor(this.config.color);
    });

    this.text.on('pointerdown', () => {
      if (!this._disabled && this.callback) {
        // Scale press feedback
        scene.tweens.add({
          targets: this.text,
          scaleX: 0.95, scaleY: 0.95,
          duration: 80,
          yoyo: true,
        });
        this.callback();
      }
    });
  }

  /** Grey out and disable interaction */
  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.text.setColor(disabled ? this.config.disabledColor : this.config.color);
    if (disabled) {
      this.text.disableInteractive();
    } else {
      this.text.setInteractive({ useHandCursor: true });
    }
  }

  /** Update the label text */
  setLabel(label: string): void {
    this.text.setText(label);
  }

  /** Update color (resets base color) */
  setColor(color: string): void {
    this.config.color = color;
    if (!this._disabled) this.text.setColor(color);
  }

  /** Clean up */
  destroy(): void {
    this.text.destroy();
  }
}
