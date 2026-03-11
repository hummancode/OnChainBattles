// ============================================================
// MainMenuScene.ts  (REFACTORED)
//
// Changes vs original:
//   1. Content vertically centred in the 720px canvas
//   2. HTML inputs managed via DOMInputManager (resize-safe)
//   3. Buttons use MenuButton component (consistent hover/press)
//   4. Toast errors use ToastNotification (fade in/out)
//   5. Auto-fills room code from URL query param (?room=XXXXXX)
//   6. Last-match banner repositioned to not overlap buttons
//   7. Scene fade-in / fade-out transitions per UI spec
// ============================================================

import Phaser from 'phaser';
import GameState, { RoomAction, GameMode } from '../GameState';
import WalletManager from '../web3/WalletManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';

// ─── Layout constants (game-space coords, 1280×720) ────────────
// Everything is relative to centerX / a baseline Y so the whole
// block sits visually centred on the canvas.
const CX = 640;                       // horizontal center
const BASE_Y = 140;                   // top of content block
const GAP = 68;                       // vertical spacing between rows

const LAYOUT = {
  title:       { x: CX, y: BASE_Y },
  tagline:     { x: CX, y: BASE_Y + 52 },
  nameLabel:   { x: CX, y: BASE_Y + GAP * 1.5 },
  nameInput:   { x: CX, y: BASE_Y + GAP * 1.5 + 38, w: 340, h: 44 },
  roomLabel:   { x: CX, y: BASE_Y + GAP * 2.5 + 10 },
  roomInput:   { x: CX, y: BASE_Y + GAP * 2.5 + 48, w: 280, h: 44 },
  playFreeBtn: { x: CX, y: BASE_Y + GAP * 3.5 + 30 },
  cryptoBtn:   { x: CX, y: BASE_Y + GAP * 4.2 + 30 },
  matchBanner: { x: CX, y: BASE_Y + GAP * 5 + 30 },
  record:      { x: CX, y: BASE_Y + GAP * 5 + 58 },
} as const;

export default class MainMenuScene extends Phaser.Scene {

  // ─── UI handles ──────────────────────────────────────────────
  private inputManager!: DOMInputManager;
  private nameInput!: HTMLInputElement;
  private roomCodeInput!: HTMLInputElement;
  private playFreeBtn!: MenuButton;
  private cryptoBtn!: MenuButton;

  constructor() {
    super('MainMenuScene');
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  create(): void {
    this.cleanupPrevious();

    const { width, height } = this.scale;
// Background — use loaded image if available, fallback to solid color
    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── Dark panel behind content for text readability ─────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(width / 2 - 260, BASE_Y - 40, 520, 500, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(width / 2 - 260, BASE_Y - 40, 520, 500, 10);

    // Fade in
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Static text ──────────────────────────────────────────
    this.add.text(LAYOUT.title.x, LAYOUT.title.y, 'OnChainBattles', {
      fontSize: '44px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    this.add.text(LAYOUT.tagline.x, LAYOUT.tagline.y, 'Chess-like On-Chain Card Game', {
      fontSize: '18px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    // ── Labels ───────────────────────────────────────────────
    this.add.text(LAYOUT.nameLabel.x, LAYOUT.nameLabel.y, 'Your Name', {
      fontSize: '16px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    this.add.text(LAYOUT.roomLabel.x, LAYOUT.roomLabel.y, 'Room Code  (leave blank to create new room)', {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    // ── HTML Inputs via DOMInputManager ──────────────────────
    this.inputManager = new DOMInputManager(this);

    this.nameInput = this.inputManager.createInput({
      gameX: LAYOUT.nameInput.x,
      gameY: LAYOUT.nameInput.y,
      width: LAYOUT.nameInput.w,
      height: LAYOUT.nameInput.h,
      placeholder: 'Enter your name...',
      maxLength: 20,
    });

    this.roomCodeInput = this.inputManager.createInput({
      gameX: LAYOUT.roomInput.x,
      gameY: LAYOUT.roomInput.y,
      width: LAYOUT.roomInput.w,
      height: LAYOUT.roomInput.h,
      placeholder: 'Enter code to join...',
      maxLength: 6,
      uppercase: true,
    });

    // Auto-fill room code from URL (?room=XXXXXX)
    const urlCode = ShareHelper.getRoomCodeFromURL();
    if (urlCode) {
      this.roomCodeInput.value = urlCode;
    }

    // ── Buttons ──────────────────────────────────────────────
    this.playFreeBtn = new MenuButton(
      this,
      LAYOUT.playFreeBtn.x,
      LAYOUT.playFreeBtn.y,
      '[ PLAY FREE ]',
      {
        color: '#00ff88',
        fontSize: '26px',
        onPointerDown: () => this.onPlayFree(),
      },
    );

    this.cryptoBtn = new MenuButton(
      this,
      LAYOUT.cryptoBtn.x,
      LAYOUT.cryptoBtn.y,
      '[ PLAY CRYPTO (AVAX) ]',
      {
        color: '#f5a623',
        fontSize: '20px',
        onPointerDown: () => this.onPlayCrypto(),
      },
    );

    // ── Last match banner (conditional) ─────────────────────
    this.renderLastMatchBanner();

    // ── Cleanup on scene shutdown ────────────────────────────
    this.events.once('shutdown', () => this.cleanupPrevious());
    this.events.once('destroy', () => this.cleanupPrevious());
  }

  // ─── Play Free ───────────────────────────────────────────────

  private onPlayFree(): void {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    GameState.setPlayerName(name);
    GameState.currentMode = GameMode.FreePlay;
    this.resolveRoomAction();
    this.transitionToRoom();
  }

  // ─── Play Crypto ─────────────────────────────────────────────

  private async onPlayCrypto(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    // Disable buttons during wallet flow
    this.playFreeBtn.setDisabled(true);
    this.cryptoBtn.setDisabled(true);
    this.cryptoBtn.setLabel('Connecting wallet...');

    try {
      const address = await WalletManager.connect();
      GameState.connectWallet(address);
      GameState.setPlayerName(name);
      this.resolveRoomAction();
      this.transitionToRoom();
    } catch (err: any) {
      ToastNotification.show(this, err.message, { color: '#ff4444' });
      this.playFreeBtn.setDisabled(false);
      this.cryptoBtn.setDisabled(false);
      this.cryptoBtn.setLabel('[ PLAY CRYPTO (AVAX) ]');
    }
  }

  // ─── Shared helpers ──────────────────────────────────────────

  private validateName(name: string): boolean {
    if (!name) {
      ToastNotification.show(this, 'Please enter your name!', {
        color: '#ff4444',
        y: LAYOUT.playFreeBtn.y - 30,
      });
      this.nameInput.focus();
      return false;
    }
    return true;
  }

  /** Set room action based on whether a room code was entered */
  private resolveRoomAction(): void {
    const code = this.roomCodeInput.value.trim().toUpperCase();
    if (code) {
      GameState.setRoomCode(code);
      GameState.setRoomAction(RoomAction.Join);
    } else {
      GameState.setRoomAction(RoomAction.Create);
    }
  }

  /** Fade out then start RoomScene */
  private transitionToRoom(): void {
    this.inputManager.destroyAll();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RoomScene');
    });
  }

  /** Show last-match result + W/L record if available */
  private renderLastMatchBanner(): void {
    const match = GameState.lastMatch;
    if (!match) return;

    const resultColor = match.playerWon ? '#00ff88'
      : match.isTie ? '#f5a623'
      : '#ff6666';

    const turnsInfo = match.turns > 0 ? ` (${match.turns} turns)` : '';
    const resultMsg = match.playerWon
      ? `Last: You beat ${match.opponentName}!${turnsInfo}`
      : match.isTie
      ? `Last: Tie with ${match.opponentName}`
      : `Last: ${match.opponentName} beat you${turnsInfo}`;

    this.add.text(LAYOUT.matchBanner.x, LAYOUT.matchBanner.y, resultMsg, {
      fontSize: '15px',
      fontFamily: '"Courier New", monospace',
      color: resultColor,
    }).setOrigin(0.5);

    this.add.text(LAYOUT.record.x, LAYOUT.record.y,
      `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      color: '#777777',
    }).setOrigin(0.5);
  }

  /** Tear down DOM inputs + buttons from a previous run of this scene */
  private cleanupPrevious(): void {
    if (this.inputManager) {
      this.inputManager.destroyAll();
    }
  }
}