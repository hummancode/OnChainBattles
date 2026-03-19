// ============================================================
// PuzzleEscrowManager.ts
// Client-side PuzzleEscrow contract interactions.
// Players pay attempt fees from their browser wallet.
// ============================================================

import { Contract, parseEther, formatEther, solidityPackedKeccak256 } from 'ethers';
import WalletManager from './WalletManager';

// Filled after deployment — must match server's PuzzlePayoutService
const PUZZLE_ESCROW_ADDRESS = '';

const PUZZLE_ESCROW_ABI = [
  'function submitAttempt(bytes32 puzzleId) external payable',
  'function puzzles(bytes32) view returns (uint256 prizePool, uint256 attemptFee, uint8 status, address solver)',
  'event AttemptPaid(bytes32 puzzleId, address player, uint256 newPrizePool)',
];

const REVERT_MESSAGES: Record<string, string> = {
  'Puzzle not active':  'This puzzle is no longer accepting attempts',
  'Wrong attempt fee':  'Incorrect attempt fee amount',
};

class PuzzleEscrowManagerClass {
  /** Whether on-chain puzzle features are available. */
  isEnabled(): boolean {
    return !!PUZZLE_ESCROW_ADDRESS;
  }

  /** Derive deterministic bytes32 puzzleId from DB row ID — must match server. */
  puzzleIdFromDbId(dbId: number): string {
    return solidityPackedKeccak256(['string', 'uint256'], ['puzzle_', dbId]);
  }

  /**
   * Player pays the attempt fee on-chain.
   * Returns the tx hash on success.
   */
  async submitAttempt(puzzleDbId: number, attemptFeeAvax: number): Promise<string> {
    const contract = this.getContract();
    const puzzleId = this.puzzleIdFromDbId(puzzleDbId);
    const value = parseEther(attemptFeeAvax.toString());

    console.log(`[PuzzleEscrow] submitAttempt — puzzle: ${puzzleDbId}, fee: ${attemptFeeAvax} AVAX`);

    try {
      const tx = await contract.submitAttempt(puzzleId, { value });
      console.log(`[PuzzleEscrow] tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[PuzzleEscrow] confirmed — block: ${receipt?.blockNumber ?? '?'}`);

      return tx.hash;
    } catch (err: any) {
      throw this.handleContractError(err, 'submitAttempt');
    }
  }

  /**
   * Read puzzle state from contract (debug/display helper).
   */
  async getPuzzleInfo(puzzleDbId: number): Promise<{
    prizePool: string;
    attemptFee: string;
    status: number;
    solver: string;
  } | null> {
    try {
      const contract = this.getContract();
      const puzzleId = this.puzzleIdFromDbId(puzzleDbId);
      const [prizePool, attemptFee, status, solver] = await contract.puzzles(puzzleId);

      return {
        prizePool: formatEther(prizePool),
        attemptFee: formatEther(attemptFee),
        status: Number(status),
        solver,
      };
    } catch (err) {
      console.warn('[PuzzleEscrow] getPuzzleInfo failed:', err);
      return null;
    }
  }

  // ── Private ──

  private getContract(): Contract {
    if (!PUZZLE_ESCROW_ADDRESS) throw new Error('PuzzleEscrow not deployed');
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('Wallet not connected');
    return new Contract(PUZZLE_ESCROW_ADDRESS, PUZZLE_ESCROW_ABI, signer);
  }

  private handleContractError(err: any, method: string): Error {
    const code = err?.code ?? 'UNKNOWN';
    const reason = err?.reason ?? '';
    const shortMsg = err?.shortMessage ?? '';

    console.error(`[PuzzleEscrow] ${method} FAILED`, { code, reason, shortMessage: shortMsg });

    if (code === 'ACTION_REJECTED' || code === 4001 || shortMsg.includes('rejected')) {
      return new Error('Transaction rejected in wallet');
    }
    if (code === 'NETWORK_ERROR' || shortMsg.includes('network')) {
      return new Error('Wrong network — switch to Avalanche Fuji');
    }
    if (shortMsg.includes('insufficient funds') || reason.includes('insufficient')) {
      return new Error('Insufficient AVAX — get test tokens from faucet');
    }
    if (code === 'CALL_EXCEPTION' || reason) {
      const revertReason = reason || shortMsg;
      for (const [key, friendly] of Object.entries(REVERT_MESSAGES)) {
        if (revertReason.includes(key)) return new Error(friendly);
      }
      return new Error(revertReason.length > 60 ? revertReason.slice(0, 60) + '...' : revertReason || 'Contract call failed');
    }

    const fallback = shortMsg || reason || err?.message || 'Unknown wallet error';
    return new Error(fallback.length > 80 ? fallback.slice(0, 80) + '...' : fallback);
  }
}

const PuzzleEscrowManager = new PuzzleEscrowManagerClass();
export default PuzzleEscrowManager;
