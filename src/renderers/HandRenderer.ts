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
import { CardRenderer } from './CardRenderer';

export class HandRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;
  private cardRenderer: CardRenderer;

  // Player hand container
  private handContainer: Phaser.GameObjects.Container;
  // Opponent hand container
  private oppHandContainer: Phaser.GameObjects.Container;

  // Current hand state
  private cards: CardRenderData[] = [];
  private cardContainers: Phaser.GameObjects.Container[] = [];
  private selectedIndex: number | null = null;
  private hoveredIndex: number | null = null;

  // Opponent hand
  private oppCardCount: number = 0;
  private oppCardContainers: Phaser.GameObjects.Container[] = [];

  private unsubs: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
    this.cardRenderer = new CardRenderer(scene, layout, theme);

    this.handContainer    = scene.add.container(0, 0);
    this.oppHandContainer = scene.add.container(0, 0);

    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Full rebuild of hand display from card data array. */
  setHand(cards: CardRenderData[]): void {
    this.cards = cards;
    this.selectedIndex = null;
    this.hoveredIndex = null;
    this.rebuild();
  }

  /** Add a card to the hand (on draw). */
  addCard(card: CardRenderData): void {
    this.cards.push(card);
    this.rebuild();
    // Animate the new card sliding in
    const lastContainer = this.cardContainers[this.cardContainers.length - 1];
    if (lastContainer) {
      lastContainer.setAlpha(0);
      this.scene.tweens.add({
        targets: lastContainer,
        alpha: 1,
        y: lastContainer.y,
        duration: 250,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Remove a card from the hand (on play/discard). */
  removeCard(index: number): void {
    if (index < 0 || index >= this.cards.length) return;

    const container = this.cardContainers[index];
    if (container) {
      this.scene.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 30,
        duration: 200,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.cards.splice(index, 1);
          if (this.selectedIndex === index) this.selectedIndex = null;
          if (this.selectedIndex !== null && this.selectedIndex > index) this.selectedIndex--;
          this.rebuild();
        },
      });
    } else {
      this.cards.splice(index, 1);
      this.rebuild();
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

    const H = this.layout.leftHUD.hand;
    const count = Math.min(this.cards.length, H.maxVisible);

    for (let i = 0; i < count; i++) {
      const pos = this.cardPosition(i, count, H);
      const cardContainer = this.cardRenderer.render(
        { ...this.cards[i], isSelected: this.selectedIndex === i },
        'full',
        pos.x,
        pos.y
      );

      // Apply fan rotation
      cardContainer.setRotation(Phaser.Math.DegToRad(pos.angle));

      // Interactivity
      const cardW = H.cardWidth;
      const cardH = H.cardHeight;
      cardContainer.setSize(cardW, cardH);
      cardContainer.setInteractive();

      const idx = i; // capture for closure
      cardContainer.on('pointerover',  () => this.onCardHover(idx));
      cardContainer.on('pointerout',   () => this.onCardHoverEnd(idx));
      cardContainer.on('pointerdown',  () => this.onCardClick(idx));
      cardContainer.on('pointerup',    () => {});

      this.handContainer.add(cardContainer);
      this.cardContainers.push(cardContainer);
    }

    // Overflow indicator
    if (this.cards.length > H.maxVisible) {
      const overflow = this.cards.length - H.maxVisible;
      const bottomCard = this.cardContainers[this.cardContainers.length - 1];
      if (bottomCard) {
        const moreLabel = this.scene.add.text(
          H.x, bottomCard.y + H.cardHeight + 4,
          `+${overflow} more`,
          {
            fontFamily: this.theme.fonts.small.family,
            fontSize: `${this.theme.fonts.small.size}px`,
            color: this.theme.colors.TEXT_SECONDARY,
          }
        ).setOrigin(0.5, 0);
        this.handContainer.add(moreLabel);
      }
    }
  }

  /**
   * Calculate a card's X, Y, and rotation angle in the fan layout.
   * All values are derived from layout.leftHUD.hand config.
   */
  private cardPosition(
    index: number,
    total: number,
    H: typeof this.layout.leftHUD.hand
  ): { x: number; y: number; angle: number } {
    if (total === 1) {
      return { x: H.x - H.cardWidth / 2, y: H.y, angle: 0 };
    }

    // Stack vertically with optional fan
    const totalHeight = (total - 1) * (H.cardHeight + H.spacing);
    const startY = H.y;

    // Fan angle: cards fan from center, negative left / positive right
    const centerIdx = (total - 1) / 2;
    const angle = (index - centerIdx) * H.fanAngle;

    // X shift based on fan angle so cards spread slightly
    const xShift = (index - centerIdx) * (H.fanAngle * 0.8);

    return {
      x: H.x - H.cardWidth / 2 + xShift,
      y: startY + index * (H.cardHeight + H.spacing),
      angle,
    };
  }

  private refreshCardVisual(index: number): void {
    const container = this.cardContainers[index];
    if (!container) return;

    // Destroy and re-render just this card
    const H = this.layout.leftHUD.hand;
    const count = Math.min(this.cards.length, H.maxVisible);
    const pos = this.cardPosition(index, count, H);

    // Update state without full rebuild for performance
    this.cardRenderer.updateState(
      container,
      { ...this.cards[index], isSelected: this.selectedIndex === index },
      'full'
    );

    // Scale animation for selected state
    const targetScale = this.selectedIndex === index ? H.selectedScale : 1.0;
    this.scene.tweens.add({
      targets: container,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: 120,
      ease: 'Quad.easeOut',
    });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — OPPONENT HAND
  // ─────────────────────────────────────────────

  private rebuildOpponent(): void {
    this.oppCardContainers.forEach(c => c.destroy());
    this.oppCardContainers = [];

    const H = this.layout.rightHUD.hand;
    const count = Math.min(this.oppCardCount, H.maxVisible);

    for (let i = 0; i < count; i++) {
      const py = H.y + i * (H.cardHeight + H.spacing);
      const back = this.cardRenderer.renderBack(
        H.x - H.cardWidth / 2,
        py,
        H.cardWidth,
        H.cardHeight
      );
      this.oppHandContainer.add(back);
      this.oppCardContainers.push(back);
    }

    // Count label above opponent hand
    const countLbl = this.scene.add.text(H.x, H.y - 20, `${this.oppCardCount} cards`, {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0.5, 1);
    this.oppHandContainer.add(countLbl);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — INPUT HANDLERS
  // ─────────────────────────────────────────────

  private onCardHover(index: number): void {
    if (this.hoveredIndex === index) return;
    this.hoveredIndex = index;

    const container = this.cardContainers[index];
    if (!container) return;

    // Expand card on hover (if not selected)
    if (this.selectedIndex !== index) {
      const H = this.layout.leftHUD.hand;
      const full = this.layout.cards.full;
      const scaleX = full.hoverWidth / full.width;
      const scaleY = full.hoverHeight / full.height;

      this.scene.tweens.add({
        targets: container,
        scaleX,
        scaleY,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    }

    // Bring to top within hand container
    this.handContainer.bringToTop(container);

    EventBus.emit(EV.CARD_HOVERED, { index, card: this.cards[index] });
  }

  private onCardHoverEnd(index: number): void {
    if (this.hoveredIndex !== index) return;
    this.hoveredIndex = null;

    const container = this.cardContainers[index];
    if (!container) return;

    if (this.selectedIndex !== index) {
      this.scene.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    }

    EventBus.emit(EV.CARD_HOVER_END, { index });
  }

  private onCardClick(index: number): void {
    const wasSelected = this.selectedIndex === index;

    // Deselect if clicking already-selected
    const newSelection = wasSelected ? null : index;
    this.setSelected(newSelection);

    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'hand',
      index: newSelection,
      card: newSelection !== null ? this.cards[newSelection] : null,
    });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.CARD_DRAWN, ({ card }) => {
        this.addCard(card);
      }),

      EventBus.on(EV.CARD_PLAYED, ({ handIndex }) => {
        this.removeCard(handIndex);
        if (this.selectedIndex === handIndex) {
          EventBus.emit(EV.SELECTION_CHANGED, { source: 'hand', index: null, card: null });
        }
      }),

      EventBus.on(EV.CARD_DISCARDED, ({ handIndex }) => {
        this.removeCard(handIndex);
      }),

      // Update selected state from SelectionManager
      EventBus.on(EV.SELECTION_CHANGED, ({ source, index }) => {
        if (source === 'board' || source === 'clear') {
          // Board selection clears hand selection
          this.setSelected(null);
        }
      }),

      // Opponent hand count update
      EventBus.on(EV.HUD_REFRESH, (snap) => {
        if (snap.opponentHandCount !== undefined) {
          this.setOpponentHandCount(snap.opponentHandCount);
        }
      }),
    );
  }
}
