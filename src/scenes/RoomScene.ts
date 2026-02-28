import Phaser from 'phaser';
import GameState, { GameMode, RoomAction } from '../GameState';
import SocketManager, { CryptoMatchResult } from '../network/SocketManager';
import EscrowManager, { STAKE_AVAX } from '../web3/EscrowManager';
import { createMatchState } from '../data/MatchState';

type CryptoPhase = 'idle' | 'depositing' | 'waiting_opponent_deposit' | 'both_ready' | 'rolling' | 'waiting_payout';

export default class RoomScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private subStatusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private myRollText!: Phaser.GameObjects.Text;
  private opponentRollText!: Phaser.GameObjects.Text;
  private opponentNameText!: Phaser.GameObjects.Text;
  private rollButton!: Phaser.GameObjects.Text;
  private stakeText!: Phaser.GameObjects.Text;

  private myRoll: number = 0;
  private opponentRoll: number = 0;
  private opponentName: string = 'Opponent';
  private myRollSent: boolean = false;
  private opponentRollReceived: boolean = false;

  // Crypto state
  private cryptoPhase: CryptoPhase = 'idle';
  private isCryptoMode: boolean = false;
  private opponentJoined: boolean = false;

  constructor() {
    super('RoomScene');
  }

  create() {
    const { width, height } = this.scale;
    this.isCryptoMode = GameState.currentMode === GameMode.CryptoPlay;

    // Title
    this.add.text(width / 2, 40, 'OnChainBattles', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Mode indicator
    const modeLabel = this.isCryptoMode ? '🔺 CRYPTO MODE' : '🎮 FREE PLAY';
    const modeColor = this.isCryptoMode ? '#f5a623' : '#00ff88';
    this.add.text(width / 2, 75, modeLabel, {
      fontSize: '16px', color: modeColor,
    }).setOrigin(0.5);

    // Room code
    this.roomCodeText = this.add.text(width / 2, 110, 'Room: ------', {
      fontSize: '20px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Stake info (crypto only)
    if (this.isCryptoMode) {
      this.stakeText = this.add.text(width / 2, 140, `Stake: ${STAKE_AVAX} AVAX each | Pot: ${STAKE_AVAX * 2 * 0.95} AVAX to winner`, {
        fontSize: '14px', color: '#f5a623',
      }).setOrigin(0.5);
    }

    // Player labels
    this.add.text(width / 4, 200, GameState.playerName, {
      fontSize: '22px', color: '#00ff88',
    }).setOrigin(0.5);

    this.opponentNameText = this.add.text((width / 4) * 3, 200, 'Waiting...', {
      fontSize: '22px', color: '#ff6666',
    }).setOrigin(0.5);

    // Dice displays
    this.myRollText = this.add.text(width / 4, 310, '?', {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    this.opponentRollText = this.add.text((width / 4) * 3, 310, '?', {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(width / 2, 430, 'Connecting...', {
      fontSize: '20px', color: '#ffff00',
    }).setOrigin(0.5);

    // Sub-status (for crypto flow details)
    this.subStatusText = this.add.text(width / 2, 460, '', {
      fontSize: '14px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Roll button
    this.rollButton = this.add.text(width / 2, 530, '[ ROLL DICE ]', {
      fontSize: '28px', color: '#555555',
    }).setOrigin(0.5);
    this.rollButton.disableInteractive();

    this.rollButton.on('pointerdown', () => this.onRollClicked());
    this.rollButton.on('pointerover', () => {
      if (this.myRoll === 0) this.rollButton.setColor('#ffffff');
    });
    this.rollButton.on('pointerout', () => {
      if (this.myRoll === 0) this.rollButton.setColor('#00ff88');
    });

    // Connect to socket server
    SocketManager.connect({
      onRoomCreated: (code) => {
        this.roomCodeText.setText(`Room: ${code} (share this code!)`);
        this.statusText.setText('Waiting for opponent...');
      },
      onRoomJoined: (code) => {
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Joined! Getting ready...');
      },
      onOpponentJoined: (name) => {
        this.opponentName = name;
        this.opponentNameText.setText(name);
        this.opponentJoined = true;

        if (this.isCryptoMode) {
          this.statusText.setText('Opponent joined! Locking funds...');
          this.subStatusText.setText('Check MetaMask/Core for the transaction');
          this.startCryptoDeposit();
        } else {
          this.statusText.setText('Opponent joined! Roll when ready.');
          this.enableRollButton();
        }
      },
      onOpponentRollReceived: (roll, name) => {
        this.opponentRoll = roll;
        this.opponentName = name;
        this.opponentRollText.setText(roll.toString());
        this.opponentRollReceived = true;
        this.tryResolveMatch();
      },
      onOpponentDisconnected: () => {
        this.statusText.setText('Opponent disconnected.');
        this.subStatusText.setText('');
        this.rollButton.disableInteractive();
        this.rollButton.setColor('#555555');
      },
      onError: (message) => {
        this.statusText.setText(`Error: ${message}`);
        this.subStatusText.setText('');
      },

      // ─── Crypto callbacks ──────────────────────────────────
      onBothCryptoReady: () => {
        this.cryptoPhase = 'both_ready';
        this.statusText.setText('Funds locked! Roll the dice!');
        this.subStatusText.setText(`${STAKE_AVAX * 2 * 0.95} AVAX goes to winner`);
        this.enableRollButton();
      },
      onTieReroll: () => {
        this.resetRolls();
        this.statusText.setText("Tie! Roll again.");
        this.subStatusText.setText('');
        this.enableRollButton();
      },
      onCryptoMatchResult: (result) => {
        this.handleCryptoResult(result);
      },
    });
  }

  // ─── Crypto Deposit Flow ──────────────────────────────────────
  private async startCryptoDeposit() {
    this.cryptoPhase = 'depositing';
    const roomCode = GameState.roomCode;
    const isCreator = GameState.roomAction === RoomAction.Create;

    try {
      // Register wallet address with server so it knows who to pay
      SocketManager.registerWallet(GameState.walletAddress);

      let txHash: string;
      if (isCreator) {
        this.statusText.setText('Creating escrow match...');
        this.subStatusText.setText('Approve the transaction in your wallet (0.01 AVAX)');
        txHash = await EscrowManager.createMatch(roomCode);
      } else {
        this.statusText.setText('Joining escrow match...');
        this.subStatusText.setText('Approve the transaction in your wallet (0.01 AVAX)');
        txHash = await EscrowManager.joinMatch(roomCode);
      }

      this.cryptoPhase = 'waiting_opponent_deposit';
      this.statusText.setText('Funds locked ✓ Waiting for opponent...');
      this.subStatusText.setText(`Tx: ${txHash.slice(0, 20)}...`);

      // Tell server our deposit is confirmed
      SocketManager.signalCryptoReady();

    } catch (err: any) {
      console.error('[RoomScene] Escrow error:', err);
      this.statusText.setText('Transaction failed!');
      this.subStatusText.setText(err.message || 'Check wallet and AVAX balance');
      this.cryptoPhase = 'idle';
    }
  }

  // ─── Roll Button ──────────────────────────────────────────────
  private enableRollButton() {
    this.rollButton.setInteractive({ useHandCursor: true });
    this.rollButton.setColor('#00ff88');
  }

  private onRollClicked() {
    if (this.myRoll !== 0) return;

    this.myRoll = Phaser.Math.Between(1, 6);
    this.myRollText.setText(this.myRoll.toString());
    this.myRollSent = true;
    this.rollButton.disableInteractive();
    this.rollButton.setColor('#555555');
    this.statusText.setText('Waiting for opponent roll...');
    this.subStatusText.setText('');

    SocketManager.sendDiceRoll(this.myRoll);
    this.tryResolveMatch();
  }

  // ─── Free Play Match Resolution ───────────────────────────────
  private tryResolveMatch() {
    if (!this.myRollSent || !this.opponentRollReceived) return;
    if (this.isCryptoMode) return; // Crypto is resolved by server via onCryptoMatchResult

    const match = createMatchState(
      GameState.playerName,
      this.opponentName,
      this.myRoll,
      this.opponentRoll,
      0
    );

    GameState.setLastMatch(match);

    if (match.isTie) {
      this.statusText.setText('Tie! Rolling again...');
      this.time.delayedCall(1500, () => this.resetRolls());
      return;
    }

    if (match.playerWon) {
      GameState.recordWin();
      this.statusText.setText('You Win! 🎉');
    } else {
      GameState.recordLoss();
      this.statusText.setText('You Lose!');
    }

    this.time.delayedCall(2000, () => this.scene.start('ResultScene'));
  }

  // ─── Crypto Match Resolution (from server) ────────────────────
  private handleCryptoResult(result: CryptoMatchResult) {
    const iWon = result.winnerName === GameState.playerName;

    const match = createMatchState(
      GameState.playerName,
      this.opponentName,
      iWon ? result.winnerRoll : result.loserRoll,
      iWon ? result.loserRoll : result.winnerRoll,
      STAKE_AVAX
    );

    GameState.setLastMatch(match);

    if (result.success) {
      if (iWon) {
        GameState.recordWin();
        this.statusText.setText('You Win! 🎉 Payout sent!');
        this.subStatusText.setText(`Tx: ${result.txHash?.slice(0, 20)}...` || '');
      } else {
        GameState.recordLoss();
        this.statusText.setText('You Lose! Better luck next time.');
        this.subStatusText.setText(`Winner: ${result.winnerName}`);
      }
    } else {
      this.statusText.setText('Match done — payout failed!');
      this.subStatusText.setText(result.error || 'Check Snowtrace manually');
    }

    this.time.delayedCall(3000, () => this.scene.start('ResultScene'));
  }

  private resetRolls() {
    this.myRoll = 0;
    this.opponentRoll = 0;
    this.myRollSent = false;
    this.opponentRollReceived = false;
    this.myRollText.setText('?');
    this.opponentRollText.setText('?');
    this.statusText.setText('Roll again!');
    this.subStatusText.setText('');
    this.enableRollButton();
  }
}