# Known Issues & Recent Fixes

## Open Issues
- Pre-existing 16 unused variable TS warnings (baseline, don't fix — see CLAUDE.md)
- `selectColumn` and `selectDiscard` not networked yet (no cards use COLUMN/DISCARD pending in current card pool)

### Stat Audit Trail system added
- **Problem**: Units had unexplained ATK/DEF values with no way to trace which aura or combat bonus produced them. Debugging stat issues required replaying the entire game mentally.
- **Fix**: Added `StatBuff` type and `activeBuffs: StatBuff[]` to every Unit. Each aura processor labels its `addDelta()` calls with source (e.g. `commander:BOARD_HALF_ATK`, `pikeman:PIKEMAN_FLANK`). CombatResolver returns `DamageBreakdown` with base ATK, cavalry counter, backstab, ambush, and active aura buffs — included in every `UNIT_ATTACKED` event.
- **Game log now shows**: `[pikeman_3] attacked [king_2] — 2 dmg (base:1, pikeman:PIKEMAN_FLANK:atk+1)` and board snapshots include `activeBuffs` per unit.
- **Files**: GameTypes.ts, UnitFactory.ts, auraHelpers.ts, AuraSystem.ts, CombatResolver.ts, EventTypes.ts, GameLogger.ts, all 6 stat processors.
- **Principle**: Every stat modification must be traceable to its source. No silent deltas.

## Fixed (14 March 2026 — round 2)

### Commander DEF aura never applied to troops
- **Root cause**: AuraSystem.ts Step 4 applied `atkDelta` and `moveDelta` to units but never applied `defDelta`. Also, `maxDef` was not reset to `baseDef` in Step 1, so aura DEF buffs couldn't cycle properly.
- **Fix**: Step 1 now resets `unit.maxDef = unit.baseDef` before capping `currentDef`. Step 4 now applies `defDelta` to both `maxDef` and `currentDef` when non-zero.
- **Files**: AuraSystem.ts

### Commander aura now zone-dependent
- **Change**: Commander's aura depends on the Commander unit's board position:
  - Own half (rows 0-2 for P1, rows 4-6 for P2): DEF bonus for friendly units in own half
  - Enemy half: ATK bonus for friendly units in enemy half
  - Neutral zone (middle row 3): no aura
- **Previously**: Both auras always applied regardless of Commander position.
- **Files**: BoardHalfDefProcessor.ts, BoardHalfAtkProcessor.ts, commander.ts (ability text updated)

### Added detailed server-side game logging (dev only)
- **Feature**: In dev mode (`NODE_ENV !== 'production'`), server writes rich game state logs including unit stats, LEG economy, card info, buffs, HP, turn/phase data.
- **How**: Client sends `game_state_report` events (at game start, every 30s, game end). Server's GameLogWriter records both actions and state snapshots, writes to disk periodically.
- **Files**: NetworkEvents.ts, SocketManager.ts, BattleScene.ts, GameLogWriter.ts, SessionManager.ts
- **Log path**: `server/dist/logs/` (dev), `logs/` (production)

## Fixed (14 March 2026)

### Back-attack system replaced with Backstab + Ambush
- **Change**: Removed universal +1 back-attack damage for all units. Replaced with per-card positional bonuses:
  - **Backstab** (`backstabBonus`): +N ATK when directly behind target (dx=0, exactly 1 row behind). Scout = +1.
  - **Ambush** (`ambushBonus`): +N ATK from rear arc (|dx|≤1, exactly 1 row behind). Assassin = +1.
- **Removed**: `backVulnerable` property (no longer needed — no universal bonus to be immune to).
- **Files**: CombatResolver.ts, CardTypes.ts, scout.ts, assassin.ts, combatResolver.test.ts
- **Tests**: 11 tests covering backstab, ambush, symmetry, distance, and no-bonus cases.

### Zero-ATK units dealt damage via back-attack bonus
- **Root cause**: `calculateDamage()` in CombatResolver applied back-attack bonus (+1) even when attacker's `currentAtk` was 0 (from Messenger aura suppression). `0 + 1 = 1` damage.
- **Fix**: Early return `if (atk <= 0) return 0` before any bonus calculations. A unit with 0 ATK deals 0 damage regardless of bonuses.
- **Files**: CombatResolver.ts

### Custom pattern dy was not player-relative (movement reversed for P1)
- **Root cause**: `resolveCustomPattern()` in MovementRules.ts used `offset.dy` directly without flipping for the unit's owner. Pattern offsets are defined from P1's perspective (dy>0 = toward enemy), but P1 moves toward increasing rows while P2 moves toward decreasing rows. Without flipping, P1's "forward" offsets went backward.
- **Fix**: Added `dySign = unit.owner === Player.P1 ? 1 : -1` and multiply `offset.dy * dySign` in both `resolveCustomPattern()` and `resolvePatternRange()`. Updated Scout and Assassin card patterns to use the corrected convention (positive dy = toward enemy). Fixed comment in `CardTypes.ts PatternOffset`.
- **Files**: MovementRules.ts, CardTypes.ts, scout.ts, assassin.ts

### Aura removal not reflected in UI (State-Driven Rendering fix)
- **Root cause**: AuraSystem.evaluateAuras() only included units with non-zero deltas in the `changes` array. When an aura was removed (e.g., Messenger moved away from King), the delta became 0 → unit excluded from changes → no UNIT_STATS_CHANGED emitted → UI showed stale values. Three layers of the same bug: (1) AuraSystem filtered zero-deltas, (2) phase modules gated on `changes.length > 0`, (3) EngineEventBridge only synced units in `changes`.
- **Fix**: Introduced **State-Driven Rendering** principle. EngineEventBridge now syncs ALL unit stats from `engine.getState()` after every AURA_APPLIED event via `emitAllUnitStats()`. Phase modules always emit AURA_APPLIED (removed `changes.length > 0` guard). This eliminates the entire class of "UI not updating" bugs.
- **Files**: EngineEventBridge.ts, ActPhase.ts, PlayPhase.ts, LEGPhase.ts
- **Principle documented**: OCB_CODING_PRINCIPLES.md §3.6

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
