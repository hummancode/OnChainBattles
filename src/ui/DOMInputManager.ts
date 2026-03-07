// ============================================================
// DOMInputManager.ts
// Manages HTML DOM inputs overlaid on the Phaser canvas.
//
// Uses Phaser's built-in DOM element system (scene.add.dom) which
// automatically handles Scale.FIT + CENTER_BOTH transforms.
// This eliminates all manual coordinate math and the alignment
// bugs that come with it.
//
// REQUIRES: dom.createContainer = true  in Phaser GameConfig
//
// USAGE:
//   const mgr = new DOMInputManager(this);      // 'this' = Phaser.Scene
//   const inp = mgr.createInput({ gameX: 640, gameY: 300, ... });
//   mgr.destroyAll();                            // on scene shutdown
// ============================================================

import Phaser from 'phaser';

// ─── Config for a single input ─────────────────────────────────
export interface InputConfig {
  /** Center X in game-space pixels (0–1280) */
  gameX: number;
  /** Center Y in game-space pixels (0–720) */
  gameY: number;
  /** Width in game-space pixels */
  width?: number;
  /** Height in game-space pixels */
  height?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Max character length */
  maxLength?: number;
  /** Force uppercase on input */
  uppercase?: boolean;
  /** Extra CSS overrides (applied last) */
  cssOverrides?: Partial<CSSStyleDeclaration>;
}

// ─── Managed input handle ──────────────────────────────────────
interface ManagedInput {
  element: HTMLInputElement;
  domElement: Phaser.GameObjects.DOMElement;
}

// ─── Default styling tokens ────────────────────────────────────
const DEFAULTS = {
  width: 300,
  height: 44,
  bg: '#16213E',
  border: '#253348',
  focusBorder: '#4fc3f7',
  text: '#ffffff',
  placeholder: '#666688',
  fontSize: '15px',
  fontFamily: '"Courier New", monospace',
  borderRadius: '6px',
} as const;

export class DOMInputManager {
  private scene: Phaser.Scene;
  private inputs: ManagedInput[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Create an HTML input positioned in game-space via Phaser's DOM layer.
   * Returns the raw HTMLInputElement for reading .value etc.
   */
  createInput(config: InputConfig): HTMLInputElement {
    const w = config.width ?? DEFAULTS.width;
    const h = config.height ?? DEFAULTS.height;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = config.placeholder ?? '';
    if (config.maxLength) input.maxLength = config.maxLength;

    // ── Uppercase transform ────────────────────────────────
    if (config.uppercase) {
      input.style.textTransform = 'uppercase';
      input.addEventListener('input', () => {
        const pos = input.selectionStart;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(pos, pos);
      });
    }

    // ── Styling ────────────────────────────────────────────
    input.style.cssText = `
      width: ${w}px;
      height: ${h}px;
      padding: 0 14px;
      font-size: ${DEFAULTS.fontSize};
      font-family: ${DEFAULTS.fontFamily};
      border: 1px solid ${DEFAULTS.border};
      border-radius: ${DEFAULTS.borderRadius};
      background: ${DEFAULTS.bg};
      color: ${DEFAULTS.text};
      outline: none;
      text-align: center;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    `;

    // Focus glow
    input.addEventListener('focus', () => {
      input.style.borderColor = DEFAULTS.focusBorder;
      input.style.boxShadow = `0 0 8px ${DEFAULTS.focusBorder}44`;
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = DEFAULTS.border;
      input.style.boxShadow = 'none';
    });

    // Extra overrides
    if (config.cssOverrides) {
      Object.assign(input.style, config.cssOverrides);
    }

    // ── Add via Phaser's DOM system ────────────────────────
    // scene.add.dom() positions the element in game-space coordinates,
    // automatically handling canvas scaling and centering.
    const domElement = this.scene.add.dom(config.gameX, config.gameY, input);

    this.inputs.push({ element: input, domElement });

    return input;
  }

  /** Remove a specific input */
  destroyInput(input: HTMLInputElement): void {
    const idx = this.inputs.findIndex(m => m.element === input);
    if (idx !== -1) {
      this.inputs[idx].domElement.destroy();
      this.inputs.splice(idx, 1);
    }
  }

  /** Remove ALL managed inputs */
  destroyAll(): void {
    for (const managed of this.inputs) {
      managed.domElement.destroy();
    }
    this.inputs = [];
  }
}