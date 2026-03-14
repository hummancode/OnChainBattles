# Step 2 Patch: Server Database + Auth API

**Git branch:** `feat/step2-server-db-auth`
**Estimated time:** 4–5 hours
**Prerequisites:** Step 1 complete (shared types extended)
**Verification:** `npx tsc -p tsconfig.server.json --noEmit` after each sub-step

---

## Sub-step 2.0: Install Dependencies

```bash
npm install better-sqlite3 jsonwebtoken cors
npm install -D @types/better-sqlite3 @types/jsonwebtoken @types/cors
```

Add `JWT_SECRET` to `.env`:
```
JWT_SECRET=ocb-dev-secret-replace-in-production-with-64-char-random
```

---

## Sub-step 2.1: `server/db/database.ts`

> One job: SQLite connection management.
> ~40 LOC. Pure utility, no business logic.

📁 **NEW FILE:** `server/db/database.ts`

```typescript
// ============================================================
// database.ts
// SQLite connection — singleton with WAL mode.
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve('server/data');
const DB_PATH = path.join(DB_DIR, 'ocb.sqlite');

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log(`[DB] Opened: ${DB_PATH}`);
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Closed.');
  }
}
```

### Verification
```bash
npx tsc -p tsconfig.server.json --noEmit
```

---

## Sub-step 2.2: `server/db/migrations.ts`

> One job: Run schema migrations idempotently.
> ~90 LOC. Called once at server startup.

📁 **NEW FILE:** `server/db/migrations.ts`

```typescript
// ============================================================
// migrations.ts
// Idempotent schema migrations. Run on every server start.
// Each migration has a unique ID — only runs once.
// ============================================================

import { getDB } from './database.js';

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_players',
    sql: `CREATE TABLE IF NOT EXISTS players (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address  TEXT UNIQUE NOT NULL,
      display_name    TEXT NOT NULL DEFAULT 'Player',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login      DATETIME DEFAULT CURRENT_TIMESTAMP,
      win_count       INTEGER DEFAULT 0,
      loss_count      INTEGER DEFAULT 0,
      elo_rating      INTEGER DEFAULT 1000,
      active_deck_id  INTEGER
    );`,
  },
  {
    id: '002_decks',
    sql: `CREATE TABLE IF NOT EXISTS decks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL,
      name        TEXT NOT NULL DEFAULT 'My Deck',
      card_ids    TEXT NOT NULL,
      is_valid    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );`,
  },
  {
    id: '003_collections',
    sql: `CREATE TABLE IF NOT EXISTS collections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     INTEGER NOT NULL,
      card_id       TEXT NOT NULL,
      owned_copies  INTEGER DEFAULT 0,
      unlocked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(player_id, card_id)
    );`,
  },
  {
    id: '004_match_history',
    sql: `CREATE TABLE IF NOT EXISTS match_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code     TEXT NOT NULL,
      player_a_id   INTEGER,
      player_b_id   INTEGER,
      winner_id     INTEGER,
      player_a_deck TEXT,
      player_b_deck TEXT,
      stake_amount  REAL DEFAULT 0,
      tx_hash       TEXT,
      game_seed     INTEGER,
      total_turns   INTEGER DEFAULT 0,
      started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at      DATETIME,
      FOREIGN KEY (player_a_id) REFERENCES players(id),
      FOREIGN KEY (player_b_id) REFERENCES players(id)
    );`,
  },
];

export function runMigrations(): void {
  const db = getDB();

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id     TEXT PRIMARY KEY,
    ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  const check = db.prepare('SELECT id FROM _migrations WHERE id = ?');
  const mark = db.prepare('INSERT INTO _migrations (id) VALUES (?)');

  for (const m of MIGRATIONS) {
    if (!check.get(m.id)) {
      console.log(`[DB] Running migration: ${m.id}`);
      db.exec(m.sql);
      mark.run(m.id);
    }
  }

  console.log('[DB] Migrations complete.');
}
```

---

## Sub-step 2.3: `server/validation/CardPool.ts`

> One job: Server-side card data for validation.
> ~80 LOC. Pure data + lookup function.

📁 **NEW FILE:** `server/validation/CardPool.ts`

```typescript
// ============================================================
// CardPool.ts
// Server-side card pool — minimal data for deck validation.
// Keep in sync with src/game/data/CardDefinitions.ts.
//
// Future: auto-generate this from CardDefinitions via build script.
// ============================================================

export interface CardPoolEntry {
  id: string;
  name: string;
  copies: number;
  cost: number;
}

export const CARD_POOL: readonly CardPoolEntry[] = [
  { id: 'king',           name: 'King',            copies: 1, cost: 0 },
  { id: 'foot_soldier',   name: 'Foot Soldier',    copies: 3, cost: 1 },
  { id: 'pikeman',        name: 'Pikeman',         copies: 2, cost: 2 },
  { id: 'archer',         name: 'Archer',          copies: 2, cost: 3 },
  { id: 'assassin',       name: 'Assassin',        copies: 2, cost: 3 },
  { id: 'militia',        name: 'Militia',          copies: 2, cost: 1 },
  { id: 'scout',          name: 'Scout',            copies: 2, cost: 2 },
  { id: 'lancer',         name: 'Lancer',           copies: 2, cost: 3 },
  { id: 'messenger',      name: 'Messenger',        copies: 2, cost: 2 },
  { id: 'mystic',         name: 'Mystic',           copies: 1, cost: 4 },
  { id: 'swordsman',      name: 'Swordsman',        copies: 2, cost: 2 },
  { id: 'priest',         name: 'Priest',           copies: 2, cost: 3 },
  { id: 'inquisitor',     name: 'Inquisitor',       copies: 2, cost: 4 },
  { id: 'knight',         name: 'Knight',           copies: 2, cost: 5 },
  { id: 'scribe',         name: 'Scribe',           copies: 2, cost: 2 },
  { id: 'princess',       name: 'Princess',         copies: 1, cost: 4 },
  { id: 'commander',      name: 'Commander',        copies: 1, cost: 5 },
  { id: 'knights_guard',  name: "Knight's Guard",   copies: 1, cost: 4 },
  { id: 'casus_belli',    name: 'Casus Belli',      copies: 2, cost: 2 },
  { id: 'coup',           name: 'Coup',             copies: 1, cost: 5 },
  { id: 'treason',        name: 'Treason',          copies: 1, cost: 4 },
  { id: 'reform',         name: 'Reform',           copies: 2, cost: 3 },
  { id: 'disease',        name: 'Disease',          copies: 1, cost: 3 },
  { id: 'earthquake',     name: 'Earthquake',       copies: 1, cost: 4 },
  { id: 'peasant_revolt', name: 'Peasant Revolt',   copies: 1, cost: 3 },
  { id: 'civil_war',      name: 'Civil War',        copies: 1, cost: 5 },
  { id: 'castle',         name: 'Castle',           copies: 1, cost: 5 },
  { id: 'temple',         name: 'Temple',           copies: 1, cost: 4 },
  { id: 'village',        name: 'Village',           copies: 2, cost: 3 },
  { id: 'motherland',     name: 'Motherland',       copies: 1, cost: 6 },
  { id: 'war_horn',       name: 'War Horn',         copies: 1, cost: 3 },
] as const;

const POOL_MAP = new Map<string, CardPoolEntry>(
  CARD_POOL.map(c => [c.id, c])
);

export function getCardFromPool(id: string): CardPoolEntry | undefined {
  return POOL_MAP.get(id);
}
```

---

## Sub-step 2.4: `server/validation/DeckValidator.ts`

> One job: Validate a deck against rules + optional ownership.
> ~60 LOC. Pure function, no side effects.

📁 **NEW FILE:** `server/validation/DeckValidator.ts`

```typescript
// ============================================================
// DeckValidator.ts
// Pure deck validation. No database access — ownership map
// is passed in by the caller.
// ============================================================

import { getCardFromPool } from './CardPool.js';

const DECK_SIZE = 31;

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a deck of card IDs.
 * @param cardIds  - Array of card ID strings
 * @param ownedCards - Optional ownership map (cardId → copies owned). Null = skip check.
 */
export function validateDeck(
  cardIds: string[],
  ownedCards: Map<string, number> | null = null
): DeckValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(cardIds)) {
    return { valid: false, errors: ['cardIds must be an array.'] };
  }

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}.`);
  }

  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck (pre-placed automatically).');
  }

  const unknown = cardIds.filter(id => !getCardFromPool(id));
  if (unknown.length > 0) {
    errors.push(`Unknown card IDs: ${[...new Set(unknown)].join(', ')}`);
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    const card = getCardFromPool(id);
    if (card && count > card.copies) {
      errors.push(`${card.name}: ${count} copies, max ${card.copies}.`);
    }
  }

  if (ownedCards) {
    for (const [id, count] of counts) {
      const owned = ownedCards.get(id) ?? 0;
      if (count > owned) {
        const card = getCardFromPool(id);
        errors.push(`${card?.name ?? id}: need ${count}, own ${owned}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Sub-step 2.5: `server/api/middleware.ts`

> One job: JWT verification middleware.
> ~50 LOC. Reusable across all authenticated routes.

📁 **NEW FILE:** `server/api/middleware.ts`

```typescript
// ============================================================
// middleware.ts
// JWT authentication middleware for Express routes.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'ocb-dev-secret-replace-in-production-with-64-char-random';

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
```

---

## Sub-step 2.6: `server/api/authRoutes.ts`

> One job: Nonce generation + wallet signature login.
> ~90 LOC. Stateless except in-memory nonce store (5min TTL).

📁 **NEW FILE:** `server/api/authRoutes.ts`

```typescript
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

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
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
    initializeCollection(player.id as number);
  }

  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);

  const token = issueToken({ playerId: player.id as number, wallet: w });

  res.json({
    token,
    player: {
      id: player.id,
      wallet: player.wallet_address,
      displayName: player.display_name,
      winCount: player.win_count,
      lossCount: player.loss_count,
      eloRating: player.elo_rating,
      activeDeckId: player.active_deck_id,
    },
  });
});
```

---

## Sub-step 2.7: `server/api/collectionHelpers.ts`

> One job: Initialize a new player's collection.
> ~25 LOC. Called once per new player.

📁 **NEW FILE:** `server/api/collectionHelpers.ts`

```typescript
// ============================================================
// collectionHelpers.ts
// Card collection initialization for new players.
// MVP: all cards unlocked at max copies.
// ============================================================

import { getDB } from '../db/database.js';
import { CARD_POOL } from '../validation/CardPool.js';

/** Grant a new player all cards at max copies. */
export function initializeCollection(playerId: number): void {
  const db = getDB();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)'
  );

  const batch = db.transaction(() => {
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      insert.run(playerId, card.id, card.copies);
    }
  });

  batch();
  console.log(`[Collection] Initialized for player #${playerId}`);
}
```

---

## Sub-step 2.8: `server/api/playerRoutes.ts`

> One job: Player profile CRUD.
> ~50 LOC.

📁 **NEW FILE:** `server/api/playerRoutes.ts`

```typescript
// ============================================================
// playerRoutes.ts
// Player profile: read + update display name.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';

export const playerRouter = Router();

// GET /api/player/me
playerRouter.get('/me', requireAuth, (req, res) => {
  const db = getDB();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown> | undefined;
  if (!p) {
    res.status(404).json({ error: 'Player not found.' });
    return;
  }

  res.json({
    id: p.id,
    wallet: p.wallet_address,
    displayName: p.display_name,
    winCount: p.win_count,
    lossCount: p.loss_count,
    eloRating: p.elo_rating,
    activeDeckId: p.active_deck_id,
    createdAt: p.created_at,
  });
});

// PATCH /api/player/me  { displayName }
playerRouter.patch('/me', requireAuth, (req, res) => {
  const { displayName } = req.body ?? {};
  const db = getDB();

  if (typeof displayName === 'string' && displayName.length >= 2 && displayName.length <= 20) {
    db.prepare('UPDATE players SET display_name = ? WHERE id = ?')
      .run(displayName, req.player!.playerId);
  }

  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown>;
  res.json({ id: p.id, displayName: p.display_name });
});
```

---

## Sub-step 2.9: `server/api/index.ts`

> One job: Assemble all route modules into a single router.
> ~20 LOC. Clean mount point.

📁 **NEW FILE:** `server/api/index.ts`

```typescript
// ============================================================
// api/index.ts
// Assembles all REST API sub-routers.
// Mounted at /api in server/app.ts.
// ============================================================

import { Router } from 'express';
import { authRouter } from './authRoutes.js';
import { playerRouter } from './playerRoutes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/player', playerRouter);

// Future: deck, collection, match routes (Steps 3+)
// apiRouter.use('/decks', deckRouter);
// apiRouter.use('/collection', collectionRouter);
// apiRouter.use('/matches', matchRouter);
```

---

## Sub-step 2.10: Mount API in `server/app.ts`

> 3 edits: add imports, add middleware, mount router.

📁 `server/app.ts`

### Edit 1: Add imports

OLD (top of file):
```typescript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/NetworkEvents.js';
import { RoomManager } from './rooms/RoomManager.js';
import { PayoutService } from './game/PayoutService.js';
import { SessionManager } from './game/SessionManager.js';
```

NEW:
```typescript
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/NetworkEvents.js';
import { RoomManager } from './rooms/RoomManager.js';
import { PayoutService } from './game/PayoutService.js';
import { SessionManager } from './game/SessionManager.js';
import { getDB, closeDB } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { apiRouter } from './api/index.js';
```

### Edit 2: Add middleware + DB init + API mount

OLD (after `dotenv.config()`):
```typescript
dotenv.config();

const app = express();
const httpServer = createServer(app);
```

NEW:
```typescript
dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api', apiRouter);

// ── Database ──
getDB();
runMigrations();

const httpServer = createServer(app);
```

### Edit 3: Add graceful shutdown

OLD (end of file):
```typescript
httpServer.listen(3001, () => {
  console.log('[Server] Socket.io running on port 3001');
});
```

NEW:
```typescript
httpServer.listen(3001, () => {
  console.log('[Server] Socket.io + REST API running on port 3001');
});

process.on('SIGTERM', () => {
  closeDB();
  process.exit(0);
});
```

---

## Sub-step 2.11: Add `server/data/` to `.gitignore`

📁 `.gitignore` — append:

```
# SQLite database (local dev data)
server/data/
```

---

## COMPLETE FILE CHANGE SUMMARY — Step 2

```
NEW FILES (8 files, all TypeScript, all <100 LOC):
  server/db/database.ts             SQLite connection (~35 LOC)
  server/db/migrations.ts           Schema migrations (~95 LOC)
  server/validation/CardPool.ts     Server card data (~80 LOC)
  server/validation/DeckValidator.ts  Deck validation (~60 LOC)
  server/api/middleware.ts          JWT auth middleware (~50 LOC)
  server/api/authRoutes.ts          Nonce + login (~90 LOC)
  server/api/collectionHelpers.ts   Collection init (~25 LOC)
  server/api/playerRoutes.ts        Player profile CRUD (~50 LOC)
  server/api/index.ts               Router assembly (~20 LOC)

MODIFIED FILES (2):
  server/app.ts                     3 EDITS
    └─ Add imports: cors, database, migrations, apiRouter
    └─ Add: cors(), express.json(), API mount, DB init
    └─ Add: graceful shutdown (SIGTERM → closeDB)

  .gitignore                        1 EDIT
    └─ Add: server/data/

UNTOUCHED:
  server/rooms/RoomManager.ts       Zero changes
  server/game/SessionManager.ts     Zero changes
  server/game/PayoutService.ts      Zero changes
  shared/types/NetworkEvents.ts     Already done in Step 1
  All src/ client files             Zero changes
```

## Directory Structure After Step 2

```
server/
  app.ts                            ← EDITED (3 additions)
  data/                             ← NEW (created by database.ts, gitignored)
    ocb.sqlite
  db/                               ← NEW
    database.ts
    migrations.ts
  validation/                       ← NEW
    CardPool.ts
    DeckValidator.ts
  api/                              ← NEW
    index.ts
    middleware.ts
    authRoutes.ts
    playerRoutes.ts
    collectionHelpers.ts
  rooms/
    RoomManager.ts                  ← untouched
  game/
    SessionManager.ts               ← untouched
    PayoutService.ts                ← untouched
```

## POST-STEP VERIFICATION CHECKLIST

```bash
# 1. Server TypeScript compiles
npx tsc -p tsconfig.server.json --noEmit

# 2. No 'any' in new files
grep -rn ": any" server/db/ server/validation/ server/api/
# Expected: 0 results

# 3. All new files under 100 LOC
wc -l server/db/*.ts server/validation/*.ts server/api/*.ts
# Expected: all < 100

# 4. Server starts without errors
npm run server
# Expected: "[DB] Opened: ..." "[DB] Migrations complete." "[Server] Socket.io + REST API running on port 3001"

# 5. Auth endpoints respond
curl http://localhost:3001/api/auth/nonce?wallet=0x1234567890abcdef1234567890abcdef12345678
# Expected: { "nonce": "...", "message": "..." }

# 6. Protected routes reject unauthenticated requests
curl http://localhost:3001/api/player/me
# Expected: 401 { "error": "Missing Authorization header." }

# 7. Database file created
ls -la server/data/ocb.sqlite
# Expected: file exists

# 8. Tables created
sqlite3 server/data/ocb.sqlite ".tables"
# Expected: _migrations  collections  decks  match_history  players

# 9. Client still compiles (no regressions)
npx tsc --noEmit

# 10. Existing multiplayer still works
# Manual: start server + client, create room, join, play a match
```

**Git commit:** `feat: Step 2 — SQLite database + wallet auth API + player profiles`

---

## NOTES FOR STEP 3

Step 3 will add to this foundation:
- `server/api/deckRoutes.ts` — CRUD for decks (uses `DeckValidator`)
- `server/api/collectionRoutes.ts` — Collection query (uses `collectionHelpers`)
- `server/api/matchRoutes.ts` — Match history recording + query
- Extend `RoomManager.ts` with `playerId`, `deckIds` fields
- Add `submitDeck` + `registerPlayer` socket handlers to `SessionManager.ts`
- Wire `apiRouter` with the new sub-routers in `server/api/index.ts`

Each of those files is <100 LOC and follows the same pattern established here.
