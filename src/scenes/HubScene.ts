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
import { CRYPTO_ENABLED } from '../config/features';
import { getBotDifficulty, setBotDifficulty, botName } from '../ui/botPrefs';
import type { BotDifficulty } from '../game/ai/SimpleBot';
import { ShareHelper } from '../ui/ShareHelper';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

export default class HubScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private botOverlay?: Phaser.GameObjects.Container;
  private botKeys?: AbortController;
  private inputManager?: DOMInputManager;
  /** Keyboard shortcuts of the open dialog (host / join) — aborted when it closes. */
  private joinKeys?: AbortController;
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
    const isAuth = AuthManager.isLoggedIn();
    const player = isAuth ? AuthManager.getPlayer()! : null;
    const displayName = player?.displayName || GameState.playerName || 'Guest';

    // Wallet/email badge
    let badge = '';
    if (CRYPTO_ENABLED && player?.wallet) badge = ` (${player.wallet.slice(0, 6)}...)`;
    else if (player?.email) badge = ` (${player.email})`;

    this.add.text(CX, 75, `Welcome, ${displayName}${badge}`, {
      fontSize: '18px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    // Tier badge
    if (isAuth) {
      const tierLabels = ['Guest', 'Free Player', 'Economy'];
      const tierColors = ['#AAAAAA', '#4fc3f7', '#f5a623'];
      const tier = player!.accountTier ?? 1;
      this.add.text(CX, 102, tierLabels[tier] ?? 'Free Player', {
        fontSize: '12px', fontFamily: '"Courier New", monospace', color: tierColors[tier] ?? '#4fc3f7',
      }).setOrigin(0.5);
    } else {
      this.add.text(CX, 102, 'Guest Mode', {
        fontSize: '12px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
      }).setOrigin(0.5);
    }

    // Action buttons row: profile/logout/login
    if (isAuth) {
      new MenuButton(this, CX - 80, 128, '[ Profile ]', {
        color: '#4fc3f7', fontSize: '12px', fontStyle: 'normal',
        onPointerDown: () => this.goToProfile(),
      });
      new MenuButton(this, CX + 80, 128, '[ Logout ]', {
        color: '#777777', fontSize: '12px', fontStyle: 'normal',
        onPointerDown: () => this.handleLogout(),
      });
    } else {
      new MenuButton(this, CX, 128, '[ Log In ]', {
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

    new MenuButton(this, CX, y += gap, '[ PUZZLES ]', {
      color: '#e67e22', fontSize: '22px',
      onPointerDown: () => this.goToPuzzles(),
    });

    // Offline: practice vs the bot / guided tutorial (no server needed)
    y += gap;
    new MenuButton(this, CX - 125, y, '[ PRACTICE VS BOT ]', {
      color: '#b388ff', fontSize: '18px',
      onPointerDown: () => this.showBotOverlay(),
    });
    new MenuButton(this, CX + 130, y, '[ TUTORIAL ]', {
      color: '#FFD54F', fontSize: '18px',
      onPointerDown: () => this.startBotMatch(true),
    });


    // W/L record
    if (GameState.winCount + GameState.lossCount > 0) {
      this.add.text(CX, y + 45, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#777777',
      }).setOrigin(0.5);
    }

    // Last match banner
    if (GameState.lastMatch) {
      const m = GameState.lastMatch;
      const color = m.isTie ? '#dddddd' : m.playerWon ? '#00ff88' : '#ff6666';
      const text = m.isTie ? `Last: draw vs ${m.opponentName} (${m.turns} turns)` : m.playerWon
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

    // Invite link (?room=CODE): open the join dialog prefilled, once.
    const invited = ShareHelper.getRoomCodeFromURL();
    if (invited) {
      ShareHelper.clearRoomCodeFromURL();
      this.time.delayedCall(450, () => this.showJoinOverlay(invited));
    }

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

    if (CRYPTO_ENABLED) {
    const cryptoBtn = this.add.text(CX, 360, '[ FREE PLAY ]', {
      fontSize: '18px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cryptoBtn.on('pointerdown', () => {
      isCrypto = !isCrypto;
      cryptoBtn.setText(isCrypto ? '[ CRYPTO MODE ]' : '[ FREE PLAY ]');
      cryptoBtn.setColor(isCrypto ? '#f5a623' : '#4fc3f7');
    });
    this.hostOverlay.add(cryptoBtn);
    } else {
      this.hostOverlay.add(this.add.text(CX, 362, 'Free play · share the room code or INVITE link', {
        fontSize: '12px', fontFamily: '"Courier New", monospace', color: '#8899AA',
      }).setOrigin(0.5));
    }

    // Create button
    const submitCreate = () => {
      const roomName = nameInput.value.trim() || `${GameState.playerName}'s Room`;
      this.lobbySM.createRoom(GameState.playerName || 'Player', {
        isPublic,
        isCrypto,
        roomName,
        stakeAmount: isCrypto ? 0.01 : 0,
      });
      this.hideHostOverlay();
    };

    // Enter = create, Esc = cancel (listener removed in hideHostOverlay via abort)
    this.joinKeys?.abort();
    this.joinKeys = new AbortController();
    nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); submitCreate(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.hideHostOverlay(); }
    }, { signal: this.joinKeys.signal });
    setTimeout(() => nameInput.focus(), 0);

    const createBtn = new MenuButton(this, CX - 70, 420, '[ CREATE ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: submitCreate,
    });
    this.hostOverlay.add(createBtn.text);

    // Cancel
    const cancelBtn = new MenuButton(this, CX + 70, 420, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '20px',
      onPointerDown: () => this.hideHostOverlay(),
    });
    this.hostOverlay.add(cancelBtn.text);
  }

  /** Offline match against SimpleBot (optionally the guided tutorial). */
  private startBotMatch(tutorial: boolean, difficulty: BotDifficulty = 'easy'): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName || 'You',
        opponentName: tutorial ? 'Tutor Bot' : botName(difficulty),
        isCryptoMode: false,
        roomCode: '',
        vsBot: { tutorial, difficulty },
      });
    });
  }

  /** Practice: pick Easy / Normal / Hard (last choice remembered and highlighted). */
  private showBotOverlay(): void {
    if (this.botOverlay) return;
    const { width, height } = this.scale;
    const o = this.add.container(0, 0).setDepth(50);
    this.botOverlay = o;
    o.add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setInteractive());
    const g = this.add.graphics();
    g.fillStyle(0x16213e, 0.95); g.fillRoundedRect(CX - 250, 230, 500, 240, 10);
    g.lineStyle(2, 0xb388ff, 0.6); g.strokeRoundedRect(CX - 250, 230, 500, 240, 10);
    o.add(g);
    o.add(this.add.text(CX, 258, 'Practice vs Bot', {
      fontSize: '20px', fontFamily: '"Courier New", monospace', fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    const last = getBotDifficulty();
    const levels: Array<{ d: BotDifficulty; label: string; hint: string; color: string }> = [
      { d: 'easy',   label: 'EASY',   hint: 'Greedy: always attacks, never plans', color: '#8BC34A' },
      { d: 'normal', label: 'NORMAL', hint: 'Weighs trades, protects its King',    color: '#4fc3f7' },
      { d: 'hard',   label: 'HARD',   hint: 'Avoids danger, sets up attacks',       color: '#FF7043' },
    ];
    levels.forEach((l, i) => {
      const y = 305 + i * 46;
      const btn = new MenuButton(this, CX - 130, y, l.d === last ? `> ${l.label} <` : `[ ${l.label} ]`, {
        color: l.color, fontSize: '20px',
        onPointerDown: () => { setBotDifficulty(l.d); this.hideBotOverlay(); this.startBotMatch(false, l.d); },
      });
      o.add(btn.text);
      o.add(this.add.text(CX - 40, y, l.hint, {
        fontSize: '12px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
      }).setOrigin(0, 0.5));
    });
    const cancel = new MenuButton(this, CX, 440, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '16px', onPointerDown: () => this.hideBotOverlay(),
    });
    o.add(cancel.text);
    this.botKeys = new AbortController();
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hideBotOverlay();
    }, { signal: this.botKeys.signal });
  }

  private hideBotOverlay(): void {
    this.botKeys?.abort();
    this.botKeys = undefined;
    this.botOverlay?.destroy();
    this.botOverlay = undefined;
  }

  private hideHostOverlay(): void {
    this.joinKeys?.abort();
    this.joinKeys = undefined;
    this.inputManager?.destroyAll();
    this.inputManager = undefined;
    this.hostOverlay?.destroy();
    this.hostOverlay = undefined;
  }

  // ─── Join Overlay ──────────────────────────────────────────

  private showJoinOverlay(prefill = ''): void {
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
    if (prefill) codeInput.value = prefill;

    const submitJoin = () => {
      const code = codeInput.value.trim();
      if (code.length < 4) {
        ToastNotification.show(this, 'Enter a room code', { color: '#ff4444' });
        return;
      }
      this.lobbySM.joinRoom(code, GameState.playerName || 'Guest');
      this.hideJoinOverlay();
    };

    // Enter = join, Esc = cancel (removed in hideJoinOverlay via abort)
    this.joinKeys = new AbortController();
    codeInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); submitJoin(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.hideJoinOverlay(); }
    }, { signal: this.joinKeys.signal });
    setTimeout(() => codeInput.focus(), 0);

    const joinBtn = new MenuButton(this, CX - 60, 385, '[ JOIN ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: submitJoin,
    });
    this.joinOverlay.add(joinBtn.text);

    const cancelBtn = new MenuButton(this, CX + 60, 385, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '20px',
      onPointerDown: () => this.hideJoinOverlay(),
    });
    this.joinOverlay.add(cancelBtn.text);
  }

  private hideJoinOverlay(): void {
    this.joinKeys?.abort();
    this.joinKeys = undefined;
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

  private goToProfile(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ProfileScene');
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

  private goToPuzzles(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('PuzzleScene');
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
    this.hideBotOverlay();
  }
}
