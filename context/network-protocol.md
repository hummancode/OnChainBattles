# Network Protocol Reference

## Game Action Types (relayed between players)
| Action | Sent by | Fields | Handler |
|--------|---------|--------|---------|
| PLAY_CARD | InputCoordinator | handIndex, col, row | engine.playCard() |
| MOVE_UNIT | InputCoordinator | fromCol, fromRow, col, row | engine.moveUnit() |
| ATTACK_UNIT | InputCoordinator | fromCol, fromRow, targetCol, targetRow | engine.attackUnit() |
| SELECT_POSITION | InputCoordinator | col, row | engine.selectPosition() |
| SELECT_TARGET | InputCoordinator | col, row | engine.selectTarget() |
| SELECT_COLUMN | InputCoordinator | col | engine.selectColumn() (Earthquake) |
| SELECT_DISCARD | InputCoordinator | handIndex | engine.selectDiscard() (mandatory — CANCEL_PENDING ignored) |
| CANCEL_PENDING | InputCoordinator | (none) | engine.cancelPending() |

All actions are applied through `src/network/ActionApplier.ts` (`applyAction` / `replayLog`) — live relay, refresh replay and reconnect catch-up share one code path.
The server stamps each accepted action with `serverSeq` (global order) and `by` (sender index) and appends it to `room.actionLog`.
| END_PLAY_PHASE | BattleScene | (none) | engine.endPlayPhase() |
| END_ACT_PHASE | BattleScene | (none) | engine.endActPhase() |

## Not yet networked
Nothing — every PendingCommand kind (TARGET, POSITION, COLUMN, DISCARD) has a network action.

## Connection Flow (Legacy: MainMenuScene → RoomScene)
```
RoomScene:  createRoom / joinRoom
            ↓
Server:     roomCreated / roomJoined / opponentJoined / game_seed
            ↓
RoomScene:  enterBattle() (after 800ms delay or crypto flow)
            ↓
BattleScene: create() → setup engine, renderers, socket callbacks
             → signalBattleReady()
             ↓
Server:      player_ready (queues game_actions until both ready)
             → both_battle_ready (flushes queue)
             ↓
BattleScene: engine.startGame()
```

## Connection Flow (Lobby: HubScene → RoomBrowserScene → LobbyScene)
```
HubScene:   → RoomBrowserScene (room list via /api/rooms)
             ↓
RoomBrowserScene: create or join room
             ↓
LobbyScene:  deck selection, ready up, chat
             → deck_submitted (validated server-side)
             → player_ready
             ↓
Server:      both_battle_ready → flush queue
             ↓
BattleScene: create() → engine.startGame()
```

## Battle Start
```
both clients → player_ready (deduped per player)
server       → both_battle_ready { decks: [P1 deck, P2 deck] }   (defaults filled for non-submitters)
clients      → engine.startGame(decks)   — never their own local deck for the opponent
```

## Disconnect / Reconnect Flow
```
Player disconnects → server starts 30s grace period
  → opponent receives: opponentDisconnected + disconnectCountdown (every 1s)

A) Socket drop, page still open (SocketManager auto-reconnect)
  → rejoin_room
  → rejoinSuccess { decks, actionLog, lastSeqNum, battleStarted, ... }
  → NetworkCoordinator.catchUpFromLog: apply opponent actions with serverSeq > last applied
  → SocketManager flushes buffered offline actions with seqNum > lastSeqNum

B) Page refresh (LoginScene → BattleScene with stored battle session)
  → connectForRejoin → await rejoinSuccess
  → new GameEngine; startGame(decks); replayLog(actionLog)   ← BEFORE event bridge/renderers
  → wire renderers → BattleStateSync.syncUIFromEngine (board, hand, HUD)
  → resumePendingAfterRejoin (re-open mandatory DISCARD; cancel optional pendings via network)
  → seqCounter continues from lastSeqNum

If grace period expires:
  → opponentAbandon → remaining player wins
  → crypto mode: auto-payout via escrow
  → room deleted
```

## Server-Side Room State
- `readyPlayers` / `battleReadyCount`: unique ready players (both_battle_ready emitted once, at 2)
- `actionLog`: every accepted action in server order (`by`, `serverSeq`) — sent on rejoin
- `actionQueue`: game_actions received before both ready (flushed on ready)
- `cryptoReadyCount`: for crypto mode deposit flow
- `settled`: prevents double payout
- `gameOverClaims[]`: dual-claim consensus for game result
- `lastSeqNum[]`: per-player action sequence counter (replay protection; NOT reset on rejoin)
- `graceTimer`: disconnect grace period handle (30s)
- `game_over.winnerIndex`: 0 | 1, or -1 for a draw (refundTie in crypto mode)

## Server Authority (MatchSimulation)
Every room runs `server/game/MatchSimulation.ts` — the same pure GameEngine as the clients,
created at `both_battle_ready` from the room seed + both decks. All actions go through
`SessionManager.commitAction()`:

```
game_action → seq check → sim.apply(action, sender)   ── illegal / not your turn ──▶ resync_required (sender only, not relayed)
                              │ ok
                              ▼
             stamp serverSeq + by → actionLog → recordHash(serverSeq) → relay → persist → turn clock
                              │
                              ▼ engine reached GAME_OVER
                          settle() → match_settled {winnerIndex, reason, turns} → payout / draw refund
```

- `game_over` claims from clients are **ignored** in authoritative rooms (logged only).
- Desync detection: actions carry `postHash` (client `engineStateHash` after applying; stripped before relay).
  After replaying a relayed action the client sends `state_hash {hash, afterGlobalSeq: serverSeq}`.
  Mismatch → `resync_required` → client restarts BattleScene in resync mode (same path as a refresh rejoin).
- `src/game/utils/stateHash.ts` defines the hash (turn, phase, pending kind, hands, deck/discard sizes, LEG, every unit).

## Turn Clock
- `turn_timer {activePlayer, remainingMs, durationMs}` when the turn changes hands (and to a rejoining client).
- Timeout: server commits `SELECT_DISCARD 0` / `CANCEL_PENDING` if needed, then `END_PLAY_PHASE` / `END_ACT_PHASE`
  with `auto: true`, **broadcast to both clients** (the idle player's client applies them too).
- 3 consecutive timeouts by one player → `match_settled {reason: 'TIMEOUT'}`. Acting resets the count.
- `TURN_TIME_SECONDS` env (default 90; 0 disables).

## Persistence & Server Restart
- `server/game/MatchStore.ts`: `active_matches` row upserted after battle start and every committed action
  (seed, decks, players, seq counters, timeouts, action log). Removed on settle / room close.
- `rejoin_room` for a room not in memory → `MatchStore.load()` rebuilds Room + MatchSimulation by replaying the
  stored log, starts grace timers for both players (the rejoiner's is cancelled immediately), restarts the turn clock.
- Clients retry the connection for ~2.5 min (30 attempts); lobby-flow sockets re-emit `rejoin_room` on reconnect.
- Grace expiry after a disconnect settles the match: `DISCONNECT` (other player wins) or `ABANDONED` (draw).

## Replays
- `match_replays` row written on settle (all matches, guests included).
- `GET /api/replays/:roomCode` → `{gameSeed, decks, actionLog, playerNames, winnerIndex, reason, totalTurns}`.
- Client: ResultScene → WATCH REPLAY → `BattleScene` with `{ replay }` (no network, no input).
