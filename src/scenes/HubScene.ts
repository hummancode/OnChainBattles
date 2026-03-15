// ============================================================
// HubScene.ts
// Central hub: navigate to host, browse, join, deck builder,
// or legacy quick play.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
import { LobbySocketManager } from '../lobby/LobbySocketManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

export default class HubScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private inputManager?: DOMInputManager;
  private joinOverlay?: Phaser.GameObjects.Container;
  private hostOverlay?: Phaser.GameObjects.Container;
  private transitioning = false;

  constructor() { super('HubScene'); }

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
    panel.fillRoundedRect(CX - 280, 40, 560, 620, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(CX - 280, 40, 560, 620, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Identity bar
    const displayName = AuthManager.isLoggedIn()
      ? AuthManager.getPlayer()!.displayName
      : GameState.playerName || 'Guest';
    const walletBadge = AuthManager.isLoggedIn()
      ? ` (${AuthManager.getPlayer()!.wallet.slice(0, 6)}...)`
      : '';

    this.add.text(CX, 75, `Welcome, ${displayName}${walletBadge}`, {
      fontSize: '18px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    const statusColor = AuthManager.isLoggedIn() ? '#00ff88' : '#AAAAAA';
    const statusLabel = AuthManager.isLoggedIn() ? 'Authenticated' : 'Guest Mode';
    this.add.text(CX, 102, statusLabel, {
      fontSize: '12px', fontFamily: '"Courier New", monospace', color: statusColor,
    }).setOrigin(0.5);

    // Logout / Login button
    if (AuthManager.isLoggedIn()) {
      new MenuButton(this, CX, 128, '[ Logout ]', {
        color: '#777777', fontSize: '12px', fontStyle: 'normal',
        onPointerDown: () => this.handleLogout(),
      });
    } else {
      new MenuButton(this, CX, 128, '[ Login with Wallet ]', {
        color: '#4fc3f7', fontSize: '12px', fontStyle: 'normal',
        onPointerDown: () => this.goToLogin(),
      });
    }

    // ── Main Buttons ────────────────────────────────────────
    let y = 170;
    const gap = 65;

    new MenuButton(this, CX, y, '[ HOST A GAME ]', {
      color: '#00ff88', fontSize: '24px',
      onPointerDown: () => this.showHostOverlay(),
    });

    new MenuButton(this, CX, y += gap, '[ BROWSE GAMES ]', {
      color: '#4fc3f7', fontSize: '22px',
      onPointerDown: () => this.goToBrowse(),
    });

    new MenuButton(this, CX, y += gap, '[ JOIN BY CODE ]', {
      color: '#4fc3f7', fontSize: '22px',
      onPointerDown: () => this.showJoinOverlay(),
    });

    new MenuButton(this, CX, y += gap, '[ DECK BUILDER ]', {
      color: '#f5a623', fontSize: '22px',
      onPointerDown: () => this.goToDeckBuilder(),
    });

    new MenuButton(this, CX, y += gap + 20, '[ QUICK PLAY (LEGACY) ]', {
      color: '#777777', fontSize: '16px',
      onPointerDown: () => this.goToLegacy(),
    });

    // W/L record
    if (GameState.winCount + GameState.lossCount > 0) {
      this.add.text(CX, y + gap, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#777777',
      }).setOrigin(0.5);
    }

    // Last match banner
    if (GameState.lastMatch) {
      const m = GameState.lastMatch;
      const color = m.playerWon ? '#00ff88' : '#ff6666';
      const text = m.playerWon
        ? `Last: You beat ${m.opponentName} (${m.turns} turns)`
        : `Last: ${m.opponentName} beat you (${m.turns} turns)`;
      this.add.text(CX, 610, text, {
        fontSize: '13px', fontFamily: '"Courier New", monospace', color,
      }).setOrigin(0.5);
    }

    // Connect socket for lobby (no auto-room)
    SocketManager.connectOnly({
      onError: (msg) => ToastNotification.show(this, msg, { color: '#ff4444' }),
    });

    // Setup lobby socket manager
    this.lobbySM = new LobbySocketManager({
      onCreated: (code) => {
        this.goToLobby(code, true);
      },
      onJoined: (code) => {
        this.goToLobby(code, false);
      },
      onError: (msg) => {
        ToastNotification.show(this, msg, { color: '#ff4444' });
      },
    });
    this.lobbySM.attach();

    this.events.once('shutdown', () => {
      this.cleanup();
      this.transitioning = false;
    });
  }

  // ─── Host Overlay ──────────────────────────────────────────

  private showHostOverlay(): void {
    if (this.hostOverlay) return;
    const { width, height } = this.scale;

    this.hostOverlay = this.add.container(0, 0);

    // Dimmer
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setInteractive();
    this.hostOverlay.add(dim);

    // Panel
    const g = this.add.graphics();
    g.fillStyle(0x16213e, 0.95);
    g.fillRoundedRect(CX - 200, 180, 400, 300, 10);
    g.lineStyle(2, 0x4fc3f7, 0.6);
    g.strokeRoundedRect(CX - 200, 180, 400, 300, 10);
    this.hostOverlay.add(g);

    this.hostOverlay.add(this.add.text(CX, 210, 'Host Settings', {
      fontSize: '22px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    // Room name input
    this.inputManager = new DOMInputManager(this);
    const nameInput = this.inputManager.createInput({
      gameX: CX, gameY: 270, width: 300, height: 36,
      placeholder: 'Room name...',
      maxLength: 30,
    });
    nameInput.value = `${GameState.playerName || 'Player'}'s Room`;

    // Toggles (simple text toggles)
    let isPublic = true;
    let isCrypto = false;

    const publicBtn = this.add.text(CX, 320, '[ PUBLIC ]', {
      fontSize: '18px', fontFamily: '"Courier New", monospace', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    publicBtn.on('pointerdown', () => {
      isPublic = !isPublic;
      publicBtn.setText(isPublic ? '[ PUBLIC ]' : '[ PRIVATE ]');
      publicBtn.setColor(isPublic ? '#00ff88' : '#f5a623');
    });
    this.hostOverlay.add(publicBtn);

    const cryptoBtn = this.add.text(CX, 360, '[ FREE PLAY ]', {
      fontSize: '18px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cryptoBtn.on('pointerdown', () => {
      isCrypto = !isCrypto;
      cryptoBtn.setText(isCrypto ? '[ CRYPTO MODE ]' : '[ FREE PLAY ]');
      cryptoBtn.setColor(isCrypto ? '#f5a623' : '#4fc3f7');
    });
    this.hostOverlay.add(cryptoBtn);

    // Create button
    const createBtn = new MenuButton(this, CX - 70, 420, '[ CREATE ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: () => {
        const roomName = nameInput.value.trim() || `${GameState.playerName}'s Room`;
        this.lobbySM.createRoom(GameState.playerName || 'Player', {
          isPublic,
          isCrypto,
          roomName,
          stakeAmount: isCrypto ? 0.01 : 0,
        });
        this.hideHostOverlay();
      },
    });
    this.hostOverlay.add(createBtn.text);

    // Cancel
    const cancelBtn = new MenuButton(this, CX + 70, 420, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '20px',
      onPointerDown: () => this.hideHostOverlay(),
    });
    this.hostOverlay.add(cancelBtn.text);
  }

  private hideHostOverlay(): void {
    this.inputManager?.destroyAll();
    this.inputManager = undefined;
    this.hostOverlay?.destroy();
    this.hostOverlay = undefined;
  }

  // ─── Join Overlay ──────────────────────────────────────────

  private showJoinOverlay(): void {
    if (this.joinOverlay) return;
    const { width, height } = this.scale;

    this.joinOverlay = this.add.container(0, 0);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setInteractive();
    this.joinOverlay.add(dim);

    const g = this.add.graphics();
    g.fillStyle(0x16213e, 0.95);
    g.fillRoundedRect(CX - 180, 250, 360, 180, 10);
    g.lineStyle(2, 0x4fc3f7, 0.6);
    g.strokeRoundedRect(CX - 180, 250, 360, 180, 10);
    this.joinOverlay.add(g);

    this.joinOverlay.add(this.add.text(CX, 275, 'Join by Room Code', {
      fontSize: '20px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    this.inputManager = new DOMInputManager(this);
    const codeInput = this.inputManager.createInput({
      gameX: CX, gameY: 325, width: 200, height: 40,
      placeholder: '6-digit code', maxLength: 6, uppercase: true,
    });

    const joinBtn = new MenuButton(this, CX - 60, 385, '[ JOIN ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: () => {
        const code = codeInput.value.trim();
        if (code.length < 4) {
          ToastNotification.show(this, 'Enter a room code', { color: '#ff4444' });
          return;
        }
        this.lobbySM.joinRoom(code, GameState.playerName || 'Guest');
        this.hideJoinOverlay();
      },
    });
    this.joinOverlay.add(joinBtn.text);

    const cancelBtn = new MenuButton(this, CX + 60, 385, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '20px',
      onPointerDown: () => this.hideJoinOverlay(),
    });
    this.joinOverlay.add(cancelBtn.text);
  }

  private hideJoinOverlay(): void {
    this.inputManager?.destroyAll();
    this.inputManager = undefined;
    this.joinOverlay?.destroy();
    this.joinOverlay = undefined;
  }

  // ─── Navigation ────────────────────────────────────────────

  private goToLobby(roomCode: string, isHost: boolean): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LobbyScene', { roomCode, isHost });
    });
  }

  private goToBrowse(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RoomBrowserScene');
    });
  }

  private goToDeckBuilder(): void {
    if (!AuthManager.isLoggedIn()) {
      ToastNotification.show(this, 'Login required for deck builder', { color: '#f5a623' });
      return;
    }
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('DeckBuilderScene');
    });
  }

  private goToLegacy(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }

  private handleLogout(): void {
    AuthManager.logout();
    DeckLoader.invalidate();
    GameState.setPlayerName('Guest');
    ToastNotification.show(this, 'Logged out', { color: '#AAAAAA' });
    // Restart HubScene to refresh identity bar
    this.scene.restart();
  }

  private goToLogin(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LoginScene');
    });
  }

  private cleanup(): void {
    this.lobbySM?.detach();
    this.inputManager?.destroyAll();
  }
}
