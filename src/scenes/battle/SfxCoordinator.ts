// ============================================================
// SfxCoordinator.ts — EventBus → SoundFX, plus the mute toggle
// (speaker button bottom-right, or the M key). Owns its listeners.
// ============================================================

import Phaser from 'phaser';
import { EventBus, EV } from '../../events/EventBus';
import { SoundFX, type SoundName } from '../../audio/SoundFX';

/** Pure mapping, unit-tested: which UI event makes which sound (null = silent). */
export function sfxForEvent(type: string, payload: any, localPlayerIndex: number): SoundName | null {
  switch (type) {
    case 'UNIT_PLACED':   return 'deploy';
    case 'UNIT_ATTACKED': return 'attack';
    case 'UNIT_DIED':     return 'death';
    case 'UNIT_HEALED':   return 'heal';
    case 'TURN_STARTED':  return payload?.activePlayer === localPlayerIndex ? 'turn' : null;
    case 'UI_TOAST':      return 'error';
    case 'INPUT_HAND_CLICK': return payload?.index != null ? 'click' : null;
    case 'GAME_OVER': {
      const r = payload?.result ?? payload;
      if (r?.isDraw || r?.winner === null) return 'draw';
      return r?.winner === localPlayerIndex ? 'win' : 'lose';
    }
    default: return null;
  }
}

const WATCHED = [
  EV.UNIT_PLACED, EV.UNIT_ATTACKED, EV.UNIT_DIED, EV.UNIT_HEALED,
  EV.TURN_STARTED, EV.UI_TOAST, EV.INPUT_HAND_CLICK, EV.GAME_OVER,
] as const;

export class SfxCoordinator {
  private unsubs: Array<() => void> = [];
  private button?: Phaser.GameObjects.Text;
  private key?: Phaser.Input.Keyboard.Key;
  private onKey = () => this.toggle();

  constructor(scene: Phaser.Scene, localPlayerIndex: number) {
    for (const ev of WATCHED) {
      this.unsubs.push(EventBus.on(ev as any, (payload: any) => {
        const s = sfxForEvent(ev, payload, localPlayerIndex);
        if (s) SoundFX.play(s);
      }));
    }
    this.button = scene.add.text(1262, 708, '', { fontSize: '20px' })
      .setOrigin(1, 1).setDepth(990).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggle());
    this.key = scene.input.keyboard?.addKey('M');
    this.key?.on('down', this.onKey);
    this.renderButton();
  }

  private toggle(): void {
    const muted = SoundFX.toggleMute();
    this.renderButton();
    if (!muted) SoundFX.play('click');
  }

  private renderButton(): void {
    this.button?.setText(SoundFX.muted ? '🔇' : '🔊').setAlpha(SoundFX.muted ? 0.6 : 0.9);
  }

  cleanup(): void {
    this.unsubs.forEach(u => u());
    this.unsubs = [];
    this.key?.off('down', this.onKey);
    this.button?.destroy();
  }
}
