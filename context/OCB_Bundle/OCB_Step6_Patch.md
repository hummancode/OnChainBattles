# Step 6 Patch: Integration, Polish & Final Wiring

**Git branch:** `feat/step6-integration-polish`
**Estimated time:** 4–5 hours
**Prerequisites:** Steps 1–5 complete
**Verification:** Full manual test matrix at the end

---

## Sub-step 6.1: Host Settings Overlay in `src/scenes/HubScene.ts`

> HubScene currently hardcodes `{ isPublic: true, isCrypto: false }` when hosting.
> Players need to choose public/private and free/crypto BEFORE entering the lobby.

📁 `src/scenes/HubScene.ts`

### Replace `goToLobbyHost()` method

OLD:
```typescript
  private goToLobbyHost(): void {
    this.fadeTo('LobbyScene', { mode: 'host', settings: { isPublic: true, isCrypto: false } });
  }
```

NEW (entire method + new fields + helper):

**Add fields** at the top of the class (after existing `joinOverlay` / `joinInputMgr`):

```typescript
  private hostOverlay: Phaser.GameObjects.Container | null = null;
```

**Replace the method + add `closeHostOverlay()`:**

```typescript
  private goToLobbyHost(): void {
    if (this.hostOverlay) return;

    let isPublic = true;
    let isCrypto = false;

    const dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive();
    const panel = this.add.rectangle(640, 330, 420, 250, 0x16213E).setStrokeStyle(1, 0x253348);
    const title = this.add.text(640, 230, 'HOST SETTINGS', {
      fontSize: '18px', fontFamily: '"Courier New"', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    const publicBtn = this.add.text(640, 280, '[ PUBLIC ROOM ]', {
      fontSize: '16px', fontFamily: '"Courier New"', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    publicBtn.on('pointerdown', () => {
      isPublic = !isPublic;
      publicBtn.setText(isPublic ? '[ PUBLIC ROOM ]' : '[ PRIVATE ROOM ]');
      publicBtn.setColor(isPublic ? '#00FF88' : '#F5A623');
    });

    const cryptoBtn = this.add.text(640, 320, '[ FREE PLAY ]', {
      fontSize: '16px', fontFamily: '"Courier New"', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cryptoBtn.on('pointerdown', () => {
      isCrypto = !isCrypto;
      cryptoBtn.setText(isCrypto ? '[ CRYPTO MODE ]' : '[ FREE PLAY ]');
      cryptoBtn.setColor(isCrypto ? '#F5A623' : '#00FF88');
    });

    const goBtn = new MenuButton(this, 580, 385, '[ CREATE ]', {
      color: '#00FF88', fontSize: '18px',
      onPointerDown: () => {
        if (isCrypto) GameState.currentMode = GameMode.CryptoPlay;
        else GameState.currentMode = GameMode.FreePlay;
        this.closeHostOverlay();
        this.fadeTo('LobbyScene', { mode: 'host', settings: { isPublic, isCrypto } });
      },
    });

    const cancelBtn = new MenuButton(this, 710, 385, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => this.closeHostOverlay(),
    });

    this.hostOverlay = this.add.container(0, 0, [
      dim, panel, title, publicBtn, cryptoBtn, goBtn.text, cancelBtn.text,
    ]);
  }

  private closeHostOverlay(): void {
    this.hostOverlay?.destroy(true);
    this.hostOverlay = null;
  }
```

### Update cleanup

OLD:
```typescript
    this.events.once('shutdown', () => this.closeJoinOverlay());
    this.events.once('destroy', () => this.closeJoinOverlay());
```

NEW:
```typescript
    this.events.once('shutdown', () => { this.closeJoinOverlay(); this.closeHostOverlay(); });
    this.events.once('destroy', () => { this.closeJoinOverlay(); this.closeHostOverlay(); });
```

---

## Sub-step 6.2: Rematch Button in `src/scenes/ResultScene.ts`

> After a match, players should be able to quickly host a new game instead of navigating through HubScene.

📁 `src/scenes/ResultScene.ts`

### Edit: Add rematch button in `addNavigationButtons()`

OLD:
```typescript
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
```

NEW:
```typescript
  private addNavigationButtons(width: number, height: number): void {
    const btnY = height - 80;

    // Rematch — go straight to LobbyScene as host
    const rematchBtn = this.add.text(width / 2 - 180, btnY, '[ REMATCH ]', {
      fontSize: '24px', color: '#4FC3F7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    rematchBtn.on('pointerover', () => rematchBtn.setColor('#FFFFFF'));
    rematchBtn.on('pointerout', () => rematchBtn.setColor('#4FC3F7'));
    rematchBtn.on('pointerdown', () => this.goToRematch());

    // Play Again — go to HubScene
    const playAgainBtn = this.add.text(width / 2 + 20, btnY, '[ HUB ]', {
      fontSize: '22px', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#FFFFFF'));
    playAgainBtn.on('pointerout', () => playAgainBtn.setColor('#00FF88'));
    playAgainBtn.on('pointerdown', () => this.goToMenu());

    // Menu — go to legacy MainMenuScene
    const menuBtn = this.add.text(width / 2 + 180, btnY, '[ LEGACY ]', {
      fontSize: '16px', color: '#555555',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#AAAAAA'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#555555'));
    menuBtn.on('pointerdown', () => {
      GameState.clearMatchData();
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenuScene'));
    });
  }
```

### Add `goToRematch()` method

Insert AFTER `goToMenu()`:

```typescript
  private goToRematch(): void {
    GameState.clearMatchData();

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LobbyScene', { mode: 'host' });
    });
  }
```

### Also update `goToMenu()` target (from Step 5)

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

## Sub-step 6.3: `src/scenes/DeckBuilderScene.ts` (Stub)

> Placeholder scene so the HubScene "DECK BUILDER" button works.
> Shows collection list + active deck info. Full builder is a future step.
> ~90 LOC.

📁 **NEW FILE:** `src/scenes/DeckBuilderScene.ts`

```typescript
// ============================================================
// DeckBuilderScene.ts — Stub
// Placeholder deck viewer. Shows collection + active deck info.
// Full interactive deck builder is a future step.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import { AuthManager } from '../auth/AuthManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

export default class DeckBuilderScene extends Phaser.Scene {
  constructor() { super({ key: 'DeckBuilderScene' }); }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── Header ───────────────────────────────────────────
    this.add.text(CX, 35, 'DECK BUILDER', {
      fontSize: '26px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    new MenuButton(this, 90, 35, '[ BACK ]', {
      color: '#AAAAAA', fontSize: '14px',
      onPointerDown: () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HubScene'));
      },
    });

    // ── Panel ────────────────────────────────────────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.7);
    panel.fillRoundedRect(CX - 300, 70, 600, 580, 10);

    // ── Active Deck Info ─────────────────────────────────
    const activeDeckId = GameState.activeDeckId;
    const activeCards = GameState.activeDeckCardIds;

    if (activeDeckId && activeCards.length > 0) {
      this.add.text(CX, 100, `Active Deck #${activeDeckId}  (${activeCards.length} cards)`, {
        fontSize: '16px', fontFamily: '"Courier New"', color: '#00FF88',
      }).setOrigin(0.5);

      // Show card list
      const counts = new Map<string, number>();
      for (const id of activeCards) counts.set(id, (counts.get(id) ?? 0) + 1);

      let y = 135;
      for (const [id, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (y > 600) break;
        this.add.text(380, y, `${id}`, { fontSize: '12px', fontFamily: '"Courier New"', color: '#AAAAAA' });
        this.add.text(620, y, `×${count}`, { fontSize: '12px', fontFamily: '"Courier New"', color: '#ffffff' });
        y += 20;
      }
    } else {
      this.add.text(CX, 200, 'No active deck selected.', {
        fontSize: '16px', fontFamily: '"Courier New"', color: '#777777',
      }).setOrigin(0.5);
      this.add.text(CX, 240, 'Using default deck for matches.', {
        fontSize: '13px', fontFamily: '"Courier New"', color: '#555555',
      }).setOrigin(0.5);
    }

    // ── Load decks from server ───────────────────────────
    if (AuthManager.isLoggedIn()) {
      this.add.text(CX, 660, 'Loading your decks from server...', {
        fontSize: '12px', fontFamily: '"Courier New"', color: '#4fc3f7',
      }).setOrigin(0.5);

      try {
        const { DeckAPI } = await import('../deck/DeckAPI');
        const decks = await DeckAPI.list();
        this.add.text(CX, 660, `You have ${decks.length} saved deck(s). Full builder coming soon!`, {
          fontSize: '12px', fontFamily: '"Courier New"', color: '#4fc3f7',
        }).setOrigin(0.5);
      } catch {
        this.add.text(CX, 660, 'Could not load decks from server.', {
          fontSize: '12px', fontFamily: '"Courier New"', color: '#ff4444',
        }).setOrigin(0.5);
      }
    } else {
      this.add.text(CX, 660, 'Connect wallet to manage decks.', {
        fontSize: '13px', fontFamily: '"Courier New"', color: '#777777',
      }).setOrigin(0.5);
    }
  }
}
```

---

## Sub-step 6.4: Register DeckBuilderScene + Fix HubScene Button

📁 `src/main.ts`

### Add import (after LobbyScene import)

```typescript
import DeckBuilderScene from './scenes/DeckBuilderScene';
```

### Add to scene array (after LobbyScene)

OLD:
```typescript
    scene: [
        PreLoadScene,
        LoginScene,
        HubScene,
        RoomBrowserScene,
        LobbyScene,
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
        DeckBuilderScene,
        MainMenuScene,
        RoomScene,
        BattleScene,
        ResultScene,
    ],
```

📁 `src/scenes/HubScene.ts` — update deck builder button

OLD (from Step 5):
```typescript
    if (isAuth) {
      new MenuButton(this, CX, 365, '[ DECK BUILDER ]', {
        color: '#F5A623', fontSize: '15px',
        onPointerDown: () => ToastNotification.show(this, 'Coming in Step 6...', { color: '#F5A623' }),
      });
    }
```

NEW:
```typescript
    new MenuButton(this, CX, 365, '[ DECK BUILDER ]', {
      color: '#F5A623', fontSize: '15px',
      onPointerDown: () => this.fadeTo('DeckBuilderScene'),
    });
```

> Removed auth gate — guests can see their default deck too. Full builder will gate editing behind auth.

---

## Sub-step 6.5: Disconnect Safety in `src/scenes/LobbyScene.ts`

> If socket disconnects while in lobby, player should be sent back to HubScene.

📁 `src/scenes/LobbyScene.ts`

### Add disconnect listener inside `registerLobbyEvents()`

INSERT at the end of `registerLobbyEvents()`, before the closing `}`:

```typescript
    // Handle unexpected disconnect while in lobby
    const socket = SocketManager.getSocket();
    if (socket) {
      const onDisconnect = () => {
        this.statusText.setText('Disconnected from server.').setColor('#ff4444');
        this.time.delayedCall(2000, () => {
          this.cleanup();
          this.scene.start('HubScene');
        });
      };
      socket.on('disconnect', onDisconnect);
      // Track for cleanup
      this.listeners_to_clean = this.listeners_to_clean ?? [];
      this.listeners_to_clean.push(() => socket.off('disconnect', onDisconnect));
    }
```

But this adds a loose field. Cleaner approach — add to the existing `cleanup()`:

**Actually, let's just register it via LobbySocket's listener tracking:**

INSERT at end of `registerLobbyEvents()`:

```typescript
    // Disconnect safety — return to hub
    const rawSocket = SocketManager.getSocket();
    rawSocket?.on('disconnect', () => {
      if (!this.scene.isActive('LobbyScene')) return;
      this.statusText.setText('Disconnected.').setColor('#ff4444');
      this.time.delayedCall(2000, () => {
        this.cleanup();
        this.scene.start('HubScene');
      });
    });
```

> On `cleanup()`, `LobbySocket.removeAllListeners()` clears lobby events. The raw `disconnect` listener auto-cleans when the socket object itself is destroyed. If the player navigates away before the 2s delay, `this.scene.isActive('LobbyScene')` prevents the stale transition.

---

## Sub-step 6.6: Back-Navigation Safety in RoomBrowserScene

> If socket disconnects during browse, REST still works (fetchPublicRooms is HTTP).
> But if auto-refresh fails repeatedly, show a warning.

📁 `src/scenes/RoomBrowserScene.ts`

### Update `loadRooms()` to handle repeated failures

OLD:
```typescript
  private async loadRooms(): Promise<void> {
    this.rooms = await fetchPublicRooms();
    this.renderList();
  }
```

NEW:
```typescript
  private failCount = 0;

  private async loadRooms(): Promise<void> {
    const result = await fetchPublicRooms();
    if (result.length === 0 && this.rooms.length > 0) {
      this.failCount++;
      if (this.failCount >= 3) {
        this.emptyMsg.setText('Server connection lost. Try refreshing.');
        return;
      }
    } else {
      this.failCount = 0;
    }
    this.rooms = result;
    this.renderList();
  }
```

---

## Sub-step 6.7: Consistent Scene Transition Helper

> Multiple scenes repeat the same fade-out pattern. Extract once, use everywhere.
> This is optional polish — not strictly required — but reduces duplication.

📁 **NEW FILE:** `src/ui/SceneTransition.ts`

```typescript
// ============================================================
// SceneTransition.ts
// Reusable fade-out → scene.start transition.
// Prevents double-transition if called twice quickly.
// ============================================================

import Phaser from 'phaser';

let transitioning = false;

export function fadeToScene(
  scene: Phaser.Scene,
  target: string,
  data?: object,
  duration = 300
): void {
  if (transitioning) return;
  transitioning = true;

  scene.cameras.main.fadeOut(duration, 0, 0, 0);
  scene.cameras.main.once('camerafadeoutcomplete', () => {
    transitioning = false;
    scene.scene.start(target, data);
  });
}
```

> **Usage (optional, not mandatory):** Scenes can import and use `fadeToScene(this, 'HubScene')` instead of the 4-line pattern. This is pure polish — existing scenes don't need to change.

---

## COMPLETE FILE CHANGE SUMMARY — Step 6

```
NEW FILES (2):
  src/scenes/DeckBuilderScene.ts     Stub deck viewer (~90 LOC)
  src/ui/SceneTransition.ts          Reusable fade helper (~20 LOC)

MODIFIED FILES (4):
  src/scenes/HubScene.ts             2 EDITS:
    └─ Replace goToLobbyHost() with host settings overlay
    └─ Deck builder button → goes to DeckBuilderScene

  src/scenes/ResultScene.ts          3 EDITS:
    └─ 3 buttons: REMATCH / HUB / LEGACY (was 2)
    └─ Add goToRematch() method
    └─ goToMenu() → HubScene (from Step 5, confirmed here)

  src/scenes/LobbyScene.ts           1 EDIT:
    └─ Add disconnect safety → return to HubScene

  src/scenes/RoomBrowserScene.ts     1 EDIT:
    └─ Add failCount for repeated fetch failures

  src/main.ts                        1 EDIT:
    └─ Add DeckBuilderScene import + scene array

UNTOUCHED:
  server/*                           Zero changes
  src/auth/*                         Zero changes
  src/deck/*                         Zero changes
  src/lobby/*                        Zero changes
  src/config/*                       Zero changes
  src/network/*                      Zero changes
  src/game/*                         Zero changes
  src/renderers/*                    Zero changes
  src/scenes/BattleScene.ts          Zero changes
  src/scenes/LoginScene.ts           Zero changes
  src/scenes/PreloadScene.ts         Zero changes
  src/scenes/MainMenuScene.ts        Zero changes
  src/scenes/RoomScene.ts            Zero changes
```

---

## FULL INTEGRATION TEST MATRIX

### Test Group A: Guest Flow (No Wallet)

```
A1. Fresh load → LoginScene appears (not MainMenuScene)
A2. Type name → PLAY AS GUEST → HubScene shows name + "Guest" + W:0 L:0
A3. HubScene → HOST A GAME → settings overlay appears
    → toggle PUBLIC/PRIVATE, toggle FREE/CRYPTO → CREATE
    → LobbyScene shows room code, "Waiting for players..."
A4. Second browser → LoginScene → guest → HubScene → BROWSE GAMES
    → RoomBrowserScene shows the hosted room
    → click JOIN → LobbyScene → both players visible
A5. Non-host clicks READY → host sees ✓ → host clicks START GAME
    → both players enter BattleScene → game plays normally
A6. Game ends → ResultScene shows turns + W/L → REMATCH → new LobbyScene
A7. ResultScene → HUB → HubScene (not MainMenuScene)
A8. HubScene → JOIN BY CODE → overlay → type code → JOIN → LobbyScene
A9. HubScene → QUICK PLAY (LEGACY) → MainMenuScene → PLAY FREE
    → RoomScene → full legacy flow works unchanged
```

### Test Group B: Authenticated Flow

```
B1. LoginScene → CONNECT WALLET → MetaMask popup → sign nonce
    → HubScene shows "Wallet Connected" + display name
B2. HubScene → DECK BUILDER → DeckBuilderScene shows active deck info
    → BACK → HubScene
B3. HubScene → HOST A GAME → CREATE (free) → LobbyScene
    → deck submitted on game start (check server log: "Deck accepted")
B4. Match ends → ResultScene → match recorded to DB
    (check: sqlite3 server/data/ocb.sqlite "SELECT * FROM match_history")
B5. ResultScene → HUB → HubScene → W/L count updated
```

### Test Group C: Crypto Flow Through Lobby

```
C1. LoginScene → CONNECT WALLET → HubScene
    → HOST A GAME → toggle CRYPTO MODE → CREATE
    → LobbyScene shows room code
C2. Player 2 joins → clicks READY → host clicks START GAME
    → "Crypto deposit phase" message appears
    → MetaMask popup for host → deposit confirms
    → MetaMask popup for joiner → deposit confirms
    → "Both deposited! Starting..." → BattleScene
C3. Game ends → payout to winner → ResultScene shows tx link
```

### Test Group D: Lobby Features

```
D1. Chat: Both players in LobbyScene → type message → both see it
D2. Chat rate limit: Send 4 messages in 1 second → 4th shows "Slow down"
D3. Kick: Host clicks [KICK] → opponent sees "Removed by host" → goes to HubScene
D4. Host disconnect: Host leaves → remaining player becomes host
    (system message: "X left. Y is now host.")
D5. Room expiry: Create room → wait 30+ minutes → room deleted by janitor
D6. Room browser refresh: Create room → browser shows it within 5 seconds
D7. Private room: Host with PRIVATE → room NOT shown in browser
    → joinable only via code
D8. Room code collision: Create 100+ rooms → no duplicate codes
```

### Test Group E: Edge Cases

```
E1. Double-click START: Only one game_starting event fires
E2. Disconnect during deposit: Player disconnects mid-deposit
    → opponent sees "Disconnected" → returned to HubScene
E3. Back-button mashing: Navigate rapidly between scenes
    → no crash, no orphaned DOM inputs, no double transitions
E4. Server not running: LoginScene → PLAY AS GUEST → HubScene
    → HOST A GAME → LobbyScene shows "Connecting..."
    → error message appears (not crash)
E5. Auth token expired: Logged in → wait 24h → try action
    → server returns 401 → client shows error (not crash)
E6. Browser refresh mid-lobby: Reload page → LoginScene
    → re-login or guest → works cleanly
E7. Legacy flow after lobby flow: Play lobby game → ResultScene
    → LEGACY → MainMenuScene → RoomScene → still works
```

### Test Group F: Server Health

```
F1. tsc compiles: npx tsc -p tsconfig.server.json --noEmit → 0 errors
F2. Client compiles: npx tsc --noEmit → 0 errors
F3. No 'any': grep -rn ": any\|as any" src/auth/ src/deck/ src/lobby/
    server/db/ server/validation/ server/api/ server/lobby/ → 0 results
F4. File sizes: wc -l on every new file → all under 200, most under 100
F5. DB tables exist: sqlite3 server/data/ocb.sqlite ".tables"
    → _migrations, collections, decks, match_history, players
F6. Janitor running: Server logs "[Janitor] Started" on boot
F7. Graceful shutdown: kill server → "[DB] Closed" in logs
```

---

## COMPLETE SYSTEM — ALL 6 STEPS — FILE INVENTORY

```
STEP 1: Shared Foundation
  MODIFIED: shared/types/NetworkEvents.ts (full rewrite)
  MODIFIED: src/network/SocketManager.ts (+4 edits)
  MODIFIED: src/GameState.ts (+auth/deck fields)
  MODIFIED: src/scenes/BattleScene.ts (+totalTurns)
  NEW:      src/auth/AuthManager.ts (stub)

STEP 2: Server Database + Auth API
  NEW:      server/db/database.ts
  NEW:      server/db/migrations.ts
  NEW:      server/validation/CardPool.ts
  NEW:      server/validation/DeckValidator.ts
  NEW:      server/api/middleware.ts
  NEW:      server/api/authRoutes.ts
  NEW:      server/api/collectionHelpers.ts
  NEW:      server/api/playerRoutes.ts
  NEW:      server/api/index.ts
  MODIFIED: server/app.ts (+cors, +json, +api mount, +db init, +shutdown)
  MODIFIED: .gitignore (+server/data/)

STEP 3: Server Deck + Collection + Lobby
  NEW:      server/api/deckRoutes.ts
  NEW:      server/api/collectionRoutes.ts
  NEW:      server/api/matchService.ts
  NEW:      server/api/matchRoutes.ts
  NEW:      server/lobby/lobbyHelpers.ts
  NEW:      server/lobby/RoomJanitor.ts
  NEW:      server/lobby/LobbyManager.ts
  MODIFIED: server/api/index.ts (mount 3 new routers)
  MODIFIED: server/rooms/RoomManager.ts (+70 LOC methods)
  MODIFIED: server/game/SessionManager.ts (+registerPlayer, +submitDeck, +match recording)
  MODIFIED: server/app.ts (+lobby, +janitor, +/api/rooms)

STEP 4: Client Auth + Deck
  REWRITE:  src/auth/AuthManager.ts (stub → real)
  NEW:      src/deck/DeckAPI.ts
  NEW:      src/deck/DeckValidatorClient.ts
  NEW:      src/deck/CollectionAPI.ts
  REWRITE:  src/config/DeckLoader.ts (3-priority chain)
  MODIFIED: src/scenes/MainMenuScene.ts (+auth UI)
  MODIFIED: src/scenes/RoomScene.ts (+deck submission)
  MODIFIED: src/network/SocketManager.ts (+registerPlayer, +submitDeck, +listeners)

STEP 5: Client Lobby Scenes
  NEW:      src/lobby/LobbySocketManager.ts
  NEW:      src/lobby/RoomBrowserAPI.ts
  NEW:      src/scenes/LoginScene.ts
  NEW:      src/scenes/HubScene.ts
  NEW:      src/scenes/RoomBrowserScene.ts
  NEW:      src/scenes/LobbyScene.ts
  MODIFIED: src/main.ts (+4 scene imports)
  MODIFIED: src/scenes/PreloadScene.ts (→LoginScene)
  MODIFIED: src/scenes/ResultScene.ts (→HubScene)

STEP 6: Integration & Polish
  NEW:      src/scenes/DeckBuilderScene.ts (stub)
  NEW:      src/ui/SceneTransition.ts (optional helper)
  MODIFIED: src/scenes/HubScene.ts (+host settings overlay, +deck builder nav)
  MODIFIED: src/scenes/ResultScene.ts (+REMATCH button, 3-button layout)
  MODIFIED: src/scenes/LobbyScene.ts (+disconnect safety)
  MODIFIED: src/scenes/RoomBrowserScene.ts (+fail count)
  MODIFIED: src/main.ts (+DeckBuilderScene)

TOTAL: 27 new files, 17 modified files across 6 steps
UNTOUCHED: GameEngine, Board, CombatResolver, all abilities, all auras,
           all renderers, CardDefinitions, CardRegistry, EventBus,
           SelectionManager, EscrowManager, WalletManager, all layouts/themes
```

---

**Git commit:** `feat: Step 6 — host settings overlay, rematch, deck builder stub, integration polish`

**Final tag:** `git tag v0.3.0-lobby-deckauth -m "Lobby system + deck/auth infrastructure complete"`
