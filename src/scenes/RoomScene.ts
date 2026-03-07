// ============================================================
// RoomScene.ts  (REFACTORED)
//
// Changes vs original:
//   1. Room code is COPIABLE — click the code text to copy
//   2. "Copy Code" + "Share Link" buttons below room code
//   3. Uses MenuButton, ToastNotification, ShareHelper components
//   4. Fade in/out transitions
//   5. Cleaner layout with named constants
//   6. DOMOverlay for copy/share uses native HTML buttons for
//      reliable clipboard access (Phaser canvas can't focus)
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode, RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import EscrowManager, { STAKE_AVAX } from '../web3/EscrowManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';

// ─── Layout constants ──────────────────────────────────────────
const CX = 640;

const LAYOUT = {
  title:        { x: CX, y: 40 },
  modeBadge:    { x: CX, y: 75 },
  roomCode:     { x: CX, y: 118 },
  copyBtn:      { x: CX - 90, y: 155 },
  shareBtn:     { x: CX + 90, y: 155 },
  stake:        { x: CX, y: 185 },
  playerName:   { x: 320, y: 240 },
  vs:           { x: CX, y: 310 },
  opponentName: { x: 960, y: 240 },
  status:       { x: CX, y: 430 },
  subStatus:    { x: CX, y: 465 },
} as const;

type CryptoPhase = 'idle' | 'depositing' | 'waiting_opponent_deposit' | 'both_ready' | 'rolling' | 'waiting_payout';

export default class RoomScene extends Phaser.Scene {

  // ─── UI handles ──────────────────────────────────────────────
  private statusText!: Phaser.GameObjects.Text;
  private subStatusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private opponentNameText!: Phaser.GameObjects.Text;
  private stakeText!: Phaser.GameObjects.Text;
  private copyBtn!: MenuButton;
  private shareBtn!: MenuButton;

  // ─── State ───────────────────────────────────────────────────
  private isCryptoMode: boolean = false;
  private opponentName: string = '';
  private cryptoPhase: CryptoPhase = 'idle';
  private currentRoomCode: string = '';

  constructor() {
    super('RoomScene');
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  create(): void {
    const { width, height } = this.scale;
    this.isCryptoMode = GameState.currentMode === GameMode.CryptoPlay;

    // Background
   // Background — use loaded image if available, fallback to solid color
    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Title ────────────────────────────────────────────────
    this.add.text(LAYOUT.title.x, LAYOUT.title.y, 'OnChainBattles', {
      fontSize: '28px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // ── Mode badge ───────────────────────────────────────────
    const modeLabel = this.isCryptoMode ? 'CRYPTO MODE' : 'FREE PLAY';
    const modeColor = this.isCryptoMode ? '#f5a623' : '#00ff88';
    this.add.text(LAYOUT.modeBadge.x, LAYOUT.modeBadge.y, modeLabel, {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: modeColor,
    }).setOrigin(0.5);

    // ── Room code (clickable to copy) ────────────────────────
    this.roomCodeText = this.add.text(LAYOUT.roomCode.x, LAYOUT.roomCode.y,
      'ROOM: connecting...', {
      fontSize: '22px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#4fc3f7',
    }).setOrigin(0.5);

    // Make the room code text itself clickable
    this.roomCodeText.setInteractive({ useHandCursor: true });
    this.roomCodeText.on('pointerdown', () => this.copyRoomCode());
    this.roomCodeText.on('pointerover', () => {
      this.roomCodeText.setColor('#ffffff');
    });
    this.roomCodeText.on('pointerout', () => {
      this.roomCodeText.setColor('#4fc3f7');
    });

    // ── Copy & Share buttons ─────────────────────────────────
    this.copyBtn = new MenuButton(
      this,
      LAYOUT.copyBtn.x,
      LAYOUT.copyBtn.y,
      '[ Copy Code ]',
      {
        color: '#4fc3f7',
        fontSize: '13px',
        fontStyle: 'normal',
        onPointerDown: () => this.copyRoomCode(),
      },
    );

    this.shareBtn = new MenuButton(
      this,
      LAYOUT.shareBtn.x,
      LAYOUT.shareBtn.y,
      '[ Share Link ]',
      {
        color: '#4fc3f7',
        fontSize: '13px',
        fontStyle: 'normal',
        onPointerDown: () => this.shareRoomLink(),
      },
    );

    // Initially hidden until we have a room code
    this.copyBtn.text.setVisible(false);
    this.shareBtn.text.setVisible(false);

    // ── Stake display (crypto only) ──────────────────────────
    if (this.isCryptoMode) {
      this.stakeText = this.add.text(LAYOUT.stake.x, LAYOUT.stake.y,
        `Stake: ${STAKE_AVAX} AVAX each | Pot: ${(STAKE_AVAX * 2 * 0.95).toFixed(4)} AVAX to winner`, {
        fontSize: '13px',
        fontFamily: '"Courier New", monospace',
        color: '#f5a623',
      }).setOrigin(0.5);
    }

    // ── Player names ─────────────────────────────────────────
    this.add.text(LAYOUT.playerName.x, LAYOUT.playerName.y, GameState.playerName, {
      fontSize: '22px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#00ff88',
    }).setOrigin(0.5);

    this.opponentNameText = this.add.text(
      LAYOUT.opponentName.x,
      LAYOUT.opponentName.y,
      'Waiting for opponent...',
      {
        fontSize: '18px',
        fontFamily: '"Courier New", monospace',
        color: '#555555',
      },
    ).setOrigin(0.5);

    // ── VS icon ──────────────────────────────────────────────
    this.add.text(LAYOUT.vs.x, LAYOUT.vs.y, 'VS', {
      fontSize: '48px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#253348',
    }).setOrigin(0.5);

    // ── Status ───────────────────────────────────────────────
    this.statusText = this.add.text(LAYOUT.status.x, LAYOUT.status.y,
      'Connecting to server...', {
      fontSize: '18px',
      fontFamily: '"Courier New", monospace',
      color: '#f5a623',
    }).setOrigin(0.5);

    this.subStatusText = this.add.text(LAYOUT.subStatus.x, LAYOUT.subStatus.y,
      'Share your room code with a friend', {
      fontSize: '13px',
      fontFamily: '"Courier New", monospace',
      color: '#777777',
    }).setOrigin(0.5);

    // ── Connect socket ───────────────────────────────────────
    this.connectSocket();
  }

  // ─── Clipboard: Copy Room Code ───────────────────────────────

  private async copyRoomCode(): Promise<void> {
    if (!this.currentRoomCode) return;

    const ok = await ShareHelper.copyToClipboard(this.currentRoomCode);
    if (ok) {
      ToastNotification.show(this, `Copied: ${this.currentRoomCode}`, {
        color: '#00ff88',
        y: LAYOUT.copyBtn.y + 30,
        duration: 1500,
      });
    } else {
      ToastNotification.show(this, 'Copy failed — select manually', {
        color: '#ff4444',
        y: LAYOUT.copyBtn.y + 30,
      });
    }
  }

  // ─── Share Room Link ─────────────────────────────────────────

  private async shareRoomLink(): Promise<void> {
    if (!this.currentRoomCode) return;

    const result = await ShareHelper.shareRoom(this.currentRoomCode);
    if (result === 'shared') {
      ToastNotification.show(this, 'Shared!', {
        color: '#00ff88',
        y: LAYOUT.shareBtn.y + 30,
        duration: 1500,
      });
    } else if (result === 'copied') {
      ToastNotification.show(this, 'Link copied to clipboard!', {
        color: '#00ff88',
        y: LAYOUT.shareBtn.y + 30,
        duration: 1500,
      });
    } else {
      ToastNotification.show(this, 'Share failed', {
        color: '#ff4444',
        y: LAYOUT.shareBtn.y + 30,
      });
    }
  }

  // ─── Socket wiring ──────────────────────────────────────────

  private connectSocket(): void {
    SocketManager.connect({
  onRoomCreated: (code) => this.onRoomCreated(code),
  onRoomJoined: (code) => this.onRoomJoined(code),
  onOpponentJoined: (name) => this.onOpponentJoined(name),
  onOpponentAction: () => {},          // ← ADD THIS LINE
  onOpponentDisconnected: () => this.onOpponentDisconnected(),
  onError: (msg) => this.onSocketError(msg),
  onBothCryptoReady: () => this.onBothCryptoReady(),
  onOpponentRollReceived: () => {},
  onCryptoMatchResult: () => {},
  onTieReroll: () => {},
  onHostDepositConfirmed: () => this.onHostDepositConfirmed(),

});
  }
private onHostDepositConfirmed(): void {
  // Host's createMatch is confirmed on-chain — now joiner can safely call joinMatch
  this.statusText.setText('Host locked funds! Your turn...').setColor('#f5a623');
  this.handleCryptoDeposit();
}
  private onRoomCreated(code: string): void {
    this.currentRoomCode = code;
    GameState.setRoomCode(code);
    this.roomCodeText.setText(`ROOM: ${code}`);
    this.statusText.setText('Waiting for opponent...');
    this.subStatusText.setText('Share the code or link below');

    // Show copy/share buttons
    this.copyBtn.text.setVisible(true);
    this.shareBtn.text.setVisible(true);

    if (this.isCryptoMode && GameState.walletAddress) {
      SocketManager.registerWallet(GameState.walletAddress);
    }
  }

  private onRoomJoined(code: string): void {
    this.currentRoomCode = code;
    this.roomCodeText.setText(`ROOM: ${code}`);
    this.statusText.setText('Joined room! Waiting...');

    // Show copy/share for joiners too
    this.copyBtn.text.setVisible(true);
    this.shareBtn.text.setVisible(true);

    if (this.isCryptoMode && GameState.walletAddress) {
      SocketManager.registerWallet(GameState.walletAddress);
    }
  }

 private onOpponentJoined(opponentName: string): void {
  this.opponentName = opponentName;
  GameState.setOpponentName(opponentName);
  this.opponentNameText.setText(opponentName).setColor('#ff6666');

  if (this.isCryptoMode) {
    const isHost = GameState.roomAction === RoomAction.Create;
    if (isHost) {
      // Show button — user clicks to deposit (required for Brave Wallet focus)
      this.statusText.setText('Opponent joined! Click to lock funds').setColor('#00ff88');
      this.subStatusText.setText('');

      const depositBtn = this.add.text(CX, 510, '[ LOCK FUNDS ]', {
        fontSize: '24px',
        fontFamily: '"Courier New", monospace',
        color: '#f5a623',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      depositBtn.on('pointerover', () => depositBtn.setColor('#ffffff'));
      depositBtn.on('pointerout', () => depositBtn.setColor('#f5a623'));
      depositBtn.on('pointerdown', () => {
        depositBtn.destroy();
        this.handleCryptoDeposit();
      });
    } else {
      // Joiner waits for host deposit to be confirmed on-chain
      this.statusText.setText('Waiting for host to lock funds...').setColor('#f5a623');
      this.subStatusText.setText('You will deposit after host confirms');
    }
  } else {
    this.statusText.setText('Opponent joined! Entering battle...');
    this.time.delayedCall(800, () => this.enterBattle());
  }
}
  private onOpponentDisconnected(): void {
    this.statusText.setText('Opponent disconnected.').setColor('#ff4444');
    this.time.delayedCall(3000, () => this.scene.start('MainMenuScene'));
  }

  private onSocketError(msg: string): void {
    this.statusText.setText(`Error: ${msg}`).setColor('#ff4444');
  }

  private onBothCryptoReady(): void {
    this.cryptoPhase = 'both_ready';
    this.statusText.setText('Funds locked! Entering battle...').setColor('#00ff88');
    this.time.delayedCall(1000, () => this.enterBattle());
  }

  // ─── Crypto deposit flow ─────────────────────────────────────

 private async handleCryptoDeposit(): Promise<void> {
  this.cryptoPhase = 'depositing';
  this.statusText.setText('Locking funds... Check your wallet').setColor('#f5a623');
  this.subStatusText.setText('MetaMask popup incoming');

  try {
    const isHost = GameState.roomAction === RoomAction.Create;
    let txHash: string;

    if (isHost) {
      txHash = await EscrowManager.createMatch(GameState.roomCode);
    } else {
      txHash = await EscrowManager.joinMatch(GameState.roomCode);
    }

    // Store tx hash for ResultScene display
    (GameState as any).depositTxHash = txHash;

    this.cryptoPhase = 'waiting_opponent_deposit';
    this.statusText.setText('Funds locked ✓  Waiting for opponent...').setColor('#4fc3f7');
    this.subStatusText.setText('');
    SocketManager.registerWallet(GameState.walletAddress!);
    SocketManager.signalCryptoReady();
  } catch (err: any) {
    this.statusText.setText(`Deposit failed: ${err.message}`).setColor('#ff4444');
    this.time.delayedCall(4000, () => this.scene.start('MainMenuScene'));
  }
}

  // ─── Scene transition ────────────────────────────────────────

  private enterBattle(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName,
        opponentName: this.opponentName || GameState.opponentName,
        isCryptoMode: this.isCryptoMode,
        roomCode: GameState.roomCode,
      });
    });
  }
}