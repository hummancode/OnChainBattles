import Phaser from 'phaser';
import GameState, { RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import { createMatchState } from '../data/MatchState';

export default class RoomScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private myRollText!: Phaser.GameObjects.Text;
  private opponentRollText!: Phaser.GameObjects.Text;
  private opponentNameText!: Phaser.GameObjects.Text;
  private rollButton!: Phaser.GameObjects.Text;

  private myRoll: number = 0;
  private opponentRoll: number = 0;
  private opponentName: string = 'Opponent';
  private myRollSent: boolean = false;
  private opponentRollReceived: boolean = false;

  constructor() {
    super('RoomScene');
  }

  create() {
    const { width, height } = this.scale;

    // Title
    this.add.text(width / 2, 60, 'OnChainBattles', {
      fontSize: '32px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Room code
    this.roomCodeText = this.add.text(width / 2, 120, 'Room: ------', {
      fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Player labels
    this.add.text(width / 4, 220, GameState.playerName, {
      fontSize: '24px', color: '#00ff88',
    }).setOrigin(0.5);

    this.opponentNameText = this.add.text((width / 4) * 3, 220, 'Waiting...', {
      fontSize: '24px', color: '#ff6666',
    }).setOrigin(0.5);

    // Dice displays
    this.myRollText = this.add.text(width / 4, 320, '?', {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    this.opponentRollText = this.add.text((width / 4) * 3, 320, '?', {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(width / 2, 460, 'Connecting...', {
      fontSize: '22px', color: '#ffff00',
    }).setOrigin(0.5);

    // Roll button
    this.rollButton = this.add.text(width / 2, 560, '[ ROLL DICE ]', {
      fontSize: '28px', color: '#555555',
    }).setOrigin(0.5);
    this.rollButton.setInteractive({ useHandCursor: true });
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
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Waiting for opponent...');
      },
      onRoomJoined: (code) => {
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Joined! Waiting for opponent to ready...');
      },
      onOpponentJoined: (name) => {
        this.opponentName = name;
        this.opponentNameText.setText(name);
        this.statusText.setText('Opponent joined! Roll when ready.');
        this.enableRollButton();
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
        this.rollButton.disableInteractive();
        this.rollButton.setColor('#555555');
      },
      onError: (message) => {
        this.statusText.setText(`Error: ${message}`);
      },
    });
  }

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

    SocketManager.sendDiceRoll(this.myRoll);
    this.tryResolveMatch();
  }

  private tryResolveMatch() {
    if (!this.myRollSent || !this.opponentRollReceived) return;

    const match = createMatchState(
      GameState.playerName,
      this.opponentName,
      this.myRoll,
      this.opponentRoll,
      GameState.currentStake
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

  private resetRolls() {
    this.myRoll = 0;
    this.opponentRoll = 0;
    this.myRollSent = false;
    this.opponentRollReceived = false;
    this.myRollText.setText('?');
    this.opponentRollText.setText('?');
    this.enableRollButton();
    this.statusText.setText('Roll again!');
  }
}