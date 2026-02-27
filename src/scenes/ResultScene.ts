import Phaser from 'phaser';
import GameState from '../GameState';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;

    if (!match) {
      this.scene.start('MainMenuScene');
      return;
    }

    // Background panel
    this.add.rectangle(width / 2, height / 2, 600, 420, 0x1a1a3e).setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, 600, 420, 0x4444aa, 0.3).setOrigin(0.5);

    // Result title
    const resultText = match.isTie ? 'TIE!' : match.playerWon ? 'YOU WIN! 🎉' : 'YOU LOSE';
    const resultColor = match.isTie ? '#ffff00' : match.playerWon ? '#00ff88' : '#ff4444';

    this.add.text(width / 2, height / 2 - 160, resultText, {
      fontSize: '52px', color: resultColor, fontStyle: 'bold',
    }).setOrigin(0.5);

    // Dice breakdown
    this.add.text(width / 2 - 120, height / 2 - 70, GameState.playerName, {
      fontSize: '20px', color: '#00ff88',
    }).setOrigin(0.5);

    this.add.text(width / 2 + 120, height / 2 - 70, match.opponentName, {
      fontSize: '20px', color: '#ff6666',
    }).setOrigin(0.5);

    this.add.text(width / 2 - 120, height / 2, match.playerRoll.toString(), {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, 'vs', {
      fontSize: '24px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(width / 2 + 120, height / 2, match.opponentRoll.toString(), {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    // Record
    this.add.text(width / 2, height / 2 + 100, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
      fontSize: '20px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Play Again button
    const playAgainBtn = this.add.text(width / 2 - 130, height / 2 + 160, '[ PLAY AGAIN ]', {
      fontSize: '24px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerdown', () => this.scene.start('MainMenuScene'));
    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#ffffff'));
    playAgainBtn.on('pointerout', () => playAgainBtn.setColor('#00ff88'));

    // Main Menu button
    const menuBtn = this.add.text(width / 2 + 130, height / 2 + 160, '[ MAIN MENU ]', {
      fontSize: '24px', color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerdown', () => this.scene.start('MainMenuScene'));
    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#aaaaaa'));
  }
}