# OnChainBattles — Action Plan (12 March 2026)

Post-refactoring audit findings and development roadmap.
Follows completion of all 11 phases from `OCB_Architecture_ActionPlan_FINAL_v5.md`.

---

## Tier 1 — Critical (Fix before any real-money matches)

### 1.1 ~~Server Trusts Client `game_over`~~ ✅ DONE

**Status:** Fixed (12 March 2026)

Dual-claim consensus system:
- Both clients send `game_over` with their claimed `winnerIndex`
- Server rejects: invalid winnerIndex, duplicate claim from same player, fewer than 4 relayed actions
- If both claims agree → payout winner
- If claims disagree → refund both players via `Escrow.refundTie()`
- Free-play mode settles immediately (no wallets involved)
- Room tracks `actionCount` and `gameOverClaims[]`

**Still open (Layer 3):** Running headless GameEngine on server for full action validation.

---

### 1.2 ~~No Server-Side Action Validation~~ ✅ Layer 1+2 DONE

**Status:** Layer 1 + Layer 2 implemented (12 March 2026)

**Layer 1 (Turn ownership):** Server tracks `currentTurnPlayer` and `currentPhase` per room. Rejects actions from wrong player. Tracks `END_PLAY_PHASE` → ACT and `END_ACT_PHASE` → PLAY + swap player.

**Layer 2 (Phase + field validation):** Rejects phase-inappropriate actions (e.g., ATTACK during PLAY). Validates required fields per action type (handIndex/col/row for PLAY_CARD, etc.).

**Layer 3 (Full engine validation):** Still open — run headless GameEngine on server per match. Eliminates all client-side cheating but requires more work.

---

### 1.3 ~~No Wallet Proof-of-Ownership~~ ✅ DONE

**Status:** Fixed (12 March 2026)

Client signs `OnChainBattles:{roomCode}:{timestamp}` with wallet signer. Server verifies signature with `ethers.verifyMessage`, checks roomCode in message, and rejects re-registration. Files: `RoomScene.ts`, `SocketManager.ts`, `NetworkEvents.ts`, `server/app.ts`.

~~**Severity:** HIGH (Critical for crypto mode)~~
~~**Files:** `server/rooms/RoomManager.ts` (lines 42-50), `src/network/SocketManager.ts` (`registerWallet`)~~

**Original problem:**
`registerWallet()` accepted any wallet address string with no proof that the sender owns that wallet:
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

### 2.1 ~~Engine Event Bridge Memory Leak~~ ✅ DONE

**Status:** Fixed (12 March 2026)

`wireEngineToEventBus` now returns an unsub function. `BattleScene` stores it and calls it in `shutdown()`, preventing subscriber accumulation on rematch.

---

### 2.2 ~~Zero Unit Tests for Game Logic~~ ✅ DONE

**Status:** Completed (12 March 2026)

74 tests across 10 files covering phases, abilities, pending interactions, replay determinism, and a full game loop smoke test. Run: `npm run test:game` (all) or `npm run test:smoke` (game loop only).

```
tests/engine/
  gameLoop.test.ts              — 14 tests: full game to GAME_OVER, invariants, replay
  helpers/TestHarness.ts        — shared utilities, all ability handlers registered
  phases/phaseTransitions.test.ts — 9 tests
  phases/playPhase.test.ts      — 11 tests
  phases/actPhase.test.ts       — 8 tests
  phases/combatResolver.test.ts — 5 tests
  abilities/onDeployHeal.test.ts — 4 tests
  abilities/onDeployDraw.test.ts — 3 tests
  pending/pendingCommand.test.ts — 6 tests
  pending/pendingResolver.test.ts — 7 tests
  replay/replayConsistency.test.ts — 4 tests
```

---

### 2.3 ~~No Reconnection Logic~~ ✅ DONE

**Status:** Fixed (12 March 2026)

Full reconnection system implemented:

**Client (SocketManager.ts):**
- Socket.io reconnection enabled: 5 attempts, 1-5s delay
- Action buffer: `sendGameAction()` buffers during disconnect, flushes on reconnect
- `rejoin_room` event sent on reconnect to re-associate socket with room
- New callbacks: `onConnectionLost`, `onReconnected`, `onReconnectFailed`, `onOpponentReconnected`, `onOpponentAbandon`

**Server (SessionManager.ts):**
- 30-second grace period on disconnect (configurable via `GRACE_PERIOD_MS`)
- `handleRejoin()`: re-maps new socket ID to player slot, cancels grace timer, re-registers handlers
- `opponentAbandon` event emitted when grace period expires (triggers win for remaining player)
- `opponentReconnected` event emitted on successful rejoin

**UI (NetworkCoordinator.ts):**
- Opponent disconnect shows non-blocking banner: "Opponent disconnected — waiting for reconnect..."
- Banner removed on `opponentReconnected`, replaced with brief "Reconnected!" flash
- Self-disconnect shows centered overlay: "Connection lost — reconnecting..."
- If all attempts fail, `handleFinalDisconnect` awards win and transitions to ResultScene

**Events added:** `rejoin_room` (C→S), `opponentReconnected`, `opponentAbandon`, `rejoinSuccess` (S→C)

---

### 2.4 ~~Ability Handler Error Boundary~~ ✅ DONE

**Status:** Fixed (12 March 2026)

All three dispatch loops (`resolveOnDeploy`, `resolveOnDeath`, `resolveOnKill`) in `AbilityDispatcher.ts` wrapped in try-catch. A buggy handler logs the error and continues instead of crashing the match.

---

### 2.5 ~~Typed Engine State Access (Eliminate `as any` casts)~~ ✅ DONE

**Status:** Fixed (12 March 2026)

`getState()` was already on `IGameEngineAPI` interface (which `GameEngine implements`). The `(engine as any)` casts were unnecessary leftovers. Removed all 8 casts + associated `(c: any)` / `(p: any)` parameter casts across InputCoordinator, NetworkCoordinator, HUDRefreshCoordinator, and GameOverHandler. Two harmless `as any` remain: SelectionManager constructor compatibility cast, and unknown-action-type safety log.

---

## Tier 3 — Nice-to-Have (Polish and future-proofing)

### 3.1 ~~Action Sequencing~~ ✅ DONE

**Status:** Fixed (12 March 2026)

- `seqNum` added to `GameAction` — client auto-increments per `sendGameAction()` call, resets on connect
- Server validates monotonic increase per player (rejects stale/duplicate seqNums)
- Server stamps `serverSeq` (global order number) before relaying to opponent
- Room tracks `lastSeqNum: [number, number]` and `globalSeq: number`
- Files: `shared/types/NetworkEvents.ts`, `src/network/SocketManager.ts`, `server/game/SessionManager.ts`, `server/rooms/RoomManager.ts`

---

### 3.2 ~~State Checksum Sync~~ ✅ DONE

**Status:** Fixed (12 March 2026)

- FNV-1a board hash utility (`src/game/utils/boardHash.ts`) — hashes unit instanceIds, positions, HP, owner
- Both clients emit `state_hash` to server after every `END_PLAY_PHASE` / `END_ACT_PHASE` (both local and opponent replay)
- Server collects hashes per `afterGlobalSeq`, compares when both arrive, logs `STATE MISMATCH` warning on divergence
- Non-blocking: mismatches are logged, don't pause gameplay
- Files: `boardHash.ts`, `BattleScene.ts`, `NetworkCoordinator.ts`, `SessionManager.ts`, `NetworkEvents.ts`

---

### 3.3 ~~Game Seed Entropy~~ ✅ DONE

**Status:** Fixed (12 March 2026)

`Math.random() * 999999` → `crypto.randomInt(0, 2^32)` in RoomManager. 32-bit cryptographically random seed.

---

### 3.4 ~~Structured Logging~~ ✅ DONE

**Status:** Fixed (12 March 2026)

Logger class created for both client (`src/utils/Logger.ts`) and server (`server/utils/Logger.ts`). Features:
- `LogLevel` enum: DEBUG, INFO, WARN, ERROR, NONE
- Global level from env: `VITE_LOG_LEVEL` (client) / `LOG_LEVEL` (server)
- Defaults: DEBUG in dev, WARN in prod
- Wired into all server files (SessionManager, RoomManager, PayoutService)

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
| ~~1.1 Server game_over consensus~~ | ~~2-3 days~~ | ✅ Done (dual-claim) |
| ~~1.2 Action validation (Layer 1+2)~~ | ~~1 day~~ | ✅ Done |
| ~~1.3 Wallet signature verification~~ | ~~0.5 day~~ | ✅ Done |
| ~~2.1 Engine bridge unsub~~ | ~~0.5 hour~~ | ✅ Done |
| ~~2.2 Unit test scaffold + 15 tests~~ | ~~2 days~~ | ✅ Done (74 tests) |
| ~~2.3 Reconnection logic~~ | ~~1-2 days~~ | ✅ Done |
| ~~2.4 Ability error boundary~~ | ~~0.5 hour~~ | ✅ Done |
| ~~2.5 Typed engine snapshot~~ | ~~1-2 hours~~ | ✅ Done |
| ~~3.1 Action sequencing~~ | ~~1 day~~ | ✅ Done |
| ~~3.2 State checksum~~ | ~~0.5 day~~ | ✅ Done |
| ~~3.3 Seed entropy~~ | ~~5 minutes~~ | ✅ Done |
| ~~3.4 Structured logging~~ | ~~0.5 day~~ | ✅ Done |
