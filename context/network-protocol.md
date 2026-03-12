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
- selectColumn (no cards use COLUMN pending currently)
- selectDiscard (no cards use DISCARD pending currently)

## Connection Flow
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

## Server-Side Room State
- `battleReadyCount`: 0→1→2 (both_battle_ready emitted at 2)
- `actionQueue`: game_actions received before both ready (flushed on ready)
- `cryptoReadyCount`: for crypto mode deposit flow
- `settled`: prevents double payout
