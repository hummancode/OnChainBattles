// ============================================================
// authRoutes.ts
// Wallet-based authentication: nonce → sign → JWT.
// No password, no email. MetaMask signature is the credential.
// ============================================================

import { Router } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { getDB } from '../db/database.js';
import { issueToken } from './middleware.js';
import { initializeCollection } from './collectionHelpers.js';

export const authRouter = Router();

// In-memory nonce store: wallet → { nonce, expiresAt }
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

const MAX_NONCES = 10_000;

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
  // Hard cap to prevent OOM under attack
  if (nonceStore.size > MAX_NONCES) {
    const excess = nonceStore.size - MAX_NONCES;
    const keys = nonceStore.keys();
    for (let i = 0; i < excess; i++) {
      const k = keys.next().value;
      if (k !== undefined) nonceStore.delete(k);
    }
  }
}

function buildNonceMessage(nonce: string): string {
  return `Sign this message to log in to OnChainBattles.\n\nNonce: ${nonce}\n\nThis does not cost any gas.`;
}

// GET /api/auth/nonce?wallet=0x...
authRouter.get('/nonce', (req, res) => {
  const wallet = (req.query.wallet as string ?? '').toLowerCase();
  if (!wallet.startsWith('0x') || wallet.length !== 42) {
    res.status(400).json({ error: 'Invalid wallet address.' });
    return;
  }

  cleanExpiredNonces();
  const nonce = crypto.randomBytes(32).toString('hex');
  nonceStore.set(wallet, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });

  res.json({ nonce, message: buildNonceMessage(nonce) });
});

// POST /api/auth/login  { wallet, signature }
authRouter.post('/login', (req, res) => {
  const { wallet, signature } = req.body ?? {};
  const w = (wallet ?? '').toLowerCase();

  if (!w || !signature) {
    res.status(400).json({ error: 'Missing wallet or signature.' });
    return;
  }

  const stored = nonceStore.get(w);
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(401).json({ error: 'Nonce expired. Request a new one.' });
    return;
  }

  const message = buildNonceMessage(stored.nonce);
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== w) {
      res.status(401).json({ error: 'Signature does not match wallet.' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid signature.' });
    return;
  }

  nonceStore.delete(w);

  const db = getDB();
  let player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(w) as Record<string, unknown> | undefined;

  if (!player) {
    const result = db.prepare(
      'INSERT INTO players (wallet_address, display_name) VALUES (?, ?)'
    ).run(w, `Player_${w.slice(-6)}`);
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>;
    initializeCollection(player!.id as number);
  }

  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player!.id);

  const token = issueToken({ playerId: player!.id as number, wallet: w });

  res.json({
    token,
    player: {
      id: player!.id,
      wallet: player!.wallet_address,
      displayName: player!.display_name,
      winCount: player!.win_count,
      lossCount: player!.loss_count,
      eloRating: player!.elo_rating,
      activeDeckId: player!.active_deck_id,
    },
  });
});
