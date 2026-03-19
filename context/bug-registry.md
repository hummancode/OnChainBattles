# Bug Registry

Structured log of all bugs found and fixed. Each entry tracks root cause, fix, category, and how it could have been prevented.
Used to identify weak areas and improve code quality over time.

**Categories**: `logic` | `network` | `state` | `rendering` | `web3` | `type-safety` | `race-condition` | `memory-leak` | `security`

**Discovered by**: `user` (found during playtesting) | `claude` (found during code review/implementation) | `test` (caught by automated tests)

---

## Stats Summary

| Category | Count | User-Found | Claude-Found | Test-Found |
|----------|-------|------------|--------------|------------|
| logic | 17 | 5 | 12 | 0 |
| network | 7 | 5 | 2 | 0 |
| state | 10 | 4 | 6 | 0 |
| rendering | 4 | 1 | 2 | 1 |
| race-condition | 2 | 2 | 0 | 0 |
| memory-leak | 2 | 0 | 2 | 0 |
| web3 | 1 | 0 | 1 | 0 |
| type-safety | 5 | 2 | 3 | 0 |
| security | 5 | 1 | 4 | 0 |
| **TOTAL** | **55** | **20** | **34** | **1** |

---

## Entries

### BUG-001: Priest heal cancel froze game
- **Date**: 2026-03-12
- **Category**: `state`
- **Discovered by**: `user`
- **Symptom**: After cancelling Priest heal interaction, game froze — no further actions possible.
- **Root cause**: `GameEngine` had no `cancelPending()` method. Pending state was set but never clearable.
- **Fix**: Added `cancelPending()` to GameEngine, wired through SelectionManager → InputCoordinator.
- **Prevention**: Any state-setting operation should always have a corresponding clear/cancel path. Review all `pending` state setters for matching clearers.
- **Files**: GameEngine.ts, SelectionManager.ts, InputCoordinator.ts

### BUG-002: Priest heal didn't work at all
- **Date**: 2026-03-12
- **Category**: `logic`
- **Discovered by**: `user`
- **Symptom**: Clicking a friendly unit to heal did nothing.
- **Root cause**: `PendingCommandResolver` only handled POSITION commands, not TARGET commands.
- **Fix**: Added full TARGET resolution with board context to PendingCommandResolver.
- **Prevention**: When adding a new PendingCommand variant, always add its resolver handler. Could add a compile-time exhaustiveness check.
- **Files**: PendingCommandResolver.ts

### BUG-003: Priest heal UI blocked board clicks
- **Date**: 2026-03-12
- **Category**: `rendering`
- **Discovered by**: `user`
- **Symptom**: Heal target selection showed a modal overlay with dimmer, blocking board clicks.
- **Root cause**: `showTargetSelect()` always used the modal (dimmer + panel) overlay, designed for hand/graveyard selection. Board-mode targeting needs the board to remain clickable.
- **Fix**: Split into board-mode (non-blocking banner) vs modal-mode.
- **Prevention**: UI overlays should be classified by interaction type (board vs modal) upfront. Consider an enum.
- **Files**: OverlayRenderer.ts

### BUG-004: InputCoordinator passed col as instanceId
- **Date**: 2026-03-12
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Heal targeted wrong unit or failed silently.
- **Root cause**: `InputCoordinator.selectTarget()` passed the column number as `instanceId` instead of looking up the unit at (col, row).
- **Fix**: Look up unit at position first, then pass its instanceId.
- **Prevention**: Parameter naming — `instanceId` vs `col` should be caught by stronger typing. Use branded types for IDs vs coordinates.
- **Files**: InputCoordinator.ts

### BUG-005: EscrowManager tx.wait() null crash
- **Date**: 2026-03-12
- **Category**: `web3`
- **Discovered by**: `claude`
- **Symptom**: Potential crash when transaction receipt was null.
- **Root cause**: `tx.wait()` can return null in ethers.js v6 if the transaction is dropped/replaced.
- **Fix**: Added null safety check.
- **Prevention**: Always handle nullable returns from async blockchain calls.
- **Files**: EscrowManager.ts

### BUG-006: OverlayRenderer ESC key listener leak
- **Date**: 2026-03-12
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: ESC key listener accumulated on every card detail open/close.
- **Root cause**: `addEventListener('keydown')` added on open but never removed on close.
- **Fix**: Store listener reference, remove on close.
- **Prevention**: Every `addEventListener` must have a matching `removeEventListener` in cleanup. Could lint for this.
- **Files**: OverlayRenderer.ts

### BUG-007: GameState.clearMatchData() missing depositTxHash
- **Date**: 2026-03-12
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After rematch, old deposit tx hash persisted, could cause incorrect escrow logic.
- **Root cause**: `clearMatchData()` didn't reset `depositTxHash`.
- **Fix**: Added `this.depositTxHash = ''` to clearMatchData().
- **Prevention**: When adding new state fields, always update all clear/reset methods. Could add a test that verifies clearMatchData resets all fields.
- **Files**: GameState.ts

### BUG-008: Board.serialize() shallow copy
- **Date**: 2026-03-12
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Serialized board shared position references with live board — mutations leaked.
- **Root cause**: Shallow copy of grid cells didn't deep-copy position objects.
- **Fix**: Deep copy in serialize().
- **Prevention**: Serialization must always produce fully independent copies. Use structuredClone or explicit deep copy.
- **Files**: Board.ts

### BUG-009: CardRegistry shallow freeze
- **Date**: 2026-03-12
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Nested stats/abilities objects in frozen registry could still be mutated.
- **Root cause**: `Object.freeze()` is shallow — doesn't freeze nested objects.
- **Fix**: Replaced with recursive `deepFreeze()`.
- **Prevention**: Always use deepFreeze for immutable data structures with nesting.
- **Files**: CardRegistry.ts

### BUG-010: Priest heal cancel network desync
- **Date**: 2026-03-12
- **Category**: `network`
- **Discovered by**: `user`
- **Symptom**: Cancelling Priest heal froze opponent's game.
- **Root cause**: `cancelPending()` and `selectTarget()` had no network sends. Opponent engine stuck in AWAITING_INPUT.
- **Fix**: Added SELECT_TARGET and CANCEL_PENDING to GameAction type, wired through network layer.
- **Prevention**: Every local game action must have a corresponding network event. Checklist: if it changes engine state, it needs a socket emit.
- **Files**: GameEngine.ts, InputCoordinator.ts, NetworkCoordinator.ts, SocketManager.ts, NetworkEvents.ts

### BUG-011: Double INTERACTION_RESOLVED emit
- **Date**: 2026-03-12
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: UI received duplicate resolution events, causing glitches.
- **Root cause**: Cancel button emitted INTERACTION_RESOLVED, then `clearPending()` emitted it again via engine subscribers.
- **Fix**: `cancelPending()` clears state silently (no emit) since UI already emitted.
- **Prevention**: Event emission should be unidirectional — either the caller or the callee emits, never both.
- **Files**: GameEngine.ts

### BUG-012: moveUnit() missing pending/status sync
- **Date**: 2026-03-12
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: Death-triggered pending abilities during moves were lost.
- **Root cause**: Unlike `playCard()` and `attackUnit()`, `moveUnit()` never synced `ctx.pending` back to engine.
- **Fix**: Added sync block + pending to `syncFromContext()`.
- **Prevention**: All action methods should use the same sync pattern. Extract a shared `syncContextToEngine()` call.
- **Files**: GameEngine.ts

### BUG-013: Priest heal on full-HP units
- **Date**: 2026-03-12
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Player forced to pointlessly heal a full-HP unit.
- **Root cause**: Target filter included all friendly units regardless of HP.
- **Fix**: Filter `u.currentDef < u.maxDef`, skip if nobody damaged.
- **Prevention**: Target filters should always exclude invalid targets. Add validation at filter definition.
- **Files**: onDeployHeal.ts

### BUG-014: Battle scene race condition
- **Date**: 2026-03-12
- **Category**: `race-condition`
- **Discovered by**: `user`
- **Symptom**: In multiplayer, fast player's actions lost because slow player hadn't loaded yet.
- **Root cause**: No "both players ready" handshake. Fast player started acting before slow player's socket handlers were attached.
- **Fix**: Added `player_ready` → server queues → `both_battle_ready` → flush → start.
- **Prevention**: Any state transition involving multiple clients needs a sync barrier. Never assume both clients load at the same speed.
- **Files**: BattleScene.ts, SocketManager.ts, SessionManager.ts, NetworkEvents.ts, RoomManager.ts

### BUG-015: Zero-ATK units dealt damage via back-attack
- **Date**: 2026-03-14
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Messenger (0 ATK from aura suppression) dealt 1 damage via back-attack bonus.
- **Root cause**: Back-attack bonus (+1) applied even when base ATK was 0. `0 + 1 = 1`.
- **Fix**: Early return `if (atk <= 0) return 0` before bonus calculations.
- **Prevention**: Damage calculation should short-circuit on zero base damage. Bonuses are multipliers/additions to existing capability, not standalone damage sources.
- **Files**: CombatResolver.ts

### BUG-016: Custom pattern dy not player-relative
- **Date**: 2026-03-14
- **Category**: `logic`
- **Discovered by**: `user`
- **Symptom**: P1 units with custom movement patterns moved backward instead of forward.
- **Root cause**: `resolveCustomPattern()` used `offset.dy` directly without flipping for owner. Offsets defined from P1 perspective only.
- **Fix**: Added `dySign = unit.owner === Player.P1 ? 1 : -1`, multiply `offset.dy * dySign`.
- **Prevention**: Any coordinate system that differs per player must have an explicit flip. Document which perspective offsets use.
- **Files**: MovementRules.ts, CardTypes.ts, scout.ts, assassin.ts

### BUG-017: Aura removal not reflected in UI
- **Date**: 2026-03-14
- **Category**: `rendering`
- **Discovered by**: `user`
- **Symptom**: When an aura source moved away, buffed units kept showing old stats in UI.
- **Root cause**: AuraSystem only included non-zero deltas in `changes` array. Zero delta (aura removed) → unit excluded → no UNIT_STATS_CHANGED emitted → stale UI.
- **Fix**: State-Driven Rendering — sync ALL unit stats from engine state after every AURA_APPLIED event.
- **Prevention**: Never rely on delta events for UI sync. Always sync full state. See OCB_CODING_PRINCIPLES.md §3.6.
- **Files**: EngineEventBridge.ts, ActPhase.ts, PlayPhase.ts, LEGPhase.ts

### BUG-018: Commander DEF aura never applied
- **Date**: 2026-03-14
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Commander's DEF aura had no effect on troop stats.
- **Root cause**: AuraSystem Step 4 applied `atkDelta` and `moveDelta` but never applied `defDelta`. Also `maxDef` not reset in Step 1.
- **Fix**: Reset `maxDef = baseDef` in Step 1, apply `defDelta` in Step 4.
- **Prevention**: When adding a new stat delta type, grep for all existing delta applications and ensure the new one is included.
- **Files**: AuraSystem.ts

### BUG-019: Seed entropy too low
- **Date**: 2026-03-12
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: Game seed only had 20 bits of entropy — predictable deck shuffles.
- **Root cause**: `Math.random() * 999999` gives ~20-bit range.
- **Fix**: `crypto.randomInt(0, 2^32)` for 32-bit entropy.
- **Prevention**: Always use `crypto` module for security-sensitive random values, not `Math.random()`.
- **Files**: RoomManager.ts

### BUG-020: Engine bridge memory leak on rematch
- **Date**: 2026-03-12
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: Event subscribers accumulated on each rematch, degrading performance.
- **Root cause**: `wireEngineToEventBus` never returned unsub function, so subscribers were never cleaned up.
- **Fix**: Return unsub function, call in BattleScene `shutdown()`.
- **Prevention**: Every event subscription must have a cleanup path called on scene/component destroy.
- **Files**: EngineEventBridge.ts, BattleScene.ts

### BUG-021: `__DRAW__` event not handled
- **Date**: 2026-03-12
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Messenger/Scribe on-deploy draws didn't actually draw cards.
- **Root cause**: `applyEvent` for CARD_DRAWN only handled `__DRAW_OVERFLOW__` sentinel, not `__DRAW__` and `__DRAW_FILTERED_*`.
- **Fix**: Added handling for all draw sentinels.
- **Prevention**: When adding new event sentinels, update all switch/if chains that handle the event type.
- **Files**: GameEngine.ts

### BUG-022: Lobby→BattleScene transition: game never started
- **Date**: 2026-03-15
- **Category**: `network`
- **Discovered by**: `user`
- **Symptom**: After lobby matchmaking, battle scene loaded but game never started (Kings not placed).
- **Root cause**: `GameState.roomCode` never set in lobby flow. `player_ready` emitted with `roomCode: ""`, server couldn't find room.
- **Fix**: `LobbyScene.enterBattle()` sets roomCode before transition. SocketManager also sets on `roomCreated`.
- **Prevention**: Scene transitions must ensure all required state is set before transitioning. Add assertions at scene entry.
- **Files**: LobbyScene.ts, SocketManager.ts

### BUG-023: SocketManager 10+ `as any` casts
- **Date**: 2026-03-15
- **Category**: `type-safety`
- **Discovered by**: `claude`
- **Symptom**: No type errors but all lobby/reconnect events were untyped — silent breakage on refactors.
- **Root cause**: Quick iteration with `as any` casts instead of proper typing.
- **Fix**: Full rewrite with `ensureSocket()` pattern, shared event registration, all typed.
- **Prevention**: Never merge code with `as any` — add proper types upfront. CI could lint for `as any` count.
- **Files**: SocketManager.ts

### BUG-024: ESC key not wired for pending interactions
- **Date**: 2026-03-12
- **Category**: `network`
- **Discovered by**: `user`
- **Symptom**: No way to cancel pending interactions via keyboard.
- **Root cause**: ESC handlers simply not implemented for target select overlays.
- **Fix**: Added ESC key handlers to both board-mode and modal-mode overlays.
- **Prevention**: Every UI interaction that can be cancelled via button should also support ESC key. Add to interaction checklist.
- **Files**: OverlayRenderer.ts

### BUG-025: Server fails to compile after email auth — unused TokenPayload import
- **Date**: 2026-03-15
- **Category**: `type-safety`
- **Discovered by**: `user`
- **Symptom**: `npm run server` fails with TS6133 "TokenPayload is declared but its value is never read" in authRoutes.ts. Server never starts → frontend gets "Failed to fetch" on register/login.
- **Root cause**: `authRoutes.ts` imported `type TokenPayload` from middleware but only used `issueToken` and `requireAuth`. The server `tsconfig.server.json` has `noUnusedLocals: true` which catches unused type imports. The client `tsconfig.json` does not report this because Vite ignores TS errors — but the server build is strict.
- **Fix**: Removed unused `type TokenPayload` from the import statement.
- **Prevention**: Always run `npx tsc -p tsconfig.server.json --noEmit` after editing server files. The server tsconfig is stricter than the client. Two separate compilation targets exist and both must pass.
- **Files**: server/api/authRoutes.ts

### BUG-026: Lancer charge empty if-block — backward move allowed
- **Date**: 2026-03-15
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Lancer could move backward and still attack in the same turn, violating the charge rule (forward-only).
- **Root cause**: `ActPhase.ts:56-59` had an empty if-block that checked `isLancerForwardMove` but did nothing on failure.
- **Fix**: Set `unit.hasActed = true` inside the block so backward moves forfeit the charge attack.
- **Prevention**: Never leave if-blocks empty — always have a body or remove the block. Linters should flag empty blocks.
- **Files**: ActPhase.ts
- **Test**: `tests/engine/abilities/lancerCharge.test.ts`

### BUG-027: Earthquake COLUMN pending resolution no-op
- **Date**: 2026-03-15
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Playing Earthquake spell and selecting a column did nothing — no damage to any units.
- **Root cause**: `PendingCommandResolver.ts` had no COLUMN handler. Also `GameEngine.selectColumn` didn't pass board context.
- **Fix**: Added COLUMN case in resolver calling `applyEarthquakeDamage()`. Passed `{ board }` context from GameEngine.
- **Prevention**: When adding a new PendingCommand kind, add its resolver handler. Exhaustiveness check pattern.
- **Files**: PendingCommandResolver.ts, GameEngine.ts
- **Test**: `tests/engine/pending/pendingResolution.test.ts`

### BUG-028: War Horn DISCARD pending resolution no-op
- **Date**: 2026-03-15
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: War Horn drew 2 cards but the discard step did nothing — card stayed in hand.
- **Root cause**: Two issues: (1) Handler registered as string `'warHornHandler'` instead of `AbilityType.SPELL_WAR_HORN`, so AbilityDispatcher couldn't find it. (2) `GameEngine.selectDiscard` called resolver but resolver had no DISCARD logic, and the engine itself never removed the card.
- **Fix**: Fixed handler registration to use enum. Rewrote `selectDiscard` to directly splice card from hand and push to discard pile.
- **Prevention**: Always register ability handlers using AbilityType enum, never raw strings. TypeScript enum ensures consistency.
- **Files**: spellWarHorn.ts, GameEngine.ts, PendingCommandResolver.ts
- **Test**: `tests/engine/pending/pendingResolution.test.ts`

### BUG-029: JWT_SECRET hardcoded fallback in production
- **Date**: 2026-03-15
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: If `JWT_SECRET` env var not set, server uses known fallback string — allows token forgery.
- **Root cause**: `middleware.ts` used `??` fallback: `process.env.JWT_SECRET ?? 'ocb-dev-secret-replace-in-production'`.
- **Fix**: Throw error if `JWT_SECRET` missing in production. Dev mode keeps a fallback (clearly labeled).
- **Prevention**: Security-critical config should throw on missing values in production, not use defaults.
- **Files**: server/api/middleware.ts
- **Test**: `tests/server/security.test.ts`

### BUG-030: Express CORS allows all origins
- **Date**: 2026-03-15
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: REST API accessible from any origin (`origin: '*'`), while Socket.IO was restricted.
- **Root cause**: Express and Socket.IO had separate CORS configs — Express was wide open.
- **Fix**: Unified to use same `allowedOrigins` for both Express and Socket.IO.
- **Prevention**: Single source of truth for CORS — define once, use everywhere.
- **Files**: server/app.ts

### BUG-031: Lobby deck_submitted accepts unvalidated decks
- **Date**: 2026-03-15
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: Malicious client could submit any deckIds array (duplicates, invalid IDs, wrong size).
- **Root cause**: `LobbyManager.ts` stored deckIds directly without calling `DeckValidator.validateDeck()`.
- **Fix**: Added `validateDeck(deckIds)` call before accepting. Invalid decks return error to client.
- **Prevention**: All user input must be validated server-side. DeckValidator already existed but wasn't wired in.
- **Files**: server/lobby/LobbyManager.ts

### BUG-032: No default deck when player doesn't submit
- **Date**: 2026-03-15
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: 10s deck submission timeout fires `finalizeLaunch()` with null deckIds, causing downstream errors.
- **Root cause**: `finalizeLaunch()` never substituted a default deck for missing submissions.
- **Fix**: Added UNITS_ONLY_DECK_IDS substitution for null deckIds in `finalizeLaunch()`.
- **Prevention**: Always handle the "no input received" case with a documented default.
- **Files**: server/lobby/LobbyManager.ts

### BUG-033: Phaser Text glTexture null reference on scene transition
- **Date**: 2026-03-15
- **Category**: `rendering`
- **Discovered by**: `test` (browser performance tests via CDP)
- **Symptom**: 23 "Uncaught (in promise)" exceptions in console: `TypeError: Cannot read properties of null (reading 'glTexture')` at `Text2.updateText` → `TextStyle2.setColor`.
- **Root cause**: Text style methods (`.setColor()`, `.setText()`) are called on Phaser Text objects whose WebGL texture has already been destroyed — the Text belongs to a scene that has shut down, but a dangling reference (timer, tween, or event handler) still triggers an update.
- **Fix**: **OPEN** — needs investigation. Likely in HUDRenderer or OverlayRenderer. Guard with `if (text.active)` before style updates, and cancel pending timers/tweens in scene `shutdown` handler.
- **Prevention**: Every deferred text update (delayed call, tween callback, event handler) must check `text.active` or be cancelled in the scene's shutdown/destroy cleanup.
- **Files**: Likely `src/scenes/battle/HUDRefreshCoordinator.ts`, `src/renderers/` scene renderers

### BUG-034: Express route ordering — /:id catches /:id/solution
- **Date**: 2026-03-15
- **Category**: `network`
- **Discovered by**: `user`
- **Symptom**: Clicking `[ VIEW ]` on a solved puzzle showed "Could not load solution" error. The `GET /api/puzzles/:id/solution` endpoint was never reached.
- **Root cause**: In `puzzleRoutes.ts`, the generic `GET /:id` route was defined before `GET /:id/solution`. Express matched `/:id` first, treating the request as `GET /puzzles/1` with leftover `/solution` path, which returned "Puzzle not found" (wrong id) or hit the wrong handler.
- **Fix**: Moved `GET /:id/solution` route definition above `GET /:id` so the more specific route matches first.
- **Prevention**: In Express, always define more specific parameterized routes before generic catch-all `:id` routes. Consider using route prefixes or explicit path segments to avoid ambiguity.
- **Files**: `server/api/puzzleRoutes.ts`

### BUG-035: LoginScene allButtons array accumulates across scene revisits
- **Date**: 2026-03-15
- **Category**: `state`
- **Discovered by**: `user`
- **Symptom**: After entering as guest, navigating to HubScene, clicking "Log In" to return to LoginScene, the Register button stopped working.
- **Root cause**: `allButtons` class field was initialized once in the constructor but never reset in `create()`. Phaser reuses scene instances — only `create()` is called on re-entry, not the constructor. Old destroyed button references accumulated, and `disableAll()` threw when iterating destroyed objects, which the catch block displayed as a registration error.
- **Fix**: Added `this.allButtons = [];` at the start of `create()`.
- **Prevention**: In Phaser scenes, always reset mutable class fields at the top of `create()`, not just in the constructor. Scene instances persist across `start()`/`restart()` calls.
- **Files**: `src/scenes/LoginScene.ts`

### BUG-036: LobbyScene crashes on email-only auth (null wallet.slice)
- **Date**: 2026-03-16
- **Category**: `type-safety`
- **Discovered by**: `user`
- **Symptom**: Hosting a game shows a black screen with only the "Type message..." chat input visible. No panels, buttons, or player list render.
- **Root cause**: `LobbyScene.create()` line 153 called `AuthManager.getPlayer()!.wallet.slice(0, 6)` without null-checking `wallet`. For email-only auth, `wallet` is `null`, so `null.slice()` throws a TypeError, aborting the entire `create()` method. The DOM chat input (created before the crash at line 129) persisted since it's HTML outside the canvas.
- **Fix**: Changed to safe pattern: `if (player?.wallet) ... else if (player?.email) ...` matching HubScene's existing approach. Also fixed same bug in `MainMenuScene.ts`.
- **Prevention**: Always null-check nullable fields before method calls. The `AuthPlayer.wallet` type is `string | null` — the type system warned but `!` assertion suppressed it. Avoid non-null assertions on nullable interface fields.
- **Files**: `src/scenes/LobbyScene.ts`, `src/scenes/MainMenuScene.ts`

### BUG-037: Free players can attempt paid puzzles (missing server-side wallet check)
- **Date**: 2026-03-16
- **Category**: `security`
- **Discovered by**: `user`
- **Symptom**: A free player (no wallet linked) could submit an attempt on a paid on-chain puzzle. The attempt was accepted, cooldown activated, but no on-chain tx occurred — effectively a free attempt that wastes their cooldown.
- **Root cause**: The backend only checked for `txHash` presence on paid puzzles but didn't verify the player actually has a linked wallet. The wallet requirement was only enforced on the frontend (PuzzleScene), which is easily bypassed.
- **Fix**: Added server-side wallet check in `puzzleRoutes.ts` — returns 403 "Wallet required" before any cooldown/attempt logic runs. Also added `needsWallet` guard to the frontend submit button.
- **Prevention**: Security checks must always be enforced server-side, never rely on frontend-only validation. Every paid/gated action needs a server-side guard on the required credential.
- **Files**: `server/api/puzzleRoutes.ts`, `src/scenes/PuzzleScene.ts`

### BUG-038: Server accepts game actions after GAME_OVER
- **Date**: 2026-03-16
- **Category**: `race-condition`
- **Discovered by**: `user`
- **Symptom**: Game log (room 844819) shows an ATTACK_UNIT action (seq 60) relayed 3ms after a GAME_OVER claim (seq 59). Late actions after game end can cause client desync or UI confusion.
- **Root cause**: `SessionManager.game_action` handler had no guard checking `room.settled` or `room.gameOverClaims.length` before relaying actions. Between the first GAME_OVER claim and settlement, actions continued to be accepted and relayed.
- **Fix**: Added "Layer -1: Game-over guard" at the top of the `game_action` handler that rejects actions when `room.settled || room.gameOverClaims.length > 0`.
- **Prevention**: Any relay/handler that mutates shared state should check terminal conditions first. Game-over is a terminal state — no further game actions should be processed.
- **Files**: `server/game/SessionManager.ts`

### BUG-043: Scout (and custom-pattern units) can't reach 2-range squares when 1-range is blocked
- **Date**: 2026-03-16
- **Category**: `logic`
- **Discovered by**: `user`
- **Symptom**: Scout at (3,1) with a friendly unit at (3,2) cannot move to (3,3), even though an L-shaped path through (2,2) or (4,2) should be valid given Scout's adjacent movement offsets.
- **Root cause**: `isPathClear()` in `MovementRules.ts` classified straight-line 2-range offsets like `{dx:0, dy:2}` as "decomposable" (gcd=2) and checked only the single intermediate cell `(col, row+1)`. If occupied, the move was rejected. The bounding-rectangle L-shape logic only applied when gcd=1. For straight-line offsets in a custom pattern, the bounding rect is only 1 cell wide, so even if it fell through, it would still only check the same single cell.
- **Fix**: Added `useFlexiblePaths` parameter to `isPathClear()`. When true (custom patterns only), dist=2 offsets use a waypoint-based check: find any adjacent cell that's also adjacent to the destination AND unoccupied. This correctly models the unit's ability to step sideways then forward around a blocker.
- **Prevention**: Movement resolvers for custom patterns should account for the unit's full offset set, not just the individual offset being checked. Path-clearing for 2-range moves should consider all possible 2-step routes through adjacent squares.
- **Files**: `src/game/MovementRules.ts`

### BUG-042: Free play result screen shows CRYPTO PLAY with 1 AVAX stake
- **Date**: 2026-03-16
- **Category**: `state`
- **Discovered by**: `user`
- **Symptom**: After a free play game, the result screen shows "CRYPTO PLAY · Staked: 1 AVAX each" and "Payout: 1.9000 AVAX" instead of "FREE PLAY".
- **Root cause**: `GameState.currentStake` defaulted to `1` instead of `0`. The `ResultScene` uses `match.stakeAmount > 0` to determine crypto mode, so free games appeared as crypto. Additionally, `clearMatchData()` did not reset `currentStake` or `currentMode`, so stale values persisted between matches.
- **Fix**: (1) Changed `currentStake` default from `1` to `0`. (2) Added `currentStake = 0` and `currentMode = FreePlay` resets to `clearMatchData()`.
- **Prevention**: Default values for mode/stake fields should be the most restrictive (free/zero). Clear functions must reset ALL match-related fields.
- **Files**: `src/GameState.ts`

### BUG-041: DEF aura buffs heal damaged units on every aura recalculation
- **Date**: 2026-03-16
- **Category**: `logic`
- **Discovered by**: `user`
- **Symptom**: Pikemen with the Flank buff (+1 DEF) regained 1 HP every turn even after taking damage. A pikeman at 2/3 HP would "heal" back to 3/3 on the next aura recalculation cycle.
- **Root cause**: In `AuraSystem.evaluateAuras()` Step 4, DEF buff delta was applied to `currentDef` as well as `maxDef` every recalculation cycle: `currentDef = Math.min(currentDef + defDelta, maxDef)`. Since auras are fully reset and reapplied each cycle, the defDelta was effectively healing the unit each time.
- **Fix**: Track damage taken (`maxDef - currentDef`) BEFORE the aura reset in Step 1. In Step 4, restore `currentDef = max(1, newMaxDef - savedDamage)`. This preserves damage across aura recalcs. Clamped to 1 because aura removal alone cannot kill a living unit (only combat can).
- **Prevention**: Any stat that is "reset + reapply" must preserve the user-visible state (damage taken). The recalc pattern must distinguish between "base value adjustment" and "current value restoration".
- **Files**: `src/game/AuraSystem.ts`

### BUG-040: Deck activation not persisted in AuthManager — UI reverts on scene reload
- **Date**: 2026-03-16
- **Category**: `state`
- **Discovered by**: `user`
- **Symptom**: Clicking [ACTIVATE] on a deck shows "ACTIVE" momentarily, but revisiting the DeckBuilder scene shows [ACTIVATE] again. The only valid deck is not auto-activated on first load.
- **Root cause**: `onActivateDeck()` updated `DeckBuilderState.activeDeckId` and `GameState.activeDeckId` but never updated `AuthManager._player.activeDeckId`. On next scene load, `createInitialState()` reads stale `null` from `AuthManager.getPlayer()?.activeDeckId`, which takes priority over `GameState.activeDeckId`.
- **Fix**: (1) Added `AuthManager.setActiveDeckId(id)` method that updates the in-memory player object and re-persists to localStorage. (2) Called it from all activation/deactivation paths (activate, delete-active, save-and-activate). (3) Added auto-activate in `loadData()`: if no active deck but exactly one valid deck exists, auto-activate it.
- **Prevention**: When state lives in multiple stores (AuthManager, GameState, scene state), ALL stores must be updated together. The "symmetry" rule: every state-setting path must update all copies.
- **Files**: `src/auth/AuthManager.ts`, `src/scenes/DeckBuilderScene.ts`

### BUG-039: Test suite broken by AuthManager localStorage dependency
- **Date**: 2026-03-16
- **Category**: `type-safety`
- **Discovered by**: `claude`
- **Symptom**: All engine performance tests (and any test importing `TestHarness` → `DeckLoader` → `AuthManager`) fail with `ReferenceError: localStorage is not defined` in Node environment.
- **Root cause**: `DeckLoader.ts` imports `AuthManager` at module level. `AuthManager` constructor calls `_restoreSession()` which accesses `localStorage`. In vitest's Node environment, `localStorage` doesn't exist.
- **Fix**: Added a `localStorage` polyfill in `tests/setup.ts` that runs before any imports, providing a Map-backed stub.
- **Prevention**: Browser-only globals used in module-level code need stubs in test setup. Consider lazy initialization for browser-only features.
- **Files**: `tests/setup.ts`, `src/auth/AuthManager.ts`, `src/config/DeckLoader.ts`

### BUG-050: canAct() ignores unit exhaustion state — exhausted units appear selectable
- **Date**: 2026-03-19
- **Category**: `type-safety`
- **Discovered by**: `claude`
- **Symptom**: In ACT phase, clicking an exhausted unit (already moved/attacked) still shows move/attack highlights. The engine rejects the action, but the UI is misleading.
- **Root cause**: `InputCoordinator.canAct()` was implemented without `(col, row)` parameters — it only checked global phase state, not whether the specific unit at that position had already acted. `SelectionManager.canAct(col, row)` passed coordinates that were silently ignored.
- **Fix**: Updated `InputCoordinator.canAct` to accept `(col, row)`, look up the unit, and check `unitsActedThisTurn.has(unit.instanceId)`.
- **Prevention**: Interface mismatches between SelectionManager.IGameEngineAPI and InputCoordinator should be caught by TypeScript strict mode. The `as any` cast on line 84 of InputCoordinator hid this.
- **Files**: `src/scenes/battle/InputCoordinator.ts`

### BUG-051: startGame() crash on double-call — duplicate kings
- **Date**: 2026-03-19
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Calling `engine.startGame()` twice throws "Cell is already occupied" when trying to place kings on cells that already have kings from the first call.
- **Root cause**: `startGame()` had no idempotency guard. Nothing prevented it from re-placing kings, re-dealing hands, or re-running the turn sequence.
- **Fix**: Added guard: `if (this.board.getKing(Player.P1) || this.board.getKing(Player.P2)) return;` — if kings exist, game has already started.
- **Prevention**: Critical state-transition functions should always guard against re-entry. Add `hasStarted` checks or use state machine status.
- **Files**: `src/game/GameEngine.ts`

### BUG-052: selectTarget accepts dead units — silent ability failure
- **Date**: 2026-03-19
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: If a pending TARGET interaction's valid target dies before the player selects it, `selectTarget()` still accepts the instanceId (it passes the `validTargetIds.includes()` check), but the resolver can't find the unit on the board and silently fails.
- **Root cause**: `selectTarget()` validated against the static `validTargetIds` list from when the pending was created, but never checked if the unit still exists on the board.
- **Fix**: Added `if (!this.board.getUnitById(instanceId)) return;` before processing the selection.
- **Prevention**: Any selection validation should check current board state, not just the cached valid list. Pending commands' valid lists are stale by definition.
- **Files**: `src/game/GameEngine.ts`

### BUG-053: OverlayRenderer card detail blocker listener not tracked for cleanup
- **Date**: 2026-03-19
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: Opening and closing the card detail overlay repeatedly accumulates pointer event listeners on the blocker rectangle, causing multiple `DETAIL_HIDE` events on a single click.
- **Root cause**: The blocker's `pointerdown` handler was added inline without being pushed to `overlayInputCleanups`. The ESC key handler was properly tracked, but the blocker was not.
- **Fix**: Named the handler function and added `this.overlayInputCleanups.push(() => blocker.off('pointerdown', blockerHandler))`.
- **Prevention**: Every event listener in overlay code must be pushed to `overlayInputCleanups`. Consider a helper method `addCleanupListener(obj, event, handler)` to enforce this.
- **Files**: `src/renderers/OverlayRenderer.ts`

### BUG-054: NetworkCoordinator disconnect overlay stacks on rapid disconnect events
- **Date**: 2026-03-19
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: If `handleOpponentDisconnect` fires twice rapidly (e.g., socket flicker), two banner overlays stack on screen. The first one becomes orphaned — never destroyed.
- **Root cause**: `handleOpponentDisconnect()` created new overlay objects and assigned them to the module-level `disconnectOverlay` array without destroying previous entries. Compare with `showConnectionOverlay()` which correctly destroys old overlays first.
- **Fix**: Added `for (const obj of disconnectOverlay) obj.destroy();` before creating new overlay.
- **Prevention**: Any function that creates UI overlays should always clean up existing instances first. Follow the pattern in `showConnectionOverlay()`.
- **Files**: `src/scenes/battle/NetworkCoordinator.ts`

### BUG-045: Disease spell targets own structures (should be enemy only)
- **Date**: 2026-03-19
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Disease spell lets the caster target their own structures, which is never desirable.
- **Root cause**: `spellDamageStructure.ts` called `ctx.board.getStructures()` without a player filter. This returns ALL structures (both players). Compare with `spellMotherland.ts` which correctly uses `getStructures(ctx.owner)`.
- **Fix**: Changed to `ctx.board.getStructures(enemyPlayer)` where `enemyPlayer = ctx.owner === P1 ? P2 : P1`.
- **Prevention**: When targeting "enemy" entities, always filter by opponent player. Code review should check all `getStructures()` / `getUnitsOf()` calls for missing player filters.
- **Files**: `src/game/abilities/handlers/spellDamageStructure.ts`

### BUG-046: Disease spell does immediate one-shot damage instead of recurring ticks
- **Date**: 2026-03-19
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Disease spell deals 1 damage once and never ticks again. Card text says "2 damage at the start of your turn for 3 turns" but the disease never recurs.
- **Root cause**: `PendingCommandResolver.ts` handled Disease TARGET by emitting an immediate `UNIT_ATTACKED` event with hardcoded 1 damage. It never created a `DISEASE_TICK` timed effect. The `LEGPhase.runDiseaseTicks()` function was correctly implemented to tick DISEASE_TICK effects, but no code ever created them. Also ignored card params `{ damage: 2, duration: 3 }`.
- **Fix**: Added `EvDiseaseApplied` event type. PendingCommandResolver now emits `DISEASE_APPLIED` with damage/duration values. GameEngine.applyEvent handles it by creating `DISEASE_TICK` timed effect on the caster's mods (ticks during caster's LEG phase). Removed the incorrect immediate damage logic.
- **Prevention**: When implementing a multi-phase ability (handler → pending → resolver → engine), trace the full pipeline end-to-end. Verify that each stage produces what the next stage expects.
- **Files**: `src/game/types/EventTypes.ts`, `src/game/pending/PendingCommandResolver.ts`, `src/game/GameEngine.ts`

### BUG-047: Treason return doesn't recalculate auras after ownership flip
- **Date**: 2026-03-19
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After Treason units return to their original owner in EndPhase, aura-dependent stats (ATK, DEF, movement) don't update until the next LEG phase. Units may have stale buffs from the wrong owner's auras.
- **Root cause**: `EndPhase.resolveTreasonReturns()` flipped unit ownership but never called `auras.evaluateAuras()`. Aura eligibility depends on ownership (e.g., "friendly units get +1 ATK"), so flipping ownership without recalculating leaves stale stats.
- **Fix**: `resolveTreasonReturns` now returns a boolean indicating whether any treason was resolved. If true, `runEndPhase` calls `auras.evaluateAuras()` to recalculate stats.
- **Prevention**: Any operation that changes unit ownership or position must trigger aura recalculation. Add to the pre-implementation checklist.
- **Files**: `src/game/phases/EndPhase.ts`

### BUG-048: Revolt spell missing +2 Royal cost penalty
- **Date**: 2026-03-19
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Peasant Revolt card text says "Permanent penalty to you: −1 LEG rate (min 1) and +2 Royal cost for the rest of the game" but only the −1 LEG rate penalty was applied. Royal cards were not more expensive after Revolt.
- **Root cause**: `spellRevolt.ts` handler emitted a `LEG_RATE_CHANGED` event for the −1 LEG rate penalty but never set `ctx.mods[ctx.owner].royalCostPenalty`. The `royalCostPenalty` field existed on GameModifiers and was wired into `getEffectiveCardCost()`, but was never written to.
- **Fix**: Added `ctx.mods[ctx.owner].royalCostPenalty += 2` to the Revolt handler.
- **Prevention**: When implementing card abilities, verify ALL effects described in the card text are implemented. Cross-reference card abilityText with handler code.
- **Files**: `src/game/abilities/handlers/spellRevolt.ts`

### BUG-049: Wallet auth nonce replay vulnerability
- **Date**: 2026-03-19
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: Wallet login nonce could be replayed within the 5-minute expiry window. An attacker with a valid signature could reuse it before the nonce was deleted.
- **Root cause**: `authRoutes.ts` deleted the nonce AFTER signature verification (`nonceStore.delete(w)` on line 153). Between the nonce check (line 135) and the deletion (line 153), a concurrent request could reuse the same nonce.
- **Fix**: Moved `nonceStore.delete(w)` to BEFORE the verification call in both `/login` and `/link-wallet` routes. Nonce is consumed on first attempt regardless of verification outcome. Also added cleanup of expired nonces in the error path.
- **Prevention**: Security-sensitive tokens (nonces, OTPs) should be consumed (deleted) before the operation they protect, not after. Single-use enforcement must be atomic.
- **Files**: `server/api/authRoutes.ts`

### BUG-044: BUILD_DELAY structures never activate (Castle, Village, Temple stay inactive forever)
- **Date**: 2026-03-19
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Structures with BUILD_DELAY (Castle, Village, Temple) are placed as inactive but never become active on the next turn. They remain inert for the entire game.
- **Root cause**: PlayPhase created BUILD_DELAY timed effect with `duration: 1`. EndPhase calls `tickEffects()` which decrements duration to 0 and removes the effect. On the next turn, LEGPhase's `runBuildDelayActivation()` searches for BUILD_DELAY effects with `duration <= 1` — but the effect was already removed. The activation check never finds anything.
- **Fix**: Changed BUILD_DELAY initial duration from 1 to 2 in PlayPhase.ts. Now: placed (dur=2) → EndPhase tick (dur=1, survives) → next LEG phase finds it (dur<=1, activates unit) → next EndPhase tick (dur=0, removed).
- **Prevention**: When designing timed effects, trace the full lifecycle: creation → tick → check → removal. Ensure the check phase runs BEFORE the removal tick, or set duration accounting for the tick order (EndPhase ticks before next LEGPhase checks).
- **Files**: `src/game/phases/PlayPhase.ts`

### BUG-055: Guest player cannot reconnect to battle after page refresh
- **Date**: 2026-03-19
- **Category**: `network`
- **Discovered by**: `user`
- **Symptom**: When a guest player refreshes the page during a battle, they cannot reconnect to the ongoing game. The session is dropped and the game is lost.
- **Root cause**: Guest authentication was entirely ephemeral — no persistent identity, no session token, no battle context saved. On page refresh: (1) guest got a new socket with no identity proof, (2) GameState lost roomCode/playerIndex/gameSeed, (3) LoginScene showed login screen instead of auto-rejoining.
- **Fix**: Three-layer fix: (1) AuthManager generates a `guestSessionId` (UUID) stored in `sessionStorage`, passed through all room creation/join/rejoin events. (2) GameState persists battle context (roomCode, playerIndex, gameSeed, names) to `sessionStorage`. (3) LoginScene detects active guest battle session and auto-redirects to BattleScene, which uses `connectForRejoin()` to emit `rejoin_room` with guestSessionId. Server matches by guestSessionId for reliable lookup even when multiple guests share the same name.
- **Prevention**: Any authentication flow must account for page refresh / reconnection. Guest sessions need a short-lived reconnection token stored in sessionStorage.
- **Files**: `src/auth/AuthManager.ts`, `src/GameState.ts`, `src/scenes/LoginScene.ts`, `src/scenes/BattleScene.ts`, `src/network/SocketManager.ts`, `src/lobby/LobbySocketManager.ts`, `src/scenes/battle/GameOverHandler.ts`, `src/scenes/battle/NetworkCoordinator.ts`, `server/game/SessionManager.ts`, `server/rooms/RoomManager.ts`, `server/app.ts`, `server/lobby/LobbyManager.ts`, `server/lobby/lobbyHelpers.ts`, `shared/types/NetworkEvents.ts`

---

## Weakness Analysis

### Most Common Categories
1. **logic** (7) — Game rule implementation errors. Biggest area for improvement.
2. **state** (6) — Incomplete state management (missing resets, shallow copies, re-entrant events, Phaser scene persistence).
3. **network** (6) — Missing network sync for local actions, missing state on transitions, route ordering.

### Most Common Prevention Patterns
1. **Exhaustiveness** — When adding a new variant/case, update ALL handlers (5 bugs).
2. **Symmetry** — Every set needs a clear, every subscribe needs unsubscribe, every local action needs network send (5 bugs).
3. **Player perspective** — Coordinates/offsets must account for both players (2 bugs).
4. **Deep vs shallow** — Copy and freeze operations must be recursive (2 bugs).

### User-Found vs Claude-Found
- **User found 12 bugs** (34%) — gameplay-visible issues (freezes, wrong movement, UI blocking, route/scene bugs).
- **Claude found 22 bugs** (63%) — mostly code-quality and subtle logic issues.
- **Tests found 1 bug** (3%) — BUG-033 (glTexture) was the first bug caught by automated browser perf tests via CDP.
