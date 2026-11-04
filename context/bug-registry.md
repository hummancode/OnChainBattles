# Bug Registry

Structured log of all bugs found and fixed. Each entry tracks root cause, fix, category, and how it could have been prevented.
Used to identify weak areas and improve code quality over time.

**Categories**: `logic` | `network` | `state` | `rendering` | `web3` | `type-safety` | `race-condition` | `memory-leak` | `security`

**Discovered by**: `user` (found during playtesting) | `claude` (found during code review/implementation) | `test` (caught by automated tests)

---

## Stats Summary

| Category | Count | User-Found | Claude-Found | Test-Found |
|----------|-------|------------|--------------|------------|
| logic | 41 | 5 | 33 | 3 |
| network | 16 | 6 | 9 | 1 |
| state | 27 | 4 | 22 | 1 |
| rendering | 15 | 1 | 13 | 1 |
| race-condition | 6 | 2 | 4 | 0 |
| memory-leak | 7 | 0 | 7 | 0 |
| web3 | 3 | 0 | 3 | 0 |
| type-safety | 7 | 2 | 5 | 0 |
| security | 13 | 1 | 12 | 0 |
| **TOTAL** | **137** | **21** | **110** | **6** |

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

### BUG-056: War Horn +1 movement buff never applied
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Playing War Horn drew 2 / discarded 1, but units did not gain the +1 movement promised by the card text.
- **Root cause**: `WAR_HORN_MOVEMENT` timed-effect type existed but nothing ever created it, and `AuraSystem` never read timed effects when computing `currentMovement`.
- **Fix**: Handler emits new `WAR_HORN_SOUNDED` event → GameEngine adds a 1-turn `WAR_HORN_MOVEMENT` timed effect → AuraSystem applies `+value` move delta (audited as `war_horn:WAR_HORN_MOVEMENT`) to all the caster's units. EndPhase re-evaluates auras when the effect expires so the buff drops immediately.
- **Prevention**: Every declared `TimedEffectType` needs a creator, a consumer, and an expiry path — grep for all three when adding one. Card text should have a matching engine test.
- **Files**: `src/game/abilities/handlers/spellWarHorn.ts`, `src/game/types/EventTypes.ts`, `src/game/GameEngine.ts`, `src/game/AuraSystem.ts`, `src/game/phases/EndPhase.ts`, `tests/engine/abilities/warHorn.test.ts`

### BUG-057: HandRenderer stale indices during card-removal tween (wrong card played)
- **Date**: 2026-11-03
- **Category**: `race-condition`
- **Discovered by**: `claude`
- **Symptom**: Clicking a hand card within 200ms of playing/discarding another selected the wrong index — the engine (already shifted) played a different card. Back-to-back removals (e.g. War Horn discard right after casting) spliced the wrong card. Drawing past `maxVisible` rendered a duplicate card and each rebuild leaked a "+N more" label.
- **Root cause**: `removeCard()` deferred splicing `cards`/`cardContainers` to the tween's `onComplete`, so the view model lagged the engine hand. Pointer closures captured fixed indices. `addCard()` assumed the new card was always visible.
- **Fix**: Model is spliced synchronously; only a detached, non-interactive container fades out. Pointer handlers resolve their index at event time via `cardContainers.indexOf(container)`. Overflow cases fall back to `rebuild()`, which now destroys the tracked overflow label.
- **Prevention**: Never let an animation own the timing of a state change — update state first, animate a detached visual. Don't capture array indices in long-lived closures.
- **Files**: `src/renderers/HandRenderer.ts`, `tests/renderers/handRenderer.test.ts`, `tests/mocks/phaser.ts`

### BUG-058: DOMInputManager HTML listeners never removed
- **Date**: 2026-11-03
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: Input/focus/blur listeners accumulated on scene revisits; inputs leaked if a scene shut down without calling `destroyAll()`.
- **Root cause**: Listeners were added with `addEventListener` and no matching removal; no scene-lifecycle hook.
- **Fix**: Each input gets an `AbortController`; all its listeners use the signal and are aborted on `destroyInput`/`destroyAll`. Manager auto-calls `destroyAll()` on scene `shutdown`/`destroy`.
- **Prevention**: Use `AbortController` signals for DOM listeners so cleanup is one call; tie manager lifetimes to scene events.
- **Files**: `src/ui/DOMInputManager.ts`

### BUG-059: DeckBuilderScene fails strict type check (TS2352)
- **Date**: 2026-11-03
- **Category**: `type-safety`
- **Discovered by**: `claude`
- **Symptom**: `tsc --noEmit` reported a hard error (not a baseline unused-var warning) in `renderCurrentView`.
- **Root cause**: Direct cast `GameObject as Components.Visible` — types don't overlap under Phaser 4 typings.
- **Fix**: Cast through `unknown`.
- **Prevention**: Run `tsc --noEmit` in CI alongside tests.
- **Files**: `src/scenes/DeckBuilderScene.ts`

### BUG-060: War Horn discard soft-locks the game and is not networked
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After playing War Horn the engine waited for a discard forever; clicking hand cards did nothing. Cancel skipped the discard (free draw 2).
- **Root cause**: `InputCoordinator.selectHandCard` was a no-op `() => {}`; `selectDiscard` had no network action; `cancelPending()` accepted DISCARD.
- **Fix**: Hand click during DISCARD pending → `engine.selectDiscard()` + new `SELECT_DISCARD` network action (server-validated, replayed). DISCARD is non-cancellable; overlay shows a mandatory prompt with no Cancel.
- **Prevention**: Every PendingCommand kind needs: UI input path, network action, replay case, and an explicit cancellable/mandatory decision.
- **Files**: `src/scenes/battle/InputCoordinator.ts`, `src/network/ActionApplier.ts`, `src/game/GameEngine.ts`, `src/renderers/OverlayRenderer.ts`, `server/game/SessionManager.ts`, `shared/types/NetworkEvents.ts`

### BUG-061: Mutual King death always awarded a winner
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: King vs King with both at 1 HP (dying blow) declared the attacker the winner.
- **Root cause**: `checkKingDeath` ran for the defender first and set GAME_OVER, so the attacker's own death check short-circuited. EndPhase iterated P1 first with the same bias.
- **Fix**: Both deaths are evaluated first; both dead → `GAME_OVER` with `isDraw: true, winner: null`. Clients claim `winnerIndex: -1`; server records a draw and calls `refundTie` in crypto mode. ResultScene's existing tie screen is used.
- **Prevention**: Win checks must collect all terminal conditions before deciding, never return on the first.
- **Files**: `src/game/phases/ActPhase.ts`, `src/game/phases/EndPhase.ts`, `src/game/types/GameTypes.ts`, `src/scenes/battle/GameOverHandler.ts`, `src/network/SocketManager.ts`, `server/game/SessionManager.ts`

### BUG-062: Page refresh lost the whole match state
- **Date**: 2026-11-03
- **Category**: `network`
- **Discovered by**: `user`
- **Symptom**: Refreshing during a battle reconnected the socket but showed an empty/initial board.
- **Root cause**: Server kept no action history; `rejoinSuccess` only carried room/seed.
- **Fix**: Server keeps an authoritative `actionLog` (every accepted action stamped with `by` + `serverSeq`). `rejoinSuccess` returns decks + log + `lastSeqNum`. BattleScene rebuilds the engine silently (replay before the event bridge is wired) and paints the UI once from state (`BattleStateSync`).
- **Prevention**: Any client-side simulation must be reconstructible from server data alone.
- **Files**: `server/game/SessionManager.ts`, `shared/types/NetworkEvents.ts`, `src/scenes/BattleScene.ts`, `src/scenes/battle/BattleStateSync.ts`, `src/network/ActionApplier.ts`

### BUG-063: Offline actions silently discarded on reconnect
- **Date**: 2026-11-03
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: Actions made while the socket was down vanished after reconnect; the opponent never saw them.
- **Root cause**: SocketManager cleared `actionBuffer` and reset `seqCounter` to 0 on reconnect; server also reset `lastSeqNum` on rejoin.
- **Fix**: Nothing is reset. Server returns its `lastSeqNum`; client continues numbering from it and flushes buffered actions with `seqNum > lastSeqNum` (older ones are deduped). Missed opponent actions are applied first via `catchUpFromLog` (serverSeq-based, duplicate-safe).
- **Prevention**: Never clear a retry buffer without asking the other side what it already has.
- **Files**: `src/network/SocketManager.ts`, `src/scenes/battle/NetworkCoordinator.ts`, `server/game/SessionManager.ts`

### BUG-064: Players with different decks desync from turn 1
- **Date**: 2026-11-03
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: (Latent) Both clients' engines diverged whenever the two players used different decks.
- **Root cause**: `GameEngine.startGame()` loaded the LOCAL `DeckLoader.get()` deck for both P1 and P2.
- **Fix**: Server sends `[P1 deck, P2 deck]` in `both_battle_ready` (defaults filled for non-submitters); `startGame(decks)` loads each player's own deck.
- **Prevention**: Every input to a deterministic simulation (seed, decks, actions) must come from one authority.
- **Files**: `src/game/GameEngine.ts`, `src/scenes/BattleScene.ts`, `server/game/SessionManager.ts`, `src/network/SocketManager.ts`

### BUG-065: Rejoin overwrote real socket callbacks with stubs
- **Date**: 2026-11-03
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: After a guest refresh, opponent actions were received but ignored.
- **Root cause**: BattleScene called `setupSocketCallbacks()` and then `connectForRejoin(stubs)`, which replaced the real callbacks.
- **Fix**: Rejoin is awaited first; real callbacks are installed after.
- **Prevention**: A function that takes a callbacks object should not silently replace the global set — or call order must be explicit.
- **Files**: `src/scenes/BattleScene.ts`

### BUG-066: Logged-in players could not rejoin after refresh
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Refreshing as a logged-in user went to HubScene and the match was lost (forfeit after grace period).
- **Root cause**: LoginScene checked `isLoggedIn()` → HubScene before the battle-session check, which was also guest-only.
- **Fix**: Battle-session check runs first for guests and logged-in players.
- **Prevention**: Order early-return guards from most to least specific.
- **Files**: `src/scenes/LoginScene.ts`

### BUG-067: Repeated player_ready could start a battle with one player
- **Date**: 2026-11-03
- **Category**: `race-condition`
- **Discovered by**: `claude`
- **Symptom**: (Latent) A client re-sending player_ready (e.g. rejoin before battle start) incremented the counter twice.
- **Root cause**: `battleReadyCount += 1` without per-player dedupe.
- **Fix**: Ready state tracked per player index (`readyPlayers` set); count = set size.
- **Prevention**: Count unique participants, not messages.
- **Files**: `server/game/SessionManager.ts`, `shared/types/NetworkEvents.ts`

### BUG-068: Server crashed at startup without FUJI_PRIVATE_KEY
- **Date**: 2026-11-03
- **Category**: `web3`
- **Discovered by**: `claude`
- **Symptom**: `npm run server` threw `invalid private key` — free-play impossible without a wallet key.
- **Root cause**: PayoutService/PuzzlePayoutService constructed an ethers Wallet unconditionally.
- **Fix**: Key validated at boot; if missing, disabled payout stand-ins return `{ success: false }` and the server runs.
- **Prevention**: Optional integrations must degrade, not crash the process.
- **Files**: `server/app.ts`, `server/game/DisabledPayout.ts`

### BUG-069: Opponent hand count label stacked on every refresh
- **Date**: 2026-11-03
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: Text above the opponent's hand became an unreadable smear (e.g. '4 cards' + '5 cards' drawn on top of each other). Found via Playwright screenshot.
- **Root cause**: `rebuildOpponent()` created a new Text object each call and never destroyed the old one.
- **Fix**: One persistent label updated with `setText()`.
- **Prevention**: Rebuild functions must destroy or reuse everything they create.
- **Files**: `src/renderers/HandRenderer.ts`, `tests/renderers/handRenderer.test.ts`

### BUG-070: Card ATK/DEF badges spilled outside the card
- **Date**: 2026-11-03
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: In the hand, fragments like "A…2", "GE", "NDLY" appeared to the left/right of cards (Playwright screenshot).
- **Root cause**: `makeBadge()` drew a fixed 24px pill but centred a ~50px "ATK 10" label on it, so the label overflowed the card edge.
- **Fix**: Label is created first and the pill is sized to `text.width + 8`.
- **Prevention**: Size containers from their content; never assume label width.
- **Files**: `src/renderers/helpers/CardRenderHelpers.ts`

### BUG-071: Cards showed raw ability enum codes instead of card text
- **Date**: 2026-11-03
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: Card body read "AURA_VILLAGE_SLOW, PASSIVE_BUILD_DELAY" instead of the rules text.
- **Root cause**: `toCardRenderData` joined `def.abilities[].type` instead of using `def.abilityText`.
- **Fix**: Use `def.abilityText`.
- **Prevention**: Player-facing strings come from display fields, never from internal identifiers.
- **Files**: `src/scenes/battle/EngineEventBridge.ts`

### BUG-072: BattleScene.shutdown() never ran
- **Date**: 2026-11-03
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: EventBus listeners, renderers, the logger and timers of every finished battle stayed alive; each new match added another set.
- **Root cause**: Phaser emits a 'shutdown' event but never calls a scene's `shutdown()` method; nothing subscribed it.
- **Fix**: `this.events.once('shutdown', () => this.shutdown())` at the start of `create()`.
- **Prevention**: Never assume a framework calls lifecycle methods by name — verify in the framework source and wire them explicitly.
- **Files**: `src/scenes/BattleScene.ts`

### BUG-073: applyAction reported engine no-ops as success
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: END_PLAY_PHASE while a pending interaction was open, SELECT_* with nothing pending, etc. returned `true` although the engine ignored them — replay divergence and (now) server validation would be blind to them.
- **Root cause**: Engine phase/pending methods return void and silently ignore invalid calls; applyAction returned `true` unconditionally for them.
- **Fix**: Acceptance detected by whether the call emitted any engine event; CANCEL_PENDING checks its precondition (cancel emits nothing by design).
- **Prevention**: Wrappers around void APIs must observe an effect (event/state change) before reporting success.
- **Files**: `src/network/ActionApplier.ts`, `tests/engine/replay/actionApplier.test.ts`

### BUG-074: Client game_over claims decided payouts; the killing blow was dropped
- **Date**: 2026-11-03
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: Two colluding (or one modified) clients could claim any winner. Also: the winner's client sends `game_over` before the final ATTACK_UNIT, and the server rejected all actions once a claim existed — the loser never received the killing blow.
- **Root cause**: Results were based on client claims; Layer -1 guard rejected actions when `gameOverClaims.length > 0`.
- **Fix**: Server runs its own engine (MatchSimulation); every action is validated by applying it; the result comes from the engine (`match_settled`). Claims are ignored in authoritative rooms; only `settled` blocks actions.
- **Prevention**: Anything that moves money must be decided server-side from validated inputs, never from client assertions.
- **Files**: `server/game/MatchSimulation.ts`, `server/game/SessionManager.ts`

### BUG-075: Losing your own connection was scored as a win
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: When all reconnect attempts failed (e.g. during a server restart) the client showed 'Opponent disconnected — You win!' and recorded a local win.
- **Root cause**: `onReconnectFailed` was wired to `handleFinalDisconnect` (the opponent-abandoned path).
- **Fix**: Own connection failure shows 'Connection to the server lost — reload to rejoin'; reconnect attempts raised 5 → 30.
- **Prevention**: Distinguish 'they left' from 'we are offline' in every network callback.
- **Files**: `src/scenes/battle/NetworkCoordinator.ts`, `src/network/SocketManager.ts`

### BUG-076: Lobby-flow battles never rejoined after a socket drop
- **Date**: 2026-11-03
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: After any reconnect in a battle started from the lobby, the server kept the dead socket id and silently ignored the player.
- **Root cause**: Only `connect()`/`connectForRejoin()` registered reconnect handling; the lobby uses `connectOnly()`, which had none (no rejoin_room, no connection-lost overlay).
- **Fix**: `connectOnly()` installs a reconnect hook active while a battle runs: re-emits rejoin_room and fires onConnectionLost/onReconnected. Verified in Playwright across a real server restart.
- **Prevention**: Enumerate every connection entry point when adding connection-level behaviour.
- **Files**: `src/network/SocketManager.ts`, `tests/engine/replay/connectionLoss.test.ts`

### BUG-077: Stale socket callbacks drew onto the next battle/replay
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: A 'Opponent disconnected — reconnect: 30s' banner appeared in the replay viewer (Playwright QA).
- **Root cause**: SocketManager kept the finished BattleScene's callbacks; Phaser reuses the scene instance, so late events drew onto the new run.
- **Fix**: `SocketManager.clearCallbacks()` in BattleScene shutdown.
- **Prevention**: Callbacks bound to a scene must be released when the scene shuts down.
- **Files**: `src/network/SocketManager.ts`, `src/scenes/BattleScene.ts`

### BUG-078: Hovered hand card stayed on top of the stack
- **Date**: 2026-11-03
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: After hovering a card, it permanently covered the header of the next card.
- **Root cause**: Hover called `bringToTop` but hover-end never restored the order.
- **Fix**: Hover-end re-stacks all cards in index order.
- **Prevention**: Every temporary visual change needs a restore path (symmetry).
- **Files**: `src/renderers/HandRenderer.ts`

### BUG-079: Opponent hand backs ran off the bottom of the screen
- **Date**: 2026-11-03
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: With 5+ cards the last card back was cut off.
- **Root cause**: Fixed vertical step regardless of count.
- **Fix**: Step compressed so the last card ends at y≤712.
- **Prevention**: Lay out lists against the available space, not a fixed pitch.
- **Files**: `src/renderers/HandRenderer.ts`

### BUG-080: CI type-check step could never pass
- **Date**: 2026-11-03
- **Category**: `type-safety`
- **Discovered by**: `claude`
- **Symptom**: `npx tsc --noEmit` always exits non-zero because of the ~21 baseline unused-variable diagnostics, so CI was red regardless of real errors (and BUG-059 slipped through).
- **Root cause**: Baseline warnings are errors under `noUnusedLocals`; CI ran plain tsc.
- **Fix**: `scripts/typecheck.mjs` fails only on non-baseline diagnostics; CI runs it for client + server and builds the server bundle.
- **Prevention**: A CI gate that is always red is no gate — make the baseline explicit.
- **Files**: `scripts/typecheck.mjs`, `.github/workflows/ci.yml`, `package.json`

### BUG-081: Earthquake soft-locked the game (column pick never reached the engine)
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After casting Earthquake no prompt appeared and clicking the board did nothing; the turn only ended via the turn clock. Card text also said columns "A–F" on a 7-column board.
- **Root cause**: SelectionManager routed every non-POSITION pending click to `selectTarget`; there was no `selectColumn` path, no `SELECT_COLUMN` network action and no overlay prompt for `PENDING_COLUMN`. known-issues wrongly claimed no card used COLUMN pending.
- **Fix**: COLUMN click → `engine.selectColumn(col)` + `SELECT_COLUMN` action (ActionApplier → relay, replay, server validation); overlay prompt with Cancel; text A–G.
- **Prevention**: Same as BUG-060 — for every PendingCommand kind grep for a producer card and verify UI input, network action, replay case and prompt. Don't trust "unused" notes; grep the card pool.
- **Files**: `src/input/SelectionManager.ts`, `src/scenes/battle/InputCoordinator.ts`, `src/network/ActionApplier.ts`, `src/renderers/OverlayRenderer.ts`, `shared/types/NetworkEvents.ts`, `src/game/data/cards/earthquake.ts`, `src/game/abilities/handlers/spellEarthquake.ts`

### BUG-082: Coup, Treason and Peasant Revolt did nothing when played
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Casting any of the three spent the card and its LEG with no effect.
- **Root cause**: Handlers were registered as 'coupHandler' / 'treasonHandler' / 'peasantRevoltHandler' but the cards reference AbilityType.SPELL_COUP / SPELL_TREASON / SPELL_REVOLT; the dispatcher only logged 'No handler'.
- **Fix**: Also register each handler under its AbilityType key. New coverage test: every non-aura/passive ability in CARD_DEFINITIONS must have a handler.
- **Prevention**: Registry keys must come from the same enum the card data uses; keep a test that walks the whole card pool.
- **Files**: `src/game/abilities/handlers/spellCoup.ts`, `spellTreason.ts`, `spellRevolt.ts`, `tests/engine/abilities/handlerCoverage.test.ts`

### BUG-083: Coup resolution: banish never applied, capture rule missing
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: (Latent behind BUG-082) Coup emitted UNIT_DIED, the UI removed the unit but the engine kept it (UI/engine desync); the card's 'capture if remaining LEG ≥ target cost' branch didn't exist.
- **Root cause**: GameEngine.applyEvent has no UNIT_DIED case (deaths are handled in ActPhase), so the pending-resolution event was render-only.
- **Fix**: New UNIT_CAPTURED (permanent) / UNIT_BANISHED events, applied by the engine and mapped by the bridge; resolver gets the caster's mods to decide capture vs banish; auras re-evaluated after.
- **Prevention**: An event a resolver returns must be applied by the engine — never rely on the UI reacting to an event the engine ignores.
- **Files**: `src/game/pending/PendingCommandResolver.ts`, `src/game/GameEngine.ts`, `src/game/types/EventTypes.ts`, `src/scenes/battle/EngineEventBridge.ts`

### BUG-084: Treason: ownership never flipped and the return crashed END phase
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: (Latent behind BUG-082) The stolen unit stayed the opponent's; once flipped, END phase threw '[Board] Target cell occupied' when the unit hadn't moved.
- **Root cause**: Treason reused UNIT_TRANSFORMED whose engine handler ignores `owner`, and never set `treasonOwner`; resolveTreasonReturns moved the unit onto its own square.
- **Fix**: UNIT_CAPTURED (permanent: false) sets owner + treasonOwner + originalPos; return skips the move when unmoved and stays put if the original square is now occupied.
- **Prevention**: Exercise every resolution path end-to-end in a test (play → resolve → turn end), not just the handler.
- **Files**: `src/game/pending/PendingCommandResolver.ts`, `src/game/GameEngine.ts`, `src/game/phases/EndPhase.ts`

### BUG-085: Targeted spells with no valid target wasted the card and LEG
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Playing Coup/Treason/Disease/Casus Belli with nothing to target consumed the card and its cost with no effect.
- **Root cause**: Handlers returned an empty result; PlayPhase treated it as a successful play.
- **Fix**: Handlers flag `noValidTarget`; PlayPhase refuses the play and returns card + LEG (CARD_RETURNED, 'no valid target' toast).
- **Prevention**: Make 'nothing happened' an explicit result, not an empty one.
- **Files**: `src/game/phases/PlayPhase.ts`, `src/game/abilities/types.ts`, `src/game/abilities/AbilityDispatcher.ts`, spell handlers

### BUG-086: Anyone with the room code and a player's name could take their seat
- **Date**: 2026-11-03
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: `rejoin_room` with just a name reclaimed a logged-in (or guest) player's seat — including their crypto payout.
- **Root cause**: `reassignSocket` fell back to name matching whenever the request carried no guestSessionId, for every seat.
- **Fix**: Seats with a playerId require a verified token for that playerId; guest seats require the guestSessionId; name matching only for legacy seats with neither. Clients send their auth token on rejoin.
- **Prevention**: Identity checks must be keyed by the strongest identity the seat has; never fall back to a user-chosen string.
- **Files**: `server/rooms/RoomManager.ts`, `server/game/SessionManager.ts`, `server/app.ts`, `shared/types/NetworkEvents.ts`, `src/network/SocketManager.ts`, `tests/server/rejoinIdentity.test.ts`

### BUG-087: Practice / tutorial games changed the W/L record
- **Date**: 2026-11-03
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Beating (or losing to) the bot counted as a real win/loss.
- **Root cause**: GameOverHandler recorded every result; it had no notion of offline matches.
- **Fix**: `setupGameOverHandler(..., { offline })` skips the record and the server notification; result is marked `practice` so REMATCH starts another bot match.
- **Prevention**: New game modes must be threaded through every side effect of 'game over' (stats, server, payouts, navigation).
- **Files**: `src/scenes/battle/GameOverHandler.ts`, `src/scenes/BattleScene.ts`, `src/scenes/ResultScene.ts`, `src/GameState.ts`

### BUG-088: Disabled puzzle payout stub lacked isEnabled()
- **Date**: 2026-11-03
- **Category**: `web3`
- **Discovered by**: `claude`
- **Symptom**: On a server without FUJI_PRIVATE_KEY, solving an on-chain puzzle threw a TypeError (500).
- **Root cause**: The BUG-068 stand-in implemented only the async payout methods; puzzleRoutes calls `isEnabled()` first.
- **Fix**: Stub implements every public method (isEnabled → false, puzzleIdFromDbId same formula); test compares against the real classes' prototypes.
- **Prevention**: Stubs must be checked against the real interface, not written from memory.
- **Files**: `server/game/DisabledPayout.ts`, `tests/server/disabledPayout.test.ts`

### BUG-089: Puzzle prize card was never granted
- **Date**: 2026-11-03
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Solving a puzzle returned `prizeCardId` but the card never reached the player's collection (TODO).
- **Root cause**: Not implemented.
- **Fix**: `awardCard()` adds a copy (insert or +1) on a correct attempt; response includes `prizeAwarded`.
- **Prevention**: Don't return a reward in an API response before it has actually been granted.
- **Files**: `server/api/collectionHelpers.ts`, `server/api/puzzleRoutes.ts`, `tests/server/puzzlePrize.test.ts`

### BUG-090: Lobby chat keydown listener never removed
- **Date**: 2026-11-03
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: Each lobby visit added a listener that was never detached.
- **Root cause**: `addEventListener` without a cleanup path.
- **Fix**: AbortController signal, aborted in `cleanup()`.
- **Prevention**: Same as BUG-058: use signals for DOM listeners.
- **Files**: `src/scenes/LobbyScene.ts`

### BUG-091: Newly drawn hand row ignored "can't afford" dimming
- **Date**: 2026-11-03
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: A 9-cost card drawn at 1 LEG showed at full brightness (Playwright QA); rows only dimmed after the next LEG change.
- **Root cause**: `addCard`'s fade-in tween always animated alpha to 1, overwriting the alpha `applyState` had just set.
- **Fix**: Tween to the row's state alpha.
- **Prevention**: Entry animations must end at the state value, not a hard-coded "visible" value (cf. BUG-057 — state first, animation second).
- **Files**: `src/renderers/HandRenderer.ts`, `tests/renderers/handRenderer.test.ts`

### BUG-092: Reformed units could not be attacked, moved or targeted
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `test`
- **Symptom**: Found by the bot-vs-bot fuzz run (400 games, full card pool, invariants + replay determinism after every action). Attacks on reformed Swordsmen were refused although the UI offered them.
- **Root cause**: UNIT_TRANSFORMED changes `instanceId` via `Board.updateUnitStats` (Object.assign) but `unitIndex` stayed keyed by the old id.
- **Fix**: `updateUnitStats` re-indexes on id change and invalidates caches.
- **Prevention**: Any field that is also an index key must be updated through the owner of the index.
- **Files**: `src/game/Board.ts`

### BUG-093: Casus Belli crashed the engine and its cancel was a free LEG-rate drain
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `test`
- **Symptom**: Found by the bot-vs-bot fuzz run (400 games, full card pool, invariants + replay determinism after every action). `selectPosition` threw 'reading movement'; cancelling after the drain refunded the card.
- **Root cause**: POSITION resolution placed the spell itself as a unit; the refund was attached even though an effect had already applied; no step to pick which hand card.
- **Fix**: Two-step deploy: square, then a UNIT from hand (DISCARD-kind pending with `deployAt` + `validHandIndices`, reused UI/network/bot/timer). Spells are only refundable if nothing has happened yet. Plays without a unit just drain.
- **Prevention**: A refund must undo everything or not happen; summons must name what they summon.
- **Files**: `src/game/GameEngine.ts`, `src/game/phases/PlayPhase.ts`, `src/game/abilities/handlers/spellForwardDeploy.ts`, `src/game/pending/PendingCommand.ts`, `src/game/ai/SimpleBot.ts`, `server/game/SessionManager.ts`

### BUG-094: Summoned units got Date.now() ids — clients and server desynced
- **Date**: 2026-11-04
- **Category**: `network`
- **Discovered by**: `test`
- **Symptom**: Found by the bot-vs-bot fuzz run (400 games, full card pool, invariants + replay determinism after every action). Replays diverged; two engines given the same actions produced different instanceIds (state hash mismatch → resync).
- **Root cause**: PendingCommandResolver (POSITION) and Peasant Revolt built ids from `Date.now()`.
- **Fix**: Events carry `instanceId: ''`; the engine assigns the deterministic factory id and writes it back before emitting.
- **Prevention**: Nothing in the engine may read the clock or Math.random; the fuzz replay check catches it.
- **Files**: `src/game/pending/PendingCommandResolver.ts`, `src/game/abilities/handlers/spellRevolt.ts`, `src/game/GameEngine.ts`

### BUG-095: Militia duplicated itself instead of pulling a copy from the deck
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `test`
- **Symptom**: Found by the bot-vs-bot fuzz run (400 games, full card pool, invariants + replay determinism after every action). Every Militia deploy created a new Militia while the deck kept its copies (endless chain).
- **Root cause**: Resolver spawned the unit without removing it from the deck.
- **Fix**: UNIT_PLACED `fromDeck` removes one copy from the owner's deck.
- **Prevention**: 'Pull from deck' must move a card, never create one.
- **Files**: `src/game/pending/PendingCommandResolver.ts`, `src/game/GameEngine.ts`

### BUG-096: Ownership changes left a stale per-owner unit cache
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After a Coup capture the unit still counted for its old owner (auras/economy, deploy rows, getKing).
- **Root cause**: UNIT_CAPTURED and Treason return assigned `unit.owner` directly; `Board._unitsOfCache` was not invalidated.
- **Fix**: `Board.setOwner()` used for every ownership change.
- **Prevention**: Mutate indexed/cached entities only through the container that caches them.
- **Files**: `src/game/Board.ts`, `src/game/GameEngine.ts`, `src/game/phases/EndPhase.ts`

### BUG-097: Spell/effect damage never killed anything (units revived at 1 HP)
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `test`
- **Symptom**: Found by the bot-vs-bot fuzz run (400 games, full card pool, invariants + replay determinism after every action). 0-HP units (even Kings) stayed on the board; Earthquake, Disease and Castle could never kill.
- **Root cause**: `GameEngine.applyEvent` had no UNIT_DIED case (only combat handled deaths); the next aura pass clamps HP to ≥1; effect damage to a King emits no death at all.
- **Fix**: UNIT_DIED applied through the shared `handleUnitDeath` (graveyard, discard, On Death); King deaths checked after every effect batch → GAME_OVER (draw if both).
- **Prevention**: Every event a handler returns must be applied by the engine; check invariants (no 0-HP unit on board) in fuzz tests.
- **Files**: `src/game/GameEngine.ts`, `src/game/phases/ActPhase.ts`

### BUG-098: Treason: returned unit exhausted forever; stolen unit often unusable
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: A unit handed back stayed exhausted permanently; a unit its owner had used couldn't act for the thief.
- **Root cause**: `isExhausted` was never cleared; temporary capture didn't reset move/act flags.
- **Fix**: Exhausted for exactly one owner turn (`exhaustedFresh`); capture resets turn flags.
- **Prevention**: Every flag needs a clear path (symmetry).
- **Files**: `src/game/Board.ts`, `src/game/phases/EndPhase.ts`, `src/game/GameEngine.ts`, `src/game/types/GameTypes.ts`

### BUG-099: Civil War permanently lowered both LEG rates to 1
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Instead of a 3-turn freeze at 0, both players got a permanent rate penalty.
- **Root cause**: Handler emitted LEG_RATE_CHANGED → 0, which applyEvent turns into a permanent clamped penalty; CIVIL_WAR_FREEZE was never added.
- **Fix**: CIVIL_WAR_DECLARED event → CIVIL_WAR_FREEZE timed effect on both players (caster +1 tick), each skips exactly 3 gains.
- **Prevention**: Use timed effects for temporary rules; trace the tick order (owner's END).
- **Files**: `src/game/abilities/handlers/spellFreezeLeg.ts`, `src/game/GameEngine.ts`, `src/game/types/EventTypes.ts`

### BUG-100: Mystic could never revive; its LEG cost was skippable
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: The revive target prompt never resolved; cancelling also skipped the permanent −1 LEG rate.
- **Root cause**: TARGET pending listed graveyard instanceIds but selectTarget only accepts units on the board; drain was a deferred event.
- **Fix**: Revives the strongest dead unit via a POSITION prompt (graveyard now tracks cardIds; card leaves graveyard + discard); drain applied immediately.
- **Prevention**: Pending kinds must point at things the UI can actually select.
- **Files**: `src/game/abilities/handlers/customMystic.ts`, `src/game/PlayerState.ts`, `src/game/phases/ActPhase.ts`, `src/game/GameEngine.ts`

### BUG-101: Disease ticked 2 times instead of 3 and ignored its card params
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Disease dealt 4 damage instead of 6.
- **Root cause**: Effect added in PLAY with duration 3; the caster's END tick ran before the first damage tick. Damage/duration were hard-coded.
- **Fix**: Duration +1 at application; numbers read from the card definition.
- **Prevention**: Same lesson as BUG-044: trace creation → tick → check order.
- **Files**: `src/game/GameEngine.ts`, `src/game/pending/PendingCommandResolver.ts`

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
5. **State before animation** — Update the view model synchronously; tweens animate detached visuals only and never own state timing (BUG-057).
6. **Declared-but-unwired** — Every enum variant (e.g. `TimedEffectType`) needs a producer, consumer and expiry path (BUG-056).
7. **Single authority for simulation inputs** — seed, decks and the ordered action log all come from the server; a client must be able to rebuild the match from server data alone (BUG-062, BUG-064).
8. **Never drop, always reconcile** — on reconnect ask the server what it has (`lastSeqNum`, `serverSeq`) instead of clearing buffers (BUG-063).
9. **Verify framework lifecycles** — Phaser never calls `scene.shutdown()`; scenes are reused, so anything bound to a scene must be released on its 'shutdown' event (BUG-072, BUG-077).
10. **Server decides what matters** — validation and results come from the server's own engine, never from client claims (BUG-074).
11. **Walk the whole card pool in tests** — handler coverage, every pending kind wired end-to-end; three spells were dead for months behind a registry-key mismatch (BUG-081, BUG-082).
12. **Fuzz the engine with the bot** — bot-vs-bot over random full-pool decks with invariants (no 0-HP unit on board, positions consistent, Kings present) and replay determinism found 6 bugs in one run (BUG-092…097). Keep running it after rule changes.
13. **Test the shipped artifact end to end** — the server bundle had no ability handlers (side-effect registration lived in the client entry); every unit test passed. A two-browser full match driven by the bot (`fullmatch.js` QA script) found it in one run (BUG-132). Import registrations where they're needed; test bundles, not only sources.
14. **Every card text line gets an engine test** — 15 text/engine mismatches in one audit (BUG-123…131); see tests/engine/regression/cardAudit.test.ts.

### User-Found vs Claude-Found
- **User found 12 bugs** (34%) — gameplay-visible issues (freezes, wrong movement, UI blocking, route/scene bugs).
- **Claude found 22 bugs** (63%) — mostly code-quality and subtle logic issues.
- **Tests found 1 bug** (3%) — BUG-033 (glTexture) was the first bug caught by automated browser perf tests via CDP.

### BUG-102: Malformed socket payloads crashed handlers / the server
- **Date**: 2026-11-04
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: `socket.emit('joinRoom')` with no/primitive payload threw inside destructuring; an async handler rejection was unhandled.
- **Root cause**: Handlers destructured the payload directly and had no try/catch.
- **Fix**: `server/net/wireConnection.ts` — `hardenSocket()` drops non-object payloads (except no-payload events) and wraps every handler (sync + promise) in a catch. Connection wiring moved out of app.ts so it is testable.
- **Prevention**: Never trust socket payload shape; register handlers through one hardened wrapper.
- **Files**: server/net/wireConnection.ts, server/app.ts

### BUG-103: createRoom could overwrite an existing (even in-battle) room
- **Date**: 2026-11-04
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: Emitting `createRoom` with a live room code replaced that room, kicking both players out of their match.
- **Root cause**: No existence/format check before `rooms.createRoom(code)`.
- **Fix**: Refuse an existing or malformed code ("Room code unavailable — try again.").
- **Prevention**: Creation APIs must never be upserts.
- **Files**: server/net/wireConnection.ts

### BUG-104: Rooms could be joined / kicked / restarted / left mid-battle; legacy join bypassed passwords
- **Date**: 2026-11-04
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: A third socket could take a seat in a battle room, the host could kick or `start_game` again during a match, `lobby:create`/`join` silently removed a player from their running match, and the legacy `joinRoom` ignored room passwords.
- **Root cause**: Seat-changing paths only checked room capacity, not whether a match was under way.
- **Fix**: `RoomManager.isLocked(room)` (simulation / battle-ready / non-waiting status) guards joinRoom, removeFromAllRooms, kick, start_game, leave, lobby create/join; legacy join refuses password rooms.
- **Prevention**: One "is the match running?" predicate used by every seat mutation.
- **Files**: server/rooms/RoomManager.ts, server/lobby/LobbyManager.ts

### BUG-105: Game seed could be 0 (unseeded Math.random shuffle) and rejoin sent the wrong seed
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Rare desyncs: seed 0 makes the engine fall back to Math.random; rejoin after a server restart sent `room.gameSeed` instead of the simulation's seed.
- **Root cause**: `randomInt(0, …)` / `Math.floor(Math.random()*N)` include 0; rejoinSuccess read the room field.
- **Fix**: Seeds drawn from [1, …); rejoin uses `sim.seed`.
- **Prevention**: Treat 0 as "unseeded" everywhere; the simulation is the single source of the seed.
- **Files**: server/rooms/RoomManager.ts, server/lobby/LobbyManager.ts, server/game/SessionManager.ts

### BUG-106: Stale-room sweep could delete a long-running active match
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: A match lasting longer than the stale-room TTL was removed by the janitor.
- **Root cause**: The sweep only looked at `createdAt`.
- **Fix**: `room.lastActivityAt` stamped in `commitAction()`; sweep uses max(createdAt, lastActivityAt).
- **Prevention**: Liveness must be based on last activity, not creation time.
- **Files**: server/rooms/RoomManager.ts, server/game/SessionManager.ts, shared/types/NetworkEvents.ts

### BUG-107: Submitted decks were not checked against the player's collection
- **Date**: 2026-11-04
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: A modified client could submit a legal-shaped deck of cards it does not own.
- **Root cause**: `deck_submitted` / `submitDeck` ran DeckValidator without ownership; `getOwnedCards` lived privately in deckRoutes.
- **Fix**: Exported `getOwnedCards` from collectionHelpers and validated ownership on both paths.
- **Prevention**: Every server path that accepts a deck uses the same validate-with-ownership helper.
- **Files**: server/api/collectionHelpers.ts, server/api/deckRoutes.ts, server/lobby/LobbyManager.ts, server/game/SessionManager.ts

### BUG-108: cryptoReady could be faked; rejoin woke stored matches for any identity
- **Date**: 2026-11-04
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: One player emitting `cryptoReady` twice (or an outsider) produced `bothCryptoReady`; a rejoin with a wrong identity restored a stored match from disk and started both grace timers.
- **Root cause**: `incrementCryptoReady` counted emits, not players; handleRejoin restored the room before checking the seat.
- **Fix**: Per-room `cryptoReadyPlayers` set (seated players only, once each); `RoomManager.findSeat()` shared by reassignSocket and the restore path, which now restores only for a matching seat.
- **Prevention**: Count distinct participants, never events; authorize before any side effect.
- **Files**: server/game/SessionManager.ts, server/rooms/RoomManager.ts, shared/types/NetworkEvents.ts

### BUG-109: Client sent actions its own engine refused; practice actions reached the socket
- **Date**: 2026-11-04
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: END TURN during a pending choice, or a SELECT_TARGET on a non-target, was sent anyway → server rejection / resync loop. Practice and tutorial moves were buffered by SocketManager (offline) and could be flushed into a later real room.
- **Root cause**: InputCoordinator / BattleScene called engine methods and `sendGameAction` unconditionally; the void-returning engine methods hid refusals.
- **Fix**: `dispatchLocal(engine, action, sink)` applies through `applyAction` (same acceptance rule as the server) and sends only accepted actions; offline battles pass a no-op sink. BattleStateSync uses it too.
- **Prevention**: Local input, relay, replay and server validation all go through ActionApplier — never call engine + send separately.
- **Files**: src/scenes/battle/InputCoordinator.ts, src/scenes/BattleScene.ts, src/scenes/battle/BattleStateSync.ts

### BUG-110: Clicking during the opponent's pending choice resolved it locally
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: While the opponent was picking a target (engine AWAITING_INPUT), a board/hand click on our side ran `selectTarget`/`selectDiscard` on our engine → desync.
- **Root cause**: SelectionManager's awaiting-input branch never checked whose turn it was.
- **Fix**: SelectionManager ignores pending clicks when `!isMyTurn()` (toast "Your opponent is choosing…"); InputCoordinator's `act()` also requires our turn.
- **Prevention**: Every input path checks ownership of the decision, not just engine status.
- **Files**: src/input/SelectionManager.ts, src/scenes/battle/InputCoordinator.ts

### BUG-111: Deselecting a hand card left it armed
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: Clicking a selected hand card un-highlighted it, but the next board click still deployed it.
- **Root cause**: HandRenderer emits `INPUT_HAND_CLICK { index: null }` on deselect; SelectionManager ignored null.
- **Fix**: null index clears a `card_selected` selection.
- **Prevention**: Handle every value of an event payload, including the "clear" value.
- **Files**: src/input/SelectionManager.ts

### BUG-112: Second result screen / lobby visit had dead buttons; stale lobby chat
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After the first match, ResultScene buttons did nothing; returning to LobbyScene/RoomBrowserScene could leave them stuck and show the previous room's chat/state.
- **Root cause**: Phaser reuses scene instances; `transitioning`, `latestState`, `chatTexts` were only initialised as class fields.
- **Fix**: Reset per-visit fields in `init()`/`create()`; ResultScene hooks its shutdown via `events.once('shutdown')`.
- **Prevention**: All per-visit scene state is reset in init/create, never by field initialisers.
- **Files**: src/scenes/ResultScene.ts, src/scenes/LobbyScene.ts, src/scenes/RoomBrowserScene.ts

### BUG-113: Server-decided result + local GAME_OVER recorded two results
- **Date**: 2026-11-04
- **Category**: `race-condition`
- **Discovered by**: `claude`
- **Symptom**: A forfeit/disconnect result followed by a late engine GAME_OVER counted W/L twice and restarted the result screen.
- **Root cause**: `resultShown` lived only in NetworkCoordinator; GameOverHandler didn't check it.
- **Fix**: Shared `resultLatch` (`claimResult()` / `resetResult()`) used by both paths.
- **Prevention**: One latch per "exactly once" outcome, shared by every producer.
- **Files**: src/scenes/battle/resultLatch.ts, src/scenes/battle/GameOverHandler.ts, src/scenes/battle/NetworkCoordinator.ts

### BUG-114: Reconnect catch-up skipped turn-timeout auto actions
- **Date**: 2026-11-04
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: If our turn timed out while our socket was down, our engine stayed on our turn after reconnecting (desync → resync).
- **Root cause**: `catchUpFromLog` skipped every action with `by === local`, but server auto actions carry our index and were never applied locally.
- **Fix**: Include `a.auto` actions.
- **Prevention**: "Who sent it" ≠ "who already applied it" — filter on the latter.
- **Files**: src/scenes/battle/NetworkCoordinator.ts

### BUG-115: Hand UI drifted at the hand limit / after overflow trim
- **Date**: 2026-11-04
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: A phantom card appeared when drawing at the hand limit (card was burned), and Motherland overflow trim (handIndex -1) left extra cards in the UI.
- **Root cause**: The hand UI relied on incremental CARD_DRAWN/CARD_DISCARDED events that can't describe these cases.
- **Fix**: Bridge skips CARD_DRAWN for a burned card; HUD refresh calls `reconcileHand()` which rebuilds the hand when it differs from engine state.
- **Prevention**: State-Driven Rendering (§3.6) — every incremental UI gets a full-state reconcile.
- **Files**: src/scenes/battle/HUDRefreshCoordinator.ts, src/scenes/battle/EngineEventBridge.ts, src/renderers/HandRenderer.ts, src/scenes/BattleScene.ts

### BUG-116: Detaching one LobbySocketManager silenced the next scene's
- **Date**: 2026-11-04
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: Lobby errors ("Room is full") and state updates sometimes went nowhere after a scene change.
- **Root cause**: `detach()` used `removeAllListeners(ev)` on the shared socket, removing the listeners of the manager the next scene had just attached.
- **Fix**: Each manager tracks and removes only its own bound listeners.
- **Prevention**: On a shared emitter, always `off(ev, fn)` with the exact function — never removeAllListeners.
- **Files**: src/lobby/LobbySocketManager.ts

### BUG-117: Hub "Last match" banner never showed
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: The Hub's "Last: …" banner was always missing; draws would have read "beat you".
- **Root cause**: ResultScene called `clearMatchData()` (which nulls lastMatch) right before starting HubScene.
- **Fix**: Preserve lastMatch across the clear; banner handles draws.
- **Prevention**: Don't clear data that the next scene is documented to read.
- **Files**: src/scenes/ResultScene.ts, src/scenes/HubScene.ts

### BUG-118: Free (off-chain) puzzles demanded a wallet signature
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Email/guest-free players could not submit any puzzle answer without MetaMask, although the route comment said "free puzzles just need auth".
- **Root cause**: The signature check ran for every attempt, not only on-chain ones; the client always connected + signed.
- **Fix**: Signature only for on-chain puzzles (server + PuzzleScene); on-chain puzzles hidden/refused while `ENABLE_CRYPTO` is off.
- **Prevention**: Gate each crypto requirement on the property that needs it (on-chain payout), not globally.
- **Files**: server/api/puzzleRoutes.ts, server/config/features.ts, src/scenes/PuzzleScene.ts

### BUG-119: Puzzle cooldown read SQLite UTC timestamps as local time
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: On a server not running in UTC the 24 h cooldown was shifted by the zone offset (too short or too long).
- **Root cause**: `new Date("YYYY-MM-DD HH:MM:SS")` parses as local time; SQLite CURRENT_TIMESTAMP is UTC.
- **Fix**: Parse as UTC (`T…Z`) unless the value already carries a zone.
- **Prevention**: Treat zone-less DB timestamps as UTC everywhere.
- **Files**: server/api/puzzleRoutes.ts

### BUG-120: Unbounded server state (rooms, pre-battle queue, login attempts) and nonce overwrite
- **Date**: 2026-11-04
- **Category**: `security`
- **Discovered by**: `claude`
- **Symptom**: A script could create unlimited rooms, push unlimited actions into a room's pre-battle queue, grow the login rate-limit map forever, and invalidate another wallet's pending login by requesting its nonce again.
- **Root cause**: No caps on `rooms` / `actionQueue`; `loginAttempts` never pruned; `/nonce` always replaced the stored nonce.
- **Fix**: `RoomManager.MAX_ROOMS` (env `MAX_ROOMS`, default 1000) → "Server is busy"; `SessionManager.MAX_QUEUED_ACTIONS = 64`; expired login windows pruned above 5000 entries; a live nonce is reused.
- **Prevention**: Every map/array fed by clients gets a bound and an eviction rule.
- **Files**: server/rooms/RoomManager.ts, server/net/wireConnection.ts, server/lobby/LobbyManager.ts, server/game/SessionManager.ts, server/api/authRoutes.ts

### BUG-121: Moved unit was only re-keyed after its 220 ms tween
- **Date**: 2026-11-04
- **Category**: `race-condition`
- **Discovered by**: `claude`
- **Symptom**: A death/stat event or click on the destination square right after a move (fast bot turns, replays at 3x, move-then-attack) found no unit there.
- **Root cause**: `animateUnitMove` updated `unitsByCell` in the tween's onComplete.
- **Fix**: Re-key and update the logical position immediately; the tween is purely visual.
- **Prevention**: Logical state changes synchronously; animations never own state.
- **Files**: src/renderers/BoardRenderer.ts

### BUG-122: Deferred UI refreshes could fire after the battle scene shut down
- **Date**: 2026-11-04
- **Category**: `memory-leak`
- **Discovered by**: `claude`
- **Symptom**: A `setTimeout` (can-act indicators) and a `requestAnimationFrame` (HUD refresh) scheduled just before leaving a match ran against a dead scene.
- **Root cause**: Neither was tracked or cancelled in the teardown functions.
- **Fix**: EngineEventBridge tracks its timers and clears them on unwire; HUD refresh cancels its pending frame.
- **Prevention**: Every timer/frame request is owned by something with a cleanup path (Symmetry rule).
- **Files**: src/scenes/battle/EngineEventBridge.ts, src/scenes/battle/HUDRefreshCoordinator.ts

### BUG-123: Casus Belli deployed on the enemy back row and skipped On Deploy
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: The forwarded unit landed next to the enemy King (row 6 for P1) instead of the front row of the enemy half, and its On Deploy ability (Scout, Priest…) never fired.
- **Root cause**: `spellForwardDeploy` used `rows-1 / 0`; the `deployAt` branch of `selectDiscard` placed the unit without `resolveOnDeploy`.
- **Fix**: Row = `rows-DEPLOY_ROWS` (P1) / `DEPLOY_ROWS-1` (P2); PlayPhase split into `placeCardUnit` / `deployUnitWithAbilities`, used by both paths. Text: "one unit".
- **Prevention**: One deploy pipeline for every way a card reaches the board.
- **Files**: src/game/abilities/handlers/spellForwardDeploy.ts, src/game/phases/PlayPhase.ts, src/game/GameEngine.ts, src/game/data/cards/casus_belli.ts

### BUG-124: Assassin jump attack was dead code
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Assassin never jumped onto enemies; its move pattern was back-weighted and only its normal (counterable) attack worked.
- **Root cause**: Custom move patterns skip occupied squares and the ON_JUMP check ran after `moveUnit`, finding the Assassin itself.
- **Fix**: 1-step diagonal or 2-square diagonal jump over units; a 2-square jump onto an enemy attacks it without counter (`getJumpAttackLandings`, `executeMove`), P2-flipped. UI shows those squares as attacks.
- **Prevention**: Every card text line needs an engine test (tests/engine/regression/cardAudit.test.ts).
- **Files**: src/game/data/cards/assassin.ts, src/game/MovementRules.ts, src/game/phases/ActPhase.ts, src/input/SelectionManager.ts

### BUG-125: Village slow ignored fixed movement patterns
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Lancer, Scout, Knight and Messenger next to a Village kept their full movement.
- **Root cause**: The −1 lowered `currentMovement`, which custom patterns never read.
- **Fix**: `shrinkPattern`: each point of slow removes the pattern's farthest ring.
- **Prevention**: Movement modifiers must apply to every movement model.
- **Files**: src/game/MovementRules.ts, src/game/data/cards/village.ts

### BUG-126: Castle made normal ACT attacks on top of its LEG-phase area attack
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Castle attacked twice per turn cycle.
- **Root cause**: `canUnitAttack` didn't exclude structures; AREA_ADJ counted as an attack pattern.
- **Fix**: Structures can't make ACT attacks (they still counter and fire in LEG).
- **Prevention**: Class-level rules belong in UnitQuery gates.
- **Files**: src/game/UnitQuery.ts, src/game/data/cards/castle.ts

### BUG-127: Pikeman ×3 vs Cavalry missing on counter-attacks
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: A Knight attacking a Pikeman took 1 counter damage instead of 3.
- **Root cause**: `resolveAttackWithCounter` used raw ATK for the counter.
- **Fix**: Counter applies the CAVALRY_COUNTER multiplier (shown in the breakdown).
- **Prevention**: Attack modifiers are applied in one damage function used by both directions.
- **Files**: src/game/CombatResolver.ts, src/game/data/cards/pikeman.ts

### BUG-128: Treason could target structures; stolen units died into the thief's graveyard
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Village was a valid Treason target; a controlled unit dying went to the caster's graveyard/discard and its on-death draw to the caster.
- **Root cause**: Target filter checked only allegiance/King; death handling used `unit.owner` instead of `treasonOwner`.
- **Fix**: Units only; death → `treasonOwner ?? owner` (ActPhase + AbilityDispatcher). Bots' usefulness filters updated.
- **Prevention**: Temporary ownership fields must be consulted by every owner-dependent path.
- **Files**: src/game/abilities/handlers/spellTreason.ts, src/game/phases/ActPhase.ts, src/game/abilities/AbilityDispatcher.ts, src/game/ai/*.ts

### BUG-129: Coup-captured unit could act immediately
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: A unit taken with Coup moved/attacked in the same turn.
- **Root cause**: Permanent UNIT_CAPTURED didn't set `isJustPlaced`.
- **Fix**: Captured units wait until their new owner's next turn.
- **Prevention**: Any ownership change resets act flags explicitly.
- **Files**: src/game/GameEngine.ts

### BUG-130: Refused spell play reordered the hand (replay/desync)
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: After a no-target spell was refused, later handIndex plays could hit a different card on the server/opponent (fuzz: 5 replay divergences).
- **Root cause**: `returnSpellToHand` appended the card instead of restoring its slot, but refused actions are never logged or relayed.
- **Fix**: NO_TARGET refusal puts the card back at its original index; the hand UI re-syncs via reconcileHand.
- **Prevention**: A refused action must leave the engine bit-for-bit unchanged.
- **Files**: src/game/phases/PlayPhase.ts

### BUG-131: Messenger logged 'No handler' on every deploy; misleading card texts
- **Date**: 2026-11-04
- **Category**: `logic`
- **Discovered by**: `claude`
- **Symptom**: Console noise; Scout/King/Disease/Revolt/Mystic/Militia/Messenger texts didn't describe what the engine does.
- **Root cause**: No no-op handler for AURA_SUPPRESS_KING_ATK; texts written before mechanics changed.
- **Fix**: No-op handler registered; texts updated (Swift, Backstab, LEG rate growth, enemy structure + both sides, auto-placed, highest-cost revive, valid deploy square).
- **Prevention**: Card text audit is part of every mechanics change.
- **Files**: src/game/abilities/handlers/passiveNoOp.ts, src/game/data/cards/*.ts

### BUG-132: Authoritative server engine ran with NO ability handlers
- **Date**: 2026-11-04
- **Category**: `state`
- **Discovered by**: `claude`
- **Symptom**: In a real two-browser match the first ability (Militia deploy, Transform, any aura) produced `STATE MISMATCH` on every following action, then an endless resync loop; the server's results/validation were computed with different rules than the clients.
- **Root cause**: Handlers self-register on import, and `registerAll` was imported only by `src/main.ts`. The esbuild server bundle (MatchSimulation → GameEngine) never imported it; unit tests imported it via helpers, so nothing caught it.
- **Fix**: `GameEngine.ts` imports `./abilities/registerAll` itself. New test bundles MatchSimulation with esbuild in a clean Node process and requires the same handler set as the client.
- **Prevention**: Side-effect registration must be imported by the module that depends on it, never by an app entry point. Test the server bundle, not just the sources.
- **Files**: src/game/GameEngine.ts, tests/server/serverHandlers.test.ts

### BUG-133: A second desync within 3 s was dropped for good
- **Date**: 2026-11-04
- **Category**: `network`
- **Discovered by**: `claude`
- **Symptom**: "Resync requested again too soon — ignoring" — the client stayed desynced.
- **Root cause**: The restart-loop guard returned without scheduling anything.
- **Fix**: Queue one retry after the cool-down (scene timer, reset on scene setup).
- **Prevention**: Throttles must defer, not discard, work that is still needed.
- **Files**: src/scenes/battle/NetworkCoordinator.ts

### BUG-134: Pikeman and King's Guard showed placeholder art on the board
- **Date**: 2026-11-04
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: Board tiles for Pikeman and King's Guard were the striped 'PIKEMAN' / 'KNIGHTS GUARD' placeholder although real art existed.
- **Root cause**: The real Pikeman thumbnail was saved as `pikeman_thumb-2.png` (loader reads `pikeman_thumb.png`); King's Guard had no thumbnail, only full art (`kings_guard.png`).
- **Fix**: Copied the real thumbnail over the placeholder; generated `knights_guard_thumb.png` from the full art (centre crop, 100×100).
- **Prevention**: Placeholder assets are tiny (≈2–4 KB) — a size check over `public/assets/cards` lists them; Militia and the spells still need real art.
- **Files**: public/assets/cards/thumb/pikeman_thumb.png, public/assets/cards/thumb/knights_guard_thumb.png

### BUG-135: LEG icon overlapped the LEG number
- **Date**: 2026-11-04
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: HUD read '✠0 LEG' — the icon sat on top of the first digit.
- **Root cause**: The icon had a fixed x while the LEG text is centred and changes width.
- **Fix**: Icon is re-positioned to the text's left edge on every LEG update.
- **Prevention**: Anchor decorations to the element they decorate, not to a fixed layout point.
- **Files**: src/renderers/HUDRenderer.ts

### BUG-136: Card previews were hidden under the tutorial panel
- **Date**: 2026-11-04
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: Hovering a hand card (or board unit) during the tutorial showed the large preview cut off by the tutorial box.
- **Root cause**: Preview depth 950 < tutorial panel 960.
- **Fix**: Hand and board previews use depth 970.
- **Prevention**: Keep a depth table: transient hover UI above instructional overlays, below modal/network overlays (999).
- **Files**: src/renderers/HandRenderer.ts, src/renderers/BoardRenderer.ts

### BUG-137: Host saw a meaningless READY button; guest's button never showed its state
- **Date**: 2026-11-04
- **Category**: `rendering`
- **Discovered by**: `claude`
- **Symptom**: The host could toggle 'ready' (ignored by the server), and the guest's button always said READY after readying.
- **Root cause**: LobbyScene always created the button and never updated its label from lobby state.
- **Fix**: Host gets only START; the guest's button label follows the server state (READY / UNREADY).
- **Prevention**: Buttons that toggle server state render from that state (State-Driven Rendering).
- **Files**: src/scenes/LobbyScene.ts
