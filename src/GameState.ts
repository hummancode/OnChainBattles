// ─── GameState.ts ─────────────────────────────────────────────
// Global singleton — survives scene changes

export enum GameMode {
    FreePlay = "FreePlay",
    CryptoPlay = "CryptoPlay",
}

export enum RoomAction {
    Create = "Create",
    Join = "Join",
}

export interface BoardGameResult {
    playerName: string;
    opponentName: string;
    playerWon: boolean;
    isTie: boolean;
    reason: string;       // 'KING_DESTROYED' | 'DISCONNECT' | 'SURRENDER' | 'TIMEOUT'
    turns: number;
    stakeAmount: number;
    payout: number;
}

// Re-export from shared types for backward compat
export type { PayoutResult } from '../shared/types/NetworkEvents';
import type { PayoutResult } from '../shared/types/NetworkEvents';

class GameStateClass {
    // ─── Player ───────────────────────────────────────────────
    playerName: string = "Player";
    opponentName: string = "";
    walletAddress: string = "";
    isWalletConnected: boolean = false;

    // ─── Mode ─────────────────────────────────────────────────
    currentMode: GameMode = GameMode.FreePlay;

    // ─── Room ─────────────────────────────────────────────────
    roomCode: string = "";
    roomAction: RoomAction = RoomAction.Create;
    playerIndex: number = 0;     // 0 = P1/creator, 1 = P2/joiner
    gameSeed: number = 0;        // Shared shuffle seed from server

    // ─── Match ────────────────────────────────────────────────
    currentStake: number = 0;
    winCount: number = 0;
    lossCount: number = 0;
    lastMatch: BoardGameResult | null = null;

    // ─── Crypto ───────────────────────────────────────────────
    depositTxHash: string | null = null;
    payoutResult: PayoutResult | null = null;

    // ─── Auth (populated by AuthManager after login) ─────────
    authToken: string = '';
    authenticatedPlayerId: number = 0;
    displayName: string = '';
    accountTier: number = 0;    // 0=guest, 1=free, 2=economy
    authEmail: string = '';

    // ─── Deck (populated by deck selection flow) ─────────────
    activeDeckId: number | null = null;
    activeDeckCardIds: string[] = [];

    // ─── Setters ──────────────────────────────────────────────
    setPlayerName(name: string): void {
        this.playerName = name;
        console.log(`[GameState] Player name set: ${name}`);
    }

    setOpponentName(name: string): void {
        this.opponentName = name;
        console.log(`[GameState] Opponent name set: ${name}`);
    }

    // ─── Wallet ───────────────────────────────────────────────
    connectWallet(address: string): void {
        this.walletAddress = address;
        this.isWalletConnected = true;
        this.currentMode = GameMode.CryptoPlay;
        console.log(`[GameState] Wallet connected: ${address}`);
    }

    disconnectWallet(): void {
        this.walletAddress = "";
        this.isWalletConnected = false;
        this.currentMode = GameMode.FreePlay;
        console.log("[GameState] Wallet disconnected.");
    }

    // ─── Stake ────────────────────────────────────────────────
    setStake(amount: number): void {
        this.currentStake = amount;
        console.log(`[GameState] Stake set: ${amount} AVAX`);
    }

    // ─── Room ─────────────────────────────────────────────────
    setRoomCode(code: string): void {
        this.roomCode = code;
        console.log(`[GameState] Room code: ${code}`);
    }

    setRoomAction(action: RoomAction): void {
        this.roomAction = action;
        console.log(`[GameState] Room action: ${action}`);
    }

    setPlayerIndex(index: number): void {
        this.playerIndex = index;
        console.log(`[GameState] Player index set: ${index} (${index === 0 ? 'P1/Creator' : 'P2/Joiner'})`);
    }

    setGameSeed(seed: number): void {
        this.gameSeed = seed;
        console.log(`[GameState] Game seed set: ${seed}`);
    }

    // ─── Match ────────────────────────────────────────────────
    recordWin(): void {
        this.winCount++;
        console.log(`[GameState] Win recorded. Total: ${this.winCount}`);
    }

    recordLoss(): void {
        this.lossCount++;
        console.log(`[GameState] Loss recorded. Total: ${this.lossCount}`);
    }

    setLastMatch(match: BoardGameResult): void {
        this.lastMatch = match;
        console.log(`[GameState] Match saved — Won: ${match.playerWon}`);
    }

    clearMatchData(): void {
        this.roomCode = "";
        this.gameSeed = 0;
        this.playerIndex = 0;
        this.opponentName = "";
        this.lastMatch = null;
        this.depositTxHash = null;
        this.payoutResult = null;
        this.currentStake = 0;
        this.currentMode = GameMode.FreePlay;
    }

    // ─── Auth ─────────────────────────────────────────────────
    setAuthData(token: string, playerId: number, name: string): void {
        this.authToken = token;
        this.authenticatedPlayerId = playerId;
        this.displayName = name;
        this.playerName = name;
        console.log(`[GameState] Auth: ${name} (#${playerId})`);
    }

    isAuthenticated(): boolean {
        return this.authenticatedPlayerId > 0 && this.authToken.length > 0;
    }

    clearAuth(): void {
        this.authToken = '';
        this.authenticatedPlayerId = 0;
        this.displayName = '';
        this.accountTier = 0;
        this.authEmail = '';
        console.log('[GameState] Auth cleared.');
    }

    // ─── Deck ─────────────────────────────────────────────────
    setActiveDeck(deckId: number | null, cardIds: string[]): void {
        this.activeDeckId = deckId;
        this.activeDeckCardIds = [...cardIds];
        console.log(`[GameState] Active deck: #${deckId} (${cardIds.length} cards)`);
    }

    hasActiveDeck(): boolean {
        return this.activeDeckCardIds.length > 0;
    }

    // ─── Battle Session Persistence ─────────────────────────────
    private static readonly BATTLE_SESSION_KEY = 'ocb_battle_session';

    /** Save battle context to sessionStorage so page refresh can rejoin. */
    persistBattleSession(): void {
        if (!this.roomCode) return;
        try {
            sessionStorage.setItem(GameStateClass.BATTLE_SESSION_KEY, JSON.stringify({
                roomCode: this.roomCode,
                playerIndex: this.playerIndex,
                gameSeed: this.gameSeed,
                playerName: this.playerName,
                opponentName: this.opponentName,
            }));
            console.log(`[GameState] Battle session persisted: room=${this.roomCode}`);
        } catch { /* storage disabled */ }
    }

    /** Restore battle context from sessionStorage. Returns true if session found. */
    restoreBattleSession(): boolean {
        try {
            const raw = sessionStorage.getItem(GameStateClass.BATTLE_SESSION_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data.roomCode) return false;
            this.roomCode = data.roomCode;
            this.playerIndex = data.playerIndex ?? 0;
            this.gameSeed = data.gameSeed ?? 0;
            this.playerName = data.playerName ?? 'Guest';
            this.opponentName = data.opponentName ?? '';
            console.log(`[GameState] Battle session restored: room=${this.roomCode}, player=${this.playerName}`);
            return true;
        } catch { return false; }
    }

    clearBattleSession(): void {
        try { sessionStorage.removeItem(GameStateClass.BATTLE_SESSION_KEY); } catch { /* */ }
    }

    hasBattleSession(): boolean {
        try {
            const raw = sessionStorage.getItem(GameStateClass.BATTLE_SESSION_KEY);
            return !!raw && !!JSON.parse(raw).roomCode;
        } catch { return false; }
    }

    // ─── Debug ────────────────────────────────────────────────
    printStatus(): void {
        console.log(
            `[GameState] Player: ${this.playerName} | ` +
            `Mode: ${this.currentMode} | ` +
            `Wallet: ${this.isWalletConnected ? this.walletAddress : "None"} | ` +
            `W/L: ${this.winCount}/${this.lossCount}`
        );
    }
}

const GameState = new GameStateClass();
export default GameState;
