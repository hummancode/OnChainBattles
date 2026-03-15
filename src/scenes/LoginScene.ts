// ============================================================
// LoginScene.ts
// Entry scene: wallet login or guest mode.
// ============================================================

import Phaser from 'phaser';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
import GameState from '../GameState';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

export default class LoginScene extends Phaser.Scene {
  private loginBtn!: MenuButton;
  private guestBtn!: MenuButton;
  private statusText!: Phaser.GameObjects.Text;

  constructor() { super('LoginScene'); }

  create(): void {
    const { width, height } = this.scale;

    // Background
    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(width / 2 - 240, height / 2 - 180, 480, 360, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(width / 2 - 240, height / 2 - 180, 480, 360, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Title
    this.add.text(width / 2, height / 2 - 130, 'OnChainBattles', {
      fontSize: '40px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 85, 'Chess-like On-Chain Card Game', {
      fontSize: '16px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
    }).setOrigin(0.5);

    // Login button
    this.loginBtn = new MenuButton(this, width / 2, height / 2 - 10,
      '[ LOGIN WITH WALLET ]', {
        color: '#00ff88', fontSize: '24px',
        onPointerDown: () => this.handleLogin(),
      },
    );

    // Guest button
    this.guestBtn = new MenuButton(this, width / 2, height / 2 + 50,
      '[ PLAY AS GUEST ]', {
        color: '#4fc3f7', fontSize: '20px',
        onPointerDown: () => this.enterAsGuest(),
      },
    );

    // Status text
    this.statusText = this.add.text(width / 2, height / 2 + 110, '', {
      fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
    }).setOrigin(0.5);

    // If already logged in, show status and skip
    if (AuthManager.isLoggedIn()) {
      const player = AuthManager.getPlayer()!;
      this.statusText.setText(`Logged in: ${player.displayName}`).setColor('#00ff88');
      this.time.delayedCall(500, () => this.goToHub());
    }
  }

  private async handleLogin(): Promise<void> {
    this.loginBtn.setDisabled(true);
    this.guestBtn.setDisabled(true);
    this.statusText.setText('Connecting wallet...').setColor('#f5a623');

    try {
      const player = await AuthManager.login();
      this.statusText.setText(`Welcome, ${player.displayName}!`).setColor('#00ff88');

      // Reload deck with auth (Priority 1 can now succeed)
      DeckLoader.invalidate();
      await DeckLoader.load();

      this.time.delayedCall(600, () => this.goToHub());
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Login failed', { color: '#ff4444' });
      this.loginBtn.setDisabled(false);
      this.guestBtn.setDisabled(false);
      this.statusText.setText('').setColor('#AAAAAA');
    }
  }

  private enterAsGuest(): void {
    this.statusText.setText('Entering as guest...').setColor('#4fc3f7');
    GameState.setPlayerName('Guest');
    this.time.delayedCall(300, () => this.goToHub());
  }

  private goToHub(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }
}
