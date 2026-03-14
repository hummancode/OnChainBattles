# Step 4 Patch: Client Auth + Deck

**Git branch:** `feat/step4-client-auth-deck`
**Estimated time:** 4–5 hours
**Prerequisites:** Steps 1–3 (shared types, server DB + auth + deck APIs)
**Verification:** `npx tsc --noEmit` after each sub-step

---

## Sub-step 4.1: Replace AuthManager Stub with Real Implementation

> **FULL REWRITE** of the Step 1 stub.
> One job: wallet-based login flow.
> ~75 LOC. Uses existing WalletManager for MetaMask.

📁 `src/auth/AuthManager.ts` — **FULL REWRITE**

```typescript
// ============================================================
// AuthManager.ts
// Wallet-based authentication: nonce → MetaMask sign → JWT.
// Uses existing WalletManager for wallet connection.
//
// Flow:
//   1. Ensure wallet connected (WalletManager.connect())
//   2. GET /api/auth/nonce → server returns nonce message
//   3. Sign message with MetaMask (signer.signMessage)
//   4. POST /api/auth/login → server returns JWT + player
//   5. Store JWT for REST calls + socket auth
// ============================================================

import WalletManager from '../web3/WalletManager';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export interface AuthPlayer {
  id: number;
  wallet: string;
  displayName: string;
  winCount: number;
  lossCount: number;
  eloRating: number;
  activeDeckId: number | null;
}

class AuthManagerClass {
  private _token: string | null = null;
  private _player: AuthPlayer | null = null;

  /** Full login flow: connect wallet → sign nonce → get JWT. */
  async login(): Promise<AuthPlayer> {
    // 1. Ensure wallet connected
    if (!WalletManager.isConnected()) {
      await WalletManager.connect();
    }
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No wallet signer available.');
    const address = await signer.getAddress();

    // 2. Request nonce
    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address}`);
    if (!nonceRes.ok) throw new Error('Failed to get nonce from server.');
    const { message } = await nonceRes.json();

    // 3. Sign with MetaMask
    const signature = await signer.signMessage(message);

    // 4. Authenticate
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address, signature }),
    });

    if (!loginRes.ok) {
      const err = await loginRes.json();
      throw new Error(err.error ?? 'Login failed.');
    }

    const data = await loginRes.json();
    this._token = data.token;
    this._player = data.player;
    console.log(`[AuthManager] Logged in as ${this._player!.displayName} (#${this._player!.id})`);
    return this._player!;
  }

  getToken(): string | null { return this._token; }
  getPlayer(): AuthPlayer | null { return this._player; }
  isLoggedIn(): boolean { return !!this._token && !!this._player; }

  /** Auth headers for REST API calls. Empty object if not logged in. */
  authHeaders(): Record<string, string> {
    if (!this._token) return {};
    return { 'Authorization': `Bearer ${this._token}` };
  }

  logout(): void {
    this._token = null;
    this._player = null;
    console.log('[AuthManager] Logged out.');
  }
}

export const AuthManager = new AuthManagerClass();
```

### Verification
```bash
npx tsc --noEmit
```

---

## Sub-step 4.2: `src/deck/DeckAPI.ts`

> One job: HTTP client for deck CRUD.
> ~80 LOC. Consumes the `/api/decks` endpoints from Step 3.

📁 **NEW FILE:** `src/deck/DeckAPI.ts`

```typescript
// ============================================================
// DeckAPI.ts
// HTTP client for server deck endpoints.
// All methods require authentication (AuthManager.authHeaders).
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export interface DeckData {
  id: number;
  name: string;
  cardIds: string[];
  isValid: boolean;
  errors?: string[];
  createdAt?: string;
  updatedAt?: string;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...AuthManager.authHeaders(),
      ...options.headers,
    },
  });
}

export class DeckAPI {

  static async list(): Promise<DeckData[]> {
    const res = await apiFetch('/decks');
    if (!res.ok) throw new Error('Failed to fetch decks.');
    return (await res.json()).decks;
  }

  static async create(name: string, cardIds: string[]): Promise<DeckData> {
    const res = await apiFetch('/decks', {
      method: 'POST',
      body: JSON.stringify({ name, cardIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Create failed.');
    }
    return (await res.json()).deck;
  }

  static async update(id: number, name?: string, cardIds?: string[]): Promise<DeckData> {
    const res = await apiFetch(`/decks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, cardIds }),
    });
    if (!res.ok) throw new Error('Update failed.');
    return (await res.json()).deck;
  }

  static async remove(id: number): Promise<boolean> {
    const res = await apiFetch(`/decks/${id}`, { method: 'DELETE' });
    return (await res.json()).success;
  }

  static async activate(id: number): Promise<void> {
    await apiFetch(`/decks/${id}/activate`, { method: 'POST' });
  }

  static async validate(cardIds: string[]): Promise<{ valid: boolean; errors: string[] }> {
    const res = await apiFetch('/decks/validate', {
      method: 'POST',
      body: JSON.stringify({ cardIds }),
    });
    return res.json();
  }
}
```

---

## Sub-step 4.3: `src/deck/DeckValidatorClient.ts`

> One job: Client-side instant validation for deck builder UX.
> ~60 LOC. Uses CardRegistry (not CardDefinitions — corrected from original plan).

📁 **NEW FILE:** `src/deck/DeckValidatorClient.ts`

```typescript
// ============================================================
// DeckValidatorClient.ts
// Client-side pre-validation for immediate UI feedback.
// Server validates authoritatively — this is for UX responsiveness.
// ============================================================

import { getCard } from '../game/data/CardRegistry';

const DECK_SIZE = 31;

export interface ClientDeckStats {
  valid: boolean;
  errors: string[];
  cardCount: number;
  avgCost: number;
  costCurve: Record<number, number>;
  typeBreakdown: Record<string, number>;
}

export function validateDeckClient(cardIds: string[]): ClientDeckStats {
  const errors: string[] = [];
  const costCurve: Record<number, number> = {};
  const typeBreakdown: Record<string, number> = {};
  let totalCost = 0;

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Need ${DECK_SIZE} cards (have ${cardIds.length}).`);
  }
  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck.');
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    try {
      const card = getCard(id);
      totalCost += card.cost;
      costCurve[card.cost] = (costCurve[card.cost] ?? 0) + 1;
      const cls = String(card.class);
      typeBreakdown[cls] = (typeBreakdown[cls] ?? 0) + 1;
    } catch {
      errors.push(`Unknown: ${id}`);
    }
  }

  for (const [id, count] of counts) {
    try {
      const card = getCard(id);
      if (count > card.copies) {
        errors.push(`${card.name}: ${count}/${card.copies} copies.`);
      }
    } catch { /* already reported */ }
  }

  return {
    valid: errors.length === 0,
    errors,
    cardCount: cardIds.length,
    avgCost: cardIds.length > 0 ? +(totalCost / cardIds.length).toFixed(1) : 0,
    costCurve,
    typeBreakdown,
  };
}
```

---

## Sub-step 4.4: `src/deck/CollectionAPI.ts`

> One job: Fetch player's card collection from server.
> ~25 LOC.

📁 **NEW FILE:** `src/deck/CollectionAPI.ts`

```typescript
// ============================================================
// CollectionAPI.ts
// Fetch the authenticated player's card collection.
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export interface OwnedCard {
  id: string;
  name: string;
  maxCopies: number;
  ownedCopies: number;
}

export async function fetchCollection(): Promise<OwnedCard[]> {
  const res = await fetch(`${API_BASE}/collection`, {
    headers: AuthManager.authHeaders(),
  });
  if (!res.ok) return [];
  return (await res.json()).collection;
}
```

---

## Sub-step 4.5: Update `src/config/DeckLoader.ts`

> Add server active deck as priority 1 in the loading chain.
> ~85 LOC (up from ~60). Same public interface: `load()`, `get()`, `invalidate()`.

📁 `src/config/DeckLoader.ts` — **FULL REWRITE**

```typescript
// ============================================================
// DeckLoader.ts
// Loads deck card IDs with priority chain:
//   1. Server active deck (via GameState.activeDeckCardIds)
//   2. /public/deck.config.json (developer override)
//   3. UNITS_ONLY_DECK_IDS (hardcoded fallback)
//
// Backward compatible: if no auth, no server deck, behaves
// identically to the original version.
// ============================================================

import { UNITS_ONLY_DECK_IDS } from '../game/data/DeckDefinitions';
import { getCard } from '../game/data/CardRegistry';
import GameState from '../GameState';

type DeckSource = 'server' | 'config' | 'fallback' | 'none';

class DeckLoaderClass {
  private deckIds: string[] | null = null;
  private source: DeckSource = 'none';
  private readonly CONFIG_PATH = '/deck.config.json';

  /**
   * Load deck. Call once during PreloadScene.
   * Safe to call multiple times — returns cache after first load.
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    // Priority 1: Server-selected active deck
    if (GameState.hasActiveDeck()) {
      const ids = GameState.activeDeckCardIds;
      if (this.validateIds(ids)) {
        console.log(`[DeckLoader] Loaded ${ids.length} cards from server active deck`);
        this.deckIds = [...ids];
        this.source = 'server';
        return this.deckIds;
      }
      console.warn('[DeckLoader] Server deck has invalid cards — falling through');
    }

    // Priority 2: deck.config.json
    try {
      const res = await fetch(this.CONFIG_PATH);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.deckIds) && this.validateIds(json.deckIds)) {
          console.log(`[DeckLoader] Loaded ${json.deckIds.length} cards from deck.config.json`);
          this.deckIds = json.deckIds;
          this.source = 'config';
          return this.deckIds;
        }
      }
    } catch { /* silent — fall through */ }

    // Priority 3: Hardcoded fallback
    return this.useFallback();
  }

  /** Synchronous get — only valid after load(). */
  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  /** Which source loaded the current deck. */
  getSource(): DeckSource {
    return this.source;
  }

  /** Clear cache — forces re-load on next load() call. */
  invalidate(): void {
    this.deckIds = null;
    this.source = 'none';
  }

  private validateIds(ids: string[]): boolean {
    return ids.every(id => {
      try { getCard(id); return true; }
      catch { return false; }
    });
  }

  private useFallback(): string[] {
    console.log('[DeckLoader] Using UNITS_ONLY_DECK_IDS fallback');
    this.deckIds = [...UNITS_ONLY_DECK_IDS];
    this.source = 'fallback';
    return this.deckIds;
  }
}

export const DeckLoader = new DeckLoaderClass();
```

### Verification
```bash
npx tsc --noEmit
# Manual: game still loads and plays (DeckLoader fallback path works)
```

---

## Sub-step 4.6: Wire Auth into `src/scenes/MainMenuScene.ts`

> 3 edits: add imports, add login button in create(), add login handler method.
> MainMenuScene grows by ~45 LOC — still well within limits.

📁 `src/scenes/MainMenuScene.ts`

### Edit 1: Add imports

OLD (top imports):
```typescript
import Phaser from 'phaser';
import GameState, { RoomAction, GameMode } from '../GameState';
import WalletManager from '../web3/WalletManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';
```

NEW:
```typescript
import Phaser from 'phaser';
import GameState, { RoomAction, GameMode } from '../GameState';
import WalletManager from '../web3/WalletManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
```

### Edit 2: Add auth status + login button in `create()`

INSERT after the `cryptoBtn` creation block (after `onPointerDown: () => this.onPlayCrypto()` block closes), BEFORE `// ── Last match banner`:

```typescript
    // ── Auth Status / Login ─────────────────────────────────
    if (AuthManager.isLoggedIn()) {
      const player = AuthManager.getPlayer()!;
      this.add.text(CX, BASE_Y - 20, `Logged in: ${player.displayName}`, {
        fontSize: '12px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
      }).setOrigin(0.5);

      // Pre-fill name from auth
      this.nameInput.value = player.displayName;
    } else {
      new MenuButton(this, CX, LAYOUT.cryptoBtn.y + GAP * 0.7,
        '[ CONNECT WALLET & LOGIN ]', {
          color: '#4fc3f7', fontSize: '14px',
          onPointerDown: () => this.handleWalletLogin(),
        });
    }
```

### Edit 3: Add `handleWalletLogin()` method

INSERT after `cleanupPrevious()` method, BEFORE the closing `}` of the class:

```typescript
  // ─── Wallet Login ────────────────────────────────────────────

  private async handleWalletLogin(): Promise<void> {
    try {
      const player = await AuthManager.login();
      GameState.setAuthData(AuthManager.getToken()!, player.id, player.displayName);

      // Fetch active deck from server
      try {
        const { DeckAPI } = await import('../deck/DeckAPI');
        const decks = await DeckAPI.list();
        const active = decks.find(d => d.id === player.activeDeckId);
        if (active?.isValid) {
          GameState.setActiveDeck(active.id, active.cardIds);
          DeckLoader.invalidate(); // Force reload with server deck on next match
        }
      } catch (deckErr) {
        console.warn('[MainMenu] Failed to fetch decks:', deckErr);
      }

      // Refresh scene to show logged-in state
      this.scene.restart();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      ToastNotification.show(this, msg, { color: '#ff4444' });
    }
  }
```

### Edit 4: Enhance `onPlayCrypto()` to reuse auth if already logged in

OLD (start of `onPlayCrypto()`):
```typescript
  private async onPlayCrypto(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    // Disable buttons during wallet flow
    this.playFreeBtn.setDisabled(true);
    this.cryptoBtn.setDisabled(true);
    this.cryptoBtn.setLabel('Connecting wallet...');

    try {
      const address = await WalletManager.connect();
      GameState.connectWallet(address);
      GameState.setPlayerName(name);
```

NEW:
```typescript
  private async onPlayCrypto(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    this.playFreeBtn.setDisabled(true);
    this.cryptoBtn.setDisabled(true);
    this.cryptoBtn.setLabel('Connecting wallet...');

    try {
      // Reuse wallet if already connected via auth login
      let address: string;
      if (AuthManager.isLoggedIn() && WalletManager.isConnected()) {
        const signer = WalletManager.getSigner()!;
        address = await signer.getAddress();
      } else {
        address = await WalletManager.connect();
      }
      GameState.connectWallet(address);
      GameState.setPlayerName(AuthManager.isLoggedIn() ? GameState.displayName || name : name);
```

> Rest of `onPlayCrypto()` stays identical.

---

## Sub-step 4.7: Wire Deck Submission + Auth into `src/scenes/RoomScene.ts`

> 3 edits: add imports, register player after socket connect, submit deck before battle.

📁 `src/scenes/RoomScene.ts`

### Edit 1: Add imports

OLD (top imports):
```typescript
import Phaser from 'phaser';
import GameState, { GameMode, RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import EscrowManager, { STAKE_AVAX } from '../web3/EscrowManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';
```

NEW:
```typescript
import Phaser from 'phaser';
import GameState, { GameMode, RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import EscrowManager, { STAKE_AVAX } from '../web3/EscrowManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';
import { DeckLoader } from '../config/DeckLoader';
```

### Edit 2: Register player identity after room connect

In `connectSocket()`, update `onRoomCreated` and `onRoomJoined` callbacks:

OLD:
```typescript
  onRoomCreated: (code) => this.onRoomCreated(code),
  onRoomJoined: (code) => this.onRoomJoined(code),
```

NEW:
```typescript
  onRoomCreated: (code) => {
    this.onRoomCreated(code);
    if (GameState.authToken) SocketManager.registerPlayer(GameState.authToken);
  },
  onRoomJoined: (code) => {
    this.onRoomJoined(code);
    if (GameState.authToken) SocketManager.registerPlayer(GameState.authToken);
  },
```

> `registerPlayer` is a method added in Step 1 patch to SocketManager's `RoomCallbacks` — but wait, it's a socket emit, not a callback. Let me check.

Actually, `registerPlayer` was defined in the Step 1 `shared/types/NetworkEvents.ts` as a `ClientToServerEvents` entry. We need a method on SocketManager to emit it. Let me add it:

### Edit 2b: Add `registerPlayer` and `submitDeck` emit methods to SocketManager

📁 `src/network/SocketManager.ts` — add AFTER `signalCryptoReady()`, BEFORE `registerEvents()`:

```typescript
  /** Identify authenticated player with server via JWT. */
  registerPlayer(token: string): void {
    this.socket?.emit('registerPlayer', { token });
    console.log('[SocketManager] Registered player identity with server.');
  }

  /** Submit deck to server for validation before match. */
  submitDeck(deckIds: string[]): void {
    this.socket?.emit('submitDeck', {
      roomCode: GameState.roomCode,
      deckIds,
    });
    console.log(`[SocketManager] Submitted deck (${deckIds.length} cards).`);
  }
```

And register the response events in `registerEvents()` — add AFTER the `payout_result` handler:

```typescript
    this.socket.on('deckAccepted', (data: { cardCount: number }) => {
      console.log(`[SocketManager] Deck accepted (${data.cardCount} cards).`);
    });

    this.socket.on('deckRejected', (data: { errors: string[] }) => {
      console.warn('[SocketManager] Deck rejected:', data.errors);
    });

    this.socket.on('bothDecksReady', () => {
      console.log('[SocketManager] Both decks validated — ready to start.');
    });
```

### Edit 3: Submit deck before entering battle (free play path)

In `onOpponentJoined()`, update the free-play branch:

OLD:
```typescript
  } else {
    this.statusText.setText('Opponent joined! Entering battle...');
    this.time.delayedCall(800, () => this.enterBattle());
  }
```

NEW:
```typescript
  } else {
    this.statusText.setText('Opponent joined! Validating decks...');
    this.submitDeckAndEnter();
  }
```

### Edit 4: Add `submitDeckAndEnter()` method

INSERT after `handleCryptoDeposit()`, BEFORE `enterBattle()`:

```typescript
  /** Submit deck to server, then enter battle. Fallback: enter after 3s timeout. */
  private submitDeckAndEnter(): void {
    const deckIds = DeckLoader.get();
    SocketManager.submitDeck(deckIds);

    // Timeout fallback — server might not have submitDeck handler yet
    const fallback = this.time.delayedCall(3000, () => {
      console.log('[RoomScene] Deck validation timeout — entering battle.');
      this.enterBattle();
    });

    // Listen for server deck response on the raw socket
    const socket = SocketManager.getSocket();
    if (!socket) { this.enterBattle(); return; }

    const onAccepted = () => {
      this.statusText.setText('Deck accepted! Waiting for opponent...');
    };

    const onBothReady = () => {
      fallback.remove();
      cleanup();
      this.statusText.setText('Both decks validated! Entering battle...');
      this.time.delayedCall(500, () => this.enterBattle());
    };

    const onRejected = (data: { errors: string[] }) => {
      fallback.remove();
      cleanup();
      this.statusText.setText('Deck rejected!').setColor('#ff4444');
      this.subStatusText.setText(data.errors[0] ?? 'Invalid deck.');
      // Retry with fallback deck after 2s
      this.time.delayedCall(2000, () => {
        DeckLoader.invalidate();
        GameState.setActiveDeck(null, []);
        this.submitDeckAndEnter();
      });
    };

    const cleanup = () => {
      socket.off('deckAccepted', onAccepted);
      socket.off('bothDecksReady', onBothReady);
      socket.off('deckRejected', onRejected);
    };

    socket.on('deckAccepted', onAccepted);
    socket.on('bothDecksReady', onBothReady);
    socket.on('deckRejected', onRejected);
  }
```

---

## Sub-step 4.8: Add `.env` Client Variable

📁 `.env` (or `.env.example`) — add:

```
VITE_API_URL=http://localhost:3001/api
```

This is read by `import.meta.env.VITE_API_URL` in AuthManager and DeckAPI.
If not set, both fall back to `http://localhost:3001/api`.

---

## COMPLETE FILE CHANGE SUMMARY — Step 4

```
NEW FILES (3 files):
  src/deck/DeckAPI.ts               Deck CRUD HTTP client (~80 LOC)
  src/deck/DeckValidatorClient.ts   Client-side validation (~60 LOC)
  src/deck/CollectionAPI.ts         Collection fetch (~25 LOC)

MODIFIED FILES (4):
  src/auth/AuthManager.ts           FULL REWRITE — stub → real wallet auth (~75 LOC)
  src/config/DeckLoader.ts          FULL REWRITE — 3-priority chain (~85 LOC)
  src/scenes/MainMenuScene.ts       4 EDITS:
    └─ Add imports: AuthManager, DeckLoader
    └─ Add auth status / login button in create()
    └─ Add handleWalletLogin() method
    └─ onPlayCrypto(): reuse wallet if already auth'd
  src/scenes/RoomScene.ts           4 EDITS:
    └─ Add import: DeckLoader
    └─ connectSocket(): registerPlayer after room connect
    └─ onOpponentJoined(): call submitDeckAndEnter (free play)
    └─ Add submitDeckAndEnter() method
  src/network/SocketManager.ts      2 EDITS:
    └─ Add registerPlayer() + submitDeck() emit methods
    └─ Add deckAccepted/deckRejected/bothDecksReady listeners

UNTOUCHED:
  server/*                          Zero changes (all APIs built in Steps 2-3)
  shared/types/NetworkEvents.ts     Already done in Step 1
  src/scenes/BattleScene.ts         Zero changes (DeckLoader.get() just works)
  src/scenes/PreloadScene.ts        Zero changes (DeckLoader.load() chain transparent)
  src/game/*                        Zero changes
  src/renderers/*                   Zero changes
```

## Directory Structure After Step 4

```
src/
  auth/
    AuthManager.ts                  ← REWRITTEN (real implementation)
  deck/                             ← NEW FOLDER
    DeckAPI.ts                      ← NEW
    DeckValidatorClient.ts          ← NEW
    CollectionAPI.ts                ← NEW
  config/
    DeckLoader.ts                   ← REWRITTEN (3-priority chain)
    LayoutLoader.ts
    ThemeLoader.ts
  network/
    SocketManager.ts                ← EDITED (+methods +listeners)
  scenes/
    MainMenuScene.ts                ← EDITED (+auth UI)
    RoomScene.ts                    ← EDITED (+deck submission)
    BattleScene.ts                  ← untouched
    PreloadScene.ts                 ← untouched
    ResultScene.ts                  ← untouched
```

## POST-STEP VERIFICATION CHECKLIST

```bash
# 1. Client compiles
npx tsc --noEmit

# 2. No 'any' in new files
grep -rn ": any\|as any" src/auth/ src/deck/
# Expected: 0 results

# 3. All new files under 100 LOC
wc -l src/auth/AuthManager.ts src/deck/*.ts src/config/DeckLoader.ts
# Expected: all < 100

# 4. Server still compiles (shared types didn't break)
npx tsc -p tsconfig.server.json --noEmit

# 5. Manual: GUEST flow still works
# Open game → type name → PLAY FREE → room → opponent joins → battle plays
# DeckLoader falls through: server (no auth) → config → fallback

# 6. Manual: AUTH flow works (requires server running from Steps 2-3)
# npm run server   (in separate terminal)
# Open game → click "CONNECT WALLET & LOGIN" → MetaMask popup → sign
# → scene restarts with "Logged in: Player_abc123"
# → name input pre-filled with display name
# → PLAY FREE → room → deck submitted to server → battle plays

# 7. Manual: CRYPTO flow still works unchanged
# Open game → PLAY CRYPTO → MetaMask → room → deposit → opponent → battle

# 8. DeckLoader source check
# Open browser console after game loads:
# DeckLoader.getSource() → 'server' (if auth'd with active deck)
#                        → 'config' (if deck.config.json exists)
#                        → 'fallback' (otherwise)
```

**Git commit:** `feat: Step 4 — client auth + deck API + DeckLoader 3-priority chain`

---

## NOTES FOR STEP 5

Step 5 is the **client lobby scenes**:
- `src/lobby/LobbySocketManager.ts` — lobby: event wrapper (uses `SocketManager.getSocket()`)
- `src/lobby/RoomBrowserAPI.ts` — REST room list fetch
- `src/scenes/LoginScene.ts` — wallet/guest login scene
- `src/scenes/HubScene.ts` — home screen hub
- `src/scenes/RoomBrowserScene.ts` — browse public rooms
- `src/scenes/LobbyScene.ts` — enhanced room with chat/kick/ready

All server endpoints + socket events are ready from Steps 2-3. Step 5 purely consumes them on the client side.
