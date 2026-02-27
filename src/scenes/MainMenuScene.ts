/// <reference lib="dom" />
import Phaser from 'phaser';
import GameState, { RoomAction } from '../GameState.ts';
import WalletManager from '../web3/WalletManager';

export default class MainMenuScene extends Phaser.Scene {
  private nameInput: HTMLInputElement | null = null;
  private roomCodeInput: HTMLInputElement | null = null;

  constructor() {
    super('MainMenuScene');
  }

  create() {
    // Always clean up any leftover inputs first
    this.removeInputs();

    const { width, height } = this.scale;

    this.add.text(width / 2, 100, 'OnChainBattles', {
      fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 160, 'Chess-like On-Chain Card Game', {
      fontSize: '20px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(width / 2, 240, 'Your Name', {
      fontSize: '18px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.nameInput = this.createInput(width / 2, 275, 'Enter your name...');

    this.add.text(width / 2, 330, 'Room Code  (leave blank to create new room)', {
      fontSize: '18px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.roomCodeInput = this.createInput(width / 2, 365, 'Enter code to join...');

    const playBtn = this.add.text(width / 2, 450, '[ PLAY FREE ]', {
      fontSize: '28px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playBtn.on('pointerdown', () => this.onPlayClicked());
    playBtn.on('pointerover', () => playBtn.setColor('#ffffff'));
    playBtn.on('pointerout', () => playBtn.setColor('#00ff88'));
    
        // Add this after the PLAY FREE button in create()
    const cryptoBtn = this.add.text(width / 2, 510, '[ PLAY CRYPTO (AVAX) ]', {
      fontSize: '24px', color: '#f5a623',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    cryptoBtn.on('pointerdown', () => this.onCryptoPlayClicked());
    cryptoBtn.on('pointerover', () => cryptoBtn.setColor('#ffffff'));
    cryptoBtn.on('pointerout', () => cryptoBtn.setColor('#f5a623'));
        // Record W/L if returning from a match
    const match = GameState.lastMatch;
    if (match) {
      const resultColor = match.playerWon ? '#00ff88' : '#ff6666';
      const resultMsg = match.playerWon
        ? `Last match: You beat ${match.opponentName}! (${match.playerRoll} vs ${match.opponentRoll})`
        : match.isTie
        ? `Last match: Tie with ${match.opponentName}`
        : `Last match: ${match.opponentName} beat you (${match.playerRoll} vs ${match.opponentRoll})`;

      this.add.text(width / 2, 530, resultMsg, {
        fontSize: '16px', color: resultColor,
      }).setOrigin(0.5);

      this.add.text(width / 2, 560, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
        fontSize: '16px', color: '#aaaaaa',
      }).setOrigin(0.5);
    }

    this.events.on('shutdown', () => this.removeInputs());
    this.events.on('destroy', () => this.removeInputs());
  }

  private createInput(x: number, y: number, placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scale.width;
    const scaleY = rect.height / this.scale.height;

    const inputWidth = 300 * scaleX;
    const left = rect.left + (x - 150) * scaleX;
    const top = rect.top + window.scrollY + (y - 20) * scaleY;

    input.style.cssText = `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
      width: ${inputWidth}px;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #2a2a4a;
      color: #ffffff;
      outline: none;
      text-align: center;
      box-sizing: border-box;
      z-index: 10;
    `;

    document.body.appendChild(input);
    return input;
  }

  private onPlayClicked() {
    const name = this.nameInput?.value.trim() ?? '';
    const code = this.roomCodeInput?.value.trim().toUpperCase() ?? '';

    if (!name) {
      const warn = this.add.text(this.scale.width / 2, 510, 'Please enter your name!', {
        fontSize: '18px', color: '#ff4444',
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => warn.destroy());
      return;
    }

    GameState.setPlayerName(name);

    if (!code) {
      GameState.setRoomAction(RoomAction.Create);
    } else {
      GameState.setRoomCode(code);
      GameState.setRoomAction(RoomAction.Join);
    }

    this.removeInputs();
    this.scene.start('RoomScene');
  }

  private removeInputs() {
    this.nameInput?.remove();
    this.nameInput = null;
    this.roomCodeInput?.remove();
    this.roomCodeInput = null;
  }
  private async onCryptoPlayClicked() {
  const name = this.nameInput?.value.trim() ?? '';
  if (!name) {
    const warn = this.add.text(this.scale.width / 2, 580, 'Please enter your name!', {
      fontSize: '18px', color: '#ff4444',
    }).setOrigin(0.5);
    this.time.delayedCall(2000, () => warn.destroy());
    return;
  }

  try {
    const address = await WalletManager.connect();
    GameState.connectWallet(address);
    GameState.setPlayerName(name);

    const code = this.roomCodeInput?.value.trim().toUpperCase() ?? '';
    if (!code) {
      GameState.setRoomAction(RoomAction.Create);
    } else {
      GameState.setRoomCode(code);
      GameState.setRoomAction(RoomAction.Join);
    }

    this.removeInputs();
    this.scene.start('RoomScene');
  } catch (err: any) {
    const warn = this.add.text(this.scale.width / 2, 580, err.message, {
      fontSize: '16px', color: '#ff4444',
    }).setOrigin(0.5);
    this.time.delayedCall(3000, () => warn.destroy());
  }
}
}