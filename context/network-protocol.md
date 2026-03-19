# Network Protocol Reference

## Game Action Types (relayed between players)
| Action | Sent by | Fields | Handler |
|--------|---------|--------|---------|
| PLAY_CARD | InputCoordinator | handIndex, col, row | engine.playCard() |
| MOVE_UNIT | InputCoordinator | fromCol, fromRow, col, row | engine.moveUnit() |
| ATTACK_UNIT | InputCoordinator | fromCol, fromRow, targetCol, targetRow | engine.attackUnit() |
| SELECT_POSITION | InputCoordinator | col, row | engine.selectPosition() |
| SELECT_TARGET | InputCoordinator | col, row | engine.selectTarget() |
| CANCEL_PENDING | InputCoordinator | (none) | engine.cancelPending() |
| END_PLAY_PHASE | BattleScene | (none) | engine.endPlayPhase() |
| END_ACT_PHASE | BattleScene | (none) | engine.endActPhase() |

## Not yet networked
- selectColumn (no cards use COLUMN pending in current card pool)
- selectDiscard (War Horn uses DISCARD pending, but not yet networked — works in local play only)

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

## Disconnect / Reconnect Flow
```
Player disconnects → server starts 10s grace period
  → opponent receives: opponentDisconnected
  → countdown: disconnectCountdown (every 1s)

If player rejoins within 10s:
  → rejoin_room { roomCode, playerName }
  → server: reassignSocket, cancel grace timer
  → rejoinSuccess + opponentReconnected
  → ⚠ NO state sync — reconnected player has stale/empty engine

If grace period expires:
  → opponentAbandon → remaining player wins
  → crypto mode: auto-payout via escrow
  → room deleted
```

## Server-Side Room State
- `battleReadyCount`: 0→1→2 (both_battle_ready emitted at 2)
- `actionQueue`: game_actions received before both ready (flushed on ready)
- `cryptoReadyCount`: for crypto mode deposit flow
- `settled`: prevents double payout
- `gameOverClaims[]`: dual-claim consensus for game result
- `lastSeqNum[]`: per-player action sequence counter (replay protection)
- `graceTimer`: disconnect grace period handle (10s)

## Known Gap: No State Recovery
Server does not send game state to reconnecting clients. Engine state (board, units, hand, modifiers) is lost on page refresh. See `context/known-issues.md` for details.
