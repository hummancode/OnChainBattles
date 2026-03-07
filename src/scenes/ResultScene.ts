// ============================================================
// ResultScene.ts
// Shows match result after BattleScene ends.
// Reads GameState.lastMatch + lastMatchExtra + payoutResult.
//
// Handles:
//   - Victory / Defeat / Tie headline
//   - Winner name + reason (King destroyed, Disconnect, etc.)
//   - Turn count
//   - AVAX payout amount + clickable tx link (crypto mode)
//   - Win/loss record
//   - Play Again / Menu buttons
//   - Auto-navigate to MainMenu after 15s
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';

interface MatchExtra {
  reason?: string;
  turnCount?: number;
  winnerName?: string;
}

interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;
    const extra = (GameState as any).lastMatchExtra as MatchExtra | undefined;
    const payoutResult = (GameState as any).payoutResult as PayoutResult | undefined;

    // ── Background ─────────────────────────────────────────────
    if (this.textures.exists('bg_result')) {
      this.add.image(width / 2, height / 2, 'bg_result').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── Title ──────────────────────────────────────────────────
    this.add.text(width / 2, 50, 'OnChainBattles', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── No match data fallback ─────────────────────────────────
    if (!match) {
      this.add.text(width / 2, height / 2, 'Match Complete', {
        fontSize: '48px', color: '#ffffff',
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
    const headlineColor = tie ? '#f5a623' : won ? '#00ff88' : '#ff4444';
    const panelBorder = tie ? 0xf5a623 : won ? 0x00ff88 : 0xff4444;

    // ── Central panel ──────────────────────────────────────────
    const panelW = 600;
    const panelH = 400;
    const panelX = width / 2;
    const panelY = height / 2 - 10;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e, 0.92);
    panelBg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 10);
    panelBg.lineStyle(2, panelBorder, 1);
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 10);

    // ── Headline ───────────────────────────────────────────────
    let yPos = panelY - panelH / 2 + 50;

    this.add.text(panelX, yPos, headline, {
      fontSize: '56px', color: headlineColor, fontStyle: 'bold',
    }).setOrigin(0.5);
    yPos += 70;

    // ── Winner name ────────────────────────────────────────────
    const winnerName = extra?.winnerName
      ?? (won ? match.playerName : match.opponentName)
      ?? '—';

    const winnerLabel = won
      ? `You defeated ${match.opponentName}`
      : tie
        ? `${match.playerName} vs ${match.opponentName}`
        : `${match.opponentName} wins`;

    this.add.text(panelX, yPos, winnerLabel, {
      fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5);
    yPos += 40;

    // ── Reason ─────────────────────────────────────────────────
    if (extra?.reason) {
      const reasonMap: Record<string, string> = {
        'KING_DESTROYED': 'King destroyed',
        'DISCONNECT':     'Opponent disconnected',
        'SURRENDER':      'Surrender',
        'TIMEOUT':        'Timeout',
      };
      const reasonText = reasonMap[extra.reason] ?? extra.reason;
      this.add.text(panelX, yPos, reasonText, {
        fontSize: '16px', color: '#666688',
      }).setOrigin(0.5);
      yPos += 28;
    }

    // ── Turn count ─────────────────────────────────────────────
    if (extra?.turnCount) {
      this.add.text(panelX, yPos, `Turns played: ${extra.turnCount}`, {
        fontSize: '16px', color: '#888899',
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
      fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5);
    yPos += 35;

    // ── Crypto payout info ─────────────────────────────────────
    const isCrypto = GameState.currentMode === GameMode.CryptoPlay
      || (match.stakeAmount != null && match.stakeAmount > 0);

    if (isCrypto) {
      if (won) {
        const payoutAmount = (match.stakeAmount * 2 * 0.95).toFixed(4);
        this.add.text(panelX, yPos, `Payout: ${payoutAmount} AVAX`, {
          fontSize: '20px', color: '#f5a623',
        }).setOrigin(0.5);
        yPos += 30;

        // Tx hash link (clickable)
        const txHash = payoutResult?.txHash;
        if (txHash) {
          const shortHash = txHash.slice(0, 10) + '...' + txHash.slice(-6);
          const txText = this.add.text(panelX, yPos, `TX: ${shortHash}`, {
            fontSize: '14px', color: '#4FC3F7',
          }).setOrigin(0.5).setInteractive({ useHandCursor: true });

          txText.on('pointerover', () => txText.setColor('#ffffff'));
          txText.on('pointerout', () => txText.setColor('#4FC3F7'));
          txText.on('pointerdown', () => {
            window.open(`https://testnet.snowtrace.io/tx/${txHash}`, '_blank');
          });
          yPos += 25;
        } else if (payoutResult && !payoutResult.success) {
          this.add.text(panelX, yPos, `Payout pending...`, {
            fontSize: '14px', color: '#ff6666',
          }).setOrigin(0.5);
          yPos += 25;
        }
      } else if (!tie) {
        this.add.text(panelX, yPos, `You lost ${match.stakeAmount} AVAX`, {
          fontSize: '18px', color: '#ff6666',
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
      fontSize: '26px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#ffffff'));
    playAgainBtn.on('pointerout', () => playAgainBtn.setColor('#00ff88'));
    playAgainBtn.on('pointerdown', () => this.goToMenu());

    // Menu
    const menuBtn = this.add.text(width / 2 + 120, btnY, '[ MENU ]', {
      fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#aaaaaa'));
    menuBtn.on('pointerdown', () => this.goToMenu());
  }

  private addAutoReturn(): void {
    this.time.delayedCall(15000, () => {
      if (!this.scene.isActive('ResultScene')) return;
      this.goToMenu();
    });
  }

  private goToMenu(): void {
    // Clear payout data so it doesn't leak into next match
    (GameState as any).payoutResult = undefined;
    (GameState as any).lastMatchExtra = undefined;

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }
}