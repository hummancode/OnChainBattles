/**
 * The disabled payout stand-ins must expose every public method of the real services.
 * Regression: createDisabledPuzzlePayout() lacked isEnabled(), so solving an on-chain
 * puzzle on a server without FUJI_PRIVATE_KEY threw a TypeError.
 */
import { describe, it, expect } from 'vitest';
import { PayoutService } from '../../server/game/PayoutService.js';
import { PuzzlePayoutService } from '../../server/game/PuzzlePayoutService.js';
import { createDisabledPayout, createDisabledPuzzlePayout } from '../../server/game/DisabledPayout.js';

const methods = (cls: any) => Object.getOwnPropertyNames(cls.prototype)
  .filter(n => n !== 'constructor' && typeof cls.prototype[n] === 'function')
  .filter(n => !['enqueue', 'sendWithRetry'].includes(n) && !n.startsWith('do'));

describe('Disabled payout stand-ins', () => {
  it('PayoutService stub implements every public method', () => {
    const stub: any = createDisabledPayout();
    for (const m of methods(PayoutService)) expect(typeof stub[m], m).toBe('function');
  });
  it('PuzzlePayoutService stub implements every public method and reports disabled', async () => {
    const stub: any = createDisabledPuzzlePayout();
    for (const m of methods(PuzzlePayoutService)) expect(typeof stub[m], m).toBe('function');
    expect(stub.isEnabled()).toBe(false);
    expect((await stub.claimPrize(1, '0x0')).success).toBe(false);
  });
});
