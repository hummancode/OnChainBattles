// ============================================================
// PayoutService.ts
// Escrow contract interaction for crypto match settlement.
// ============================================================

import { ethers } from 'ethers';
import type { PayoutResult } from '../../shared/types/NetworkEvents.js';

const ESCROW_ADDRESS = '0xa145f82DC5b285B970BE71F48Cf5173E722cF515';
const ESCROW_ABI = [
  'function claimWinnings(bytes32 matchId, address winner) external',
  'function refundTie(bytes32 matchId) external',
  'function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)',
];

const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';

export class PayoutService {
  private contract: ethers.Contract;
  private walletAddress: string;

  constructor(privateKey: string) {
    const provider = new ethers.JsonRpcProvider(FUJI_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
    this.walletAddress = wallet.address;
    console.log(`[PayoutService] Owner wallet: ${this.walletAddress}`);
  }

  /** Convert room code string → bytes32 matchId (must match frontend). */
  matchIdFromCode(roomCode: string): string {
    const hex = Buffer.from(roomCode, 'utf8').toString('hex');
    const padded = hex.padStart(64, '0');
    return '0x' + padded;
  }

  async payoutWinner(roomCode: string, winnerAddress: string): Promise<PayoutResult> {
    const matchId = this.matchIdFromCode(roomCode);
    console.log(`[PayoutService] Paying winner ${winnerAddress} for room ${roomCode}`);
    try {
      const tx = await this.contract.claimWinnings(matchId, winnerAddress);
      await tx.wait();
      console.log(`[PayoutService] Payout done! tx: ${tx.hash}`);
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      console.error(`[PayoutService] Payout failed:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async refundTie(roomCode: string): Promise<PayoutResult> {
    const matchId = this.matchIdFromCode(roomCode);
    console.log(`[PayoutService] Refunding tie for room ${roomCode}`);
    try {
      const tx = await this.contract.refundTie(matchId);
      await tx.wait();
      console.log(`[PayoutService] Tie refund done! tx: ${tx.hash}`);
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      console.error(`[PayoutService] Tie refund failed:`, err.message);
      return { success: false, error: err.message };
    }
  }
}
