/**
 * HandRenderer index-integrity tests.
 *
 * Regression: removeCard() kept the removed card in `cards`/`cardContainers`
 * until its 200ms fade tween completed. Clicking another card during that window
 * emitted its OLD index — but the engine hand had already shifted, so the wrong
 * card got played. Back-to-back removals (play + discard) also used stale indices.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Fakes ────────────────────────────────────────────────
class FakeContainer {
  x = 0; y = 0; alpha = 1; destroyed = false;
  private handlers = new Map<string, Array<() => void>>();
  constructor(public cardId = '') {}
  on(ev: string, fn: () => void) { (this.handlers.get(ev) ?? this.handlers.set(ev, []).get(ev)!).push(fn); return this; }
  emit(ev: string) { (this.handlers.get(ev) ?? []).forEach(fn => fn()); }
  removeAllListeners() { this.handlers.clear(); return this; }
  disableInteractive() { return this; }
  setInteractive() { return this; }
  setRotation() { return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setScale() { return this; }
  setDepth() { return this; }
  setOrigin() { return this; }
  add() { return this; }
  destroy() { this.destroyed = true; }
}

vi.mock('../../src/renderers/CardRenderer', () => ({
  CardRenderer: class {
    render(data: { id: string }) { return new FakeContainer(data.id); }
    updateState() {}
  },
}));
vi.mock('../../src/utils/PhaserUtils', () => ({ setContainerHitArea: () => {} }));

import { HandRenderer } from '../../src/renderers/HandRenderer';
import { EventBus, EV } from '../../src/events/EventBus';

function makeScene() {
  const pendingTweens: Array<{ onComplete?: () => void }> = [];
  return {
    pendingTweens,
    add: {
      container: () => new FakeContainer(),
      text: () => new FakeContainer(),
    },
    tweens: { add: (cfg: any) => { pendingTweens.push(cfg); return cfg; } },
  };
}

const layout: any = {
  leftHUD: { hand: { x: 0, y: 0, maxVisible: 10, cardHeight: 100, selectedScale: 1.1, spacing: 20, fanAngle: 0 } },
  cards: { full: { width: 80, height: 100 } },
};
const theme: any = { fonts: { small: { family: 'x', size: 10 } }, colors: { TEXT_SECONDARY: '#fff' } };

const card = (id: string): any => ({ id, name: id });

describe('HandRenderer — index integrity during removal tweens', () => {
  let scene: ReturnType<typeof makeScene>;
  let hand: HandRenderer;
  let clicks: Array<number | null>;
  let unsub: () => void;

  beforeEach(() => {
    scene = makeScene();
    hand = new HandRenderer(scene as any, layout, theme);
    hand.setHand([card('a'), card('b'), card('c')]);
    clicks = [];
    unsub = EventBus.on(EV.INPUT_HAND_CLICK, ({ index }: any) => clicks.push(index));
  });
  afterEach(() => { unsub(); hand.destroy(); });

  const containers = () => (hand as any).cardContainers as FakeContainer[];

  it('clicking a card while a removal tween is in flight emits the post-removal index', () => {
    const cBefore = containers()[2];        // card 'c' at index 2
    hand.removeCard(0);                     // 'a' starts fading out — tween NOT complete
    cBefore.emit('pointerdown');            // user clicks 'c' mid-animation
    expect(clicks).toEqual([1]);            // engine hand is now [b, c] → 'c' is index 1
  });

  it('two back-to-back removals remove the correct cards', () => {
    hand.removeCard(0);                     // remove 'a' → [b, c]
    hand.removeCard(1);                     // remove 'c' (index 1 in the NEW hand)
    scene.pendingTweens.forEach(t => t.onComplete?.());
    const ids = containers().filter(c => !c.destroyed).map(c => c.cardId);
    expect(ids).toEqual(['b']);
    expect((hand as any).cards.map((c: any) => c.id)).toEqual(['b']);
  });

  it('the fading-out card no longer reacts to clicks', () => {
    const cA = containers()[0];
    hand.removeCard(0);
    cA.emit('pointerdown');
    expect(clicks).toEqual([]);
  });
});
