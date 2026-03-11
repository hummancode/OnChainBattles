# OnChainBattles — Action Plan (12 March 2026)

Post-refactoring audit findings and development roadmap.
Follows completion of all 11 phases from `OCB_Architecture_ActionPlan_FINAL_v5.md`.

---

## Tier 1 — Critical (Fix before any real-money matches)

### 1.1 Server Trusts Client `game_over` (Security)

**Severity:** CRITICAL
**Files:** `server/game/SessionManager.ts` (line ~28), `src/network/SocketManager.ts` (lines 165-171)

**Problem:**
The server blindly trusts the `game_over` event sent by the client. When a game ends, the winning client emits:
```ts
socket.emit('game_over', {
  roomCode: GameState.roomCode,
  winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
});
```
The server receives this and immediately calls `PayoutService.payoutWinner()` using the claimed `winnerIndex` — no verification that this player actually won. A malicious client can:
1. Lose the game legitimately
2. Send a fake `game_over` with themselves as the winner
3. Receive the entire pot (minus 5% rake)

**Fix — Server-Side Game State Tracker:**
- Maintain a minimal game log on the server: track all relayed actions in order per room
- On `game_over`, verify the claim against the action log (at minimum: confirm a King was killed)
- Reject `game_over` from a player who already sent one (prevent double-claims)
- Add a timeout: if no `game_over` arrives within N minutes of last action, flag the match for manual review
- Long-term: run a headless game engine on the server to fully validate outcomes

**Interim mitigation (if full fix is too large):**
- Require BOTH clients to agree on the winner. If they disagree, freeze payout and flag for admin review
- Add a `game_over` cooldown: only accept `game_over` after at least N actions have been relayed

---

### 1.2 No Server-Side Action Validation

**Severity:** CRITICAL
**Files:** `server/game/SessionManager.ts` (line ~24), `server/rooms/RoomManager.ts`

**Problem:**
The server acts as a dumb relay — it forwards any `game_action` from one player to the other without any validation:
```ts
socket.on('game_action', ({ roomCode, action }) => {
  socket.to(roomCode).emit('opponent_action', action);
});
```
Exploitable behaviors:
- **Turn injection:** P2 can send `END_PLAY_PHASE` during P1's turn, and P1's client will execute it
- **Action spam:** Same action can be sent repeatedly (e.g., duplicate attacks to stack damage)
- **Phase violation:** Send `ATTACK_UNIT` during Play phase when only card placement is allowed
- **Ghost units:** Reference units that don't exist to trigger error paths

**Fix — Layered Validation:**

**Layer 1 (Easy — Turn ownership):**
- Server tracks `currentTurnPlayer` per room (toggle on `END_ACT_PHASE`)
- Reject any `game_action` from the player whose turn it is NOT
- Track phase state: `PLAY` or `ACT`. Reject phase-inappropriate actions.

**Layer 2 (Medium — Action schema validation):**
- Validate required fields per action type:
  - `PLAY_CARD` requires `handIndex`, `col`, `row`
  - `MOVE_UNIT` requires `fromCol`, `fromRow`, `col`, `row`
  - `ATTACK_UNIT` requires `fromCol`, `fromRow`, `targetCol`, `targetRow`
  - `SELECT_POSITION` requires `col`, `row`
  - `END_PLAY_PHASE` / `END_ACT_PHASE` require no extra fields
- Reject actions with missing or out-of-bounds coordinates (col/row must be 0-6)

**Layer 3 (Hard — Full game logic validation):**
- Run headless `GameEngine` on server per active match
- Replay every action through the engine; if the engine throws, reject the action
- This eliminates ALL client-side cheating but requires the game engine to be isomorphic (runs in Node)

**Recommended approach:** Implement Layer 1 immediately, Layer 2 in parallel, Layer 3 as a longer-term goal.

---

### 1.3 No Wallet Proof-of-Ownership

**Severity:** HIGH (Critical for crypto mode)
**Files:** `server/rooms/RoomManager.ts` (lines 42-50), `src/network/SocketManager.ts` (`registerWallet`)

**Problem:**
`registerWallet()` accepts any wallet address string with no proof that the sender owns that wallet:
```ts
socket.on('registerWallet', ({ roomCode, walletAddress }) => {
  room.players[socketIndex].wallet = walletAddress; // No verification!
});
```
A player can:
- Register a different wallet to redirect payouts
- Register the opponent's wallet to cause confusion
- Change their wallet address mid-match by calling `registerWallet` again

**Fix — Signature-Based Verification:**

**Client side:**
```ts
// In RoomScene.ts, before registerWallet:
const message = `OnChainBattles:${roomCode}:${Date.now()}`;
const signature = await signer.signMessage(message);
SocketManager.registerWallet(walletAddress, message, signature);
```

**Server side:**
```ts
import { verifyMessage } from 'ethers';

socket.on('registerWallet', ({ roomCode, walletAddress, message, signature }) => {
  const recovered = verifyMessage(message, signature);
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    socket.emit('error', { message: 'Wallet verification failed' });
    return;
  }
  // Verify message contains correct roomCode
  if (!message.includes(roomCode)) {
    socket.emit('error', { message: 'Invalid verification message' });
    return;
  }
  room.players[socketIndex].wallet = walletAddress;
});
```

**Additional hardening:**
- Only accept `registerWallet` once per player per match (reject re-registration)
- Add timestamp to prevent replay attacks (reject if message timestamp > 5 minutes old)
- Store the signature server-side for audit trail

---

## Tier 2 — High Value (Significant quality improvements)

### 2.1 Engine Event Bridge Memory Leak

**Severity:** HIGH
**Files:** `src/scenes/battle/EngineEventBridge.ts` (line ~60), `src/scenes/BattleScene.ts` (`shutdown`)

**Problem:**
`wireEngineToEventBus(engine, localPlayerIndex)` registers a callback via `engine.on()`:
```ts
engine.on((event: GameEvent) => {
  // transforms and emits to EventBus
});
```
This callback is stored in `GameEngine.subscribers: Set<Function>` but is **never unsubscribed** when the BattleScene shuts down. On rematch/replay:
- A new bridge registers a new callback
- The old callback still exists in the engine's subscriber set
- Both fire on every game event, causing duplicate EventBus emissions
- After N rematches, N bridge callbacks are active simultaneously

`BattleScene.shutdown()` calls `EventBus.clearAll()` which clears EventBus listeners, but does NOT clear the engine's subscriber set — the old bridges keep pumping events into a fresh EventBus.

**Fix:**
```ts
// EngineEventBridge.ts — return unsub function
export function wireEngineToEventBus(engine: GameEngine, localPlayerIndex: number): () => void {
  const handler = (event: GameEvent) => { /* ... */ };
  engine.on(handler);
  return () => engine.off(handler); // NEW: return cleanup function
}

// GameEngine.ts — add off() method
off(subscriber: (event: GameEvent) => void): void {
  this.subscribers.delete(subscriber);
}

// BattleScene.ts — store and call unsub
private bridgeUnsub?: () => void;

create() {
  this.bridgeUnsub = wireEngineToEventBus(this.engine, localPlayerIndex);
}

shutdown() {
  this.bridgeUnsub?.();          // Clean up engine subscriber
  this.hudUnsubs.forEach(fn => fn());
  EventBus.clearAll();
  // ... destroy renderers
}
```

---

### 2.2 Zero Unit Tests for Game Logic

**Severity:** HIGH
**Files:** None exist — need to create `src/game/__tests__/` or `tests/game/`

**Problem:**
The entire game engine — phases, abilities, combat, movement, aura system — has zero automated test coverage. Only Hardhat contract tests exist. This means:
- Any refactoring risks silent regressions
- Ability handlers with complex interactions (Coup, Treason, Mystic revive) are validated only by manual playtesting
- Edge cases (e.g., killing a unit mid-aura-recalc, playing a card when hand is empty) are untested

**Recommended Test Strategy:**

**Phase 1 — Core loop integration tests (10-15 tests):**
```
tests/game/
  GameEngine.test.ts       — create engine, play cards, advance phases, check win condition
  CombatResolver.test.ts   — attack scenarios, counter-attack, cavalry counter, ranged no-counter
  MovementRules.test.ts    — valid moves per movement type, blocking, jump patterns
```

**Phase 2 — Ability handler unit tests (20-30 tests):**
```
tests/game/abilities/
  onDeployDraw.test.ts     — Messenger draws 1, Scribe draws 2
  auraRoyalDiscount.test.ts — Princess reduces royal costs
  spellCoup.test.ts        — Coup kills target, spawns foot soldiers
  spellTreason.test.ts     — Treason steals unit, exhausted flag
  mysticRevive.test.ts     — Revive from graveyard, position selection
```

**Phase 3 — Edge case and regression tests:**
- King killed during ability resolution
- Unit dies from counter-attack triggering ON_DEATH_DRAW
- Castle spawn when board is full
- Playing a card with insufficient LEG
- Double-move prevention (hasMoved flag)

**Test setup needs:**
- Install vitest or jest (`npm i -D vitest`)
- GameEngine can be instantiated without Phaser (pure TS) — no mocking needed
- Create test helper: `createTestEngine(p1Cards, p2Cards)` that skips UI wiring

---

### 2.3 No Reconnection Logic

**Severity:** HIGH
**Files:** `src/network/SocketManager.ts`, `src/scenes/battle/NetworkCoordinator.ts`

**Problem:**
SocketManager uses default Socket.io settings with no reconnection strategy:
- `socket.on('disconnect')` only logs to console
- `sendGameAction()` silently discards actions when disconnected
- Opponent disconnect triggers immediate win + scene transition (3-second timer)
- No "Reconnecting..." UI state
- No action buffering during outage

A brief network hiccup (common on mobile, Wi-Fi switching) instantly ends the game.

**Fix — Reconnection with Action Buffer:**

**Client side (SocketManager.ts):**
```ts
// Enable Socket.io reconnection
this.socket = io(this.serverUrl, {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Buffer actions during disconnect
private actionBuffer: GameAction[] = [];
private isConnected = false;

this.socket.on('connect', () => {
  this.isConnected = true;
  // Flush buffered actions
  this.actionBuffer.forEach(a => this.socket!.emit('game_action', { roomCode: GameState.roomCode, action: a }));
  this.actionBuffer = [];
});

this.socket.on('disconnect', () => {
  this.isConnected = false;
  this.callbacks?.onConnectionLost?.();   // NEW callback
});

this.socket.on('reconnect', () => {
  this.callbacks?.onReconnected?.();      // NEW callback
});

sendGameAction(action: GameAction): void {
  if (!this.isConnected) {
    this.actionBuffer.push(action);       // Buffer instead of discard
    return;
  }
  this.socket!.emit('game_action', { roomCode: GameState.roomCode, action });
}
```

**UI side (NetworkCoordinator.ts or new ConnectionOverlay):**
- Show "Connection lost — reconnecting..." overlay on `onConnectionLost`
- Hide overlay on `onReconnected`
- If all reconnection attempts fail, THEN award opponent the win

**Server side:**
- Track disconnect timestamps per player
- Add grace period (e.g., 30 seconds) before declaring a player disconnected
- On reconnect, send missed actions from the action log

---

### 2.4 Ability Handler Error Boundary

**Severity:** MEDIUM-HIGH
**Files:** `src/game/abilities/AbilityDispatcher.ts` (line ~43)

**Problem:**
`AbilityDispatcher.dispatch()` iterates over a card's abilities and calls each handler. If any handler throws an unhandled exception (e.g., referencing a dead unit, array index out of bounds), the entire phase execution crashes:
```ts
for (const ability of card.abilities) {
  const handler = this.registry.get(ability.type);
  handler.execute(context, ability.params); // If this throws → game crashes
}
```

The `EventBus` has try-catch around its handlers, and `GameEngine` wraps subscriber callbacks — but the ability dispatch path has no error boundary.

**Impact:** A single buggy ability (or unexpected board state) can freeze the game mid-match with no recovery.

**Fix:**
```ts
for (const ability of card.abilities) {
  const handler = this.registry.get(ability.type);
  if (!handler) {
    console.warn(`[AbilityDispatcher] No handler for ability type: ${ability.type}`);
    continue;
  }
  try {
    handler.execute(context, ability.params);
  } catch (err) {
    console.error(`[AbilityDispatcher] Handler "${ability.type}" threw for card "${context.cardId}":`, err);
    // Continue to next ability — don't crash the entire phase
  }
}
```

Also wrap the `PendingCommandResolver.resolve()` call path, since pending interactions (POSITION, DISCARD) involve async user input and are another failure point.

---

### 2.5 Typed Engine State Access (Eliminate `as any` casts)

**Severity:** MEDIUM
**Files:** `src/scenes/battle/InputCoordinator.ts`, `NetworkCoordinator.ts`, `HUDRefreshCoordinator.ts`, `GameOverHandler.ts` — 8 total `(engine as any).getState()` casts

**Problem:**
All battle coordinators need to read engine state but `GameEngine` doesn't expose `getState()` on its public interface. They work around this with unsafe casts:
```ts
const state = (engine as any).getState();
```
This bypasses TypeScript's type system entirely — if `getState()` is renamed or its return type changes, no compile error is raised.

**Fix — Add typed read-only state accessor:**

```ts
// src/game/interfaces/IGameEngineReadonly.ts (NEW)
export interface GameSnapshot {
  board: BoardCell[];
  players: [PlayerStateSnapshot, PlayerStateSnapshot];
  modifiers: [GameModifiersSnapshot, GameModifiersSnapshot];
  turn: { turnNumber: number; currentPlayer: Player; phase: string };
  graveyard: [Unit[], Unit[]];
}

// GameEngine.ts — add to public API
getSnapshot(): GameSnapshot {
  return {
    board: this.board.serialize(),
    players: [this.players[0].serialize(), this.players[1].serialize()],
    modifiers: [this.modifiers[0].serialize(), this.modifiers[1].serialize()],
    turn: { ...this.turnState },
    graveyard: [this.graveyard[0].slice(), this.graveyard[1].slice()],
  };
}
```

Then replace all `(engine as any).getState()` with `engine.getSnapshot()` across coordinators.

---

## Tier 3 — Nice-to-Have (Polish and future-proofing)

### 3.1 Action Sequencing

**Severity:** MEDIUM
**Files:** `src/network/SocketManager.ts`, `server/game/SessionManager.ts`

**Problem:**
Game actions have no sequence numbers or timestamps. If two actions cross on the wire (network jitter), they can arrive at the opponent in wrong order, causing state divergence. Example: P1 sends MOVE then ATTACK in quick succession. Due to packet reordering, opponent receives ATTACK first (unit hasn't moved yet) → attack fails → boards diverge.

**Fix:**
- Add `seqNum: number` to `GameAction` interface (client increments per action sent)
- Server validates sequence is monotonically increasing per player
- Server stamps a global order number before relaying
- Client buffers and reorders incoming actions by server sequence number

---

### 3.2 State Checksum Sync

**Severity:** MEDIUM
**Files:** `src/game/Board.ts`, `src/game/GameEngine.ts`, `server/game/SessionManager.ts`

**Problem:**
Both clients run the game engine independently. If states diverge (due to a bug, race condition, or tampering), neither side knows. The game continues with inconsistent boards until something visibly breaks.

**Fix:**
- At end of each phase, compute a lightweight hash of board state:
  ```ts
  function boardHash(board: Board): string {
    const units = board.getAllUnits()
      .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
      .map(u => `${u.instanceId}:${u.position.col},${u.position.row}:${u.currentHP}`)
      .join('|');
    return simpleHash(units); // e.g., FNV-1a or CRC32
  }
  ```
- Emit hash to server at phase boundaries
- Server compares both players' hashes; if mismatch, log a warning (and optionally pause the game)
- Does NOT need to block gameplay — just provides visibility into sync issues

---

### 3.3 Game Seed Entropy

**Severity:** LOW
**Files:** `server/rooms/RoomManager.ts` (line ~31)

**Problem:**
```ts
const seed = Math.floor(Math.random() * 999999);
```
Only ~20 bits of entropy. A determined player could brute-force the seed to predict deck ordering (999,999 possibilities is trivially searchable).

**Fix:**
```ts
import { randomInt } from 'crypto';
const seed = randomInt(0, 2 ** 32); // 32-bit entropy, cryptographically random
```

---

### 3.4 Structured Logging

**Severity:** LOW
**Files:** Throughout `src/` and `server/`

**Problem:**
All logging uses `console.log/warn/error` with manual `[Tag]` prefixes:
```ts
console.log('[SocketManager] Connected to server.');
console.log(`[GameEngine] Phase: ${phase}`);
console.warn('[Board] Cell occupied');
```
In production, there's no way to filter by severity, disable debug logs, or send errors to a monitoring service.

**Fix — Lightweight Logger:**
```ts
// src/utils/Logger.ts
enum LogLevel { DEBUG, INFO, WARN, ERROR }

class Logger {
  private level: LogLevel = LogLevel.INFO;

  constructor(private tag: string) {}

  debug(...args: any[]) { if (this.level <= LogLevel.DEBUG) console.log(`[${this.tag}]`, ...args); }
  info(...args: any[])  { if (this.level <= LogLevel.INFO)  console.log(`[${this.tag}]`, ...args); }
  warn(...args: any[])  { if (this.level <= LogLevel.WARN)  console.warn(`[${this.tag}]`, ...args); }
  error(...args: any[]) { console.error(`[${this.tag}]`, ...args); }
}

// Usage:
const log = new Logger('SocketManager');
log.info('Connected to server.');
log.debug('Action sent:', action); // Only shows in debug mode
```

Set level from environment variable (`VITE_LOG_LEVEL`). Default to `WARN` in production builds.

---

## Bug Fixes Already Applied (12 March 2026)

These issues were found during the audit and fixed in the same session:

| # | File | Fix |
|---|------|-----|
| 1 | `src/web3/EscrowManager.ts` | `tx.wait()` null safety — `receipt?.blockNumber ?? '?'` |
| 2 | `src/renderers/OverlayRenderer.ts` | ESC key listener leak — cleanup on container destroy |
| 3 | `src/GameState.ts` | `clearMatchData()` now resets `depositTxHash` |
| 4 | `src/renderers/HandRenderer.ts` | Removed empty no-op `pointerup` listener |
| 5 | `src/game/Board.ts` | `serialize()` deep-copies `position` to prevent mutation |
| 6 | `src/game/data/CardRegistry.ts` | `Object.freeze` → `deepFreeze` for nested stats/abilities |

---

## Implementation Priority

**If crypto mode is active or launching soon:**
```
1.1 (server game_over validation) → 1.2 (action validation) → 1.3 (wallet proof)
→ 2.1 (bridge leak) → 2.4 (error boundary) → 2.2 (tests) → 2.3 (reconnection)
```

**If free-play only for now:**
```
2.1 (bridge leak) → 2.4 (error boundary) → 2.2 (tests) → 2.5 (typed state)
→ 2.3 (reconnection) → 1.x (security, before crypto launch)
```

---

## Estimated Effort

| Item | Effort | Risk |
|------|--------|------|
| 1.1 Server game state tracker | 2-3 days | Medium (needs server-side game logic) |
| 1.2 Action validation (Layer 1+2) | 1 day | Low |
| 1.3 Wallet signature verification | 0.5 day | Low |
| 2.1 Engine bridge unsub | 0.5 hour | Very low |
| 2.2 Unit test scaffold + 15 tests | 2 days | Low |
| 2.3 Reconnection logic | 1-2 days | Medium (UI + buffer + server grace) |
| 2.4 Ability error boundary | 0.5 hour | Very low |
| 2.5 Typed engine snapshot | 1-2 hours | Low |
| 3.1 Action sequencing | 1 day | Medium |
| 3.2 State checksum | 0.5 day | Low |
| 3.3 Seed entropy | 5 minutes | None |
| 3.4 Structured logging | 0.5 day | Low |
