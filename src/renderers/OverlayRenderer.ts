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

export type CursorIcon = 'heal' | 'damage' | 'select' | 'none';

/** Map ability types to cursor icons for target selection. */
function deriveCursorIcon(sourceAbility?: string): CursorIcon {
  if (!sourceAbility) return 'select';
  if (sourceAbility.includes('HEAL') || sourceAbility.includes('REVIVE')) return 'heal';
  if (sourceAbility.includes('DAMAGE') || sourceAbility.includes('EARTHQUAKE')) return 'damage';
  return 'select';
}

export interface TargetSelectConfig {
  prompt: string;
  positions?: Array<{ col: number; row: number }>; // board positions to highlight
  cards?: CardRenderData[];                         // cards to show (for discard)
  mode: 'board' | 'hand' | 'graveyard';
  cursorIcon?: CursorIcon;                          // icon that follows the cursor
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
  private cursorFollower: Phaser.GameObjects.Container | null = null;

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

  /** Show the target selection UI. Board mode uses a non-blocking banner; other modes use a modal. */
  showTargetSelect(config: TargetSelectConfig, onSelect: (payload: any) => void): void {
    this.close();
    this.onTargetSelected = onSelect;

    if (config.mode === 'board') {
      // Non-blocking: prompt banner + cancel button, board stays clickable
      this.showBoardTargetSelect(config);
    } else {
      // Modal: dimmer + panel for hand/graveyard selection
      this.showModalTargetSelect(config);
    }

    // Cursor follower icon
    if (config.cursorIcon && config.cursorIcon !== 'none') {
      this.showCursorFollower(config.cursorIcon);
    }
  }

  /** Non-blocking target select — prompt banner + cancel, board stays interactive. */
  private showBoardTargetSelect(config: TargetSelectConfig): void {
    const container = this.scene.add.container(0, 0);

    // Prompt banner at bottom of board
    const bannerY = 690;
    const bannerW = 500;
    const bannerH = 36;
    const bannerX = 283 + (7 * 102) / 2; // board center X

    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0x000000, 0.85);
    bannerBg.fillRoundedRect(bannerX - bannerW / 2, bannerY, bannerW, bannerH, 6);
    bannerBg.lineStyle(1, 0x00FF88, 0.5);
    bannerBg.strokeRoundedRect(bannerX - bannerW / 2, bannerY, bannerW, bannerH, 6);
    container.add(bannerBg);

    const promptText = this.scene.add.text(bannerX, bannerY + bannerH / 2, config.prompt, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${this.theme.fonts.body.size}px`,
      color: this.theme.overlays.titleColor,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    container.add(promptText);

    // Cancel button to the right of the banner
    const cancelBtn = createButton(this.scene, {
      x: bannerX + bannerW / 2 + 50,
      y: bannerY + bannerH / 2,
      w: 70, h: 28,
      label: 'CANCEL',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: () => {
        this.close();
        EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
      },
    });
    container.add(cancelBtn);

    this.activeOverlay = container;
    this.rootContainer.add(container);
  }

  /** Modal target select — dimmer + panel for hand/graveyard picking. */
  private showModalTargetSelect(config: TargetSelectConfig): void {
    const L = this.layout.overlays.targetSelect;
    const T = this.theme.overlays;

    this.showDimmer(0.6);
    const panel = this.makePanel(L);

    const prompt = this.scene.add.text(0, -L.height / 2 + 20, config.prompt, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.titleColor,
      wordWrap: { width: L.width - 40 },
      align: 'center',
    }).setOrigin(0.5, 0);
    panel.add(prompt);

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
    this.destroyCursorFollower();
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
  // PRIVATE — CURSOR FOLLOWER
  // ─────────────────────────────────────────────

  private showCursorFollower(icon: CursorIcon): void {
    this.destroyCursorFollower();

    const container = this.scene.add.container(0, 0);
    container.setDepth(200); // above everything

    const size = 24;
    const gfx = this.scene.add.graphics();

    if (icon === 'heal') {
      // Green cross
      const t = 6; // thickness
      gfx.fillStyle(0x00FF88, 0.9);
      gfx.fillRect(-size / 2, -t / 2, size, t);     // horizontal bar
      gfx.fillRect(-t / 2, -size / 2, t, size);      // vertical bar
      gfx.lineStyle(1.5, 0x00CC66, 1);
      gfx.strokeRect(-size / 2, -t / 2, size, t);
      gfx.strokeRect(-t / 2, -size / 2, t, size);
    } else if (icon === 'damage') {
      // Red X
      const s = size * 0.4;
      gfx.lineStyle(3, 0xFF4444, 0.9);
      gfx.lineBetween(-s, -s, s, s);
      gfx.lineBetween(s, -s, -s, s);
    } else {
      // Default: white circle outline
      gfx.lineStyle(2, 0xFFFFFF, 0.8);
      gfx.strokeCircle(0, 0, size * 0.4);
    }

    container.add(gfx);

    // Label below icon
    const labelMap: Record<string, string> = {
      heal: 'HEAL',
      damage: 'DMG',
      select: 'SELECT',
    };
    const label = this.scene.add.text(0, size / 2 + 4, labelMap[icon] ?? '', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: '10px',
      color: icon === 'heal' ? '#00FF88' : icon === 'damage' ? '#FF4444' : '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    container.add(label);

    // Offset from cursor so it doesn't obscure the click target
    const offsetX = 18;
    const offsetY = 18;

    // Follow pointer
    const moveHandler = (pointer: Phaser.Input.Pointer) => {
      container.setPosition(pointer.x + offsetX, pointer.y + offsetY);
    };
    this.scene.input.on('pointermove', moveHandler);

    // Set initial position
    const pointer = this.scene.input.activePointer;
    container.setPosition(pointer.x + offsetX, pointer.y + offsetY);

    // Store cleanup
    container.once('destroy', () => {
      this.scene.input.off('pointermove', moveHandler);
    });

    this.cursorFollower = container;
  }

  private destroyCursorFollower(): void {
    if (this.cursorFollower) {
      this.cursorFollower.destroy();
      this.cursorFollower = null;
    }
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
      EventBus.on(EV.PENDING_TARGET, (ev: any) => {
        const cursorIcon: CursorIcon = deriveCursorIcon(ev.sourceAbility);
        const config: TargetSelectConfig = {
          prompt: ev.reason ?? 'Choose a target',
          mode: 'board',
          cursorIcon,
        };
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
