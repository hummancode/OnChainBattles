// ============================================================
// RoomScene.ts — Phase 2
// Matchmaking lobby. When opponent joins → go to BattleScene.
// Crypto mode: deposit escrow first, then enter battle.
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';
import SocketManager from '../network/SocketManager';
import EscrowManager, { STAKE_AVAX } from '../web3/EscrowManager';

type CryptoPhase = 'idle' | 'depositing' | 'waiting_opponent_deposit' | 'both_ready';

export default class RoomScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private subStatusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private opponentNameText!: Phaser.GameObjects.Text;
  private stakeText!: Phaser.GameObjects.Text;

  private isCryptoMode: boolean = false;
  private opponentName: string = '';
  private cryptoPhase: CryptoPhase = 'idle';

  constructor() {
    super('RoomScene');
  }

  create() {
    const { width, height } = this.scale;
    this.isCryptoMode = GameState.currentMode === GameMode.CryptoPlay;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add.text(width / 2, 40, 'OnChainBattles', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Mode badge
    const modeLabel = this.isCryptoMode ? '🔺 CRYPTO MODE' : '🎮 FREE PLAY';
    const modeColor = this.isCryptoMode ? '#f5a623' : '#00ff88';
    this.add.text(width / 2, 75, modeLabel, {
      fontSize: '16px', color: modeColor,
    }).setOrigin(0.5);

    // Room code display
    this.roomCodeText = this.add.text(width / 2, 115, 'Room: connecting...', {
      fontSize: '20px', color: '#4fc3f7',
    }).setOrigin(0.5);

    // Stake display (crypto only)
    if (this.isCryptoMode) {
      this.stakeText = this.add.text(width / 2, 148,
        `Stake: ${STAKE_AVAX} AVAX each | Pot: ${(STAKE_AVAX * 2 * 0.95).toFixed(4)} AVAX to winner`, {
        fontSize: '14px', color: '#f5a623',
      }).setOrigin(0.5);
    }

    // Player name
    this.add.text(width / 4, 200, GameState.playerName, {
      fontSize: '22px', color: '#00ff88', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Opponent name (waiting state)
    this.opponentNameText = this.add.text((width / 4) * 3, 200, 'Waiting for opponent...', {
      fontSize: '18px', color: '#888888',
    }).setOrigin(0.5);

    // Sword icon
    this.add.text(width / 2, 310, '⚔', {
      fontSize: '64px', color: '#253348',
    }).setOrigin(0.5);

    // Status text
    this.statusText = this.add.text(width / 2, 430, 'Connecting to server...', {
      fontSize: '20px', color: '#f5a623',
    }).setOrigin(0.5);

    this.subStatusText = this.add.text(width / 2, 465, 'Share your room code with a friend', {
      fontSize: '14px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Connect socket
    SocketManager.connect({
      onRoomCreated: (code) => {
        GameState.setRoomCode(code);
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Waiting for opponent...');
        this.subStatusText.setText(`Share code: ${code}`);
        if (this.isCryptoMode && GameState.walletAddress) {
          SocketManager.registerWallet(GameState.walletAddress);
        }
      },

      onRoomJoined: (code) => {
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Joined room! Waiting...');
        if (this.isCryptoMode && GameState.walletAddress) {
          SocketManager.registerWallet(GameState.walletAddress);
        }
      },

      onOpponentJoined: (opponentName) => {
        this.opponentName = opponentName;
        GameState.setOpponentName(opponentName);
        this.opponentNameText.setText(opponentName).setColor('#ff6666');

        if (this.isCryptoMode) {
          this.handleCryptoDeposit();
        } else {
          this.statusText.setText('Opponent joined! Entering battle...');
          this.time.delayedCall(800, () => this.enterBattle());
        }
      },

      onOpponentDisconnected: () => {
        this.statusText.setText('Opponent disconnected.').setColor('#ff4444');
        this.time.delayedCall(3000, () => this.scene.start('MainMenuScene'));
      },

      onError: (msg) => {
        this.statusText.setText(`Error: ${msg}`).setColor('#ff4444');
      },

      // Crypto: both deposits confirmed → enter battle
      onBothCryptoReady: () => {
        this.cryptoPhase = 'both_ready';
        this.statusText.setText('Funds locked! Entering battle...').setColor('#00ff88');
        this.time.delayedCall(1000, () => this.enterBattle());
      },

      // Unused in Phase 2 — kept for SocketManager interface compatibility
      onOpponentRollReceived: () => {},
      onCryptoMatchResult: () => {},
      onTieReroll: () => {},
    });
  }

  private async handleCryptoDeposit(): Promise<void> {
    this.cryptoPhase = 'depositing';
    this.statusText.setText('Locking funds... Check your wallet').setColor('#f5a623');
    this.subStatusText.setText('MetaMask popup incoming');

    try {
      await EscrowManager.createMatch(GameState.roomCode);
      this.cryptoPhase = 'waiting_opponent_deposit';
      this.statusText.setText('Funds locked ✓  Waiting for opponent...').setColor('#4fc3f7');
      this.subStatusText.setText('');
      SocketManager.signalCryptoReady();
    } catch (err: any) {
      this.statusText.setText(`Deposit failed: ${err.message}`).setColor('#ff4444');
      this.time.delayedCall(4000, () => this.scene.start('MainMenuScene'));
    }
  }

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