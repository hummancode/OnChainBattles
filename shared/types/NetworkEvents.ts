// ============================================================
// NetworkEvents.ts
// Shared client ↔ server event contracts.
// Both SocketManager.ts and server/app.ts import from here.
// ============================================================

// ─── Game Actions (relayed between players) ──────────────────

export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE' | 'SELECT_POSITION';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
}

// ─── Client → Server Events ─────────────────────────────────

export interface ClientToServerEvents {
  createRoom:     (data: { roomCode: string; playerName: string }) => void;
  joinRoom:       (data: { roomCode: string; playerName: string }) => void;
  registerWallet: (data: { roomCode: string; walletAddress: string }) => void;
  cryptoReady:    (data: { roomCode: string }) => void;
  game_action:    (data: { roomCode: string; action: GameAction }) => void;
  game_over:      (data: { roomCode: string; winnerIndex: number }) => void;
}

// ─── Server → Client Events ─────────────────────────────────

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface ServerToClientEvents {
  roomCreated:          (data: { roomCode: string; playerIndex: number }) => void;
  roomJoined:           (data: { roomCode: string; playerIndex: number }) => void;
  opponentJoined:       (data: { playerName: string; playerIndex: number }) => void;
  opponent_action:      (action: GameAction) => void;
  game_seed:            (data: { seed: number }) => void;
  opponentDisconnected: () => void;
  hostDepositConfirmed: () => void;
  bothCryptoReady:      () => void;
  payout_result:        (data: PayoutResult) => void;
  error:                (data: { message: string }) => void;
}

// ─── Room Player (server-side) ──────────────────────────────

export interface RoomPlayer {
  id: string;
  name: string;
  wallet: string | null;
}

export interface Room {
  players: RoomPlayer[];
  gameSeed: number | null;
  cryptoReadyCount: number;
  settled: boolean;
}
