// ============================================================
// ResultScene.ts
// Shows match result after BattleScene ends.
// Reads GameState.lastMatch + payoutResult.
//
// Handles:
//   - Victory / Defeat / Tie headline
//   - Dynamic mode badge (FREE PLAY / CRYPTO PLAY + stake)
//   - Winner name + reason (King destroyed, Disconnect, etc.)
//   - Turn count
//   - AVAX payout amount + clickable tx link (crypto mode)
//   - Win/loss record
//   - Play Again / Menu buttons
//   - Auto-navigate to MainMenu after 15s
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';

export default class ResultScene extends Phaser.Scene {
  private autoReturnTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;
    const payoutResult = GameState.payoutResult;

    // ── Background ─────────────────────────────────────────────
    if (this.textures.exists('bg_result')) {
      this.add.image(width / 2, height / 2, 'bg_result').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── No match data fallback ─────────────────────────────────
    if (!match) {
      const fbPanel = this.add.graphics();
      fbPanel.fillStyle(0x16213e, 0.62);
      fbPanel.fillRoundedRect(width / 2 - 300, 30, 600, 660, 10);
      fbPanel.lineStyle(2, 0xaaaaaa, 0.8);
      fbPanel.strokeRoundedRect(width / 2 - 300, 30, 600, 660, 10);

      this.add.text(width / 2, 60, 'OnChainBattles', {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(width / 2, height / 2, 'Match Complete', {
        fontSize: '48px', color: '#FFFFFF',
      }).setOrigin(0.5);

      this.addNavigationButtons(width, height);
      this.addAutoReturn();
      this.cameras.main.fadeIn(300, 0, 0, 0);
      return;
    }

    // ── Outcome ────────────────────────────────────────────────
    const won = match.playerWon;
    const tie = match.isTie;

    const headline = tie ? "It's a Tie!" : won ? 'Victory!' : 'Defeat';
    const headlineColor = tie ? '#F5A623' : won ? '#00FF88' : '#FF4444';
    const panelBorder = tie ? 0xf5a623 : won ? 0x00ff88 : 0xff4444;

    // ── Central panel ──────────────────────────────────────────
    const panelW = 600;
    const panelH = 660;
    const panelX = width / 2;
    const panelTop = 30;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e, 0.72);
    panelBg.fillRoundedRect(panelX - panelW / 2, panelTop, panelW, panelH, 10);
    panelBg.lineStyle(2, panelBorder, 0.8);
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelTop, panelW, panelH, 10);

    // ── Title ──────────────────────────────────────────────────
    let yPos = panelTop + 30;

    this.add.text(panelX, yPos, 'OnChainBattles', {
      fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
    }).setOrigin(0.5);
    yPos += 36;

    // ── Mode badge (FREE PLAY / CRYPTO) ────────────────────────
    const isCrypto = GameState.currentMode === GameMode.CryptoPlay;

    const modeLabel = isCrypto
      ? `CRYPTO PLAY  ·  Staked: ${match.stakeAmount} AVAX each`
      : 'FREE PLAY';
    const modeColor = isCrypto ? '#F5A623' : '#00FF88';

    this.add.text(panelX, yPos, modeLabel, {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: modeColor,
    }).setOrigin(0.5);
    yPos += 34;

    // ── Headline ───────────────────────────────────────────────
    this.add.text(panelX, yPos, headline, {
      fontSize: '56px', color: headlineColor, fontStyle: 'bold',
    }).setOrigin(0.5);
    yPos += 70;

    // ── Winner name ────────────────────────────────────────────
    const winnerLabel = won
      ? `You defeated ${match.opponentName}`
      : tie
        ? `${match.playerName} vs ${match.opponentName}`
        : `${match.opponentName} wins`;

    this.add.text(panelX, yPos, winnerLabel, {
      fontSize: '22px', color: '#AAAAAA',
    }).setOrigin(0.5);
    yPos += 40;

    // ── Reason ─────────────────────────────────────────────────
    if (match.reason) {
      const reasonMap: Record<string, string> = {
        'KING_DESTROYED': 'King destroyed',
        'DISCONNECT':     'Opponent disconnected',
        'SURRENDER':      'Surrender',
        'TIMEOUT':        'Timeout',
      };
      const reasonText = reasonMap[match.reason] ?? match.reason;
      this.add.text(panelX, yPos, reasonText, {
        fontSize: '16px', color: '#AAAAAA',
      }).setOrigin(0.5);
      yPos += 28;
    }

    // ── Turn count ─────────────────────────────────────────────
    if (match.turns > 0) {
      this.add.text(panelX, yPos, `Turns played: ${match.turns}`, {
        fontSize: '16px', color: '#AAAAAA',
      }).setOrigin(0.5);
      yPos += 30;
    }

    // ── Divider ────────────────────────────────────────────────
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x444466, 0.6);
    divider.lineBetween(panelX - 200, yPos, panelX + 200, yPos);
    yPos += 20;

    // ── Win/Loss record ────────────────────────────────────────
    this.add.text(panelX, yPos, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
      fontSize: '18px', color: '#FFFFFF',
    }).setOrigin(0.5);
    yPos += 35;

    // ── Crypto payout info (only in crypto mode) ───────────────
    if (isCrypto) {
      if (won) {
        const payoutAmount = (match.stakeAmount * 2 * 0.95).toFixed(4);
        this.add.text(panelX, yPos, `Payout: ${payoutAmount} AVAX`, {
          fontSize: '20px', color: '#F5A623',
        }).setOrigin(0.5);
        yPos += 30;

        // Tx hash link (clickable)
        const txHash = payoutResult?.txHash;
        if (txHash) {
          const shortHash = txHash.slice(0, 10) + '...' + txHash.slice(-6);
          const txText = this.add.text(panelX, yPos, `TX: ${shortHash}`, {
            fontSize: '14px', color: '#4FC3F7',
          }).setOrigin(0.5).setInteractive({ useHandCursor: true });

          txText.on('pointerover', () => txText.setColor('#FFFFFF'));
          txText.on('pointerout', () => txText.setColor('#4FC3F7'));
          txText.on('pointerdown', () => {
            window.open(`https://testnet.snowtrace.io/tx/${txHash}`, '_blank');
          });
          yPos += 25;
        } else if (payoutResult && !payoutResult.success) {
          this.add.text(panelX, yPos, 'Payout pending...', {
            fontSize: '14px', color: '#FF6666',
          }).setOrigin(0.5);
          yPos += 25;
        }
      } else if (!tie) {
        this.add.text(panelX, yPos, `You lost ${match.stakeAmount} AVAX`, {
          fontSize: '18px', color: '#FF6666',
        }).setOrigin(0.5);
        yPos += 30;
      }
    }

    // ── Navigation buttons ─────────────────────────────────────
    this.addNavigationButtons(width, height);

    // ── Auto-return timer ──────────────────────────────────────
    this.addAutoReturn();

    // ── Fade in ────────────────────────────────────────────────
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  // ─── HELPERS ───────────────────────────────────────────────

  private addNavigationButtons(width: number, height: number): void {
    const btnY = height - 80;

    // Play Again
    const playAgainBtn = this.add.text(width / 2 - 100, btnY, '[ PLAY AGAIN ]', {
      fontSize: '26px', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#FFFFFF'));
    playAgainBtn.on('pointerout', () => playAgainBtn.setColor('#00FF88'));
    playAgainBtn.on('pointerdown', () => this.goToMenu());

    // Menu
    const menuBtn = this.add.text(width / 2 + 120, btnY, '[ MENU ]', {
      fontSize: '22px', color: '#AAAAAA',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#FFFFFF'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#AAAAAA'));
    menuBtn.on('pointerdown', () => this.goToMenu());
  }

  private addAutoReturn(): void {
    this.autoReturnTimer = this.time.delayedCall(15000, () => {
      if (!this.scene.isActive('ResultScene')) return;
      this.goToMenu();
    });
  }

  shutdown(): void {
    if (this.autoReturnTimer) {
      this.autoReturnTimer.destroy();
      this.autoReturnTimer = undefined;
    }
  }

  private goToMenu(): void {
    GameState.clearMatchData();

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }
}
