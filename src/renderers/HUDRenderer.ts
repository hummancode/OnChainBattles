// ============================================================
// HUDRenderer.ts
// Renders the left HUD (player), right HUD (opponent),
// and bottom action bar (phase label, End Turn, Pass buttons).
//
// All positions from layout JSON. All colors from theme JSON.
// Subscribes to EventBus — updates only the elements that changed.
// No game logic. No GameState reads.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, HUDSnapshot, ButtonStyle } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { setContainerHitArea } from '../utils/PhaserUtils';

export class HUDRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  // ── Left HUD elements ──
  private leftPanel!: Phaser.GameObjects.Graphics;
  private playerNameText!: Phaser.GameObjects.Text;
  private playerHPBar!: Phaser.GameObjects.Graphics;
  private playerHPBarFill!: Phaser.GameObjects.Graphics;
  private playerLEGText!: Phaser.GameObjects.Text;
  private playerLEGRateText!: Phaser.GameObjects.Text;
  private playerWinLossText!: Phaser.GameObjects.Text;

  // ── Right HUD elements ──
  private rightPanel!: Phaser.GameObjects.Graphics;
  private opponentNameText!: Phaser.GameObjects.Text;
  private opponentHPBar!: Phaser.GameObjects.Graphics;
  private opponentHPBarFill!: Phaser.GameObjects.Graphics;
  private opponentLEGText!: Phaser.GameObjects.Text;

  // ── Bottom Bar elements ──
  private bottomPanel!: Phaser.GameObjects.Graphics;
  private phaseLabelText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Container;
  private passBtnObj!: Phaser.GameObjects.Container;
  private playZoneBorder!: Phaser.GameObjects.Graphics;

  // Callbacks set by BattleScene
  private onEndTurn?: () => void;
  private onPass?: () => void;

  // Current state for HP bar sizing
  private playerMaxHP: number = 30;
  private opponentMaxHP: number = 30;

  private unsubs: Array<() => void> = [];
  private localPlayerIndex: number = 0;

  setLocalPlayer(index: number): void {
    this.localPlayerIndex = index;
}
  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;

    this.buildLeftHUD();
    this.buildRightHUD();
    this.buildBottomBar();
    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Full refresh from a HUDSnapshot. Called on turn start. */
  refresh(snap: HUDSnapshot): void {
    this.playerMaxHP   = snap.playerKingMaxHP;
    this.opponentMaxHP = snap.opponentKingMaxHP;

    this.playerNameText.setText(snap.playerName);
    this.opponentNameText.setText(snap.opponentName);
    this.updatePlayerHP(snap.playerKingHP, snap.playerKingMaxHP);
    this.updateOpponentHP(snap.opponentKingHP, snap.opponentKingMaxHP);
    this.updatePlayerLEG(snap.playerLEG, snap.playerCrown);
    this.updateOpponentLEG(snap.opponentLEGCount);
    this.updatePhaseLabel(snap.currentPhase, snap.turnNumber);
    this.playerWinLossText.setText(`${snap.playerWins}W / ${snap.playerLosses}L`);

    const isMyTurn = snap.isPlayerTurn;
    this.setEndTurnEnabled(isMyTurn);
    this.setPassEnabled(isMyTurn);
  }

  updatePlayerHP(current: number, max: number): void {
    this.drawHPBar(
      this.playerHPBarFill,
      this.layout.leftHUD.kingHPBar,
      current,
      max
    );
  }

  updateOpponentHP(current: number, max: number): void {
    this.drawHPBar(
      this.opponentHPBarFill,
      this.layout.rightHUD.kingHPBar,
      current,
      max
    );
  }

  updatePlayerLEG(amount: number, rate: number): void {
    this.playerLEGText.setText(`${amount} LEG`);
    this.playerLEGRateText.setText(`+${rate}/turn`);
  }

  updateOpponentLEG(count: number): void {
    this.opponentLEGText.setText(`${count} LEG`);
  }

updatePhaseLabel(phase: string, turn: number): void {
  this.phaseLabelText.setText(`TURN ${turn} · ${phase}`);

  // Color-code phase so player knows what they can do
  const phaseColors: Record<string, string> = {
    'DRAW': '#AAAAAA',
    'PLAY': '#00FF88',
    'ACT':  '#F5A623',
    'END':  '#888888',
  };
  const color = phaseColors[phase] ?? '#FFFFFF';
  this.phaseLabelText.setColor(color);
}

// AFTER:
setEndTurnEnabled(enabled: boolean): void {
  const btn = this.endTurnBtn;
  if (!btn) return;
  btn.setAlpha(enabled ? 1.0 : 0.4);
  if (btn.input) {
    btn.input.enabled = enabled;
  }
}

setPassEnabled(enabled: boolean): void {
  const btn = this.passBtnObj;
  if (!btn) return;
  btn.setAlpha(enabled ? 1.0 : 0.4);
  if (btn.input) {
    btn.input.enabled = enabled;
  }
}

  /** Register callbacks for button presses. Called by BattleScene. */
  onEndTurnClick(fn: () => void): void { this.onEndTurn = fn; }
  onPassClick(fn: () => void): void    { this.onPass = fn; }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
  }

  // ─────────────────────────────────────────────
  // PRIVATE — BUILD
  // ─────────────────────────────────────────────

  private buildLeftHUD(): void {
    const L = this.layout.leftHUD;
    const T = this.theme.hud;
    const C = this.theme.colors;

    // Panel background
    this.leftPanel = this.scene.add.graphics();
    this.leftPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.leftPanel.fillRect(L.x, L.y, L.width, L.height);

    // Player name
    this.playerNameText = this.scene.add.text(L.playerName.x, L.playerName.y, 'PLAYER', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.playerNameColor,
    }).setOrigin(0.5, 0);

    // King HP bar background
    this.playerHPBar = this.scene.add.graphics();
    this.playerHPBar.fillStyle(ThemeLoader.hexToNum(T.hpBarBg), 1);
    this.playerHPBar.fillRoundedRect(L.kingHPBar.x, L.kingHPBar.y, L.kingHPBar.width, L.kingHPBar.height, 3);

    // King HP bar fill (starts full)
    this.playerHPBarFill = this.scene.add.graphics();
    this.drawHPBar(this.playerHPBarFill, L.kingHPBar, 30, 30);

    // LEG counter
    this.playerLEGText = this.scene.add.text(L.legCounter.x, L.legCounter.y, '1 LEG', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.legColor,
    }).setOrigin(0.5, 0);

    // LEG rate
    this.playerLEGRateText = this.scene.add.text(L.legRate.x, L.legRate.y, '+1/turn', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: T.legRateColor,
    }).setOrigin(0.5, 0);

    // Win/Loss
    this.playerWinLossText = this.scene.add.text(L.winLoss.x, L.winLoss.y, '0W / 0L', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: C.TEXT_SECONDARY,
    }).setOrigin(0.5, 0);

    // LEG icon (if loaded)
    if (this.scene.textures.exists('icon_leg')) {
      this.scene.add.image(L.legCounter.x - 32, L.legCounter.y + 9, 'icon_leg')
        .setDisplaySize(20, 20);
    }
  }

  private buildRightHUD(): void {
    const L = this.layout.rightHUD;
    const T = this.theme.hud;

    // Panel background
    this.rightPanel = this.scene.add.graphics();
    this.rightPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.rightPanel.fillRect(L.x, L.y, L.width, L.height);

    // Opponent name
    this.opponentNameText = this.scene.add.text(L.opponentName.x, L.opponentName.y, 'OPPONENT', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.enemyNameColor,
    }).setOrigin(0.5, 0);

    // Opponent HP bar background
    this.opponentHPBar = this.scene.add.graphics();
    this.opponentHPBar.fillStyle(ThemeLoader.hexToNum(T.hpBarBg), 1);
    this.opponentHPBar.fillRoundedRect(
      L.kingHPBar.x, L.kingHPBar.y, L.kingHPBar.width, L.kingHPBar.height, 3
    );

    // Opponent HP bar fill
    this.opponentHPBarFill = this.scene.add.graphics();
    this.drawHPBar(this.opponentHPBarFill, L.kingHPBar, 30, 30);

    // Opponent LEG (shown as count)
    this.opponentLEGText = this.scene.add.text(L.legCounter.x, L.legCounter.y, '1 LEG', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.legColor,
    }).setOrigin(0.5, 0);
  }

  private buildBottomBar(): void {
    const L = this.layout.bottomBar;
    const T = this.theme.hud;
    const C = this.theme.colors;

    // Bar background
    this.bottomPanel = this.scene.add.graphics();
    this.bottomPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.bottomPanel.fillRect(L.x, L.y, L.width, L.height);

    // Phase label
    this.phaseLabelText = this.scene.add.text(
      L.phaseLabel.x, L.phaseLabel.y,
      'TURN 1 · DRAW PHASE',
      {
        fontFamily: this.theme.fonts.body.family,
        fontSize: `${this.theme.fonts.body.size}px`,
        color: T.phaseLabelColor,
      }
    ).setOrigin(0.5, 0);

    // Card play zone dashed border
    this.playZoneBorder = this.scene.add.graphics();
    const { color: pzColor, alpha: pzAlpha } = ThemeLoader.hexToColorAlpha(
      T.cardPlayZoneBorderColor + Math.round(T.cardPlayZoneBorderAlpha * 255).toString(16).padStart(2, '0')
    );
    this.drawDashedRect(
      this.playZoneBorder,
      L.cardPlayZone.x - L.cardPlayZone.width / 2,
      L.cardPlayZone.y - L.cardPlayZone.height / 2,
      L.cardPlayZone.width,
      L.cardPlayZone.height,
      pzColor,
      pzAlpha
    );

    // End Turn button
    this.endTurnBtn = this.makeButton(
      L.endTurnBtn.x - L.endTurnBtn.width / 2,
      L.endTurnBtn.y - L.endTurnBtn.height / 2,
      L.endTurnBtn.width,
      L.endTurnBtn.height,
      'END TURN',
      this.theme.buttons.endTurn,
      () => { if (this.onEndTurn) this.onEndTurn(); }
    );

    // Pass button
    this.passBtnObj = this.makeButton(
      L.passBtn.x - L.passBtn.width / 2,
      L.passBtn.y - L.passBtn.height / 2,
      L.passBtn.width,
      L.passBtn.height,
      'PASS',
      this.theme.buttons.pass,
      () => { if (this.onPass) this.onPass(); }
    );
  }

  // ─────────────────────────────────────────────
  // PRIVATE — DRAWING HELPERS
  // ─────────────────────────────────────────────

  private drawHPBar(
    gfx: Phaser.GameObjects.Graphics,
    bar: { x: number; y: number; width: number; height: number },
    current: number,
    max: number
  ): void {
    const T = this.theme.hud;
    gfx.clear();

    if (max <= 0) return;
    const pct = Math.max(0, Math.min(1, current / max));
    const fillW = Math.round(bar.width * pct);

    const fillHex = pct > 0.5 ? T.hpBarFull : pct > 0.25 ? T.hpBarMid : T.hpBarLow;
    gfx.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
    gfx.fillRoundedRect(bar.x, bar.y, fillW, bar.height, 3);

    // Animate if we have tweens available
    // (Simple: just redraw. For animation, caller can tween a value.)
  }

  /**
   * Create a button container with background, border, and label.
   * All sizes and colors from the ButtonStyle config.
   */
  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    style: ButtonStyle,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(style.fillColor), 1);
    bg.fillRoundedRect(0, 0, w, h, style.cornerRadius);
    bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
    bg.strokeRoundedRect(0, 0, w, h, style.cornerRadius);

    const txt = this.scene.add.text(w / 2, h / 2, label, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${style.fontSize}px`,
      color: style.textColor,
    }).setOrigin(0.5, 0.5);

    container.add([bg, txt]);
setContainerHitArea(container, w, h);

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(ThemeLoader.hexToNum(style.hoverFillColor), 1);
      bg.fillRoundedRect(0, 0, w, h, style.cornerRadius);
      bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
      bg.strokeRoundedRect(0, 0, w, h, style.cornerRadius);
      txt.setColor(style.hoverTextColor);
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(ThemeLoader.hexToNum(style.fillColor), 1);
      bg.fillRoundedRect(0, 0, w, h, style.cornerRadius);
      bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
      bg.strokeRoundedRect(0, 0, w, h, style.cornerRadius);
      txt.setColor(style.textColor);
    });

    container.on('pointerdown', onClick);

    return container;
  }

  /** Draw a dashed rectangle border. */
  private drawDashedRect(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    color: number, alpha: number,
    dashLen = 8, gapLen = 6
  ): void {
    gfx.lineStyle(1, color, alpha);

    // Draw dashed lines along each edge
    this.drawDashedLine(gfx, x,     y,     x + w, y,     dashLen, gapLen); // top
    this.drawDashedLine(gfx, x + w, y,     x + w, y + h, dashLen, gapLen); // right
    this.drawDashedLine(gfx, x + w, y + h, x,     y + h, dashLen, gapLen); // bottom
    this.drawDashedLine(gfx, x,     y + h, x,     y,     dashLen, gapLen); // left
  }

  private drawDashedLine(
    gfx: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    dashLen: number, gapLen: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len;
    const ny = dy / len;

    let pos = 0;
    let drawing = true;

    while (pos < len) {
      const segLen = Math.min(drawing ? dashLen : gapLen, len - pos);
      if (drawing) {
        gfx.lineBetween(
          x1 + nx * pos,       y1 + ny * pos,
          x1 + nx * (pos + segLen), y1 + ny * (pos + segLen)
        );
      }
      pos += segLen;
      drawing = !drawing;
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
  this.unsubs.push(
    EventBus.on(EV.HUD_REFRESH, (snap: HUDSnapshot) => {
      this.refresh(snap);
    }),

    EventBus.on(EV.LEG_GAINED, ({ player, total, rate }) => {
      if (player === this.localPlayerIndex) {
        this.updatePlayerLEG(total, rate);
      } else {
        this.updateOpponentLEG(total);
      }
    }),

    EventBus.on(EV.LEG_SPENT, ({ player, remaining, rate }) => {
      if (player === this.localPlayerIndex) {
        this.updatePlayerLEG(remaining, rate);
      }
      // Opponent spending doesn't show their pool (hidden info)
    }),

    EventBus.on(EV.UNIT_HEALED, ({ player, isKing, newHP, maxHP }) => {
      if (!isKing) return;
      if (player === this.localPlayerIndex) {
        this.updatePlayerHP(newHP, maxHP);
      } else {
        this.updateOpponentHP(newHP, maxHP);
      }
    }),

    EventBus.on(EV.UNIT_ATTACKED, ({ targetPlayer, isKingHit, newHP, maxHP }) => {
      if (!isKingHit) return;
      if (targetPlayer === this.localPlayerIndex) {
        this.updatePlayerHP(newHP, maxHP);
      } else {
        this.updateOpponentHP(newHP, maxHP);
      }
    }),

    EventBus.on(EV.PHASE_CHANGED, ({ phase, turn }) => {
      this.updatePhaseLabel(phase, turn);
    }),

    EventBus.on(EV.TURN_STARTED, ({ activePlayer }) => {
      const isMyTurn = activePlayer === this.localPlayerIndex;
      this.setEndTurnEnabled(isMyTurn);
      this.setPassEnabled(isMyTurn);
    }),
  );
}
}
