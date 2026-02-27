// ─── MatchState.ts ────────────────────────────────────────────
// Data model for a single match result
// Equivalent to MatchState.cs in Unity

export interface MatchState {
    playerName: string;
    opponentName: string;
    playerRoll: number;
    opponentRoll: number;
    playerWon: boolean;
    isTie: boolean;
    stakeAmount: number;
    payout: number;
}

export function createMatchState(
    playerName: string,
    opponentName: string,
    playerRoll: number,
    opponentRoll: number,
    stakeAmount: number
): MatchState {
    const playerWon = playerRoll > opponentRoll;
    const isTie = playerRoll === opponentRoll;

    return {
        playerName,
        opponentName,
        playerRoll,
        opponentRoll,
        playerWon,
        isTie,
        stakeAmount,
        payout: playerWon ? stakeAmount * 2 * 0.95 : 0,
    };
}