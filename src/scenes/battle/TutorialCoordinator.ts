// ============================================================
// TutorialCoordinator.ts — renders TutorialScript as a panel over
// the board and feeds it UI events. Owns its listeners (cleanup()).
// ============================================================

import Phaser from 'phaser';
import { EventBus, EV } from '../../events/EventBus';
import { TutorialScript } from './TutorialScript';

const WATCHED = [EV.CARD_PLAYED, EV.PHASE_CHANGED, EV.TURN_STARTED, EV.UNIT_MOVED, EV.UNIT_ATTACKED] as const;

export class TutorialCoordinator {
  readonly script: TutorialScript;
  private panel?: Phaser.GameObjects.Container;
  private unsubs: Array<() => void> = [];

  constructor(private scene: Phaser.Scene, localPlayerIndex: number) {
    this.script = new TutorialScript(localPlayerIndex);
    for (const ev of WATCHED) {
      this.unsubs.push(EventBus.on(ev as any, (payload: any) => {
        if (this.script.onEvent(ev, payload)) this.render();
      }));
    }
    this.render();
  }

  private render(): void {
    this.panel?.destroy();
    this.panel = undefined;
    if (this.script.done) return;

    const step = this.script.current;
    const x = 640, y = 200, w = 600;
    const title = this.scene.add.text(0, -38, `${step.title}   (${this.script.stepNumber}/${this.script.totalSteps})`, {
      fontSize: '18px', fontStyle: 'bold', color: '#FFD54F',
    }).setOrigin(0.5, 0);
    const body = this.scene.add.text(0, -12, step.text, {
      fontSize: '15px', color: '#FFFFFF', align: 'center', wordWrap: { width: w - 40 },
    }).setOrigin(0.5, 0);
    const h = Math.max(110, body.height + 78);
    const bg = this.scene.add.rectangle(0, h / 2 - 50, w, h, 0x0b1020, 0.92).setStrokeStyle(2, 0xFFD54F, 0.8);

    const btnY = h - 70;
    const mk = (bx: number, label: string, color: string, fn: () => void) =>
      this.scene.add.text(bx, btnY, label, { fontSize: '15px', color, backgroundColor: '#00000088', padding: { x: 8, y: 3 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', fn);

    const parts: Phaser.GameObjects.GameObject[] = [bg, title, body];
    if (step.manual) parts.push(mk(120, this.script.stepNumber === this.script.totalSteps ? '[ PLAY ON ]' : '[ NEXT ]', '#00FF88', () => { this.script.next(); this.render(); }));
    parts.push(mk(-200, '[ SKIP TUTORIAL ]', '#AAAAAA', () => { this.script.skip(); this.render(); }));

    this.panel = this.scene.add.container(x, y, parts).setDepth(960);
  }

  cleanup(): void {
    this.unsubs.forEach(u => u());
    this.unsubs = [];
    this.panel?.destroy();
    this.panel = undefined;
  }
}
