// ============================================================
// middleware.ts
// JWT authentication middleware for Express routes.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET ?? (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
    : 'ocb-dev-secret-DO-NOT-USE-IN-PROD'
);

export interface TokenPayload {
  playerId: number;
  wallet: string | null;
  email: string | null;
  authProvider: string;   // 'wallet' | 'email' | 'both'
  accountTier: number;    // 0=guest, 1=free, 2=economy
}

// Extend Express Request to carry auth payload
declare global {
  namespace Express {
    interface Request {
      player?: TokenPayload;
    }
  }
}

export function issueToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const raw = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    return {
      playerId: raw.playerId as number,
      wallet: (raw.wallet as string) ?? null,
      email: (raw.email as string) ?? null,
      authProvider: (raw.authProvider as string) ?? 'wallet',
      accountTier: (raw.accountTier as number) ?? 1,
    };
  } catch {
    return null;
  }
}

/** Requires valid JWT. Attaches `req.player`. Returns 401/403 on failure. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header.' });
    return;
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  // Check ban status
  const db = getDB();
  const row = db.prepare('SELECT banned_at FROM players WHERE id = ?').get(payload.playerId) as Record<string, unknown> | undefined;
  if (row?.banned_at) {
    res.status(403).json({ error: 'Account suspended.' });
    return;
  }

  req.player = payload;
  next();
}

/** Requires admin. Must be chained after requireAuth or used standalone (does its own auth). */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // First do auth check
  requireAuth(req, res, () => {
    // Then check admin status from DB
    const db = getDB();
    const row = db.prepare('SELECT is_admin FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown> | undefined;
    if (!row || row.is_admin !== 1) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    next();
  });
}
