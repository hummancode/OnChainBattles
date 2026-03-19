// ============================================================
// LoginScene.ts
// Entry scene: email login, email register, wallet login, or guest.
// ============================================================

import Phaser from 'phaser';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
import GameState from '../GameState';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const FONT = '"Courier New", monospace';

export default class LoginScene extends Phaser.Scene {
  private inputManager!: DOMInputManager;
  private emailInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private statusText!: Phaser.GameObjects.Text;
  private allButtons: MenuButton[] = [];

  constructor() { super('LoginScene'); }

  create(): void {
    this.allButtons = [];
    const { width, height } = this.scale;

    // Skip login UI entirely if session is already restored
    if (AuthManager.isLoggedIn()) {
      console.log('[LoginScene] Session active, skipping to HubScene');
      this.scene.start('HubScene');
      return;
    }

    // Auto-rejoin if guest has an active battle session
    if (AuthManager.isGuest() && GameState.hasBattleSession()) {
      console.log('[LoginScene] Guest battle session found, auto-rejoining...');
      GameState.restoreBattleSession();
      this.scene.start('BattleScene');
      return;
    }

    // Background
    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.90);
    panel.fillRoundedRect(width / 2 - 260, height / 2 - 240, 520, 480, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(width / 2 - 260, height / 2 - 240, 520, 480, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    const cx = width / 2;
    let y = height / 2 - 195;

    // Title
    this.add.text(cx, y, 'OnChainBattles', {
      fontSize: '36px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);
    y += 35;

    this.add.text(cx, y, 'Chess-like On-Chain Card Game', {
      fontSize: '14px', fontFamily: FONT, color: '#777777',
    }).setOrigin(0.5);
    y += 45;

    // ── Email / Password Inputs ─────────────────────────────
    this.inputManager = new DOMInputManager(this);

    this.emailInput = this.inputManager.createInput({
      gameX: cx, gameY: y, width: 340, height: 36,
      placeholder: 'Email address', maxLength: 254,
    });
    y += 48;

    this.passwordInput = this.inputManager.createInput({
      gameX: cx, gameY: y, width: 340, height: 36,
      placeholder: 'Password (min 8 chars)', maxLength: 128,
    });
    this.passwordInput.type = 'password';

    this.passwordInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.handleEmailLogin();
    });
    y += 50;

    // ── Email Buttons ───────────────────────────────────────
    const loginBtn = new MenuButton(this, cx - 80, y, '[ LOG IN ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: () => this.handleEmailLogin(),
    });
    this.allButtons.push(loginBtn);

    const registerBtn = new MenuButton(this, cx + 80, y, '[ REGISTER ]', {
      color: '#4fc3f7', fontSize: '20px',
      onPointerDown: () => this.handleRegister(),
    });
    this.allButtons.push(registerBtn);
    y += 50;

    // ── Divider ─────────────────────────────────────────────
    this.add.text(cx, y, '── or ──', {
      fontSize: '12px', fontFamily: FONT, color: '#444444',
    }).setOrigin(0.5);
    y += 35;

    // ── Wallet Login ────────────────────────────────────────
    const walletBtn = new MenuButton(this, cx, y, '[ LOGIN WITH WALLET ]', {
      color: '#f5a623', fontSize: '20px',
      onPointerDown: () => this.handleWalletLogin(),
    });
    this.allButtons.push(walletBtn);
    y += 50;

    // ── Guest ───────────────────────────────────────────────
    const guestBtn = new MenuButton(this, cx, y, '[ PLAY AS GUEST ]', {
      color: '#777777', fontSize: '16px',
      onPointerDown: () => this.enterAsGuest(),
    });
    this.allButtons.push(guestBtn);
    y += 40;

    // ── Status Text ─────────────────────────────────────────
    this.statusText = this.add.text(cx, y, '', {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }).setOrigin(0.5);

    this.events.once('shutdown', () => {
      this.inputManager?.destroyAll();
    });
  }

  // ─── Auth Handlers ────────────────────────────────────────

  private async handleEmailLogin(): Promise<void> {
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    if (!email || !password) {
      ToastNotification.show(this, 'Enter email and password', { color: '#ff4444' });
      return;
    }

    this.disableAll();
    this.statusText.setText('Logging in...').setColor('#f5a623');

    try {
      const player = await AuthManager.loginWithEmail(email, password);
      this.statusText.setText(`Welcome, ${player.displayName}!`).setColor('#00ff88');
      DeckLoader.invalidate();
      await DeckLoader.load();
      this.time.delayedCall(600, () => this.goToHub());
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Login failed', { color: '#ff4444' });
      this.enableAll();
      this.statusText.setText('');
    }
  }

  private async handleRegister(): Promise<void> {
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email) {
      ToastNotification.show(this, 'Enter an email address', { color: '#ff4444' });
      return;
    }
    if (password.length < 8) {
      ToastNotification.show(this, 'Password must be at least 8 characters', { color: '#ff4444' });
      return;
    }

    this.disableAll();
    this.statusText.setText('Creating account...').setColor('#f5a623');

    try {
      const player = await AuthManager.register(email, password);
      this.statusText.setText(`Welcome, ${player.displayName}!`).setColor('#00ff88');
      DeckLoader.invalidate();
      await DeckLoader.load();
      this.time.delayedCall(600, () => this.goToHub());
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Registration failed', { color: '#ff4444' });
      this.enableAll();
      this.statusText.setText('');
    }
  }

  private async handleWalletLogin(): Promise<void> {
    this.disableAll();
    this.statusText.setText('Connecting wallet...').setColor('#f5a623');

    try {
      const player = await AuthManager.login();
      this.statusText.setText(`Welcome, ${player.displayName}!`).setColor('#00ff88');
      DeckLoader.invalidate();
      await DeckLoader.load();
      this.time.delayedCall(600, () => this.goToHub());
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Wallet login failed', { color: '#ff4444' });
      this.enableAll();
      this.statusText.setText('');
    }
  }

  private enterAsGuest(): void {
    this.statusText.setText('Entering as guest...').setColor('#4fc3f7');
    GameState.setPlayerName('Guest');
    AuthManager.enterAsGuest();
    this.time.delayedCall(300, () => this.goToHub());
  }

  // ─── Helpers ──────────────────────────────────────────────

  private disableAll(): void {
    for (const btn of this.allButtons) btn.setDisabled(true);
  }

  private enableAll(): void {
    for (const btn of this.allButtons) btn.setDisabled(false);
  }

  private goToHub(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }
}
