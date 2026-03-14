# Step 5 Patch: Client Lobby Scenes

**Git branch:** `feat/step5-client-lobby-scenes`
**Estimated time:** 6–8 hours
**Prerequisites:** Steps 1–4 (shared types, server lobby, client auth/deck)
**Verification:** `npx tsc --noEmit` after each sub-step

---

## Sub-step 5.1: `src/lobby/LobbySocketManager.ts`

> One job: Typed wrapper for `lobby:*` socket events.
> Uses `SocketManager.getSocket()` from Step 1 — no private field access.
> ~120 LOC.

📁 **NEW FILE:** `src/lobby/LobbySocketManager.ts`

```typescript
// ============================================================
// LobbySocketManager.ts
// Typed wrapper for lobby: namespaced socket events.
// Attaches listeners to the existing SocketManager connection.
// Does NOT create a second socket — just adds lobby events.
// ============================================================

import SocketManager from '../network/SocketManager';
import type { Socket } from 'socket.io-client';
import type {
  LobbyState, PublicRoomListing, ChatMessage,
  GameStartingData, RoomSettings,
} from '../../shared/types/NetworkEvents';

type AnyFn = (...args: unknown[]) => void;

class LobbySocketManagerClass {
  private listeners: Array<{ event: string; fn: AnyFn }> = [];

  private socket(): Socket | null {
    return SocketManager.getSocket() as Socket | null;
  }

  private on(event: string, fn: AnyFn): void {
    const s = this.socket();
    if (!s) { console.warn('[LobbySocket] No socket.'); return; }
    s.on(event, fn);
    this.listeners.push({ event, fn });
  }

  private emit(event: string, data?: unknown): void {
    const s = this.socket();
    if (!s) { console.warn('[LobbySocket] No socket.'); return; }
    s.emit(event, data);
  }

  // ─── Outgoing (client → server) ─────────────────────────

  createRoom(playerName: string, settings: Partial<RoomSettings> = {}): void {
    this.emit('lobby:create', { playerName, settings });
  }

  joinRoom(roomCode: string, playerName: string, password?: string): void {
    this.emit('lobby:join', { roomCode, playerName, password });
  }

  leaveRoom(roomCode: string): void {
    this.emit('lobby:leave', { roomCode });
  }

  requestRoomList(): void {
    this.emit('lobby:list');
  }

  sendChat(roomCode: string, text: string): void {
    this.emit('lobby:chat', { roomCode, text });
  }

  toggleReady(roomCode: string): void {
    this.emit('lobby:ready', { roomCode });
  }

  kickPlayer(roomCode: string, targetPlayerName: string): void {
    this.emit('lobby:kick', { roomCode, targetPlayerName });
  }

  updateSettings(roomCode: string, settings: Partial<RoomSettings>): void {
    this.emit('lobby:settings', { roomCode, settings });
  }

  startGame(roomCode: string): void {
    this.emit('lobby:start_game', { roomCode });
  }

  signalCryptoReady(roomCode: string): void {
    this.emit('lobby:crypto_ready', { roomCode });
  }

  submitDeck(roomCode: string, deckIds: string[]): void {
    this.emit('lobby:deck_submitted', { roomCode, deckIds });
  }

  // ─── Incoming (server → client) ─────────────────────────

  onCreated(fn: (data: { code: string }) => void): void { this.on('lobby:created', fn); }
  onJoined(fn: (data: { code: string }) => void): void { this.on('lobby:joined', fn); }
  onStateUpdate(fn: (state: LobbyState) => void): void { this.on('lobby:state', fn); }
  onRoomList(fn: (data: { rooms: PublicRoomListing[] }) => void): void { this.on('lobby:room_list', fn); }
  onChatMessage(fn: (msg: ChatMessage) => void): void { this.on('lobby:chat_message', fn); }
  onSystemMessage(fn: (data: { text: string; timestamp: number }) => void): void { this.on('lobby:system_message', fn); }
  onKicked(fn: (data: { reason: string }) => void): void { this.on('lobby:kicked', fn); }
  onGameStarting(fn: (data: GameStartingData) => void): void { this.on('lobby:game_starting', fn); }
  onError(fn: (data: { message: string }) => void): void { this.on('lobby:error', fn); }
  onDepositPhase(fn: (data: { stakeAmount: number }) => void): void { this.on('lobby:deposit_phase', fn); }
  onOpponentDeposited(fn: () => void): void { this.on('lobby:opponent_deposited', fn); }
  onBothDeposited(fn: () => void): void { this.on('lobby:both_deposited', fn); }
  onSubmitDecks(fn: () => void): void { this.on('lobby:submit_decks', fn); }
  onPasswordRequired(fn: (data: { roomCode: string }) => void): void { this.on('lobby:password_required', fn); }

  // ─── Cleanup ────────────────────────────────────────────

  removeAllListeners(): void {
    const s = this.socket();
    if (!s) return;
    for (const { event, fn } of this.listeners) {
      s.off(event, fn);
    }
    this.listeners = [];
  }
}

export const LobbySocket = new LobbySocketManagerClass();
```

---

## Sub-step 5.2: `src/lobby/RoomBrowserAPI.ts`

> One job: REST fetch for public room list.
> ~20 LOC.

📁 **NEW FILE:** `src/lobby/RoomBrowserAPI.ts`

```typescript
// ============================================================
// RoomBrowserAPI.ts
// REST client for the public room list endpoint.
// No auth required — room list is public.
// ============================================================

import type { PublicRoomListing } from '../../shared/types/NetworkEvents';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export async function fetchPublicRooms(): Promise<PublicRoomListing[]> {
  try {
    const res = await fetch(`${API_BASE}/rooms`);
    if (!res.ok) return [];
    return (await res.json()).rooms ?? [];
  } catch {
    console.warn('[RoomBrowser] Failed to fetch rooms.');
    return [];
  }
}
```

---

## Sub-step 5.3: `src/scenes/LoginScene.ts`

> One job: Entry scene — wallet login or guest.
> ~95 LOC.

📁 **NEW FILE:** `src/scenes/LoginScene.ts`

```typescript
// ============================================================
// LoginScene.ts
// First scene after PreloadScene. Two paths:
//   1. CONNECT WALLET → AuthManager.login() → HubScene (authenticated)
//   2. PLAY AS GUEST  → type name → HubScene (guest mode)
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import { AuthManager } from '../auth/AuthManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { DeckLoader } from '../config/DeckLoader';

const CX = 640;

export default class LoginScene extends Phaser.Scene {
  private inputManager!: DOMInputManager;
  private nameInput!: HTMLInputElement;

  constructor() { super({ key: 'LoginScene' }); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Panel ────────────────────────────────────────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(CX - 240, 100, 480, 440, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(CX - 240, 100, 480, 440, 10);

    this.add.text(CX, 140, 'OnChainBattles', {
      fontSize: '40px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(CX, 185, 'Chess-Like On-Chain Card Duel', {
      fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#888888',
    }).setOrigin(0.5);

    // ── Wallet Login ─────────────────────────────────────
    new MenuButton(this, CX, 260, '[ CONNECT WALLET ]', {
      color: '#F5A623', fontSize: '22px',
      onPointerDown: () => this.handleWalletLogin(),
    });

    // ── Divider ──────────────────────────────────────────
    this.add.text(CX, 320, '— or play as guest —', {
      fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#555555',
    }).setOrigin(0.5);

    // ── Guest Name ───────────────────────────────────────
    this.inputManager = new DOMInputManager(this);
    this.nameInput = this.inputManager.createInput({
      gameX: CX, gameY: 380, width: 320, height: 44,
      placeholder: 'Enter guest name...', maxLength: 20,
    });

    new MenuButton(this, CX, 450, '[ PLAY AS GUEST ]', {
      color: '#00FF88', fontSize: '20px',
      onPointerDown: () => this.handleGuest(),
    });

    this.events.once('shutdown', () => this.inputManager?.destroyAll());
    this.events.once('destroy', () => this.inputManager?.destroyAll());
  }

  private async handleWalletLogin(): Promise<void> {
    try {
      const player = await AuthManager.login();
      GameState.setAuthData(AuthManager.getToken()!, player.id, player.displayName);

      // Fetch + activate deck
      try {
        const { DeckAPI } = await import('../deck/DeckAPI');
        const decks = await DeckAPI.list();
        const active = decks.find(d => d.id === player.activeDeckId);
        if (active?.isValid) {
          GameState.setActiveDeck(active.id, active.cardIds);
          DeckLoader.invalidate();
        }
      } catch { /* deck fetch optional */ }

      this.goToHub();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      ToastNotification.show(this, msg, { color: '#ff4444' });
    }
  }

  private handleGuest(): void {
    const name = this.nameInput.value.trim();
    if (!name) {
      ToastNotification.show(this, 'Enter a name to continue.', { color: '#ff4444' });
      return;
    }
    GameState.setPlayerName(name);
    this.goToHub();
  }

  private goToHub(): void {
    this.inputManager.destroyAll();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }
}
```

---

## Sub-step 5.4: `src/scenes/HubScene.ts`

> One job: Home screen. Navigation hub for all game features.
> ~175 LOC.

📁 **NEW FILE:** `src/scenes/HubScene.ts`

```typescript
// ============================================================
// HubScene.ts
// Central home screen after login. Shows:
//   - Player identity bar
//   - HOST A GAME → LobbyScene (host)
//   - BROWSE GAMES → RoomBrowserScene
//   - JOIN BY CODE → overlay → LobbyScene (join)
//   - DECK BUILDER (auth only, future)
//   - QUICK PLAY → legacy MainMenuScene flow
//   - Last match banner
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';
import { AuthManager } from '../auth/AuthManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

export default class HubScene extends Phaser.Scene {
  private joinOverlay: Phaser.GameObjects.Container | null = null;
  private joinInputMgr: DOMInputManager | null = null;

  constructor() { super({ key: 'HubScene' }); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Player Identity (top-left) ───────────────────────
    const name = GameState.playerName || 'Guest';
    const isAuth = GameState.isAuthenticated();

    this.add.text(20, 16, name, {
      fontSize: '20px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    });
    this.add.text(20, 42, isAuth ? 'Wallet Connected' : 'Guest', {
      fontSize: '11px', fontFamily: '"Courier New", monospace',
      color: isAuth ? '#4fc3f7' : '#777777',
    });
    this.add.text(20, 60, `W: ${GameState.winCount}  L: ${GameState.lossCount}`, {
      fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#888888',
    });

    // ── Title ────────────────────────────────────────────
    this.add.text(CX, 70, 'OnChainBattles', {
      fontSize: '34px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // ── Central panel ────────────────────────────────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.7);
    panel.fillRoundedRect(CX - 220, 115, 440, 420, 10);
    panel.lineStyle(1, 0x253348, 0.6);
    panel.strokeRoundedRect(CX - 220, 115, 440, 420, 10);

    // ── Main Buttons ─────────────────────────────────────
    new MenuButton(this, CX, 170, '[ HOST A GAME ]', {
      color: '#00FF88', fontSize: '24px',
      onPointerDown: () => this.goToLobbyHost(),
    });

    new MenuButton(this, CX, 230, '[ BROWSE GAMES ]', {
      color: '#4FC3F7', fontSize: '22px',
      onPointerDown: () => this.goToRoomBrowser(),
    });

    new MenuButton(this, CX, 290, '[ JOIN BY CODE ]', {
      color: '#AAAAAA', fontSize: '18px',
      onPointerDown: () => this.showJoinOverlay(),
    });

    // ── Secondary Buttons ────────────────────────────────
    if (isAuth) {
      new MenuButton(this, CX, 365, '[ DECK BUILDER ]', {
        color: '#F5A623', fontSize: '15px',
        onPointerDown: () => ToastNotification.show(this, 'Coming in Step 6...', { color: '#F5A623' }),
      });
    }

    new MenuButton(this, CX, 420, '[ QUICK PLAY (LEGACY) ]', {
      color: '#555555', fontSize: '13px',
      onPointerDown: () => {
        GameState.currentMode = GameMode.FreePlay;
        this.fadeTo('MainMenuScene');
      },
    });

    // ── Last Match Banner ────────────────────────────────
    const match = GameState.lastMatch;
    if (match) {
      const color = match.playerWon ? '#00ff88' : '#ff6666';
      const msg = match.playerWon
        ? `Last: You beat ${match.opponentName}!`
        : `Last: ${match.opponentName} beat you`;
      this.add.text(CX, 490, msg, {
        fontSize: '13px', fontFamily: '"Courier New", monospace', color,
      }).setOrigin(0.5);
    }

    this.events.once('shutdown', () => this.closeJoinOverlay());
    this.events.once('destroy', () => this.closeJoinOverlay());
  }

  // ─── Navigation ──────────────────────────────────────────

  private goToLobbyHost(): void {
    this.fadeTo('LobbyScene', { mode: 'host', settings: { isPublic: true, isCrypto: false } });
  }

  private goToRoomBrowser(): void {
    this.fadeTo('RoomBrowserScene');
  }

  private fadeTo(scene: string, data?: object): void {
    this.closeJoinOverlay();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(scene, data);
    });
  }

  // ─── Join By Code Overlay ────────────────────────────────

  private showJoinOverlay(): void {
    if (this.joinOverlay) return;

    const dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive();
    const bg = this.add.rectangle(640, 340, 400, 170, 0x16213E).setStrokeStyle(1, 0x253348);
    const label = this.add.text(640, 285, 'Enter Room Code', {
      fontSize: '18px', fontFamily: '"Courier New"', color: '#ffffff',
    }).setOrigin(0.5);

    this.joinInputMgr = new DOMInputManager(this);
    const input = this.joinInputMgr.createInput({
      gameX: 640, gameY: 335, width: 260, height: 42,
      placeholder: '6-digit code...', maxLength: 6, uppercase: true,
    });

    const joinBtn = new MenuButton(this, 580, 390, '[ JOIN ]', {
      color: '#00FF88', fontSize: '16px',
      onPointerDown: () => {
        const code = input.value.trim().toUpperCase();
        if (code.length >= 6) {
          this.closeJoinOverlay();
          this.fadeTo('LobbyScene', { mode: 'join', roomCode: code });
        } else {
          ToastNotification.show(this, 'Code must be 6 digits.', { color: '#ff4444' });
        }
      },
    });

    const cancelBtn = new MenuButton(this, 720, 390, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => this.closeJoinOverlay(),
    });

    this.joinOverlay = this.add.container(0, 0, [dim, bg, label, joinBtn.text, cancelBtn.text]);
    input.focus();
  }

  private closeJoinOverlay(): void {
    this.joinInputMgr?.destroyAll();
    this.joinInputMgr = null;
    this.joinOverlay?.destroy(true);
    this.joinOverlay = null;
  }
}
```

---

## Sub-step 5.5: `src/scenes/RoomBrowserScene.ts`

> One job: List public rooms, click to join.
> ~135 LOC.

📁 **NEW FILE:** `src/scenes/RoomBrowserScene.ts`

```typescript
// ============================================================
// RoomBrowserScene.ts
// Browse and join public game rooms.
// Uses REST API for initial load + auto-refresh every 5s.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import { MenuButton } from '../ui/MenuButton';
import { fetchPublicRooms } from '../lobby/RoomBrowserAPI';
import type { PublicRoomListing } from '../../shared/types/NetworkEvents';

const CX = 640;
const LIST_Y = 155;
const ROW_H = 48;
const MAX_VISIBLE = 8;

export default class RoomBrowserScene extends Phaser.Scene {
  private rooms: PublicRoomListing[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private emptyMsg!: Phaser.GameObjects.Text;
  private refreshTimer: Phaser.Time.TimerEvent | null = null;

  constructor() { super({ key: 'RoomBrowserScene' }); }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.add.text(CX, 35, 'PUBLIC GAMES', {
      fontSize: '26px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // ── Navigation ───────────────────────────────────────
    new MenuButton(this, 90, 35, '[ BACK ]', {
      color: '#AAAAAA', fontSize: '14px',
      onPointerDown: () => this.fadeTo('HubScene'),
    });

    new MenuButton(this, 1190, 35, '[ REFRESH ]', {
      color: '#4FC3F7', fontSize: '14px',
      onPointerDown: () => this.loadRooms(),
    });

    // ── Column Headers ───────────────────────────────────
    const hY = LIST_Y - 22;
    const hStyle = { fontSize: '11px', color: '#777777', fontFamily: '"Courier New"' };
    this.add.text(100, hY, 'ROOM', hStyle);
    this.add.text(420, hY, 'HOST', hStyle);
    this.add.text(660, hY, 'PLAYERS', hStyle);
    this.add.text(810, hY, 'MODE', hStyle);

    this.listContainer = this.add.container(0, 0);
    this.emptyMsg = this.add.text(CX, 380, '', {
      fontSize: '16px', color: '#555555', fontFamily: '"Courier New"',
    }).setOrigin(0.5);

    await this.loadRooms();

    // Auto-refresh
    this.refreshTimer = this.time.addEvent({
      delay: 5000, loop: true, callback: () => this.loadRooms(),
    });

    this.events.on('shutdown', this.cleanup, this);
  }

  private async loadRooms(): Promise<void> {
    this.rooms = await fetchPublicRooms();
    this.renderList();
  }

  private renderList(): void {
    this.listContainer.removeAll(true);

    if (this.rooms.length === 0) {
      this.emptyMsg.setText('No public rooms. Host one from the hub!');
      return;
    }
    this.emptyMsg.setText('');

    this.rooms.slice(0, MAX_VISIBLE).forEach((room, i) => {
      const y = LIST_Y + i * ROW_H;
      const rowBg = this.add.rectangle(CX, y + ROW_H / 2, 1100, ROW_H - 4, i % 2 === 0 ? 0x16213E : 0x1a1a2e);
      const rowStyle = { fontSize: '14px', fontFamily: '"Courier New"' };

      const nameT = this.add.text(100, y + 10, room.roomName.slice(0, 28), { ...rowStyle, color: '#ffffff' });
      const hostT = this.add.text(420, y + 10, room.hostName, { ...rowStyle, color: '#AAAAAA' });
      const countColor = room.playerCount >= room.maxPlayers ? '#ff4444' : '#00ff88';
      const countT = this.add.text(660, y + 10, `${room.playerCount}/${room.maxPlayers}`, { ...rowStyle, color: countColor });
      const modeT = this.add.text(810, y + 10, room.isCrypto ? `CRYPTO` : 'FREE', {
        ...rowStyle, color: room.isCrypto ? '#F5A623' : '#00ff88',
      });

      this.listContainer.add([rowBg, nameT, hostT, countT, modeT]);

      if (room.playerCount < room.maxPlayers) {
        const joinT = this.add.text(1000, y + 10, '[ JOIN ]', {
          ...rowStyle, color: '#4FC3F7',
        }).setInteractive({ useHandCursor: true });
        joinT.on('pointerover', () => joinT.setColor('#ffffff'));
        joinT.on('pointerout', () => joinT.setColor('#4FC3F7'));
        joinT.on('pointerdown', () => {
          GameState.setRoomCode(room.code);
          this.fadeTo('LobbyScene', { mode: 'join', roomCode: room.code });
        });
        this.listContainer.add(joinT);
      }
    });
  }

  private fadeTo(scene: string, data?: object): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }

  private cleanup(): void {
    this.refreshTimer?.remove();
    this.refreshTimer = null;
  }
}
```

---

## Sub-step 5.6: `src/scenes/LobbyScene.ts`

> One job: Enhanced room with chat, kick, ready, host controls.
> This is the biggest file in the step — ~200 LOC. At the alarm threshold (Principles §1.1).
> Accepts `{ mode: 'host' | 'join', roomCode?, settings? }` from HubScene/RoomBrowserScene.

📁 **NEW FILE:** `src/scenes/LobbyScene.ts`

```typescript
// ============================================================
// LobbyScene.ts
// Enhanced room: chat, kick, ready, host controls, deck submit.
// Receives init data:
//   { mode: 'host' }                           → create new room
//   { mode: 'join', roomCode: string }          → join existing room
//   { mode: 'host', settings: Partial<RoomSettings> } → create with settings
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';
import SocketManager from '../network/SocketManager';
import { LobbySocket } from '../lobby/LobbySocketManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { DeckLoader } from '../config/DeckLoader';
import type { LobbyState, LobbyPlayerInfo, RoomSettings } from '../../shared/types/NetworkEvents';

const CX = 640;

interface LobbySceneData {
  mode: 'host' | 'join';
  roomCode?: string;
  settings?: Partial<RoomSettings>;
}

export default class LobbyScene extends Phaser.Scene {
  private data!: LobbySceneData;
  private inputMgr!: DOMInputManager;
  private chatInput!: HTMLInputElement;
  private roomCode = '';
  private isHost = false;

  // Live-updated UI
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private chatTexts: Phaser.GameObjects.Text[] = [];
  private chatLines: string[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private codeText!: Phaser.GameObjects.Text;
  private startBtn: MenuButton | null = null;

  constructor() { super({ key: 'LobbyScene' }); }
  init(data: LobbySceneData): void { this.data = data; }

  create(): void {
    const { width, height } = this.scale;
    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── Header ───────────────────────────────────────────
    this.add.text(CX, 22, 'GAME LOBBY', {
      fontSize: '22px', fontFamily: '"Courier New", monospace', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);
    this.codeText = this.add.text(CX, 50, 'ROOM: ...', {
      fontSize: '16px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
    }).setOrigin(0.5);

    // ── Left: Players Panel ──────────────────────────────
    this.add.text(60, 85, 'PLAYERS', { fontSize: '12px', fontFamily: '"Courier New"', color: '#777777' });
    this.add.rectangle(190, 200, 320, 200, 0x16213E, 0.5);

    // ── Right: Chat Panel ────────────────────────────────
    this.add.text(740, 85, 'CHAT', { fontSize: '12px', fontFamily: '"Courier New"', color: '#777777' });
    this.add.rectangle(900, 300, 380, 380, 0x16213E, 0.5);

    this.inputMgr = new DOMInputManager(this);
    this.chatInput = this.inputMgr.createInput({
      gameX: 900, gameY: 510, width: 340, height: 34,
      placeholder: 'Type a message...', maxLength: 200,
    });
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.roomCode) {
        const text = this.chatInput.value.trim();
        if (text) { LobbySocket.sendChat(this.roomCode, text); this.chatInput.value = ''; }
      }
    });

    // ── Status ───────────────────────────────────────────
    this.statusText = this.add.text(CX, 560, 'Connecting...', {
      fontSize: '15px', fontFamily: '"Courier New"', color: '#f5a623',
    }).setOrigin(0.5);

    // ── Bottom Buttons ───────────────────────────────────
    new MenuButton(this, 100, 640, '[ LEAVE ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => this.leave(),
    });

    new MenuButton(this, CX, 640, '[ READY / NOT READY ]', {
      color: '#00FF88', fontSize: '15px',
      onPointerDown: () => { if (this.roomCode) LobbySocket.toggleReady(this.roomCode); },
    });

    this.connectAndInit();
    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
  }

  // ─── Socket Setup ──────────────────────────────────────

  private connectAndInit(): void {
    if (!SocketManager.isConnected()) {
      SocketManager.connectOnly({ onError: (msg) => this.statusText.setText(`Error: ${msg}`).setColor('#ff4444') });
      const s = SocketManager.getSocket();
      s?.once('connect', () => this.registerAndJoin());
    } else {
      this.registerAndJoin();
    }
  }

  private registerAndJoin(): void {
    if (GameState.authToken) SocketManager.registerPlayer(GameState.authToken);
    this.registerLobbyEvents();

    if (this.data.mode === 'host') {
      LobbySocket.createRoom(GameState.playerName, this.data.settings);
    } else if (this.data.roomCode) {
      LobbySocket.joinRoom(this.data.roomCode, GameState.playerName);
    }
  }

  private registerLobbyEvents(): void {
    LobbySocket.onCreated(({ code }) => {
      this.roomCode = code; this.isHost = true;
      this.codeText.setText(`ROOM: ${code}`);
      this.statusText.setText('Waiting for players...');
      this.showStartBtn();
    });

    LobbySocket.onJoined(({ code }) => {
      this.roomCode = code; this.isHost = false;
      this.codeText.setText(`ROOM: ${code}`);
      this.statusText.setText('Joined! Waiting for host to start...');
    });

    LobbySocket.onStateUpdate((state: LobbyState) => {
      this.renderPlayers(state.players);
      this.isHost = state.players.some(p => p.isHost && p.name === GameState.playerName);
      if (this.isHost) this.showStartBtn();
      this.updateStatus(state);
    });

    LobbySocket.onChatMessage((msg) => this.appendChat(`${msg.sender}: ${msg.text}`, '#ffffff'));
    LobbySocket.onSystemMessage(({ text }) => this.appendChat(`» ${text}`, '#f5a623'));
    LobbySocket.onKicked(({ reason }) => {
      ToastNotification.show(this, reason, { color: '#ff4444' });
      this.time.delayedCall(1500, () => this.scene.start('HubScene'));
    });
    LobbySocket.onError(({ message }) => ToastNotification.show(this, message, { color: '#ff4444' }));

    LobbySocket.onSubmitDecks(async () => {
      this.statusText.setText('Submitting deck...');
      await DeckLoader.load();
      LobbySocket.submitDeck(this.roomCode, DeckLoader.get());
    });

    LobbySocket.onGameStarting((data) => {
      this.statusText.setText('Game starting!').setColor('#00ff88');
      const me = data.players.find(p => p.name === GameState.playerName);
      const opp = data.players.find(p => p.name !== GameState.playerName);
      if (opp) GameState.setOpponentName(opp.name);
      GameState.setRoomCode(this.roomCode);
      // playerIndex and gameSeed are set by legacy events (roomCreated, game_seed)
      this.time.delayedCall(800, () => this.enterBattle());
    });

    LobbySocket.onDepositPhase(async ({ stakeAmount }) => {
      this.statusText.setText('Deposit phase — lock funds!').setColor('#f5a623');
      try {
        const EscrowMod = await import('../web3/EscrowManager');
        const txHash = this.isHost
          ? await EscrowMod.default.createMatch(this.roomCode)
          : await EscrowMod.default.joinMatch(this.roomCode);
        GameState.depositTxHash = txHash;
        this.statusText.setText('Funds locked! Waiting...').setColor('#4fc3f7');
        LobbySocket.signalCryptoReady(this.roomCode);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Deposit failed.';
        this.statusText.setText(`Deposit failed: ${msg}`).setColor('#ff4444');
      }
    });

    LobbySocket.onOpponentDeposited(() => this.statusText.setText('Opponent deposited!').setColor('#f5a623'));
    LobbySocket.onBothDeposited(() => this.statusText.setText('Both deposited! Starting...').setColor('#00ff88'));
  }

  // ─── UI Renderers ──────────────────────────────────────

  private renderPlayers(players: LobbyPlayerInfo[]): void {
    this.playerTexts.forEach(t => t.destroy());
    this.playerTexts = [];

    players.forEach((p, i) => {
      const y = 110 + i * 55;
      const hostTag = p.isHost ? ' [HOST]' : '';
      const readyTag = p.ready ? ' ✓' : '';
      const nameColor = p.isHost ? '#F5A623' : '#ffffff';

      const t1 = this.add.text(50, y, `${p.name}${hostTag}${readyTag}`, {
        fontSize: '16px', fontFamily: '"Courier New"', color: nameColor,
      });
      const statusColor = p.ready ? '#00FF88' : '#ff4444';
      const t2 = this.add.text(50, y + 20, p.ready ? 'READY' : 'NOT READY', {
        fontSize: '11px', fontFamily: '"Courier New"', color: statusColor,
      });
      this.playerTexts.push(t1, t2);

      if (this.isHost && !p.isHost) {
        const kick = this.add.text(310, y + 5, '[KICK]', {
          fontSize: '11px', fontFamily: '"Courier New"', color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        kick.on('pointerdown', () => LobbySocket.kickPlayer(this.roomCode, p.name));
        kick.on('pointerover', () => kick.setColor('#ffffff'));
        kick.on('pointerout', () => kick.setColor('#ff4444'));
        this.playerTexts.push(kick);
      }
    });
  }

  private appendChat(line: string, color: string): void {
    this.chatLines.push(line);
    if (this.chatLines.length > 12) this.chatLines.shift();
    this.chatTexts.forEach(t => t.destroy());
    this.chatTexts = [];
    this.chatLines.forEach((text, i) => {
      const t = this.add.text(720, 110 + i * 26, text, {
        fontSize: '11px', fontFamily: '"Courier New"', color, wordWrap: { width: 360 },
      });
      this.chatTexts.push(t);
    });
  }

  private showStartBtn(): void {
    if (this.startBtn) return;
    this.startBtn = new MenuButton(this, 300, 480, '[ START GAME ]', {
      color: '#00FF88', fontSize: '20px',
      onPointerDown: () => { if (this.roomCode) LobbySocket.startGame(this.roomCode); },
    });
  }

  private updateStatus(state: LobbyState): void {
    switch (state.status) {
      case 'waiting':
        this.statusText.setText(state.players.length < 2 ? 'Waiting for players...' : 'All here — ready up!');
        break;
      case 'depositing': this.statusText.setText('Crypto deposit phase...').setColor('#f5a623'); break;
      case 'starting': this.statusText.setText('Validating decks...').setColor('#4fc3f7'); break;
      case 'in_progress': this.statusText.setText('Game in progress!').setColor('#00ff88'); break;
    }
  }

  // ─── Transitions ───────────────────────────────────────

  private enterBattle(): void {
    this.cleanup();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName,
        opponentName: GameState.opponentName,
        isCryptoMode: GameState.currentMode === GameMode.CryptoPlay,
        roomCode: this.roomCode,
      });
    });
  }

  private leave(): void {
    if (this.roomCode) LobbySocket.leaveRoom(this.roomCode);
    this.cleanup();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HubScene'));
  }

  private cleanup(): void {
    LobbySocket.removeAllListeners();
    this.inputMgr?.destroyAll();
  }
}
```

---

## Sub-step 5.7: Wire New Scenes into `src/main.ts`

📁 `src/main.ts`

### Edit 1: Add imports

OLD:
```typescript
import './game/abilities/registerAll';
import Phaser from 'phaser';
import PreLoadScene    from './scenes/PreloadScene';
import MainMenuScene   from './scenes/MainMenuScene';
import RoomScene       from './scenes/RoomScene';
import BattleScene     from './scenes/BattleScene';
import ResultScene     from './scenes/ResultScene';
```

NEW:
```typescript
import './game/abilities/registerAll';
import Phaser from 'phaser';
import PreLoadScene      from './scenes/PreloadScene';
import LoginScene        from './scenes/LoginScene';
import HubScene          from './scenes/HubScene';
import RoomBrowserScene  from './scenes/RoomBrowserScene';
import LobbyScene        from './scenes/LobbyScene';
import MainMenuScene     from './scenes/MainMenuScene';
import RoomScene         from './scenes/RoomScene';
import BattleScene       from './scenes/BattleScene';
import ResultScene       from './scenes/ResultScene';
```

### Edit 2: Update scene array

OLD:
```typescript
    scene: [
        PreLoadScene,
        MainMenuScene,
        RoomScene,
        BattleScene,
        ResultScene,
    ],
```

NEW:
```typescript
    scene: [
        PreLoadScene,
        LoginScene,
        HubScene,
        RoomBrowserScene,
        LobbyScene,
        MainMenuScene,    // Legacy flow — accessible from HubScene
        RoomScene,        // Legacy flow — accessible from MainMenuScene
        BattleScene,
        ResultScene,
    ],
```

---

## Sub-step 5.8: Update `src/scenes/PreloadScene.ts` Entry Point

📁 `src/scenes/PreloadScene.ts` — function `create()`

OLD:
```typescript
create(): void {
    console.log('[PreloadScene] All assets loaded. Starting MainMenuScene.');
    MipmapHelper.enableAll(this);
    this.scene.start('MainMenuScene');
  }
```

NEW:
```typescript
create(): void {
    console.log('[PreloadScene] All assets loaded. Starting LoginScene.');
    MipmapHelper.enableAll(this);
    this.scene.start('LoginScene');
  }
```

---

## Sub-step 5.9: Update `src/scenes/ResultScene.ts` Exit Target

📁 `src/scenes/ResultScene.ts` — function `goToMenu()`

OLD:
```typescript
  private goToMenu(): void {
    GameState.clearMatchData();

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }
```

NEW:
```typescript
  private goToMenu(): void {
    GameState.clearMatchData();

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }
```

---

## COMPLETE FILE CHANGE SUMMARY — Step 5

```
NEW FILES (6 files):
  src/lobby/LobbySocketManager.ts     Lobby socket wrapper (~120 LOC)
  src/lobby/RoomBrowserAPI.ts          REST room list fetch (~20 LOC)
  src/scenes/LoginScene.ts             Wallet/guest login (~95 LOC)
  src/scenes/HubScene.ts               Home screen hub (~175 LOC)
  src/scenes/RoomBrowserScene.ts       Public room browser (~135 LOC)
  src/scenes/LobbyScene.ts             Enhanced room scene (~200 LOC)

MODIFIED FILES (3):
  src/main.ts                          2 EDITS: imports + scene array
  src/scenes/PreloadScene.ts           1 EDIT: LoginScene instead of MainMenuScene
  src/scenes/ResultScene.ts            1 EDIT: HubScene instead of MainMenuScene

UNTOUCHED:
  src/scenes/MainMenuScene.ts          Still accessible via HubScene "QUICK PLAY"
  src/scenes/RoomScene.ts              Still accessible via MainMenuScene
  src/scenes/BattleScene.ts            Zero changes
  server/*                             Zero changes (all ready from Steps 2-3)
  src/game/*                           Zero changes
  src/renderers/*                      Zero changes
```

## Directory Structure After Step 5

```
src/
  auth/
    AuthManager.ts
  deck/
    DeckAPI.ts
    DeckValidatorClient.ts
    CollectionAPI.ts
  lobby/                               ← NEW FOLDER
    LobbySocketManager.ts             ← NEW
    RoomBrowserAPI.ts                  ← NEW
  config/
    DeckLoader.ts
  network/
    SocketManager.ts
  scenes/
    LoginScene.ts                      ← NEW (entry point)
    HubScene.ts                        ← NEW (home screen)
    RoomBrowserScene.ts                ← NEW (room browser)
    LobbyScene.ts                      ← NEW (enhanced room)
    MainMenuScene.ts                   ← legacy (still works)
    RoomScene.ts                       ← legacy (still works)
    PreloadScene.ts                    ← EDITED (→ LoginScene)
    BattleScene.ts                     ← untouched
    ResultScene.ts                     ← EDITED (→ HubScene)
```

## POST-STEP VERIFICATION CHECKLIST

```bash
# 1. Client compiles
npx tsc --noEmit

# 2. Server still compiles
npx tsc -p tsconfig.server.json --noEmit

# 3. No 'any' in new files
grep -rn ": any\|as any" src/lobby/ src/scenes/LoginScene.ts src/scenes/HubScene.ts src/scenes/RoomBrowserScene.ts src/scenes/LobbyScene.ts
# Expected: 0 results

# 4. File sizes
wc -l src/lobby/*.ts src/scenes/LoginScene.ts src/scenes/HubScene.ts src/scenes/RoomBrowserScene.ts src/scenes/LobbyScene.ts
# Expected: LobbyScene ~200 (at alarm), all others <180

# 5. Manual: NEW FLOW — Guest
# Game loads → LoginScene → type name → PLAY AS GUEST → HubScene
# → HOST A GAME → LobbyScene (shows room code, "Waiting for players...")
# → open second browser → LoginScene → guest → HubScene → JOIN BY CODE → enter code
# → LobbyScene shows both players → non-host clicks READY → host clicks START
# → BattleScene → play game → ResultScene → HubScene (not MainMenuScene)

# 6. Manual: NEW FLOW — Room Browser
# Player 1: HubScene → HOST A GAME → LobbyScene (public room)
# Player 2: HubScene → BROWSE GAMES → RoomBrowserScene → sees room → click JOIN
# → LobbyScene → ready → host starts → BattleScene

# 7. Manual: LEGACY FLOW still works
# HubScene → QUICK PLAY (LEGACY) → MainMenuScene → type name → PLAY FREE
# → RoomScene → opponent joins → BattleScene (unchanged)

# 8. Manual: Chat works
# Both players in LobbyScene → type message → press Enter → both see it

# 9. Manual: Kick works
# Host in LobbyScene → click [KICK] next to opponent → opponent sees "Removed by host"
# → opponent redirected to HubScene

# 10. Manual: Auth flow through lobby
# LoginScene → CONNECT WALLET → MetaMask → HubScene (shows "Wallet Connected")
# → HOST A GAME → LobbyScene → opponent joins → START → BattleScene
```

**Git commit:** `feat: Step 5 — LoginScene + HubScene + RoomBrowserScene + LobbyScene`

---

## NOTES FOR STEP 6

Step 6 is **integration testing + polish**:
- DeckBuilderScene (if scope includes it) — or defer to a later step
- Test all 3 flows end-to-end: guest, auth, crypto
- Test room browser with multiple concurrent rooms
- Test disconnect handling in LobbyScene
- Test rematch flow (ResultScene → HubScene → HOST → play again)
- Fix any visual layout issues in the new scenes
- Add `bg_hub` background asset if desired
