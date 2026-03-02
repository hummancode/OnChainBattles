// ============================================================
// ResultScene.ts
// Shows match result after BattleScene ends.
// Reads GameState.lastMatch for outcome data.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';

export default class ResultScene extends Phaser.Scene {

  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add.text(width / 2, 80, 'OnChainBattles', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    if (!match) {
      // Fallback if arrived here without match data
      this.add.text(width / 2, 300, 'Match Complete', {
        fontSize: '48px', color: '#ffffff',
      }).setOrigin(0.5);
    } else {
      // Win / Loss / Tie headline
      const won = match.playerWon;
      const tie = match.isTie;
      const headline = tie ? "It's a Tie!" : won ? 'Victory!' : 'Defeat';
      const headlineColor = tie ? '#f5a623' : won ? '#00ff88' : '#ff4444';

      this.add.text(width / 2, 200, headline, {
        fontSize: '64px', color: headlineColor, fontStyle: 'bold',
      }).setOrigin(0.5);

      // Opponent name
      this.add.text(width / 2, 290, `vs ${match.opponentName}`, {
        fontSize: '24px', color: '#aaaaaa',
      }).setOrigin(0.5);

      // Win/loss record
      this.add.text(width / 2, 340, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
        fontSize: '20px', color: '#ffffff',
      }).setOrigin(0.5);
// In ResultScene.create(), ADD after the win/loss record text block:

const extra = (GameState as any).lastMatchExtra as
  { reason?: string; turnCount?: number; winnerName?: string } | undefined;

if (extra) {
  // Turn count
  this.add.text(width / 2, 385, `Turns played: ${extra.turnCount ?? '—'}`, {
    fontSize: '18px', color: '#aaaaaa',
  }).setOrigin(0.5);

  // Reason (only if not standard king kill — keep it clean)
  const reasonMap: Record<string, string> = {
    'KING_DESTROYED': 'King destroyed',
    'DISCONNECT':     'Opponent disconnected',
    'SURRENDER':      'Surrender',
    'TIMEOUT':        'Timeout',
  };
  const reasonText = reasonMap[extra.reason ?? ''] ?? extra.reason ?? '';
  if (reasonText) {
    this.add.text(width / 2, 410, reasonText, {
      fontSize: '16px', color: '#666688',
    }).setOrigin(0.5);
  }
}

// ADD auto-navigate after 15s (quality of life — player can still click buttons)
this.time.delayedCall(15000, () => {
  this.cameras.main.fadeOut(300, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () =>
    this.scene.start('MainMenuScene')
  );
});
      // Crypto payout info
      if (match.stakeAmount > 0) {
        const payoutMsg = won
          ? `You won ${match.payout.toFixed(4)} AVAX!`
          : `You lost ${match.stakeAmount} AVAX`;
        this.add.text(width / 2, 390, payoutMsg, {
          fontSize: '20px', color: won ? '#f5a623' : '#ff6666',
        }).setOrigin(0.5);
      }
    }

    // Divider
    const line = this.add.graphics();
    line.lineStyle(1, 0x444466, 1);
    line.lineBetween(width / 2 - 200, 450, width / 2 + 200, 450);

    // Play Again button
    const playAgainBtn = this.add.text(width / 2, 510, '[ PLAY AGAIN ]', {
      fontSize: '28px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
// ADD after the existing playAgainBtn block:
const menuBtn = this.add.text(width / 2 + 140, 510, '[ MENU ]', {
  fontSize: '22px', color: '#aaaaaa',
}).setOrigin(0.5).setInteractive({ useHandCursor: true });

menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
menuBtn.on('pointerout',  () => menuBtn.setColor('#aaaaaa'));
menuBtn.on('pointerdown', () => {
  this.cameras.main.fadeOut(200, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () =>
    this.scene.start('MainMenuScene')
  );
});

// Shift Play Again left to make room:
// Change playAgainBtn x from width/2 to width/2 - 80
    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#ffffff'));
    playAgainBtn.on('pointerout',  () => playAgainBtn.setColor('#00ff88'));
    playAgainBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MainMenuScene');
      });
    });

    // Fade in
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }
}