// ============================================================
// EscrowManager.ts
// Handles all Escrow smart contract interactions.
//
// Functions:
//   createMatch  — Host deposits AVAX to create a match on-chain
//   joinMatch    — Joiner deposits matching AVAX to join
//   getMatchInfo — Read match state from contract (debug helper)
//
// Error handling:
//   All contract calls log detailed errors to console for debugging
//   but throw clean short messages for UI display.
// ============================================================

import { Contract, parseEther, formatEther } from "ethers";
import WalletManager from "./WalletManager";

export const STAKE_AVAX = 0.01; // Hardcoded stake for Phase 1

const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";

const ESCROW_ABI = [
  "function createMatch(bytes32 matchId) external payable",
  "function joinMatch(bytes32 matchId) external payable",
  "function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)",
  "event MatchCreated(bytes32 matchId, address playerA, uint256 stake)",
  "event MatchReady(bytes32 matchId, address playerA, address playerB)",
  "event MatchFinished(bytes32 matchId, address winner, uint256 payout)",
];

// Human-readable error codes for known revert reasons
const REVERT_MESSAGES: Record<string, string> = {
  "Match exists":         "Match already created for this room",
  "Stake required":       "Stake amount must be > 0",
  "Match not found":      "No match found — host hasn't deposited yet",
  "Match full":           "Match already has two players",
  "Wrong stake amount":   "Stake doesn't match host's deposit",
  "Cannot join own match": "You can't join your own match",
};

class EscrowManagerClass {

  private getContract(): Contract {
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error("Wallet not connected");
    return new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  }

  /**
   * Generate matchId from room code.
   * MUST match server logic exactly:
   *   Buffer.from(roomCode, 'utf8').toString('hex').padStart(64, '0')
   */
  matchIdFromCode(roomCode: string): string {
    const hex = Array.from(new TextEncoder().encode(roomCode))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return '0x' + hex.padStart(64, '0');
  }

  /**
   * Host creates a match on-chain by depositing AVAX.
   * Returns the transaction hash on success.
   */
  async createMatch(roomCode: string): Promise<string> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(STAKE_AVAX.toString());

    console.log(`[EscrowManager] createMatch — room: ${roomCode}, matchId: ${matchId}, stake: ${STAKE_AVAX} AVAX`);

    try {
      const tx = await contract.createMatch(matchId, { value });
      console.log(`[EscrowManager] createMatch tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[EscrowManager] createMatch confirmed — block: ${receipt?.blockNumber ?? '?'}, tx: ${tx.hash}`);

      return tx.hash;
    } catch (err: any) {
      throw this.handleContractError(err, 'createMatch');
    }
  }

  /**
   * Joiner matches the host's deposit to join the match.
   * Returns the transaction hash on success.
   */
  async joinMatch(roomCode: string): Promise<string> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(STAKE_AVAX.toString());

    console.log(`[EscrowManager] joinMatch — room: ${roomCode}, matchId: ${matchId}, stake: ${STAKE_AVAX} AVAX`);

    try {
      const tx = await contract.joinMatch(matchId, { value });
      console.log(`[EscrowManager] joinMatch tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[EscrowManager] joinMatch confirmed — block: ${receipt?.blockNumber ?? '?'}, tx: ${tx.hash}`);

      return tx.hash;
    } catch (err: any) {
      throw this.handleContractError(err, 'joinMatch');
    }
  }

  /**
   * Read match state from contract — useful for debugging.
   * Returns null if match doesn't exist.
   */
  async getMatchInfo(roomCode: string): Promise<{
    playerA: string;
    playerB: string;
    stake: string;
    status: number;
  } | null> {
    try {
      const contract = this.getContract();
      const matchId = this.matchIdFromCode(roomCode);
      const [playerA, playerB, stake, status] = await contract.matches(matchId);

      if (playerA === '0x0000000000000000000000000000000000000000') {
        return null; // match doesn't exist
      }

      return {
        playerA,
        playerB,
        stake: formatEther(stake),
        status: Number(status),
      };
    } catch (err) {
      console.warn('[EscrowManager] getMatchInfo failed:', err);
      return null;
    }
  }

  /**
   * Parse contract errors into clean, UI-friendly messages.
   * Logs full details to console for debugging.
   */
  private handleContractError(err: any, method: string): Error {
    const code = err?.code ?? 'UNKNOWN';
    const reason = err?.reason ?? '';
    const shortMsg = err?.shortMessage ?? '';
    const revertData = err?.data ?? '';

    // Log full details for developer debugging
    console.error(`[EscrowManager] ${method} FAILED`, {
      code,
      reason,
      shortMessage: shortMsg,
      revertData,
      message: err?.message?.slice(0, 200),
    });

    // User rejected the wallet popup
    if (code === 'ACTION_REJECTED' || code === 4001 || shortMsg.includes('rejected')) {
      return new Error('Transaction rejected in wallet');
    }

    // Wrong network
    if (code === 'NETWORK_ERROR' || shortMsg.includes('network')) {
      return new Error('Wrong network — switch to Avalanche Fuji');
    }

    // Insufficient funds
    if (shortMsg.includes('insufficient funds') || reason.includes('insufficient')) {
      return new Error('Insufficient AVAX — get test tokens from faucet');
    }

    // Contract revert — try to extract readable reason
    if (code === 'CALL_EXCEPTION' || reason) {
      const revertReason = reason || shortMsg;
      for (const [key, friendly] of Object.entries(REVERT_MESSAGES)) {
        if (revertReason.includes(key)) {
          return new Error(friendly);
        }
      }
      return new Error(revertReason.length > 60 ? revertReason.slice(0, 60) + '...' : revertReason || 'Contract call failed');
    }

    // Fallback
    const fallback = shortMsg || reason || err?.message || 'Unknown wallet error';
    return new Error(fallback.length > 80 ? fallback.slice(0, 80) + '...' : fallback);
  }
}

const EscrowManager = new EscrowManagerClass();
export default EscrowManager;