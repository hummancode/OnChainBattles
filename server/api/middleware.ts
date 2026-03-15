// ============================================================
// middleware.ts
// JWT authentication middleware for Express routes.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'ocb-dev-secret-replace-in-production';

export interface TokenPayload {
  playerId: number;
  wallet: string;
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
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/** Requires valid JWT. Attaches `req.player`. Returns 401 on failure. */
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

  req.player = payload;
  next();
}
