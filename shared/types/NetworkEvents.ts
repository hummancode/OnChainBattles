// ============================================================
// NetworkEvents.ts
// Shared client ↔ server event contracts.
// Both SocketManager.ts and server/app.ts import from here.
// ============================================================

// ─── Game Actions (relayed between players) ──────────────────

export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE' | 'SELECT_POSITION' | 'SELECT_TARGET' | 'CANCEL_PENDING';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
  /** Client-assigned sequence number (monotonically increasing per player). */
  seqNum?: number;
  /** Server-assigned global order stamp (set before relay to opponent). */
  serverSeq?: number;
}

// ─── Client → Server Events ─────────────────────────────────

// ─── Game State Report (dev-only, sent by client for server logs) ──

export interface StateReportUnit {
  instanceId: string;
  cardId: string;
  name: string;
  owner: number;
  col: number;
  row: number;
  baseAtk: number;
  currentAtk: number;
  baseDef: number;
  currentDef: number;
  maxDef: number;
  isActive: boolean;
  hasMoved: boolean;
  hasActed: boolean;
  buffs: Array<{ source: string; atkDelta: number; defDelta: number; movDelta: number }>;
}

export interface StateReportPlayer {
  player: number;
  handCards: string[];      // card names
  handCount: number;
  deckCount: number;
  discardCount: number;
  leg: number;
  legRate: number;
  legRateBase: number;
  legRateBonus: number;
  legRatePenalty: number;
  crownDiscount: number;
  crownPenalty: number;
}

export interface GameStateReport {
  trigger: 'GAME_START' | 'PERIODIC' | 'GAME_END';
  ts: string;                    // ISO timestamp
  turn: number;
  phase: string;
  activePlayer: number;
  units: StateReportUnit[];
  players: [StateReportPlayer, StateReportPlayer];
}

export interface ClientToServerEvents {
  // Existing room events
  createRoom:     (data: { roomCode: string; playerName: string; guestSessionId?: string }) => void;
  joinRoom:       (data: { roomCode: string; playerName: string; guestSessionId?: string }) => void;
  registerWallet: (data: { roomCode: string; walletAddress: string; message: string; signature: string }) => void;
  cryptoReady:    (data: { roomCode: string }) => void;
  player_ready:   (data: { roomCode: string }) => void;
  game_action:    (data: { roomCode: string; action: GameAction }) => void;
  game_over:      (data: { roomCode: string; winnerIndex: number; totalTurns?: number }) => void;
  state_hash:     (data: { roomCode: string; hash: string; afterGlobalSeq: number }) => void;
  rejoin_room:    (data: { roomCode: string; playerName: string; guestSessionId?: string }) => void;
  game_state_report: (data: { roomCode: string; report: GameStateReport }) => void;

  // Auth/Deck events
  registerPlayer: (data: { token: string }) => void;
  submitDeck:     (data: { roomCode: string; deckIds: string[] }) => void;

  // Lobby events
  'lobby:create':         (data: { playerName: string; settings?: Partial<RoomSettings>; guestSessionId?: string }) => void;
  'lobby:join':           (data: { roomCode: string; playerName: string; password?: string; guestSessionId?: string }) => void;
  'lobby:leave':          (data: { roomCode: string }) => void;
  'lobby:chat':           (data: { roomCode: string; text: string }) => void;
  'lobby:ready':          (data: { roomCode: string }) => void;
  'lobby:kick':           (data: { roomCode: string; targetPlayerName: string }) => void;
  'lobby:settings':       (data: { roomCode: string; settings: Partial<RoomSettings> }) => void;
  'lobby:start_game':     (data: { roomCode: string }) => void;
  'lobby:crypto_ready':   (data: { roomCode: string }) => void;
  'lobby:deck_submitted': (data: { roomCode: string; deckIds: string[] }) => void;
  'lobby:list':           () => void;
  'lobby:request_state':  (data: { roomCode: string }) => void;
}

// ─── Server → Client Events ─────────────────────────────────

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface ServerToClientEvents {
  // Existing room events
  roomCreated:          (data: { roomCode: string; playerIndex: number }) => void;
  roomJoined:           (data: { roomCode: string; playerIndex: number }) => void;
  opponentJoined:       (data: { playerName: string; playerIndex: number }) => void;
  opponent_action:      (action: GameAction) => void;
  game_seed:            (data: { seed: number }) => void;
  both_battle_ready:    () => void;
  opponentDisconnected: () => void;
  opponentReconnected:  () => void;
  opponentAbandon:      () => void;
  disconnectCountdown:  (data: { remaining: number }) => void;
  rejoinSuccess:        (data: { roomCode: string; playerIndex: number; gameSeed: number }) => void;
  hostDepositConfirmed: () => void;
  bothCryptoReady:      () => void;
  payout_result:        (data: PayoutResult) => void;
  error:                (data: { message: string }) => void;

  // Deck validation events
  deckAccepted:   (data: { cardCount: number }) => void;
  deckRejected:   (data: { errors: string[] }) => void;
  bothDecksReady: () => void;

  // Lobby events
  'lobby:created':            (data: { code: string }) => void;
  'lobby:joined':             (data: { code: string }) => void;
  'lobby:state':              (data: LobbyState) => void;
  'lobby:room_list':          (data: { rooms: PublicRoomListing[] }) => void;
  'lobby:chat_message':       (data: ChatMessage) => void;
  'lobby:system_message':     (data: { text: string; timestamp: number }) => void;
  'lobby:kicked':             (data: { reason: string }) => void;
  'lobby:game_starting':      (data: GameStartingData) => void;
  'lobby:error':              (data: { message: string }) => void;
  'lobby:deposit_phase':      (data: { stakeAmount: number }) => void;
  'lobby:opponent_deposited': () => void;
  'lobby:both_deposited':     () => void;
  'lobby:submit_decks':       () => void;
  'lobby:password_required':  (data: { roomCode: string }) => void;
}

// ─── Room Settings (lobby) ──────────────────────────────────

export interface RoomSettings {
  isPublic: boolean;
  isCrypto: boolean;
  maxPlayers: number;
  roomName: string;
  stakeAmount: number;
  password: string | null;
}

// ─── Chat ───────────────────────────────────────────────────

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

// ─── Room Status ────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'full' | 'depositing' | 'starting' | 'in_progress' | 'finished';

// ─── Lobby State (sent to players inside a room) ────────────

export interface LobbyPlayerInfo {
  name: string;
  playerId: number | null;
  ready: boolean;
  isHost: boolean;
  hasDeck: boolean;
}

export interface LobbyState {
  code: string;
  settings: RoomSettings;
  status: RoomStatus;
  players: LobbyPlayerInfo[];
  chat: ChatMessage[];
}

export interface PublicRoomListing {
  code: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isCrypto: boolean;
  stakeAmount: number;
  hasPassword: boolean;
  status: RoomStatus;
  createdAt: number;
}

export interface GameStartingData {
  seed: number;
  players: Array<{
    name: string;
    playerIndex: number;
    isHost: boolean;
  }>;
}

// ─── Room Player (server-side) ──────────────────────────────

export interface RoomPlayer {
  id: string;
  name: string;
  wallet: string | null;
  // Auth/Deck extensions (optional — backward compatible)
  playerId?: number | null;
  deckIds?: string[] | null;
  ready?: boolean;
  guestSessionId?: string | null;
}

export interface GameOverClaim {
  playerIndex: number;
  claimedWinner: number;
}

export interface Room {
  players: RoomPlayer[];
  gameSeed: number | null;
  cryptoReadyCount: number;
  battleReadyCount: number;
  actionQueue: GameAction[];
  settled: boolean;
  // Server-side turn tracking for action validation
  currentTurnPlayer: number;  // 0 = P1, 1 = P2
  currentPhase: 'PLAY' | 'ACT';
  // Game-over verification
  actionCount: number;
  gameOverClaims: GameOverClaim[];
  // Action sequencing
  lastSeqNum: [number, number];  // last seqNum received from [P1, P2]
  globalSeq: number;             // monotonic server-wide order stamp
  // State checksum sync
  pendingHashes: Map<number, { playerIndex: number; hash: string }[]>;
  // Reconnection grace
  disconnectTimers: Map<number, ReturnType<typeof setTimeout>>;
  disconnectIntervals: Map<number, ReturnType<typeof setInterval>>;
  // Room age tracking for stale cleanup
  createdAt: number;
  // Server-side game log (optional, set when battle starts)
  gameLog?: any;
  // Lobby extensions (optional — backward compatible with legacy RoomScene flow)
  hostSocketId?: string;
  hostPlayerId?: number | null;
  status?: RoomStatus;
  settings?: RoomSettings;
  chat?: ChatMessage[];
}
