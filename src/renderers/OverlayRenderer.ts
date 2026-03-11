// ============================================================
// OverlayRenderer.ts
// All modal overlays: target selection, game over, deck preview,
// stake selection, and card detail view.
//
// All positions/sizes from layout.overlays (JSON).
// All colors/styles from theme.overlays (JSON).
// Overlays stack on top of everything else (highest depth).
// ============================================================

import Phaser from 'phaser';
import type {
  BattleLayoutJSON,
  ThemeJSON,
  CardRenderData,
  Rect,
} from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { CardRenderer } from './CardRenderer';
import { createButton } from './helpers/ButtonFactory';
import { getCard } from '../game/data/CardRegistry';

export interface TargetSelectConfig {
  prompt: string;
  positions?: Array<{ col: number; row: number }>; // board positions to highlight
  cards?: CardRenderData[];                         // cards to show (for discard)
  mode: 'board' | 'hand' | 'graveyard';
}

export interface GameOverConfig {
  won: boolean;
  playerName: string;
  opponentName: string;
  reason: string;        // 'King defeated', 'Opponent surrendered', etc.
  isCryptoMode: boolean;
  payoutAmount?: string; // e.g. '0.1 AVAX'
  txHash?: string;
}

export class OverlayRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;
  private cardRenderer: CardRenderer;

  // Root container — always on top
  private rootContainer: Phaser.GameObjects.Container;
  private dimmer: Phaser.GameObjects.Graphics | null = null;
  private activeOverlay: Phaser.GameObjects.Container | null = null;

  private unsubs: Array<() => void> = [];

  // Callbacks
  private onTargetSelected?: (payload: any) => void;
  private onCloseOverlay?: () => void;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
    this.cardRenderer = new CardRenderer(scene, layout, theme);

    this.rootContainer = scene.add.container(0, 0);
    // Set depth above everything else
    this.rootContainer.setDepth(100);

    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Show the target selection modal. */
  showTargetSelect(config: TargetSelectConfig, onSelect: (payload: any) => void): void {
    this.close();
    this.onTargetSelected = onSelect;

    const L = this.layout.overlays.targetSelect;
    const T = this.theme.overlays;

    this.showDimmer(0.6);
    const panel = this.makePanel(L);

    // Prompt text
    const prompt = this.scene.add.text(0, -L.height / 2 + 20, config.prompt, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.titleColor,
      wordWrap: { width: L.width - 40 },
      align: 'center',
    }).setOrigin(0.5, 0);
    panel.add(prompt);

    // Cancel button
    const cancelBtn = createButton(this.scene, {
      x: 0, y: L.height / 2 - 30,
      w: 80, h: 28,
      label: 'CANCEL',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: () => {
        this.close();
        EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
      },
      centered: true,
    });
    panel.add(cancelBtn);

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Show the game over screen. */
  showGameOver(config: GameOverConfig, onPlayAgain: () => void, onMenu: () => void): void {
    this.close();

    const L = this.layout.overlays.gameOver;
    const T = this.theme.overlays;
    const C = this.theme.colors;

    this.showDimmer(0.85);
    const panel = this.makePanel(L);

    // Result title (WIN / DEFEAT)
    const resultLabel = config.won ? 'VICTORY' : 'DEFEAT';
    const resultColor = config.won ? C.ACCENT_GREEN : C.ACCENT_RED;

    const title = this.scene.add.text(0, -L.height / 2 + 30, resultLabel, {
      fontFamily: this.theme.fonts.title.family,
      fontSize: `${this.theme.fonts.title.size + 8}px`,
      color: resultColor,
    }).setOrigin(0.5, 0);

    // Winner name
    const winnerLabel = this.scene.add.text(
      0, -L.height / 2 + 85,
      config.won ? `You defeated ${config.opponentName}` : `${config.opponentName} wins`,
      {
        fontFamily: this.theme.fonts.body.family,
        fontSize: `${this.theme.fonts.body.size}px`,
        color: T.bodyColor,
      }
    ).setOrigin(0.5, 0);

    // Reason
    const reasonLabel = this.scene.add.text(
      0, -L.height / 2 + 115,
      config.reason,
      {
        fontFamily: this.theme.fonts.small.family,
        fontSize: `${this.theme.fonts.small.size}px`,
        color: C.TEXT_SECONDARY,
      }
    ).setOrigin(0.5, 0);

    // Crypto payout (if applicable)
    const children: Phaser.GameObjects.GameObject[] = [title, winnerLabel, reasonLabel];

    if (config.isCryptoMode && config.payoutAmount) {
      const payoutLabel = this.scene.add.text(
        0, -L.height / 2 + 155,
        `Payout: ${config.payoutAmount}`,
        {
          fontFamily: this.theme.fonts.body.family,
          fontSize: `${this.theme.fonts.body.size}px`,
          color: C.ACCENT_GOLD,
        }
      ).setOrigin(0.5, 0);
      children.push(payoutLabel);

      if (config.txHash) {
        const txLabel = this.scene.add.text(
          0, -L.height / 2 + 180,
          `TX: ${config.txHash.slice(0, 12)}...`,
          {
            fontFamily: this.theme.fonts.small.family,
            fontSize: `${this.theme.fonts.small.size}px`,
            color: C.ACCENT_BLUE,
          }
        ).setOrigin(0.5, 0);
        children.push(txLabel);
      }
    }

    // Play again button
    const playAgainBtn = createButton(this.scene, {
      x: -60, y: L.height / 2 - 40,
      w: 120, h: 40,
      label: 'PLAY AGAIN',
      style: this.theme.buttons.primary,
      fontFamily: this.theme.fonts.body.family,
      onClick: onPlayAgain,
      centered: true,
    });

    // Menu button
    const menuBtn = createButton(this.scene, {
      x: 80, y: L.height / 2 - 40,
      w: 80, h: 40,
      label: 'MENU',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: onMenu,
      centered: true,
    });

    panel.add([...children, playAgainBtn, menuBtn]);

    // Entrance animation
    panel.setAlpha(0);
    panel.setScale(0.85);
    this.scene.tweens.add({
      targets: panel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Show placement prompt with card preview in top-right corner. */
  showPlacementPreview(cardData: CardRenderData, prompt: string): void {
    this.close();

    const container = this.scene.add.container(0, 0);

    // Card preview at top-right (above phase label area)
    const previewX = 1040;
    const previewY = 20;
    const cardContainer = this.cardRenderer.render(cardData, 'full', previewX, previewY);
    container.add(cardContainer);

    // Prompt banner above the board
    const bannerY = 690;
    const bannerW = 400;
    const bannerH = 32;
    const bannerX = 283 + (7 * 102) / 2; // board center X

    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0x000000, 0.8);
    bannerBg.fillRoundedRect(bannerX - bannerW / 2, bannerY, bannerW, bannerH, 6);
    container.add(bannerBg);

    const promptText = this.scene.add.text(bannerX, bannerY + bannerH / 2, prompt, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${this.theme.fonts.body.size}px`,
      color: this.theme.overlays.titleColor,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    container.add(promptText);

    this.activeOverlay = container;
    this.rootContainer.add(container);
  }

  /** Show card detail overlay (right-click). */
  showCardDetail(data: CardRenderData): void {
    this.close();

    const L = this.layout.overlays;

    this.showDimmer(0.7);

    const container = this.scene.add.container(0, 0);
    const detail = this.cardRenderer.render(data, 'detail', L.dimmer.width / 2, L.dimmer.height / 2);
    container.add(detail);

    // Click anywhere to close
    const blocker = this.scene.add.rectangle(
      L.dimmer.width / 2,
      L.dimmer.height / 2,
      L.dimmer.width,
      L.dimmer.height,
      0x000000, 0
    ).setInteractive();
    blocker.on('pointerdown', () => {
      this.close();
      EventBus.emit(EV.DETAIL_HIDE, {});
    });
    container.add(blocker);
    container.bringToTop(detail);

    // ESC key to close — track so we can remove on close()
    const escKey = this.scene.input.keyboard?.addKey('ESC');
    const escHandler = () => {
      this.close();
      EventBus.emit(EV.DETAIL_HIDE, {});
    };
    escKey?.once('down', escHandler);
    // Remove ESC listener when overlay is destroyed (e.g. clicked away)
    container.once('destroy', () => escKey?.off('down', escHandler));

    this.activeOverlay = container;
    this.rootContainer.add(container);
  }

  /** Show deck preview (your graveyard / remaining deck list). */
  showDeckPreview(
    title: string,
    cards: CardRenderData[],
    onClose: () => void
  ): void {
    this.close();

    const L = this.layout.overlays.deckPreview;
    const T = this.theme.overlays;

    this.showDimmer(0.75);
    const panel = this.makePanel(L);

    // Title
    const titleText = this.scene.add.text(0, -L.height / 2 + 16, title, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.titleColor,
    }).setOrigin(0.5, 0);
    panel.add(titleText);

    // Card grid (thumbnail size)
    const thumbW = this.layout.cards.thumbnail.width;
    const thumbH = this.layout.cards.thumbnail.height;
    const cols = Math.floor((L.width - 40) / (thumbW + 8));
    const startX = -(cols * (thumbW + 8)) / 2 + thumbW / 2;
    const startY = -L.height / 2 + 50;

    cards.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (thumbW + 8);
      const cy = startY + row * (thumbH + 8);
      const thumb = this.cardRenderer.render(card, 'thumbnail', cx, cy);
      panel.add(thumb);
    });

    // Close button
    const closeBtn = createButton(this.scene, {
      x: 0, y: L.height / 2 - 25,
      w: 80, h: 30,
      label: 'CLOSE',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: () => { this.close(); onClose(); },
      centered: true,
    });
    panel.add(closeBtn);

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Close the current overlay. */
  close(): void {
    if (this.dimmer) {
      this.dimmer.destroy();
      this.dimmer = null;
    }
    if (this.activeOverlay) {
      this.activeOverlay.destroy();
      this.activeOverlay = null;
    }
  }

  /** Is any overlay currently visible? */
  isOpen(): boolean {
    return this.activeOverlay !== null;
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.close();
    this.rootContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — PANEL BUILDER
  // ─────────────────────────────────────────────

  /**
   * Build a panel container centered at the layout rect's center.
   * The panel's local (0,0) is its center.
   */
  private makePanel(L: Rect): Phaser.GameObjects.Container {
    const T = this.theme.overlays;
    const panel = this.scene.add.container(L.x, L.y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(T.panelColor), T.panelAlpha);
    bg.fillRoundedRect(-L.width / 2, -L.height / 2, L.width, L.height, T.cornerRadius);
    bg.lineStyle(T.panelStrokeWidth, ThemeLoader.hexToNum(T.panelStroke), 1);
    bg.strokeRoundedRect(-L.width / 2, -L.height / 2, L.width, L.height, T.cornerRadius);

    panel.add(bg);
    return panel;
  }

  // makePanelButton extracted → helpers/ButtonFactory.ts createButton()

  private showDimmer(alpha: number): void {
    const L = this.layout.overlays.dimmer;
    this.dimmer = this.scene.add.graphics();
    this.dimmer.fillStyle(ThemeLoader.hexToNum(this.theme.overlays.dimmerColor), alpha);
    this.dimmer.fillRect(L.x, L.y, L.width, L.height);
    this.rootContainer.add(this.dimmer);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.PENDING_TARGET, (config: TargetSelectConfig) => {
        this.showTargetSelect(config, (payload) => {
          EventBus.emit(EV.INTERACTION_RESOLVED, payload);
        });
      }),

      EventBus.on(EV.PENDING_POSITION, (ev: any) => {
        // Build CardRenderData from the sourceCardId carried in the event
        const cardId = ev.sourceCardId;
        if (cardId) {
          const def = getCard(cardId);
          const cardData: CardRenderData = {
            id: cardId, name: def.name, cardClass: def.class,
            allegiance: def.allegiance, cost: def.cost,
            artKey: `art_${cardId}`,
            atk: def.stats?.atk, def: def.stats?.def,
            currentHP: def.stats?.def, maxHP: def.stats?.def,
            abilityText: def.abilityText,
            isEnemy: false, isExhausted: false, isSelected: false,
          };
          this.showPlacementPreview(cardData, ev.reason ?? 'Choose a position');
        }
      }),

      EventBus.on(EV.INTERACTION_RESOLVED, () => {
        this.close();
      }),

      EventBus.on(EV.DETAIL_SHOW, (data: CardRenderData) => {
        this.showCardDetail(data);
      }),
    );
  }
}
