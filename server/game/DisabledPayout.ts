// ============================================================
// DisabledPayout.ts
// Stand-ins for PayoutService / PuzzlePayoutService when no owner key
// is configured (local dev, free-play only). The server boots and
// free-play works; any on-chain call fails cleanly instead of the
// whole process crashing at startup.
// ============================================================

import { solidityPackedKeccak256 } from 'ethers';
import type { PayoutResult } from '../../shared/types/NetworkEvents.js';
import type { PayoutService } from './PayoutService.js';
import type { PuzzlePayoutService } from './PuzzlePayoutService.js';

const DISABLED: PayoutResult = { success: false, error: 'On-chain payouts disabled: FUJI_PRIVATE_KEY is not configured' };
const fail = async (): Promise<PayoutResult> => DISABLED;

export function isValidPrivateKey(key: string | undefined): key is string {
  return !!key && /^(0x)?[0-9a-fA-F]{64}$/.test(key.trim());
}

export function createDisabledPayout(): PayoutService {
  return {
    matchIdFromCode: (code: string) => '0x' + Buffer.from(code, 'utf8').toString('hex').padStart(64, '0'),
    payoutWinner: fail,
    refundTie: fail,
  } as unknown as PayoutService;
}

export function createDisabledPuzzlePayout(): PuzzlePayoutService {
  return {
    isEnabled: () => false,          // puzzleRoutes checks this before claimPrize — was missing (TypeError)
    puzzleIdFromDbId: (dbId: number) => solidityPackedKeccak256(['string', 'uint256'], ['puzzle_', dbId]), // same id as the real service
    createPuzzle: fail, claimPrize: fail, closePuzzle: fail,
  } as unknown as PuzzlePayoutService;
}
