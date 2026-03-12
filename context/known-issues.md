# Known Issues & Recent Fixes

## Open Issues
- Pre-existing 16 unused variable TS warnings (baseline, don't fix — see CLAUDE.md)
- `selectColumn` and `selectDiscard` not networked yet (no cards use COLUMN/DISCARD pending in current card pool)

## Fixed (12 March 2026 — Session 3)

### Quick wins batch
- **Seed entropy (3.3)**: `Math.random() * 999999` → `crypto.randomInt(0, 2^32)` in RoomManager. 20-bit → 32-bit entropy.
- **Engine bridge memory leak (2.1)**: `wireEngineToEventBus` now returns unsub function. BattleScene calls it in `shutdown()`. Prevents subscriber accumulation on rematch.
- **Ability error boundary (2.4)**: All three dispatch loops (`resolveOnDeploy`, `resolveOnDeath`, `resolveOnKill`) wrapped in try-catch. A buggy handler logs instead of crashing the match.
- **Dead code removal**: Removed unused `onTargetSelected` and `onCloseOverlay` fields from OverlayRenderer.
- **Typed engine state (2.5)**: Removed all 8 `(engine as any).getState()` casts across 4 coordinator files. `getState()` was already on `IGameEngineAPI`.

### Action plan items
- **Server action validation (1.2 Layer 1+2)**: Server tracks `currentTurnPlayer` and `currentPhase` per room. Rejects out-of-turn actions, phase-inappropriate actions, and missing required fields.
- **Wallet proof-of-ownership (1.3)**: Client signs message with wallet signer, server verifies with `ethers.verifyMessage`. Re-registration rejected.
- **`__DRAW__` bug fix**: `applyEvent` for `CARD_DRAWN` only handled `__DRAW_OVERFLOW__`. Added handling for `__DRAW__` and `__DRAW_FILTERED_*` — messenger/scribe on-deploy draws now actually draw cards.
- **Deterministic test seed**: TestHarness now sets `GameState.gameSeed = 42` by default, eliminating flaky tests from random deck order.

## Fixed (12 March 2026 — Session 2)

### Priest heal cancel freeze (multiplayer)
- **Root cause**: `cancelPending()` and `selectTarget()` had no network sends. Opponent engine stuck in AWAITING_INPUT forever.
- **Fix**: Added `SELECT_TARGET` + `CANCEL_PENDING` to GameAction type, InputCoordinator sends, NetworkCoordinator replay handlers.
- **Files**: GameEngine.ts, InputCoordinator.ts, NetworkCoordinator.ts, SocketManager.ts, NetworkEvents.ts

### Double INTERACTION_RESOLVED emit
- **Root cause**: Cancel button emitted INTERACTION_RESOLVED, then `clearPending()` emitted it again re-entrantly via engine subscribers.
- **Fix**: `cancelPending()` now clears state silently (no emit) since UI already emitted it.
- **File**: GameEngine.ts

### moveUnit() missing pending/status sync
- **Root cause**: Unlike `playCard()` and `attackUnit()`, `moveUnit()` never synced `ctx.pending` back to the engine. Death-triggered pending abilities during moves were lost.
- **Fix**: Added sync block + also added pending to `syncFromContext()`.
- **File**: GameEngine.ts

### Priest heal on full-HP units
- **Root cause**: `onDeployHeal` included all friendly units (including the just-placed full-HP Priest). If only full-HP units existed, player was forced to pointlessly heal.
- **Fix**: Filter `u.currentDef < u.maxDef` — skip if nobody damaged.
- **File**: onDeployHeal.ts

### Battle scene race condition (multiplayer)
- **Root cause**: No "both players ready" handshake. Fast player loads BattleScene and starts acting; slow player's socket callbacks still point to RoomScene, so actions are lost.
- **Fix**: Added `player_ready` → server queues actions until both ready → `both_battle_ready` → flush queue → start engine.
- **Files**: BattleScene.ts, SocketManager.ts, SessionManager.ts, NetworkEvents.ts, RoomManager.ts

### ESC key support for pending interactions
- Added ESC key handlers to board-mode and modal target select overlays.
- **File**: OverlayRenderer.ts

### sourceAbility missing from PENDING_TARGET
- PlayPhase didn't include `sourceAbility` in the PENDING_TARGET event emit.
- **File**: PlayPhase.ts

## Fixed (12 March 2026 — Session 1)
- Priest heal cancel froze game (no cancelPending method)
- Priest heal didn't work (no TARGET handler in PendingCommandResolver)
- Priest heal UI blocked board (dimmer+modal → board mode split)
- InputCoordinator.selectTarget passed col as instanceId
- EscrowManager tx.wait() null safety
- OverlayRenderer ESC key listener leak on card detail close
- GameState.clearMatchData() missing depositTxHash reset
- Board.serialize() shallow copy → deep copy
- CardRegistry shallow freeze → deepFreeze
