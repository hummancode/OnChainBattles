// ============================================================
// HandRenderer.ts
// Renders the player's hand of cards in the left HUD.
// Opponent hand renders as face-down backs in the right HUD.
//
// Reads from:
//   layout.leftHUD.hand   → positions, spacing, fan, scale
//   layout.cards.full     → card dimensions
//   theme.*               → colors
//
// Fully parametric: change fanAngle, spacing, cardWidth
// in the JSON → hand re-lays out automatically.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { CardRenderer, PREVIEW } from './CardRenderer';
import { setContainerHitArea } from '../utils/PhaserUtils';
import { CardRowRenderer, ROW } from './CardRowRenderer';

/** Rows fit between the LEG/record block and the bottom of the screen. */
const ROW_X = 15;
const ROW_BOTTOM = 552; // the player block (name / King / LEG) sits below

export class HandRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;
  private cardRenderer: CardRenderer;
  private rowRenderer: CardRowRenderer;
  /** Full-size card shown beside the hand while a row is hovered. */
  private preview: Phaser.GameObjects.Container | null = null;
  /** Current LEG pool (from HUD_REFRESH) — rows that cost more are dimmed. */
  private legAvailable = Infinity;

  // Player hand container
  private handContainer: Phaser.GameObjects.Container;
  // Opponent hand container
  private oppHandContainer: Phaser.GameObjects.Container;

  // Current hand state
  private cards: CardRenderData[] = [];
  private cardContainers: Phaser.GameObjects.Container[] = [];
  private selectedIndex: number | null = null;
  private hoveredIndex: number | null = null;
  private overflowLabel: Phaser.GameObjects.Text | null = null;
  private oppCountLabel: Phaser.GameObjects.Text | null = null;

  // Opponent hand
  private oppCardCount: number = 0;
  private oppCardContainers: Phaser.GameObjects.Container[] = [];

  private unsubs: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
    this.cardRenderer = new CardRenderer(scene, layout, theme);
    this.rowRenderer = new CardRowRenderer(scene, theme);

    this.handContainer    = scene.add.container(0, 0);
    this.oppHandContainer = scene.add.container(0, 0);
    this.handContainer.setDepth(10);
  this.oppHandContainer.setDepth(10); 
    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Card ids currently shown (hand cards use the card id as their render id). */
  cardIds(): string[] { return this.cards.map(c => c.id); }

  /** Full rebuild of hand display from card data array. */
  setHand(cards: CardRenderData[]): void {
    this.cards = cards;
    this.selectedIndex = null;
    this.hoveredIndex = null;
    this.rebuild();
  }

  /** Add a card to the hand (on draw). Renders only the new card + repositions existing. */
  addCard(card: CardRenderData): void {
    this.cards.push(card);
    // Overflow: the new card isn't visible — full rebuild keeps the "+N more" label right.
    if (this.cards.length > this.maxVisible) {
      this.rebuild();
      return;
    }

    const newCount = this.cards.length;
    const newIndex = newCount - 1;

    // Reposition existing cards to updated fan layout (no destroy/recreate)
    this.repositionCards(newCount);

    // Render only the new card
    const pos = this.cardPosition(newIndex);
    const cardContainer = this.rowRenderer.render(this.rowData(newIndex), pos.x, pos.y);
    this.bindCardInput(cardContainer);

    this.handContainer.add(cardContainer);
    this.cardContainers.push(cardContainer);

    // Animate the new card sliding in — to its state alpha (dimmed if unaffordable),
    // not to 1, or the fade-in would undo applyState's dimming.
    const targetAlpha = cardContainer.alpha;
    cardContainer.setAlpha(0);
    this.scene.tweens.add({
      targets: cardContainer, alpha: targetAlpha, duration: 250, ease: 'Quad.easeOut',
    });
  }

  /**
   * Remove a card from the hand (on play/discard).
   * The data model (cards / cardContainers / selection) is updated SYNCHRONOUSLY
   * so it always mirrors the engine hand; only the detached visual fades out.
   */
  removeCard(index: number): void {
    if (index < 0 || index >= this.cards.length) return;

    this.cards.splice(index, 1);
    if (this.selectedIndex === index) this.selectedIndex = null;
    else if (this.selectedIndex !== null && this.selectedIndex > index) this.selectedIndex--;
    if (this.hoveredIndex === index) { this.hoveredIndex = null; this.hidePreview(); }
    else if (this.hoveredIndex !== null && this.hoveredIndex > index) this.hoveredIndex--;

    const container = this.cardContainers[index];
    if (!container) {
      // Card was in the hidden overflow region
      this.rebuild();
      return;
    }

    this.cardContainers.splice(index, 1);
    container.removeAllListeners();
    container.disableInteractive();
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      x: container.x - 40,
      duration: 200,
      ease: 'Quad.easeIn',
      onComplete: () => container.destroy(),
    });

    if (this.cards.length >= this.maxVisible) {
      // A previously hidden card becomes visible — rebuild (fading container is detached, unaffected)
      this.rebuild();
    } else {
      this.repositionCards(this.cards.length);
    }
  }

  /** Set which hand card is currently selected. */
  setSelected(index: number | null): void {
    const prev = this.selectedIndex;
    this.selectedIndex = index;

    if (prev !== null) this.refreshCardVisual(prev);
    if (index !== null) this.refreshCardVisual(index);
  }

  /** Update a card's data (e.g., after stat change). */
  updateCard(index: number, data: CardRenderData): void {
    if (index < 0 || index >= this.cards.length) return;
    this.cards[index] = data;
    this.refreshCardVisual(index);
  }

  /** Update opponent's face-down hand count. */
  setOpponentHandCount(count: number): void {
    this.oppCardCount = count;
    this.rebuildOpponent();
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.hidePreview();
    this.handContainer.destroy();
    this.oppHandContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — PLAYER HAND LAYOUT
  // ─────────────────────────────────────────────

  private rebuild(): void {
    // Destroy existing card visuals
    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];
    this.overflowLabel?.destroy();
    this.overflowLabel = null;

    const H = this.layout.leftHUD.hand;
    const count = Math.min(this.cards.length, this.maxVisible);

    for (let i = 0; i < count; i++) {
      const pos = this.cardPosition(i);
      const cardContainer = this.rowRenderer.render(this.rowData(i), pos.x, pos.y);

      // Interactivity
      this.bindCardInput(cardContainer);

      this.handContainer.add(cardContainer);
      this.cardContainers.push(cardContainer);
    }

    // Overflow indicator
    if (this.cards.length > this.maxVisible) {
      const overflow = this.cards.length - this.maxVisible;
      const bottomCard = this.cardContainers[this.cardContainers.length - 1];
      if (bottomCard) {
        const moreLabel = this.scene.add.text(
          H.x, bottomCard.y + ROW.height + 2,
          `+${overflow} more`,
          {
            fontFamily: this.theme.fonts.small.family,
            fontSize: `${this.theme.fonts.small.size}px`,
            color: this.theme.colors.TEXT_SECONDARY,
          }
        ).setOrigin(0.5, 0);
        this.handContainer.add(moreLabel);
        this.overflowLabel = moreLabel;
      }
    }
  }

  /** Tween existing rows to their slots without destroy/recreate. */
  private repositionCards(count: number): void {
    for (let i = 0; i < this.cardContainers.length && i < count; i++) {
      const pos = this.cardPosition(i);
      this.scene.tweens.add({
        targets: this.cardContainers[i],
        x: pos.x + (this.selectedIndex === i ? 8 : 0), y: pos.y,
        duration: 150, ease: 'Quad.easeOut',
      });
    }
  }

  /**
   * Attach pointer handlers that resolve the card's index AT EVENT TIME.
   * Never capture an index in the closure — indices shift when cards are removed.
   */
  private bindCardInput(c: Phaser.GameObjects.Container): void {
    setContainerHitArea(c, ROW.width, ROW.height);
    const withIndex = (fn: (i: number) => void) => () => {
      const i = this.cardContainers.indexOf(c);
      if (i >= 0) fn(i);
    };
    c.on('pointerover', withIndex(i => this.onCardHover(i)));
    c.on('pointerout',  withIndex(i => this.onCardHoverEnd(i)));
    c.on('pointerdown', withIndex(i => this.onCardClick(i)));
  }

  /** How many rows fit between the hand's top (layout) and the bottom of the screen. */
  private get maxVisible(): number {
    const H = this.layout.leftHUD.hand;
    return Math.max(1, Math.floor((ROW_BOTTOM - H.y + ROW.gap) / (ROW.height + ROW.gap)));
  }

  private cardPosition(index: number): { x: number; y: number } {
    return { x: ROW_X, y: this.layout.leftHUD.hand.y + index * (ROW.height + ROW.gap) };
  }

  private rowData(index: number): CardRenderData & { unaffordable: boolean } {
    const d = this.cards[index];
    return { ...d, isSelected: this.selectedIndex === index, unaffordable: d.cost > this.legAvailable };
  }

  private refreshCardVisual(index: number): void {
    const container = this.cardContainers[index];
    if (!container) return;
    this.rowRenderer.applyState(container, this.rowData(index));
    // Selected row nudges right so it reads as "picked up"
    const pos = this.cardPosition(index);
    this.scene.tweens.add({
      targets: container, x: pos.x + (this.selectedIndex === index ? 8 : 0),
      duration: 120, ease: 'Quad.easeOut',
    });
  }

  /** Big readable card next to the hand while hovering a row. */
  private showPreview(index: number): void {
    this.hidePreview();
    const data = this.cards[index];
    const row = this.cardContainers[index];
    if (!data || !row) return;
    // Fixed spot in the right column (over the battle log) — never over the board
    this.preview = this.cardRenderer.renderPreview({ ...data, isSelected: false }, 1140 - PREVIEW.width / 2, 360);
    this.preview.setDepth(970); // above the tutorial panel (960): a hovered card is what the player is looking at
  }

  private hidePreview(): void {
    this.preview?.destroy();
    this.preview = null;
  }

  // ─────────────────────────────────────────────
  // PRIVATE — OPPONENT HAND
  // ─────────────────────────────────────────────

  private rebuildOpponent(): void {
    this.oppCardContainers.forEach(c => c.destroy());
    this.oppCardContainers = [];

    const H = this.layout.rightHUD.hand;
    const count = Math.min(this.oppCardCount, H.maxVisible);
    // One compact row of small backs (they used to fill the whole right column)
    for (let i = 0; i < count; i++) {
      const back = this.cardRenderer.renderBack(
        H.x + i * (H.cardWidth + H.spacing),
        H.y,
        H.cardWidth,
        H.cardHeight
      );
      this.oppHandContainer.add(back);
      this.oppCardContainers.push(back);
    }

    // Count label above opponent hand — one persistent label, text updated in place
    // (creating a new one per refresh stacked them into an unreadable smear).
    const label = `${this.oppCardCount} card${this.oppCardCount === 1 ? '' : 's'}`;
    if (this.oppCountLabel) {
      this.oppCountLabel.setText(label);
    } else {
      this.oppCountLabel = this.scene.add.text(1250, H.y + H.cardHeight / 2, label, {
        fontFamily: this.theme.fonts.small.family,
        fontSize: `${this.theme.fonts.small.size + 1}px`,
        color: this.theme.colors.TEXT_SECONDARY,
      }).setOrigin(1, 0.5);
      this.oppHandContainer.add(this.oppCountLabel);
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — INPUT HANDLERS
  // ─────────────────────────────────────────────

  private onCardHover(index: number): void {
    if (this.hoveredIndex === index) return;
    this.hoveredIndex = index;
    if (!this.cardContainers[index]) return;
    this.showPreview(index);
    EventBus.emit(EV.CARD_HOVERED, { index, card: this.cards[index] });
  }

  private onCardHoverEnd(index: number): void {
    if (this.hoveredIndex !== index) return;
    this.hoveredIndex = null;
    this.hidePreview();
    EventBus.emit(EV.CARD_HOVER_END, { index });
  }

  private onCardClick(index: number): void {
    const wasSelected = this.selectedIndex === index;

    // Deselect if clicking already-selected
    const newSelection = wasSelected ? null : index;
    this.setSelected(newSelection);

 EventBus.emit(EV.INPUT_HAND_CLICK, { index: newSelection });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.CARD_DRAWN, ({ card }) => {
        this.addCard(card);
      }),

      EventBus.on(EV.CARD_PLAYED, ({ handIndex, isLocal }) => {
  if (!isLocal) return;  // ← opponent played — opponent hand is count-based via HUD_REFRESH
  this.removeCard(handIndex);  // also clears/shifts selectedIndex
}),

EventBus.on(EV.CARD_DISCARDED, ({ handIndex, isLocal }) => {
  if (!isLocal) return;
  this.removeCard(handIndex);
}),

      // Update selected state from SelectionManager
EventBus.on(EV.INPUT_BOARD_CLICK, () => {
  this.setSelected(null);
}),
EventBus.on(EV.SELECTION_CHANGED, ({ source }) => {
  if (source === 'clear') {
    this.setSelected(null);
  }
}),
    
    

      // Opponent hand count update
      EventBus.on(EV.HUD_REFRESH, (snap) => {
        if (snap.opponentHandCount !== undefined) {
          this.setOpponentHandCount(snap.opponentHandCount);
        }
        // Dim rows the player can't afford right now
        if (typeof snap.playerLEG === 'number' && snap.playerLEG !== this.legAvailable) {
          this.legAvailable = snap.playerLEG;
          this.cardContainers.forEach((_, i) => this.rowRenderer.applyState(this.cardContainers[i], this.rowData(i)));
        }
      }),
    );
  }
}
