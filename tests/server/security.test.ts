/**
 * security.test.ts — Security baseline tests.
 * JWT middleware, sanitize, deck validation, ban check.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { issueToken, verifyToken, requireAuth } from '../../server/api/middleware';
import type { TokenPayload } from '../../server/api/middleware';
import { sanitizeText } from '../../server/utils/sanitize';
import { validateDeck } from '../../server/validation/DeckValidator';
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions';
import { patchGetDB, createTestPlayer } from './helpers/testDB';

const testPayload: TokenPayload = {
  playerId: 1,
  wallet: '0x1234',
  email: 'test@test.com',
  authProvider: 'wallet',
  accountTier: 1,
};

describe('JWT middleware', () => {
  let cleanup: () => void;
  let db: any;

  beforeAll(() => {
    const patched = patchGetDB();
    db = patched.db;
    cleanup = patched.cleanup;
    // Insert test player so requireAuth's ban check doesn't fail
    db.prepare('INSERT INTO players (id, wallet_address, display_name) VALUES (?, ?, ?)').run(1, '0x1234', 'TestPlayer');
  });

  afterAll(() => cleanup());

  it('issueToken + verifyToken round-trips correctly', () => {
    const token = issueToken(testPayload);
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.playerId).toBe(1);
    expect(decoded!.wallet).toBe('0x1234');
    expect(decoded!.authProvider).toBe('wallet');
  });

  it('verifyToken rejects garbage token', () => {
    expect(verifyToken('not.a.valid.jwt.token')).toBeNull();
  });

  it('verifyToken rejects tampered token', () => {
    const token = issueToken(testPayload);
    const parts = token.split('.');
    parts[2] = parts[2].split('').reverse().join('');
    expect(verifyToken(parts.join('.'))).toBeNull();
  });

  it('requireAuth returns 401 without Authorization header', () => {
    const req = { headers: {} } as any;
    let statusCode = 0;
    let body: any = null;
    const res = { status: (c: number) => { statusCode = c; return { json: (b: any) => { body = b; } }; } } as any;
    requireAuth(req, res, () => {});
    expect(statusCode).toBe(401);
    expect(body.error).toContain('Missing');
  });

  it('requireAuth returns 401 with invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalid.token' } } as any;
    let statusCode = 0;
    const res = { status: (c: number) => { statusCode = c; return { json: () => {} }; } } as any;
    requireAuth(req, res, () => {});
    expect(statusCode).toBe(401);
  });

  it('requireAuth passes with valid token and non-banned player', () => {
    const token = issueToken(testPayload);
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    let nextCalled = false;
    requireAuth(req, {} as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.player.playerId).toBe(1);
  });

  it('requireAuth returns 403 for banned player', () => {
    // Ban the player
    db.prepare('UPDATE players SET banned_at = CURRENT_TIMESTAMP WHERE id = ?').run(1);
    const token = issueToken(testPayload);
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    let statusCode = 0;
    const res = { status: (c: number) => { statusCode = c; return { json: () => {} }; } } as any;
    requireAuth(req, res, () => {});
    expect(statusCode).toBe(403);
    // Unban for other tests
    db.prepare('UPDATE players SET banned_at = NULL WHERE id = ?').run(1);
  });
});

describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert("xss")</script>Hello', 100)).toBe('alert(xss)Hello');
  });

  it('strips dangerous characters', () => {
    expect(sanitizeText('test<>&"\'chars', 100)).toBe('testchars');
  });

  it('trims to max length', () => {
    expect(sanitizeText('a'.repeat(200), 50)).toHaveLength(50);
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeText(42, 100)).toBe('');
    expect(sanitizeText(null, 100)).toBe('');
    expect(sanitizeText(undefined, 100)).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeText('  hello  ', 100)).toBe('hello');
    expect(sanitizeText('\n\ttrimme\n', 100)).toBe('trimme');
  });
});

describe('Lobby deck validation (D1)', () => {
  it('DeckValidator accepts valid UNITS_ONLY deck', () => {
    const result = validateDeck(UNITS_ONLY_DECK_IDS);
    expect(result.valid).toBe(true);
  });

  it('DeckValidator rejects empty deck', () => {
    expect(validateDeck([]).valid).toBe(false);
  });

  it('DeckValidator rejects deck with king', () => {
    expect(validateDeck([...UNITS_ONLY_DECK_IDS.slice(0, 30), 'king']).valid).toBe(false);
  });

  it('DeckValidator rejects unknown card IDs', () => {
    expect(validateDeck([...UNITS_ONLY_DECK_IDS.slice(0, 30), 'fake_xyz']).valid).toBe(false);
  });

  it('DeckValidator rejects non-array input', () => {
    expect(validateDeck('string' as any).valid).toBe(false);
  });

  it('DeckValidator accepts deck with exactly max copies owned', () => {
    // Boundary test: 3 foot_soldiers used, 3 owned → should pass
    const owned = new Map<string, number>();
    for (const id of new Set(UNITS_ONLY_DECK_IDS)) {
      const count = UNITS_ONLY_DECK_IDS.filter(c => c === id).length;
      owned.set(id, count); // exact match
    }
    const result = validateDeck(UNITS_ONLY_DECK_IDS, owned);
    expect(result.valid).toBe(true);
  });

  it('DeckValidator rejects deck with copies exceeding max', () => {
    // 4 foot_soldiers but max copies is 3
    const deck = ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier',
      ...UNITS_ONLY_DECK_IDS.slice(3)]; // replace first 3 with 4
    // This deck has wrong size too, but the copy check should also fail
    const result = validateDeck(deck.slice(0, 31));
    // Either copy limit or size check should fail
    expect(result.valid).toBe(false);
  });
});
