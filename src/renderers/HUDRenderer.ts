// ============================================================
// HUDRenderer.ts
// Renders the left HUD (player), right HUD (opponent),
// and action controls (phase label, End Turn button).
//
// All positions from layout JSON. All colors from theme JSON.
// Subscribes to EventBus — updates only the elements that changed.
// No game logic. No GameState reads.
//
// PATCH v0.3.1:
//   - PASS button removed (END TURN handles both PLAY→ACT and ACT→END)
//   - Bottom bar repositioned to right HUD area (no longer covers board)
//   - Card play zone dashed border removed (not needed)
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, HUDSnapshot } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { createButton } from './helpers/ButtonFactory';

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
  private handHeaderText!: Phaser.GameObjects.Text;
  private playerLegGfx!: Phaser.GameObjects.Graphics;
  private opponentLegGfx!: Phaser.GameObjects.Graphics;
  private stepper: Array<{ bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; phase: string; x: number }> = [];
  private endTurnLabel?: Phaser.GameObjects.Text;
  private lastPhase = 'DRAW';
  private isMyTurn = true;

  // ── Right HUD elements ──
  private rightPanel!: Phaser.GameObjects.Graphics;
  private opponentNameText!: Phaser.GameObjects.Text;
  private opponentHPBar!: Phaser.GameObjects.Graphics;
  private opponentHPBarFill!: Phaser.GameObjects.Graphics;
  private opponentLEGText!: Phaser.GameObjects.Text;

  // ── Action controls (right HUD area) ──
  private phaseLabelText!: Phaser.GameObjects.Text;
  private turnOwnerText!: Phaser.GameObjects.Text;
  private playerHPText!: Phaser.GameObjects.Text;
  private opponentHPText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Container;

  // Callbacks set by BattleScene
  private onEndTurn?: () => void;
  private onPass?: () => void;

  // Current state for HP bar sizing
  private playerMaxHP: number = 30;
  private opponentMaxHP: number = 30;

  private unsubs: Array<() => void> = [];
  private localPlayerIndex: number = 0;

  // Turn clock (server-driven)
  private timerText?: Phaser.GameObjects.Text;
  private timerTick?: Phaser.Time.TimerEvent;
  private turnDeadline = 0;
  private timerOwner = -1;

  setLocalPlayer(index: number): void {
    this.localPlayerIndex = index;
  }

  /** Replay viewer: name whose turn it is instead of YOUR/THEIR, no END TURN button. */
  private spectatorNames: [string, string] | null = null;
  setSpectator(names: [string, string]): void {
    this.spectatorNames = names;
    this.endTurnBtn?.setVisible(false);
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
    if (this.spectatorNames) {
      const active = snap.isPlayerTurn ? this.localPlayerIndex : 1 - this.localPlayerIndex;
      this.turnOwnerText?.setText(this.spectatorNames[active]).setColor('#FFD54F');
    } else {
      this.turnOwnerText?.setText(snap.isPlayerTurn ? 'YOUR TURN' : 'THEIR TURN') // short: must fit beside the board
        .setColor(snap.isPlayerTurn ? '#00FF88' : '#FF8866');
    }
    this.playerWinLossText.setText(`${snap.playerWins}W / ${snap.playerLosses}L`);
    this.handHeaderText?.setText(`YOUR HAND · ${snap.playerHandCount ?? 0}`);

    this.isMyTurn = snap.isPlayerTurn;
    this.setEndTurnEnabled(this.isMyTurn);
    this.refreshEndTurnLabel();
  }

  updatePlayerHP(current: number, max: number): void {
    this.drawHPBar(this.playerHPBarFill, this.layout.leftHUD.kingHPBar, current, max);
    this.playerHPText?.setText(`King ${Math.max(0, current)} / ${max}`);
  }

  updateOpponentHP(current: number, max: number): void {
    this.drawHPBar(this.opponentHPBarFill, this.layout.rightHUD.kingHPBar, current, max);
    this.opponentHPText?.setText(`King ${Math.max(0, current)} / ${max}`);
  }

  updatePlayerLEG(amount: number, rate: number): void {
    this.playerLEGText.setText(`${amount} LEG`);
    this.placeLegIcon();
    this.playerLEGRateText.setText(`+${rate} / turn`);
    const L = this.layout.leftHUD.legCounter;
    this.drawLegDiamonds(this.playerLegGfx, L.x, L.y + 26, amount, Math.max(rate, amount));
  }

  updateOpponentLEG(count: number): void {
    this.opponentLEGText.setText(`${count} LEG`);
    const L = this.layout.rightHUD.legCounter;
    this.drawLegDiamonds(this.opponentLegGfx, L.x + 64, L.y + 1, count, count);
  }

  /** LEG as gems: filled = available now, hollow = room up to this turn's cap (the LEG rate). */
  private drawLegDiamonds(g: Phaser.GameObjects.Graphics | undefined, x: number, cy: number, filled: number, slots: number): void {
    if (!g) return;
    g.clear();
    const n = Math.min(10, Math.max(0, slots)), s = 7, step = 17;
    for (let i = 0; i < n; i++) {
      const cx = x + s + i * step;
      const pts = [{ x: cx, y: cy - s }, { x: cx + s, y: cy }, { x: cx, y: cy + s }, { x: cx - s, y: cy }] as unknown as Phaser.Math.Vector2[];
      if (i < filled) {
        g.fillStyle(0xF5C542, 1); g.fillPoints(pts, true);
        g.lineStyle(1, 0x7A5A10, 1); g.strokePoints(pts, true);
      } else {
        g.lineStyle(1.5, 0x8A7440, 0.8); g.strokePoints(pts, true);
      }
    }
    if (filled > 10) {
      // Overflow (Motherland): show the extra as a number
      g.fillStyle(0xF5C542, 1);
    }
  }

  updatePhaseLabel(phase: string, turn: number): void {
    this.phaseLabelText.setText(`TURN ${turn}`);
    this.lastPhase = phase;
    // Stepper: PLAY → ACT → END (DRAW/LEG are automatic and light up PLAY's predecessor)
    const order = ['PLAY', 'ACT', 'END'];
    const idx = order.indexOf(phase);
    for (const st of this.stepper) {
      const i = order.indexOf(st.phase);
      const active = i === idx, done = idx > i;
      st.bg.clear();
      st.bg.fillStyle(active ? 0xF5C542 : done ? 0x3A4A66 : 0x161E2E, 1);
      st.bg.fillRoundedRect(st.x - 34, -12, 68, 24, 12);
      st.bg.lineStyle(1, active ? 0xFFE08A : 0x44506A, 1);
      st.bg.strokeRoundedRect(st.x - 34, -12, 68, 24, 12);
      st.label.setColor(active ? '#1A1200' : done ? '#9AA6BE' : '#6C7890').setFontStyle(active ? 'bold' : 'normal');
    }
    this.refreshEndTurnLabel();
  }

  /** The one action button says exactly what it will do. */
  private refreshEndTurnLabel(): void {
    if (!this.endTurnLabel) return;
    this.endTurnLabel.setText(!this.isMyTurn ? 'WAITING…' : this.lastPhase === 'PLAY' ? 'TO ACT PHASE  ▸' : 'END TURN');
  }

  setEndTurnEnabled(enabled: boolean): void {
    const btn = this.endTurnBtn;
    if (!btn) return;
    if (this.spectatorNames) { btn.setVisible(false); return; }
    btn.setAlpha(enabled ? 1.0 : 0.4);
    if (btn.input) {
      btn.input.enabled = enabled;
    }
  }

  onEndTurnClick(fn: () => void): void { this.onEndTurn = fn; }
  onPassClick(fn: () => void): void    { this.onPass = fn; }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.timerTick?.remove(false);
    this.timerTick = undefined;
    this.toastTimer?.remove(false);
    this.toastObj?.destroy();
    this.bannerObj?.destroy();
  }

  // Board centre (grid origin + half of the grid)
  private get boardCenterX(): number { const g = this.layout.grid; return g.originX + (g.cols * g.cellSize) / 2; }

  private toastObj?: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;

  /** Short feedback line near the bottom of the board (replaces the previous one). */
  showToast(message: string, color = '#FFDD88'): void {
    this.toastTimer?.remove(false);
    this.toastObj?.destroy();
    this.toastObj = this.scene.add.text(this.boardCenterX, 662, message, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${this.theme.fonts.body.size + 1}px`,
      color, backgroundColor: '#000000DD', padding: { x: 12, y: 6 },
      align: 'center', wordWrap: { width: 640 },
    }).setOrigin(0.5).setDepth(950);
    const t = this.toastObj;
    this.toastTimer = this.scene.time.delayedCall(1800, () => {
      this.scene.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
      if (this.toastObj === t) this.toastObj = undefined;
    });
  }

  private bannerObj?: Phaser.GameObjects.Container;

  /** Big "YOUR TURN" / "OPPONENT'S TURN" banner over the board on every turn change. */
  private showTurnBanner(isMyTurn: boolean, spectatorLabel?: string): void {
    this.bannerObj?.destroy();
    const x = this.boardCenterX, y = 96;
    const bg = this.scene.add.rectangle(0, 0, 400, 50, 0x000000, 0.8)
      .setStrokeStyle(2, isMyTurn ? 0x00FF88 : 0xFF6666, 0.9);
    const label = this.scene.add.text(0, 0, spectatorLabel ?? (isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"), {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: '28px', fontStyle: 'bold',
      color: isMyTurn ? '#00FF88' : '#FF8866',
    }).setOrigin(0.5);
    const c = this.scene.add.container(x, y, [bg, label]).setDepth(940).setAlpha(0).setScale(0.9);
    this.bannerObj = c;
    this.scene.tweens.add({
      targets: c, alpha: 1, scale: 1, duration: 180, ease: 'Quad.easeOut',
      onComplete: () => this.scene.tweens.add({
        targets: c, alpha: 0, delay: 700, duration: 300,
        onComplete: () => { c.destroy(); if (this.bannerObj === c) this.bannerObj = undefined; },
      }),
    });
  }

  /** Server announced a turn clock — show a live countdown under END TURN. */
  private startTurnClock(activePlayer: number, remainingMs: number): void {
    this.turnDeadline = Date.now() + remainingMs; // remainingMs, not a timestamp: no clock skew
    this.timerOwner = activePlayer;
    if (!this.timerText) {
      const B = this.layout.bottomBar;
      this.timerText = this.scene.add.text(B.phaseLabel.x, B.endTurnBtn.y + B.endTurnBtn.height / 2 + 6, '', {
        fontFamily: this.theme.fonts.body.family,
        fontSize: `${this.theme.fonts.body.size + 2}px`,
        fontStyle: 'bold',
        color: '#FFFFFF',
      }).setOrigin(0.5, 0);
    }
    if (!this.timerTick) {
      this.timerTick = this.scene.time.addEvent({ delay: 250, loop: true, callback: () => this.renderTurnClock() });
    }
    this.renderTurnClock();
  }

  private renderTurnClock(): void {
    if (!this.timerText) return;
    const left = Math.max(0, Math.ceil((this.turnDeadline - Date.now()) / 1000));
    const mine = this.timerOwner === this.localPlayerIndex;
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    this.timerText.setText(`⏱ ${mm}:${ss}`);
    this.timerText.setColor(!mine ? '#888888' : left <= 10 ? '#FF4444' : left <= 30 ? '#F5A623' : '#FFFFFF');
  }

  // ─────────────────────────────────────────────
  // PRIVATE — BUILD
  // ─────────────────────────────────────────────

  /** Rounded "card" block used by every HUD section. */
  private block(x: number, y: number, w: number, h: number, accent: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(0x0B1220, 0.92); g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(1, 0x2A3650, 1); g.strokeRoundedRect(x, y, w, h, 8);
    g.fillStyle(accent, 1); g.fillRoundedRect(x, y, w, 4, { tl: 8, tr: 8, bl: 0, br: 0 });
    return g;
  }

  private buildLeftHUD(): void {
    const L = this.layout.leftHUD;
    const T = this.theme.hud;
    const C = this.theme.colors;

    this.leftPanel = this.scene.add.graphics();
    this.leftPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.leftPanel.fillRect(L.x, L.y, L.width, L.height);

    // Hand header (the rows themselves are drawn by HandRenderer below it)
    this.handHeaderText = this.scene.add.text(18, 14, 'YOUR HAND', {
      fontFamily: this.theme.fonts.heading.family, fontSize: '13px', fontStyle: 'bold', color: '#C9A45C',
    });

    // Player block (bottom-left — your side of the board)
    this.block(12, 558, 252, 152, ThemeLoader.hexToNum(this.theme.board.unitBandPlayer));

    this.playerNameText = this.scene.add.text(L.playerName.x, L.playerName.y, 'PLAYER', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.playerNameColor,
    }).setOrigin(0.5, 0);

    this.playerHPBar = this.scene.add.graphics();
    this.playerHPBar.fillStyle(ThemeLoader.hexToNum(T.hpBarBg), 1);
    this.playerHPBar.fillRoundedRect(L.kingHPBar.x, L.kingHPBar.y, L.kingHPBar.width, L.kingHPBar.height, 3);

    this.playerHPBarFill = this.scene.add.graphics();
    this.drawHPBar(this.playerHPBarFill, L.kingHPBar, 30, 30);
    this.playerHPText = this.makeHPText(L.kingHPBar);

    // LEG: number + gems
    this.playerLEGText = this.scene.add.text(L.legCounter.x + 22, L.legCounter.y, '1 LEG', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: '18px', fontStyle: 'bold',
      color: T.legColor,
    }).setOrigin(0, 0);
    this.playerLegGfx = this.scene.add.graphics();

    this.playerLEGRateText = this.scene.add.text(L.legRate.x, L.legRate.y, '+1 / turn', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size + 1}px`,
      color: T.legRateColor,
    }).setOrigin(1, 0);

    this.playerWinLossText = this.scene.add.text(L.winLoss.x, L.winLoss.y, '0W / 0L', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size + 1}px`,
      color: C.TEXT_SECONDARY,
    }).setOrigin(0, 0);

    if (this.scene.textures.exists('icon_leg')) {
      this.scene.add.image(L.legCounter.x + 8, L.legCounter.y + 11, 'icon_leg')
        .setDisplaySize(18, 18);
    }
  }

  /** Keep the LEG icon just left of the (centred, variable-width) LEG text — it overlapped the digits. */
  private placeLegIcon(): void {
    // Text is left-aligned beside a fixed icon now — nothing to re-centre.
  }

  private buildRightHUD(): void {
    const L = this.layout.rightHUD;
    const T = this.theme.hud;

    this.rightPanel = this.scene.add.graphics();
    this.rightPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.rightPanel.fillRect(L.x, L.y, L.width, L.height);

    // Opponent block (top-right — their side of the board)
    this.block(1010, 6, 260, 142, ThemeLoader.hexToNum(this.theme.board.unitBandEnemy));
    // Turn block + log block frames
    const B = this.layout.bottomBar;
    this.block(B.x, B.y, B.width, B.height, 0xC9A45C);
    const G = this.layout.battleLog;
    if (G) this.block(G.x, G.y, G.width, G.height, 0x44506A);

    this.opponentNameText = this.scene.add.text(L.opponentName.x, L.opponentName.y, 'OPPONENT', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.enemyNameColor,
    }).setOrigin(0.5, 0);

    this.opponentHPBar = this.scene.add.graphics();
    this.opponentHPBar.fillStyle(ThemeLoader.hexToNum(T.hpBarBg), 1);
    this.opponentHPBar.fillRoundedRect(
      L.kingHPBar.x, L.kingHPBar.y, L.kingHPBar.width, L.kingHPBar.height, 3
    );

    this.opponentHPBarFill = this.scene.add.graphics();
    this.drawHPBar(this.opponentHPBarFill, L.kingHPBar, 30, 30);
    this.opponentHPText = this.makeHPText(L.kingHPBar);

    this.opponentLEGText = this.scene.add.text(L.legCounter.x, L.legCounter.y, '1 LEG', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: '15px', fontStyle: 'bold',
      color: T.legColor,
    }).setOrigin(0, 0.5);
    this.opponentLegGfx = this.scene.add.graphics();
  }

  private buildBottomBar(): void {
    const L = this.layout.bottomBar;
    const T = this.theme.hud;

    // "YOUR TURN" / "THEIR TURN" + turn number
    this.turnOwnerText = this.scene.add.text(L.phaseLabel.x, L.y + 10, '', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5, 0);
    this.phaseLabelText = this.scene.add.text(L.phaseLabel.x, L.y + 36, 'TURN 1', {
      fontFamily: this.theme.fonts.body.family,
      fontSize: '12px',
      color: T.phaseLabelColor,
    }).setOrigin(0.5, 0);

    // Phase stepper PLAY → ACT → END
    const sy = L.y + 72;
    const c = this.scene.add.container(L.phaseLabel.x, sy);
    ['PLAY', 'ACT', 'END'].forEach((phase, i) => {
      const x = (i - 1) * 76;
      const bg = this.scene.add.graphics();
      const label = this.scene.add.text(x, 0, phase, {
        fontFamily: this.theme.fonts.body.family, fontSize: '12px', color: '#6C7890',
      }).setOrigin(0.5);
      c.add([bg, label]);
      this.stepper.push({ bg, label, phase, x });
    });

    // The phase button — says what it does (TO ACT PHASE ▸ / END TURN / WAITING…)
    if (L.endTurnBtn.width > 0 && L.endTurnBtn.height > 0) {
      this.endTurnBtn = createButton(this.scene, {
        x: L.endTurnBtn.x - L.endTurnBtn.width / 2,
        y: L.endTurnBtn.y - L.endTurnBtn.height / 2,
        w: L.endTurnBtn.width,
        h: L.endTurnBtn.height,
        label: 'END TURN',
        style: this.theme.buttons.endTurn,
        fontFamily: this.theme.fonts.body.family,
        onClick: () => { if (this.onEndTurn) this.onEndTurn(); },
      });
      this.endTurnLabel = this.endTurnBtn.list.find(o => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      this.endTurnLabel?.setFontStyle('bold');
    }
    this.updatePhaseLabel('PLAY', 1);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — DRAWING HELPERS
  // ─────────────────────────────────────────────

  /** Numeric King HP under a bar — the bar alone gave no exact value. */
  private makeHPText(bar: { x: number; y: number; width: number; height: number }): Phaser.GameObjects.Text {
    return this.scene.add.text(bar.x + bar.width / 2, bar.y + bar.height + 3, '', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size + 1}px`,
      color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0.5, 0);
  }

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
  }

  // makeButton extracted → helpers/ButtonFactory.ts createButton()

  private drawDashedRect(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    color: number, alpha: number,
    dashLen = 8, gapLen = 6
  ): void {
    gfx.lineStyle(1, color, alpha);
    this.drawDashedLine(gfx, x,     y,     x + w, y,     dashLen, gapLen);
    this.drawDashedLine(gfx, x + w, y,     x + w, y + h, dashLen, gapLen);
    this.drawDashedLine(gfx, x + w, y + h, x,     y + h, dashLen, gapLen);
    this.drawDashedLine(gfx, x,     y + h, x,     y,     dashLen, gapLen);
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
      EventBus.on(EV.TURN_TIMER, ({ activePlayer, remainingMs }) => {
        this.startTurnClock(activePlayer, remainingMs);
      }),

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
        if (newHP == null || maxHP == null) return;
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
        this.showTurnBanner(isMyTurn, this.spectatorNames ? `${this.spectatorNames[activePlayer]}'S TURN` : undefined);
      }),

      EventBus.on(EV.UI_TOAST, ({ message, color }) => this.showToast(message, color)),
    );
  }
}
