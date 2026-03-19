// ============================================================
// PuzzlePayoutService.ts
// PuzzleEscrow contract interaction for puzzle prize payouts.
// Same patterns as PayoutService.ts (tx queue, retry, owner wallet).
// ============================================================

import { ethers } from 'ethers';
import type { PayoutResult } from '../../shared/types/NetworkEvents.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('PuzzlePayoutService');

// Filled after deployment — empty string disables on-chain features
const PUZZLE_ESCROW_ADDRESS = '';

const PUZZLE_ESCROW_ABI = [
  'function createPuzzle(bytes32 puzzleId, uint256 attemptFee) external payable',
  'function submitAttempt(bytes32 puzzleId) external payable',
  'function claimPrize(bytes32 puzzleId, address solver) external',
  'function closePuzzle(bytes32 puzzleId) external',
  'function puzzles(bytes32) view returns (uint256 prizePool, uint256 attemptFee, uint8 status, address solver)',
];

const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

export class PuzzlePayoutService {
  private contract: ethers.Contract | null = null;
  private wallet: ethers.Wallet;
  private txQueue: Promise<void> = Promise.resolve();

  constructor(privateKey: string) {
    const provider = new ethers.JsonRpcProvider(FUJI_RPC);
    this.wallet = new ethers.Wallet(privateKey, provider);

    if (PUZZLE_ESCROW_ADDRESS) {
      this.contract = new ethers.Contract(PUZZLE_ESCROW_ADDRESS, PUZZLE_ESCROW_ABI, this.wallet);
      log.info(`PuzzleEscrow at ${PUZZLE_ESCROW_ADDRESS}, wallet: ${this.wallet.address}`);
    } else {
      log.warn('PuzzleEscrow address not set — on-chain puzzle features disabled');
    }
  }

  /** Whether on-chain puzzle features are available. */
  isEnabled(): boolean {
    return this.contract !== null;
  }

  /** Derive deterministic bytes32 puzzleId from SQLite row ID. */
  puzzleIdFromDbId(dbId: number): string {
    return ethers.solidityPackedKeccak256(['string', 'uint256'], ['puzzle_', dbId]);
  }

  /** Admin creates a puzzle on-chain with a seed prize pool. */
  async createPuzzle(dbId: number, seedAvax: string, attemptFeeAvax: string): Promise<PayoutResult> {
    if (!this.contract) return { success: false, error: 'PuzzleEscrow not configured' };
    const puzzleId = this.puzzleIdFromDbId(dbId);
    const value = ethers.parseEther(seedAvax);
    const fee = ethers.parseEther(attemptFeeAvax);

    log.info(`Creating puzzle #${dbId} on-chain, seed: ${seedAvax} AVAX, fee: ${attemptFeeAvax} AVAX`);
    return this.enqueue(() =>
      this.sendWithRetry(
        () => this.contract!.createPuzzle(puzzleId, fee, { value }),
        `createPuzzle #${dbId}`
      )
    );
  }

  /** Backend claims prize for the solver after verifying solution. */
  async claimPrize(dbId: number, solverAddress: string): Promise<PayoutResult> {
    if (!this.contract) return { success: false, error: 'PuzzleEscrow not configured' };
    const puzzleId = this.puzzleIdFromDbId(dbId);

    log.info(`Claiming prize for puzzle #${dbId}, solver: ${solverAddress}`);
    return this.enqueue(() =>
      this.sendWithRetry(
        () => this.contract!.claimPrize(puzzleId, solverAddress),
        `claimPrize #${dbId}`
      )
    );
  }

  /** Admin closes an unsolved puzzle, refunds remaining pool. */
  async closePuzzle(dbId: number): Promise<PayoutResult> {
    if (!this.contract) return { success: false, error: 'PuzzleEscrow not configured' };
    const puzzleId = this.puzzleIdFromDbId(dbId);

    log.info(`Closing puzzle #${dbId}`);
    return this.enqueue(() =>
      this.sendWithRetry(
        () => this.contract!.closePuzzle(puzzleId),
        `closePuzzle #${dbId}`
      )
    );
  }

  // ── Internals (same pattern as PayoutService) ──

  private enqueue(fn: () => Promise<PayoutResult>): Promise<PayoutResult> {
    const resultPromise = this.txQueue.then(fn, fn);
    this.txQueue = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  private async sendWithRetry(
    sendFn: () => Promise<ethers.TransactionResponse>,
    label: string
  ): Promise<PayoutResult> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tx = await sendFn();
        const receipt = await tx.wait();
        if (!receipt) {
          log.warn(`${label}: tx.wait() returned null, hash: ${tx.hash}`);
          return { success: false, error: 'Transaction may have been dropped' };
        }
        log.info(`${label} done! tx: ${tx.hash}`);
        return { success: true, txHash: tx.hash };
      } catch (err: any) {
        const isRetryable = err.code === 'NETWORK_ERROR'
          || err.code === 'SERVER_ERROR'
          || err.code === 'TIMEOUT'
          || err.message?.includes('nonce');

        if (isRetryable && attempt < MAX_RETRIES) {
          log.warn(`${label} attempt ${attempt + 1} failed (retryable): ${err.message}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        log.error(`${label} failed:`, err.message);
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }
}
