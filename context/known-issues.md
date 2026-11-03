# Known Issues & Recent Fixes

## Open Issues

### Game Logic
- Pre-existing 16 unused variable TS warnings (baseline, don't fix — see CLAUDE.md)

### Network / Reconnection
- Rejoin falls back to matching by player NAME when there is no guestSessionId (logged-in players) — should match by authenticated playerId
- Server engine trusts the client-side deck validation path for the legacy RoomScene flow (decks are validated in `submitDeck`, but unsubmitted decks silently become the default)
- Refresh during an optional pending interaction (Priest/Scout target etc.) cancels it on both clients; the card cost is not refunded

### UI (found in Playwright QA, 3 Nov 2026 — see ROADMAP Phase 2)
- Hand cards are stacked with heavy overlap (only header + art visible until hover) — a bottom fan would need a board-layout change
- Missing card art uses the generated placeholder texture (REFORM, MILITIA) — needs art, not code
- Replay viewer reuses the battle HUD: "YOUR TURN" / END TURN refer to the viewed player and the button is inert
- IGameEngineAPI.getValidDeployPositions interface takes unused `cardIndex` param

### Security (Dev-Only)
- Hardcoded dev JWT secret in middleware.ts (`'ocb-dev-secret-DO-NOT-USE-IN-PROD'`)
- Socket.IO Admin UI accessible without auth in dev mode
- Email enumeration possible via different error messages on registration

### Stat Audit Trail system added
- **Problem**: Units had unexplained ATK/DEF values with no way to trace which aura or combat bonus produced them. Debugging stat issues required replaying the entire game mentally.
- **Fix**: Added `StatBuff` type and `activeBuffs: StatBuff[]` to every Unit. Each aura processor labels its `addDelta()` calls with source (e.g. `commander:BOARD_HALF_ATK`, `pikeman:PIKEMAN_FLANK`). CombatResolver returns `DamageBreakdown` with base ATK, cavalry counter, backstab, ambush, and active aura buffs — included in every `UNIT_ATTACKED` event.
- **Game log now shows**: `[pikeman_3] attacked [king_2] — 2 dmg (base:1, pikeman:PIKEMAN_FLANK:atk+1)` and board snapshots include `activeBuffs` per unit.
- **Principle**: Every stat modification must be traceable to its source. No silent deltas.

---

## Fixed (3 November 2026 — server authority, persistence, UI, BUG-072…080)
- **Server-authoritative engine** — the server runs the same GameEngine per room; illegal/out-of-turn actions are rejected; the result (and payout) comes from the server engine (`match_settled`), not client claims (BUG-074).
- **Desync detection + auto-resync** — actions carry `postHash`, replays report `state_hash`; any mismatch or rejection sends `resync_required` and the client rebuilds from the server log.
- **Matches survive a server restart** — active matches persisted to SQLite (`active_matches`) after every action; rebuilt on rejoin with grace timers for both players.
- **Turn timer** — server clock per turn (`TURN_TIME_SECONDS`, default 90); timeout auto-ends the turn; 3 consecutive timeouts forfeit; HUD countdown.
- **Replays** — every settled match stored (`match_replays`), `GET /api/replays/:roomCode`, WATCH REPLAY on the result screen (pause / 1x / 3x).
- **Fixes**: BattleScene cleanup never ran (BUG-072), applyAction no-op detection (BUG-073), own disconnect scored as a win (BUG-075), lobby-flow reconnect never rejoined (BUG-076), stale callbacks on reused scene (BUG-077), hover stacking (BUG-078), opponent hand overflow (BUG-079), CI typecheck always red (BUG-080).
- **UI**: invalid-click feedback toasts, YOUR TURN / OPPONENT'S TURN banner, Enter/Esc + autofocus in host dialog.

## Fixed (3 November 2026 — multiplayer reliability, BUG-060…069)
- **State recovery on refresh/reconnect** — server action log + decks in `rejoinSuccess`; engine rebuilt silently and UI painted from state.
- **Offline actions** — buffer flushed after rejoin using server `lastSeqNum`; missed opponent actions caught up by `serverSeq`.
- **Per-player decks** — server sends both decks; engines no longer desync when players use different decks.
- **Mutual King death = draw** — `isDraw` result, `winnerIndex: -1` claim, crypto refund.
- **War Horn discard** — was a soft-lock; now networked, mandatory, with on-screen prompt.
- **UI pass**: badges sized to text (BUG-070), real ability text on cards (BUG-071), King HP numbers, YOUR TURN / OPPONENT'S TURN label, END TURN moved off the board, unique guest names, Enter/Esc in join dialog.
- **Logged-in rejoin**, **player_ready dedupe**, **server boots without wallet key**, **opponent count label smear**.

## Fixed (3 November 2026)
- **War Horn +1 movement (BUG-056)** — new `WAR_HORN_SOUNDED` event → 1-turn `WAR_HORN_MOVEMENT` timed effect → AuraSystem move delta. Note: only affects distance-based movers (OMNI_n, VERTICAL_2); fixed-pattern movers (custom patterns, jump, forward-1) ignore `currentMovement`.
- **HandRenderer stale indices (BUG-057)** — model spliced synchronously, click index resolved at event time; overflow duplicate card + label leak fixed.
- **DOMInputManager listener leak (BUG-058)** — AbortController per input + auto-cleanup on scene shutdown.
- **DeckBuilderScene TS2352 (BUG-059)** — `tsc --noEmit` is clean again (aside from baseline unused-var warnings).

---

## Fixed (19 March 2026)

### BUILD_DELAY structures never activate (BUG-044)
- **Root cause**: PlayPhase created BUILD_DELAY timed effect with `duration: 1`. EndPhase `tickEffects()` decremented to 0 and removed it before LEGPhase could check. Castle, Village, Temple stayed inactive forever.
- **Fix**: Changed duration from 1 to 2.

### Disease spell targets own structures (BUG-045)
- **Root cause**: `spellDamageStructure.ts` called `getStructures()` without player filter.
- **Fix**: Filter to enemy structures only.

### Disease spell one-shot instead of recurring (BUG-046)
- **Root cause**: PendingCommandResolver did immediate 1 damage instead of creating DISEASE_TICK timed effect. LEGPhase.runDiseaseTicks had nothing to tick.
- **Fix**: Added EvDiseaseApplied event → engine creates DISEASE_TICK timed effect → LEGPhase ticks it each turn.

### Treason return missing aura recalc (BUG-047)
- **Root cause**: EndPhase.resolveTreasonReturns() flipped ownership without recalculating auras.
- **Fix**: Added evaluateAuras() call after treason returns.

### Revolt missing +2 Royal cost penalty (BUG-048)
- **Root cause**: Handler only applied -1 LEG rate, not the +2 Royal cost described in card text.
- **Fix**: Added `royalCostPenalty += 2`.

### Wallet nonce replay vulnerability (BUG-049)
- **Root cause**: Nonce deleted after verification, allowing replay within 5-min window.
- **Fix**: Delete nonce before verification in both login and link-wallet routes.

### canAct() ignores unit exhaustion (BUG-050)
- **Root cause**: InputCoordinator.canAct() only checked phase, not whether specific unit had acted.
- **Fix**: Check unitsActedThisTurn per unit.

### startGame() crash on double-call (BUG-051)
- **Root cause**: No idempotency guard — placing kings on occupied cells throws.
- **Fix**: Guard with king existence check.

### selectTarget accepts dead units (BUG-052)
- **Root cause**: Validated against stale validTargetIds list without checking board.
- **Fix**: Added board existence check.

### OverlayRenderer blocker listener leak (BUG-053)
- **Root cause**: Card detail blocker pointerdown handler not tracked in overlayInputCleanups.
- **Fix**: Track handler for cleanup.

### NetworkCoordinator disconnect overlay stacks (BUG-054)
- **Root cause**: handleOpponentDisconnect created new overlay without destroying previous.
- **Fix**: Destroy existing overlay before creating new.

---

## Fixed (15 March 2026)

### Lobby → BattleScene transition: game never started (Kings not placed)
- **Root cause**: `GameState.roomCode` was never set in the lobby flow.
- **Fix**: Set roomCode before scene transition + on roomCreated handler.

### SocketManager rewrite: removed 10+ `as any` casts, fixed state machine
- **Fix**: Full SocketManager rewrite with `ensureSocket()` pattern, typed events.

## Fixed (14 March 2026 — round 2)

### Commander DEF aura never applied to troops
- **Fix**: Step 1 resets `maxDef`, Step 4 applies `defDelta`.

### Commander aura now zone-dependent
- Own half: DEF bonus. Enemy half: ATK bonus. Neutral: none.

### Back-attack system replaced with Backstab + Ambush
- Per-card positional bonuses instead of universal +1.

### Zero-ATK units dealt damage via back-attack bonus
- **Fix**: Early return if ATK ≤ 0 before bonus calculations.

### Custom pattern dy was not player-relative
- **Fix**: dySign flip for P2 in resolveCustomPattern and resolvePatternRange.

### Aura removal not reflected in UI (State-Driven Rendering)
- **Fix**: Always emit AURA_APPLIED, sync ALL units from engine state.

## Fixed (12 March 2026)
- Server action validation (turn ownership + phase checks)
- Wallet proof-of-ownership (ethers.verifyMessage)
- `__DRAW__` / `__DRAW_FILTERED_*` bug (on-deploy draws now work)
- Priest heal cancel freeze (cancelPending + network sync)
- Battle scene ready handshake (player_ready / both_battle_ready)
- Board.serialize() shallow→deep copy, CardRegistry shallow→deepFreeze
- 20+ other fixes (see bug-registry.md for full details)
