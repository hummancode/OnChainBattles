// ============================================================
// PayoutService.ts
// Escrow contract interaction for crypto match settlement.
// ============================================================

import { ethers } from 'ethers';
import type { PayoutResult } from '../../shared/types/NetworkEvents.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('PayoutService');

const ESCROW_ADDRESS = '0xa145f82DC5b285B970BE71F48Cf5173E722cF515';
const ESCROW_ABI = [
  'function claimWinnings(bytes32 matchId, address winner) external',
  'function refundTie(bytes32 matchId) external',
  'function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)',
];

const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

export class PayoutService {
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;
  private walletAddress: string;
  /** Simple mutex to serialize transactions (prevents nonce collisions). */
  private txQueue: Promise<void> = Promise.resolve();

  constructor(privateKey: string) {
    const provider = new ethers.JsonRpcProvider(FUJI_RPC);
    this.wallet = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, this.wallet);
    this.walletAddress = this.wallet.address;
    log.info(` Owner wallet: ${this.walletAddress}`);
  }

  /** Convert room code string → bytes32 matchId (must match frontend). */
  matchIdFromCode(roomCode: string): string {
    const hex = Buffer.from(roomCode, 'utf8').toString('hex');
    const padded = hex.padStart(64, '0');
    return '0x' + padded;
  }

  async payoutWinner(roomCode: string, winnerAddress: string): Promise<PayoutResult> {
    return this.enqueue(() => this.doPayoutWinner(roomCode, winnerAddress));
  }

  async refundTie(roomCode: string): Promise<PayoutResult> {
    return this.enqueue(() => this.doRefundTie(roomCode));
  }

  // ── Internals ──

  /** Serialize all contract calls through a queue to prevent nonce collisions. */
  private enqueue(fn: () => Promise<PayoutResult>): Promise<PayoutResult> {
    const resultPromise = this.txQueue.then(fn, fn);
    // Update the queue tail (swallow result to keep it as Promise<void>)
    this.txQueue = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  private async doPayoutWinner(roomCode: string, winnerAddress: string): Promise<PayoutResult> {
    const matchId = this.matchIdFromCode(roomCode);
    log.info(` Paying winner ${winnerAddress} for room ${roomCode}`);
    return this.sendWithRetry(
      () => this.contract.claimWinnings(matchId, winnerAddress),
      `payout ${roomCode}`
    );
  }

  private async doRefundTie(roomCode: string): Promise<PayoutResult> {
    const matchId = this.matchIdFromCode(roomCode);
    log.info(` Refunding tie for room ${roomCode}`);
    return this.sendWithRetry(
      () => this.contract.refundTie(matchId),
      `refund ${roomCode}`
    );
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
          log.warn(`${label}: tx.wait() returned null (tx dropped?), hash: ${tx.hash}`);
          return { success: false, error: 'Transaction may have been dropped' };
        }
        log.info(` ${label} done! tx: ${tx.hash}`);
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
