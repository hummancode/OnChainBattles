// ============================================================
// authRoutes.ts
// Multi-provider authentication: wallet (MetaMask) + email/password.
// Supports account linking (add wallet to email account or vice versa).
// ============================================================

import { Router } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import bcrypt from 'bcryptjs';
import { getDB } from '../db/database.js';
import { issueToken, requireAuth } from './middleware.js';
import { initializeCollection } from './collectionHelpers.js';
import { sanitizeText } from '../utils/sanitize.js';

export const authRouter = Router();

// ─── Validation helpers ─────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_EMAIL = 254;

function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > MAX_EMAIL || !EMAIL_REGEX.test(trimmed)) return null;
  return trimmed;
}

function isValidPassword(password: unknown): boolean {
  return typeof password === 'string'
    && password.length >= MIN_PASSWORD
    && password.length <= MAX_PASSWORD;
}

// ─── Rate limiting (login/register) ─────────────────────────

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

// ─── Wallet nonce store ─────────────────────────────────────

const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
const MAX_NONCES = 10_000;

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
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

// ─── Helper: build player response ──────────────────────────

function buildPlayerResponse(p: Record<string, unknown>) {
  return {
    id: p.id,
    wallet: p.wallet_address ?? null,
    email: p.email ?? null,
    displayName: p.display_name,
    winCount: p.win_count,
    lossCount: p.loss_count,
    eloRating: p.elo_rating,
    activeDeckId: p.active_deck_id,
    accountTier: p.account_tier ?? 1,
    authProvider: p.auth_provider ?? 'wallet',
  };
}

function buildToken(p: Record<string, unknown>): string {
  return issueToken({
    playerId: p.id as number,
    wallet: (p.wallet_address as string) ?? null,
    email: (p.email as string) ?? null,
    authProvider: (p.auth_provider as string) ?? 'wallet',
    accountTier: (p.account_tier as number) ?? 1,
  });
}

// ═══════════════════════════════════════════════════════════════
// WALLET AUTH (existing, unchanged logic)
// ═══════════════════════════════════════════════════════════════

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
    nonceStore.delete(w); // Clean up expired nonce
    res.status(401).json({ error: 'Nonce expired. Request a new one.' });
    return;
  }

  // Delete nonce BEFORE verification to prevent replay within expiry window
  const message = buildNonceMessage(stored.nonce);
  nonceStore.delete(w);

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

  const db = getDB();
  let player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(w) as Record<string, unknown> | undefined;

  if (!player) {
    db.prepare(
      'INSERT INTO players (wallet_address, auth_provider, account_tier, display_name) VALUES (?, ?, ?, ?)'
    ).run(w, 'wallet', 1, `Player_${w.slice(-6)}`);
    player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(w) as Record<string, unknown>;
    initializeCollection(player!.id as number);
  }

  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player!.id);

  res.json({ token: buildToken(player!), player: buildPlayerResponse(player!) });
});

// ═══════════════════════════════════════════════════════════════
// EMAIL AUTH (new)
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/register  { email, password, displayName? }
authRouter.post('/register', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }

  const { password, displayName } = req.body ?? {};
  const email = validateEmail(req.body?.email);

  if (!email) {
    res.status(400).json({ error: 'Invalid email address.' });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({ error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters.` });
    return;
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM players WHERE email = ?').get(email);
  if (existing) {
    res.status(400).json({ error: 'Email already registered.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const name = sanitizeText(displayName, 20) || email.split('@')[0].slice(0, 20);

  const result = db.prepare(
    'INSERT INTO players (email, password_hash, auth_provider, account_tier, display_name) VALUES (?, ?, ?, ?, ?)'
  ).run(email, hash, 'email', 1, name);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>;
  initializeCollection(player!.id as number);

  res.status(201).json({ token: buildToken(player!), player: buildPlayerResponse(player!) });
});

// POST /api/auth/email-login  { email, password }
authRouter.post('/email-login', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }

  const { password } = req.body ?? {};
  const email = validateEmail(req.body?.email);

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required.' });
    return;
  }

  const db = getDB();
  const player = db.prepare('SELECT * FROM players WHERE email = ?').get(email) as Record<string, unknown> | undefined;

  if (!player || !player.password_hash) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (!bcrypt.compareSync(password, player.password_hash as string)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);

  res.json({ token: buildToken(player), player: buildPlayerResponse(player) });
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNT LINKING
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/link-wallet  { wallet, signature }  [requires JWT]
authRouter.post('/link-wallet', requireAuth, (req, res) => {
  const { wallet, signature } = req.body ?? {};
  const w = (wallet ?? '').toLowerCase();

  if (!w || !signature) {
    res.status(400).json({ error: 'Missing wallet or signature.' });
    return;
  }

  // Check player doesn't already have a wallet
  const db = getDB();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown> | undefined;
  if (!player) { res.status(404).json({ error: 'Player not found.' }); return; }
  if (player.wallet_address) {
    res.status(400).json({ error: 'Wallet already linked.' });
    return;
  }

  // Check wallet not taken by another player
  const existing = db.prepare('SELECT id FROM players WHERE wallet_address = ?').get(w);
  if (existing) {
    res.status(409).json({ error: 'This wallet is already linked to another account.' });
    return;
  }

  // Verify signature
  const stored = nonceStore.get(w);
  if (!stored || stored.expiresAt < Date.now()) {
    nonceStore.delete(w); // Clean up expired nonce
    res.status(401).json({ error: 'Nonce expired. Request a new one.' });
    return;
  }

  // Delete nonce BEFORE verification to prevent replay within expiry window
  const message = buildNonceMessage(stored.nonce);
  nonceStore.delete(w);

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

  db.prepare('UPDATE players SET wallet_address = ?, auth_provider = ? WHERE id = ?')
    .run(w, 'both', player.id);

  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id) as Record<string, unknown>;
  res.json({ token: buildToken(updated), player: buildPlayerResponse(updated) });
});

// POST /api/auth/link-email  { email, password }  [requires JWT]
authRouter.post('/link-email', requireAuth, (req, res) => {
  const { password } = req.body ?? {};
  const email = validateEmail(req.body?.email);

  if (!email) {
    res.status(400).json({ error: 'Invalid email address.' });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({ error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters.` });
    return;
  }

  const db = getDB();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown> | undefined;
  if (!player) { res.status(404).json({ error: 'Player not found.' }); return; }
  if (player.email) {
    res.status(400).json({ error: 'Email already linked.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM players WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'This email is already linked to another account.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE players SET email = ?, password_hash = ?, auth_provider = ? WHERE id = ?')
    .run(email, hash, 'both', player.id);

  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id) as Record<string, unknown>;
  res.json({ token: buildToken(updated), player: buildPlayerResponse(updated) });
});
