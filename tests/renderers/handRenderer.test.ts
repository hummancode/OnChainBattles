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
  getByName() { return null; }
  setOrigin() { return this; }
  add() { return this; }
  destroy() { this.destroyed = true; }
}

vi.mock('../../src/renderers/CardRenderer', () => ({
  PREVIEW: { width: 200, height: 330 },
  CardRenderer: class {
    renderPreview(data: { id: string }) { const c = new FakeContainer('preview:' + data.id); (globalThis as any).__previews = [...((globalThis as any).__previews ?? []), c]; return c; }
    render(data: { id: string }) { const c = new FakeContainer('preview:' + data.id); (globalThis as any).__previews = [...((globalThis as any).__previews ?? []), c]; return c; }
    updateState() {}
    renderBack() { return new FakeContainer('back'); }
  },
}));
vi.mock('../../src/utils/PhaserUtils', () => ({ setContainerHitArea: () => {} }));
vi.mock('../../src/renderers/CardRowRenderer', () => ({
  ROW: { width: 250, height: 54, gap: 4, art: { w: 64, h: 46 } },
  CardRowRenderer: class {
    render(data: any) { const c = new FakeContainer(data.id); this.applyState(c, data); return c; } // like the real one
    applyState(c: any, data: any) { c.setAlpha(data.unaffordable && !data.isSelected ? 0.5 : 1); c.selected = !!data.isSelected; }
  },
}));

import { HandRenderer } from '../../src/renderers/HandRenderer';
import { EventBus, EV } from '../../src/events/EventBus';

function makeScene() {
  const pendingTweens: Array<{ onComplete?: () => void }> = [];
  const scene = {
    pendingTweens,
    texts: [] as FakeContainer[],
    add: {
      container: () => new FakeContainer(),
      text(_x: number, _y: number, str: string) { const t: any = new FakeContainer(str); t.setText = (v: string) => { t.cardId = v; return t; }; (this as any).owner.texts.push(t); return t; },
      owner: null as any,
    },
    tweens: { add: (cfg: any) => { pendingTweens.push(cfg); return cfg; } },
  };
  scene.add.owner = scene;
  return scene;
}

const layout: any = {
  leftHUD: { hand: { x: 0, y: 44, maxVisible: 10, cardHeight: 100, selectedScale: 1.1, spacing: 20, fanAngle: 0 } },
  rightHUD: { hand: { x: 0, y: 0, maxVisible: 5, cardHeight: 100, cardWidth: 70, spacing: 5 } },
  cards: { full: { width: 80, height: 100 } },
};
const theme: any = { fonts: { small: { family: 'x', size: 10 } }, colors: { TEXT_SECONDARY: '#fff' } };

const card = (id: string, cost = 1): any => ({ id, name: id, cost });

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

describe('HandRenderer — opponent hand count label', () => {
  it('updates a single label instead of stacking a new one per refresh', () => {
    const scene = makeScene();
    const hand = new HandRenderer(scene as any, layout, theme);
    hand.setOpponentHandCount(4);
    hand.setOpponentHandCount(5);
    hand.setOpponentHandCount(5);
    const live = scene.texts.filter(t => !t.destroyed && /cards$/.test(t.cardId));
    expect(live.map(t => t.cardId)).toEqual(['5 cards']);
    hand.destroy();
  });
});

describe('HandRenderer — compact rows', () => {
  it('hovering a row shows one full-size preview; leaving removes it', () => {
    (globalThis as any).__previews = [];
    const scene = makeScene();
    const hand = new HandRenderer(scene as any, layout, theme);
    hand.setHand([card('a'), card('b')]);
    const rows = (hand as any).cardContainers as FakeContainer[];
    rows[0].emit('pointerover');
    rows[1].emit('pointerout');            // not the hovered one → ignored
    rows[0].emit('pointerout');
    rows[1].emit('pointerover');
    const previews = (globalThis as any).__previews as FakeContainer[];
    expect(previews.map(p => p.cardId)).toEqual(['preview:a', 'preview:b']);
    expect(previews[0].destroyed).toBe(true);
    expect(previews[1].destroyed).toBe(false);
    hand.removeCard(1);                     // playing the hovered card drops its preview
    expect(previews[1].destroyed).toBe(true);
    hand.destroy();
  });

  it('dims rows the player cannot afford, from HUD_REFRESH', () => {
    const scene = makeScene();
    const hand = new HandRenderer(scene as any, layout, theme);
    hand.setHand([card('cheap', 1), card('pricey', 5)]);
    EventBus.emit(EV.HUD_REFRESH, { playerLEG: 2, opponentHandCount: 4 } as any);
    const rows = (hand as any).cardContainers as FakeContainer[];
    expect(rows.map(r => r.alpha)).toEqual([1, 0.5]);
    EventBus.emit(EV.HUD_REFRESH, { playerLEG: 6, opponentHandCount: 4 } as any);
    expect(rows.map(r => r.alpha)).toEqual([1, 1]);
    hand.destroy();
  });

  it('as many rows as fit are shown, the rest as "+N more"', () => {
    const scene = makeScene();
    const hand = new HandRenderer(scene as any, layout, theme);
    hand.setHand('abcdefghijkl'.split('').map(c => card(c)));
    const visible = (hand as any).cardContainers.length;
    expect(visible).toBeGreaterThanOrEqual(8);
    expect(visible).toBeLessThan(12);
    expect(scene.texts.some(t => /^\+\d+ more$/.test(t.cardId))).toBe(true);
    hand.destroy();
  });
});

describe('HandRenderer — drawn card keeps its dimming', () => {
  it('the slide-in tween ends at the dimmed alpha for an unaffordable card', () => {
    const scene = makeScene();
    const hand = new HandRenderer(scene as any, layout, theme);
    EventBus.emit(EV.HUD_REFRESH, { playerLEG: 1, opponentHandCount: 4 } as any);
    hand.addCard(card('knight', 9));
    const tween = scene.pendingTweens.find((t: any) => t.alpha !== undefined && t.targets === (hand as any).cardContainers[0]);
    expect(tween?.alpha).toBe(0.5);
    hand.destroy();
  });
});
