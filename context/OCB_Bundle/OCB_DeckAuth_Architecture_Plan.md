# OnChainBattles — Deck Building, User Login, Card Ownership & Server Persistence

## Architecture Action Plan — March 2026

---

# SECTION 1: CURRENT STATE ASSESSMENT

## 1.1 What Exists Today

| Area | Current State | Location |
|------|--------------|----------|
| **Deck Loading** | `DeckLoader.ts` reads `deck.config.json` from `/public/`. Falls back to `UNITS_ONLY_DECK_IDS`. Single deck for all players. | `src/config/DeckLoader.ts` |
| **Player Identity** | `GameState.ts` singleton stores `playerName` (typed by user in lobby), `walletAddress` (MetaMask). No persistent identity. | `src/GameState.ts` |
| **Server** | Plain JS `server/index.js`. In-memory `rooms` object. Socket.io relay + escrow payout. No database. No auth. | `server/index.js` |
| **Card Data** | `CardDefinitions.ts` — all 22+ cards defined as static objects. `copies` field per card. | `src/game/data/CardDefinitions.ts` |
| **Wallet** | `WalletManager.ts` — MetaMask connect/disconnect. `EscrowManager.ts` — deposit/payout. | `src/web3/` |
| **Match History** | `GameState.lastMatch`, `winCount`, `lossCount` — in-memory only, lost on refresh. | `src/GameState.ts` |

## 1.2 What's Missing

1. **No user accounts** — players type a name each session, no persistence.
2. **No deck builder UI** — everyone uses the same `deck.config.json`.
3. **No per-player deck storage** — no way to save/load custom decks.
4. **No card ownership/collection system** — all cards available to everyone.
5. **No database** — server is stateless between restarts.
6. **No server-side deck validation** — client sends deck, server trusts it blindly.
7. **No auth tokens** — socket connections are anonymous.

## 1.3 Dependency Chain (What Must Come First)

```
Server TypeScript Migration (F1-F3 from Architecture Plan)
        │
        ▼
   Database Layer (PostgreSQL/SQLite)
        │
        ├──► User Auth (wallet-based sign-in)
        │         │
        │         ▼
        │    Player Profiles (persistent identity)
        │         │
        │         ├──► Card Collection System
        │         │         │
        │         │         ▼
        │         │    Deck Builder (constrained by collection)
        │         │         │
        │         │         ▼
        │         │    Deck Storage (server-side)
        │         │
        │         ▼
        │    Match History Persistence
        │
        ▼
   Server-Side Deck Validation (on match start)
```

---

# SECTION 2: TARGET ARCHITECTURE

## 2.1 New Directory Structure

```
server/
  src/
    index.ts                      ← Entry point (replaces index.js)
    app.ts                        ← Express + Socket.io setup
    config/
      database.ts                 ← DB connection config
      env.ts                      ← Environment variables typed
    middleware/
      authMiddleware.ts           ← JWT/wallet-signature verification
      rateLimiter.ts              ← Basic rate limiting
    auth/
      AuthService.ts              ← Wallet-based login flow
      WalletVerifier.ts           ← EIP-712 / personal_sign verification
      TokenService.ts             ← JWT issue/verify
    models/
      Player.ts                   ← Player profile ORM model
      Deck.ts                     ← Saved deck ORM model
      Collection.ts               ← Card ownership ORM model
      MatchRecord.ts              ← Persistent match history
    services/
      PlayerService.ts            ← CRUD for player profiles
      DeckService.ts              ← CRUD for decks + validation
      CollectionService.ts        ← Card unlock/ownership queries
      MatchService.ts             ← Match history recording
    validation/
      DeckValidator.ts            ← Shared deck rules (server-side)
      CardPool.ts                 ← Server's copy of card definitions
    rooms/
      RoomManager.ts              ← Existing room logic, extracted
      SessionManager.ts           ← Socket ↔ Player binding
    escrow/
      PayoutService.ts            ← Existing escrow logic, extracted
    shared/
      types.ts                    ← Client-server shared event types
    db/
      migrations/                 ← Schema migration files
        001_create_players.ts
        002_create_decks.ts
        003_create_collections.ts
        004_create_match_history.ts

src/
  auth/                           ← NEW client-side auth
    AuthManager.ts                ← Wallet sign-in flow (client)
    SessionStore.ts               ← JWT storage + refresh
  deck/                           ← NEW deck builder
    DeckBuilderScene.ts           ← Phaser scene for deck building
    DeckBuilderUI.ts              ← Card grid, filters, deck panel
    DeckValidatorClient.ts        ← Client-side pre-validation
    DeckAPI.ts                    ← HTTP calls to server deck endpoints
  collection/                     ← NEW collection viewer
    CollectionManager.ts          ← Tracks owned cards client-side
    CollectionAPI.ts              ← HTTP calls to server collection endpoints
```

## 2.2 Database Schema

Using **SQLite** for MVP (file-based, zero config, easy to migrate to PostgreSQL later).

```sql
-- PLAYERS: Wallet address is the primary identity
CREATE TABLE players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT UNIQUE NOT NULL,        -- 0x... lowercase
  display_name   TEXT NOT NULL DEFAULT 'Player',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login     DATETIME DEFAULT CURRENT_TIMESTAMP,
  win_count      INTEGER DEFAULT 0,
  loss_count     INTEGER DEFAULT 0,
  elo_rating     INTEGER DEFAULT 1000,
  peak_elo       INTEGER DEFAULT 1000,
  active_deck_id INTEGER,                     -- FK to decks.id
  FOREIGN KEY (active_deck_id) REFERENCES decks(id)
);

-- COLLECTIONS: Which cards each player owns
-- MVP: All players own all cards. Infrastructure ready for gating.
CREATE TABLE collections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL,
  card_id       TEXT NOT NULL,                -- e.g. 'foot_soldier'
  owned_copies  INTEGER DEFAULT 0,            -- How many copies owned
  unlocked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id),
  UNIQUE(player_id, card_id)
);

-- DECKS: Saved deck presets per player
CREATE TABLE decks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL,
  name          TEXT NOT NULL DEFAULT 'My Deck',
  card_ids      TEXT NOT NULL,                -- JSON array: ["foot_soldier","foot_soldier","pikeman",...]
  is_valid      BOOLEAN DEFAULT 0,            -- Server-validated flag
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- MATCH_HISTORY: Persistent record of every match
CREATE TABLE match_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code     TEXT NOT NULL,
  player_a_id   INTEGER NOT NULL,
  player_b_id   INTEGER,                      -- NULL if opponent was guest
  winner_id     INTEGER,                      -- NULL if tie
  player_a_deck TEXT,                         -- JSON snapshot of deck used
  player_b_deck TEXT,
  stake_amount  REAL DEFAULT 0,
  tx_hash       TEXT,                         -- On-chain tx if crypto match
  game_seed     INTEGER,
  total_turns   INTEGER,
  started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at      DATETIME,
  FOREIGN KEY (player_a_id) REFERENCES players(id),
  FOREIGN KEY (player_b_id) REFERENCES players(id)
);
```

## 2.3 Authentication Flow

**Wallet-Based Auth (no email/password):**

```
Client                          Server
  │                               │
  ├─── GET /auth/nonce ──────────►│  Server generates random nonce
  │◄── { nonce: "abc123..." } ────┤  Stores nonce keyed by wallet
  │                               │
  │  User signs nonce in MetaMask │
  │                               │
  ├─── POST /auth/login ─────────►│  { wallet, signature, nonce }
  │    Server recovers signer     │  ethers.verifyMessage(nonce, sig)
  │    from signature             │  Checks recovered === wallet
  │                               │  Creates/finds Player record
  │◄── { jwt, player } ──────────┤  Issues JWT (24h expiry)
  │                               │
  │  JWT sent on every request    │
  │  + Socket handshake auth      │
  │                               │
```

**Why wallet-based, not username/password:**
- Players already have MetaMask for crypto play
- No password storage liability
- Wallet address = unique identity
- Free-play users can play as guests (no wallet required, limited features)

## 2.4 Server API Endpoints

```
AUTH
  GET   /auth/nonce?wallet=0x...        → { nonce }
  POST  /auth/login                      → { jwt, player }
         body: { wallet, signature }

PLAYER
  GET   /player/me                       → { player profile }
  PATCH /player/me                       → { updated profile }
         body: { displayName }

DECKS
  GET   /decks                           → { decks[] }
  POST  /decks                           → { deck }
         body: { name, cardIds[] }
  PUT   /decks/:id                       → { deck }
         body: { name?, cardIds[]? }
  DELETE /decks/:id                      → { success }
  POST  /decks/:id/activate              → { player }
         Sets this deck as active for matchmaking.
  POST  /decks/validate                  → { valid, errors[] }
         body: { cardIds[] }

COLLECTION
  GET   /collection                      → { cards[] with owned counts }

MATCHES
  GET   /matches                         → { matches[] }
         query: ?limit=20&offset=0
```

---

# SECTION 3: DETAILED ACTION PLAN

## Phase A: Server TypeScript Migration + Database (Week 1-2)

> **Prerequisites:** None (can start immediately)
> **Effort:** ~10-12 hours
> **Blocks:** Everything else

### Step A.1: Convert server/index.js → TypeScript

**What changes:** The entire `server/index.js` gets replaced by a proper TypeScript project.

**New files to create:**

`server/package.json`
```json
{
  "name": "ocb-server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.7.5",
    "ethers": "^6.11.0",
    "better-sqlite3": "^11.0.0",
    "jsonwebtoken": "^9.0.0",
    "dotenv": "^16.0.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "tsx": "^4.7.0",
    "@types/express": "^4.17.21",
    "@types/better-sqlite3": "^7.6.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/cors": "^2.8.17"
  }
}
```

`server/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

`server/src/config/env.ts`
```typescript
import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  JWT_SECRET: process.env.JWT_SECRET ?? 'ocb-dev-secret-change-in-prod',
  FUJI_RPC: process.env.FUJI_RPC ?? 'https://api.avax-test.network/ext/bc/C/rpc',
  FUJI_PRIVATE_KEY: process.env.FUJI_PRIVATE_KEY ?? '',
  ESCROW_ADDRESS: process.env.ESCROW_ADDRESS ?? '0xa145f82DC5b285B970BE71F48Cf5173E722cF515',
  DB_PATH: process.env.DB_PATH ?? './data/ocb.sqlite',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
} as const;
```

### Step A.2: Database Setup

`server/src/config/database.ts`
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ENV } from './env';

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;

  const dbDir = path.dirname(ENV.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(ENV.DB_PATH);
  db.pragma('journal_mode = WAL');       // Better concurrent read performance
  db.pragma('foreign_keys = ON');        // Enforce FK constraints
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

`server/src/db/migrate.ts`
```typescript
import { getDB } from '../config/database';

const MIGRATIONS = [
  {
    id: '001_create_players',
    sql: `
      CREATE TABLE IF NOT EXISTS players (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address  TEXT UNIQUE NOT NULL,
        display_name    TEXT NOT NULL DEFAULT 'Player',
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login      DATETIME DEFAULT CURRENT_TIMESTAMP,
        win_count       INTEGER DEFAULT 0,
        loss_count      INTEGER DEFAULT 0,
        elo_rating      INTEGER DEFAULT 1000,
        peak_elo        INTEGER DEFAULT 1000,
        active_deck_id  INTEGER
      );
    `
  },
  {
    id: '002_create_decks',
    sql: `
      CREATE TABLE IF NOT EXISTS decks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id   INTEGER NOT NULL,
        name        TEXT NOT NULL DEFAULT 'My Deck',
        card_ids    TEXT NOT NULL,
        is_valid    INTEGER DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id)
      );
    `
  },
  {
    id: '003_create_collections',
    sql: `
      CREATE TABLE IF NOT EXISTS collections (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id     INTEGER NOT NULL,
        card_id       TEXT NOT NULL,
        owned_copies  INTEGER DEFAULT 0,
        unlocked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id),
        UNIQUE(player_id, card_id)
      );
    `
  },
  {
    id: '004_create_match_history',
    sql: `
      CREATE TABLE IF NOT EXISTS match_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code     TEXT NOT NULL,
        player_a_id   INTEGER NOT NULL,
        player_b_id   INTEGER,
        winner_id     INTEGER,
        player_a_deck TEXT,
        player_b_deck TEXT,
        stake_amount  REAL DEFAULT 0,
        tx_hash       TEXT,
        game_seed     INTEGER,
        total_turns   INTEGER,
        started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at      DATETIME,
        FOREIGN KEY (player_a_id) REFERENCES players(id),
        FOREIGN KEY (player_b_id) REFERENCES players(id)
      );
    `
  },
  {
    id: '005_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id   TEXT PRIMARY KEY,
        ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `
  }
];

export function runMigrations(): void {
  const db = getDB();

  // Ensure migrations table exists first
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     TEXT PRIMARY KEY,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insertMigration = db.prepare('INSERT OR IGNORE INTO _migrations (id) VALUES (?)');
  const checkMigration = db.prepare('SELECT id FROM _migrations WHERE id = ?');

  for (const migration of MIGRATIONS) {
    if (migration.id === '005_create_migrations_table') continue;
    const existing = checkMigration.get(migration.id);
    if (!existing) {
      console.log(`[DB] Running migration: ${migration.id}`);
      db.exec(migration.sql);
      insertMigration.run(migration.id);
    }
  }

  console.log('[DB] Migrations complete.');
}
```

### Step A.3: Extract Room/Escrow Logic

Take the existing `server/index.js` logic and split into typed modules.

`server/src/rooms/RoomManager.ts`
```typescript
import type { Server, Socket } from 'socket.io';

export interface RoomPlayer {
  id: string;           // socket.id
  name: string;
  roll: number | null;
  wallet: string | null;
  playerId: number | null;  // NEW: DB player.id (null for guests)
  deckIds: string[] | null; // NEW: validated deck for this match
}

export interface Room {
  code: string;
  players: RoomPlayer[];
  cryptoReady: { count: number };
  gameSeed: number;
  settled: boolean;
  startedAt: Date;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(code: string, player: RoomPlayer): Room {
    const room: Room = {
      code,
      players: [player],
      cryptoReady: { count: 0 },
      gameSeed: 0,
      settled: false,
      startedAt: new Date(),
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  joinRoom(code: string, player: RoomPlayer): Room | null {
    const room = this.rooms.get(code);
    if (!room || room.players.length >= 2) return null;
    room.players.push(player);
    return room;
  }

  removePlayerFromRooms(socketId: string): { room: Room; playerIndex: number } | null {
    for (const [code, room] of this.rooms) {
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) {
        const result = { room, playerIndex: idx };
        // Don't delete room immediately — let disconnect handler decide
        return result;
      }
    }
    return null;
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code);
  }

  findPlayerRoom(socketId: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.id === socketId)) return room;
    }
    return null;
  }
}
```

`server/src/escrow/PayoutService.ts`
```typescript
import { ethers } from 'ethers';
import { ENV } from '../config/env';

const ESCROW_ABI = [
  'function claimWinnings(bytes32 matchId, address winner) external',
  'function refundTie(bytes32 matchId) external',
  'function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)',
];

export class PayoutService {
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;

  constructor() {
    const provider = new ethers.JsonRpcProvider(ENV.FUJI_RPC);
    this.wallet = new ethers.Wallet(ENV.FUJI_PRIVATE_KEY, provider);
    this.contract = new ethers.Contract(ENV.ESCROW_ADDRESS, ESCROW_ABI, this.wallet);
    console.log(`[PayoutService] Owner wallet: ${this.wallet.address}`);
  }

  private matchIdFromCode(roomCode: string): string {
    const hex = Buffer.from(roomCode, 'utf8').toString('hex');
    const padded = hex.padStart(64, '0');
    return '0x' + padded;
  }

  async payoutWinner(roomCode: string, winnerAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const matchId = this.matchIdFromCode(roomCode);
    console.log(`[Escrow] Paying winner ${winnerAddress} for room ${roomCode}`);
    try {
      const tx = await this.contract.claimWinnings(matchId, winnerAddress);
      await tx.wait();
      console.log(`[Escrow] Payout done! tx: ${tx.hash}`);
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      console.error(`[Escrow] Payout failed:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async refundTie(roomCode: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const matchId = this.matchIdFromCode(roomCode);
    try {
      const tx = await this.contract.refundTie(matchId);
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
```

### Step A.4: New Server Entry Point

`server/src/index.ts` — thin shell, replaces entire `server/index.js`
```typescript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { ENV } from './config/env';
import { getDB, closeDB } from './config/database';
import { runMigrations } from './db/migrate';
import { RoomManager } from './rooms/RoomManager';
import { PayoutService } from './escrow/PayoutService';
import { setupAuthRoutes } from './auth/AuthService';
import { setupDeckRoutes } from './services/DeckService';
import { setupCollectionRoutes } from './services/CollectionService';
import { setupPlayerRoutes } from './services/PlayerService';
import { setupMatchRoutes } from './services/MatchService';
import { setupSocketHandlers } from './rooms/SessionManager';

// ── Bootstrap ──────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(helmet());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Database ───────────────────────────────────────────
getDB();
runMigrations();

// ── Services ───────────────────────────────────────────
const roomManager = new RoomManager();
const payoutService = new PayoutService();

// ── REST Routes ────────────────────────────────────────
setupAuthRoutes(app);
setupPlayerRoutes(app);
setupDeckRoutes(app);
setupCollectionRoutes(app);
setupMatchRoutes(app);

// ── Socket.io ──────────────────────────────────────────
setupSocketHandlers(io, roomManager, payoutService);

// ── Start ──────────────────────────────────────────────
server.listen(ENV.PORT, () => {
  console.log(`[Server] Listening on :${ENV.PORT}`);
});

process.on('SIGTERM', () => {
  closeDB();
  process.exit(0);
});
```

### ✅ CHECKPOINT A
```
- [ ] server/index.js deleted, server/src/index.ts compiles
- [ ] `npx tsx src/index.ts` starts without errors
- [ ] SQLite database created in server/data/ocb.sqlite
- [ ] All 4 tables exist (players, decks, collections, match_history)
- [ ] Existing room create/join/relay still works
- [ ] Escrow payout still works
- [ ] Git commit: "refactor: server TypeScript migration + SQLite database"
```

---

## Phase B: Wallet-Based Authentication (Week 2-3)

> **Prerequisites:** Phase A complete
> **Effort:** ~6-8 hours
> **Blocks:** Deck storage, collection, match history

### Step B.1: Server Auth Service

`server/src/auth/WalletVerifier.ts`
```typescript
import { ethers } from 'ethers';

/**
 * Verifies that a signature was produced by the claimed wallet address.
 * Uses EIP-191 personal_sign (MetaMask's default).
 */
export function verifyWalletSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Generates a nonce message for the user to sign.
 * Includes timestamp to prevent replay attacks.
 */
export function generateNonceMessage(nonce: string): string {
  return `Sign this message to log in to OnChainBattles.\n\nNonce: ${nonce}\n\nThis does not cost any gas.`;
}
```

`server/src/auth/TokenService.ts`
```typescript
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface TokenPayload {
  playerId: number;
  wallet: string;
}

export function issueToken(payload: TokenPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, ENV.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
```

`server/src/auth/AuthService.ts`
```typescript
import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import { getDB } from '../config/database';
import { verifyWalletSignature, generateNonceMessage } from './WalletVerifier';
import { issueToken } from './TokenService';
import { initializeCollection } from '../services/CollectionService';

// In-memory nonce store (TTL: 5 minutes)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
}

export function setupAuthRoutes(app: Express): void {

  // GET /auth/nonce?wallet=0x...
  app.get('/auth/nonce', (req: Request, res: Response) => {
    const wallet = (req.query.wallet as string)?.toLowerCase();
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    cleanExpiredNonces();
    const nonce = crypto.randomBytes(32).toString('hex');
    nonceStore.set(wallet, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });

    res.json({ nonce, message: generateNonceMessage(nonce) });
  });

  // POST /auth/login
  app.post('/auth/login', (req: Request, res: Response) => {
    const { wallet, signature } = req.body;
    const walletLower = wallet?.toLowerCase();

    if (!walletLower || !signature) {
      return res.status(400).json({ error: 'Missing wallet or signature' });
    }

    const stored = nonceStore.get(walletLower);
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Nonce expired or not found. Request a new one.' });
    }

    const message = generateNonceMessage(stored.nonce);
    if (!verifyWalletSignature(message, signature, walletLower)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Nonce consumed — delete it
    nonceStore.delete(walletLower);

    // Find or create player
    const db = getDB();
    let player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(walletLower) as any;

    if (!player) {
      const result = db.prepare(
        'INSERT INTO players (wallet_address, display_name) VALUES (?, ?)'
      ).run(walletLower, `Player_${walletLower.slice(-6)}`);

      player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);

      // Initialize collection: give all cards to new player (MVP mode)
      initializeCollection(player.id);
    }

    // Update last_login
    db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);

    const token = issueToken({ playerId: player.id, wallet: walletLower });

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
      }
    });
  });
}
```

### Step B.2: Auth Middleware

`server/src/middleware/authMiddleware.ts`
```typescript
import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../auth/TokenService';

// Extend Express Request to carry authenticated player info
declare global {
  namespace Express {
    interface Request {
      player?: TokenPayload;
    }
  }
}

/**
 * Requires a valid JWT in Authorization: Bearer <token>.
 * Attaches player info to req.player.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.player = payload;
  next();
}

/**
 * Optional auth — sets req.player if token present, continues either way.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload) req.player = payload;
  }
  next();
}
```

### Step B.3: Socket Authentication

`server/src/rooms/SessionManager.ts` — key section for socket auth
```typescript
import type { Server, Socket } from 'socket.io';
import { verifyToken, type TokenPayload } from '../auth/TokenService';
import type { RoomManager, RoomPlayer } from './RoomManager';
import type { PayoutService } from '../escrow/PayoutService';

// Map socket.id → authenticated player
const socketPlayerMap = new Map<string, TokenPayload>();

export function setupSocketHandlers(
  io: Server,
  roomManager: RoomManager,
  payoutService: PayoutService
): void {

  // Socket auth middleware — optional (guests allowed for free play)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        socketPlayerMap.set(socket.id, payload);
      }
    }
    next(); // Always allow connection (guests play without token)
  });

  io.on('connection', (socket: Socket) => {
    const playerInfo = socketPlayerMap.get(socket.id);
    console.log(`[Server] +${socket.id} ${playerInfo ? `(player #${playerInfo.playerId})` : '(guest)'}`);

    // ── createRoom ────────────────────────────────────
    socket.on('createRoom', ({ roomCode, playerName }) => {
      const player: RoomPlayer = {
        id: socket.id,
        name: playerName,
        roll: null,
        wallet: null,
        playerId: playerInfo?.playerId ?? null,
        deckIds: null,
      };
      roomManager.createRoom(roomCode, player);
      socket.join(roomCode);
      socket.emit('roomCreated', { roomCode, playerIndex: 0 });
      console.log(`[Server] Room created: ${roomCode} by ${playerName}`);
    });

    // ── joinRoom (existing logic, now with playerId) ──
    socket.on('joinRoom', ({ roomCode, playerName }) => {
      const player: RoomPlayer = {
        id: socket.id,
        name: playerName,
        roll: null,
        wallet: null,
        playerId: playerInfo?.playerId ?? null,
        deckIds: null,
      };
      const room = roomManager.joinRoom(roomCode, player);
      if (!room) {
        socket.emit('error', { message: 'Room not found or full.' });
        return;
      }

      socket.join(roomCode);
      socket.emit('roomJoined', { roomCode, playerIndex: 1 });

      const host = room.players[0];
      io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
      socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

      const seed = Math.floor(Math.random() * 999999);
      room.gameSeed = seed;
      io.to(roomCode).emit('game_seed', { seed });
    });

    // ── submitDeck (NEW — player sends deck for validation) ──
    socket.on('submitDeck', ({ roomCode, deckIds }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // TODO: Validate deck server-side (Phase D)
      player.deckIds = deckIds;

      // Check if both players submitted decks → ready to start
      if (room.players.length === 2 && room.players.every(p => p.deckIds)) {
        io.to(roomCode).emit('bothDecksReady');
      }
    });

    // ── game_action relay (unchanged) ─────────────────
    socket.on('game_action', ({ roomCode, action }) => {
      socket.to(roomCode).emit('opponent_action', action);
    });

    // ── registerWallet (unchanged) ────────────────────
    socket.on('registerWallet', ({ roomCode, walletAddress }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (player) player.wallet = walletAddress;
    });

    // ── cryptoReady (unchanged) ───────────────────────
    socket.on('cryptoReady', ({ roomCode }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      room.cryptoReady.count++;
      if (room.cryptoReady.count === 1) {
        socket.to(roomCode).emit('hostDepositConfirmed');
      } else if (room.cryptoReady.count >= 2) {
        io.to(roomCode).emit('bothCryptoReady');
      }
    });

    // ── game_over (unchanged logic, now records to DB) ─
    socket.on('game_over', async ({ roomCode, winnerIndex }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room || room.settled) return;
      room.settled = true;

      const winner = room.players[winnerIndex];

      // Record match to DB (Phase E)
      // recordMatch(room, winnerIndex);

      if (winner?.wallet) {
        const result = await payoutService.payoutWinner(roomCode, winner.wallet);
        io.to(roomCode).emit('payout_result', result);
      }
    });

    // ── disconnect ────────────────────────────────────
    socket.on('disconnect', () => {
      socketPlayerMap.delete(socket.id);
      const result = roomManager.removePlayerFromRooms(socket.id);
      if (!result) return;

      const { room, playerIndex } = result;
      socket.to(room.code).emit('opponentDisconnected');

      if (room.cryptoReady.count >= 2 && !room.settled) {
        room.settled = true;
        const remainingIdx = playerIndex === 0 ? 1 : 0;
        const remaining = room.players[remainingIdx];
        if (remaining?.wallet) {
          payoutService.payoutWinner(room.code, remaining.wallet).then(result => {
            io.to(room.code).emit('payout_result', result);
          });
        }
      }

      roomManager.deleteRoom(room.code);
    });
  });
}
```

### Step B.4: Client Auth Manager

`src/auth/AuthManager.ts`
```typescript
/**
 * Handles wallet-based authentication flow.
 * 1. Request nonce from server
 * 2. Sign nonce with MetaMask
 * 3. Send signature to server, receive JWT
 * 4. Store JWT for subsequent API calls + socket auth
 */

import { WalletManager } from '../web3/WalletManager';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface AuthenticatedPlayer {
  id: number;
  wallet: string;
  displayName: string;
  winCount: number;
  lossCount: number;
  eloRating: number;
  activeDeckId: number | null;
}

class AuthManagerClass {
  private jwt: string | null = null;
  private player: AuthenticatedPlayer | null = null;

  /** Full login flow: connect wallet → sign nonce → get JWT */
  async login(): Promise<AuthenticatedPlayer> {
    // 1. Ensure wallet is connected
    const address = WalletManager.isConnected()
      ? WalletManager.getAddress()
      : await WalletManager.connect();

    // 2. Request nonce
    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address}`);
    if (!nonceRes.ok) throw new Error('Failed to get nonce');
    const { message } = await nonceRes.json();

    // 3. Sign with MetaMask
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No signer available');
    const signature = await signer.signMessage(message);

    // 4. Send to server
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address, signature }),
    });

    if (!loginRes.ok) {
      const err = await loginRes.json();
      throw new Error(err.error ?? 'Login failed');
    }

    const data = await loginRes.json();
    this.jwt = data.token;
    this.player = data.player;

    console.log(`[AuthManager] Logged in as ${this.player!.displayName} (#${this.player!.id})`);
    return this.player!;
  }

  getToken(): string | null { return this.jwt; }
  getPlayer(): AuthenticatedPlayer | null { return this.player; }
  isLoggedIn(): boolean { return !!this.jwt; }

  /** Get auth headers for API calls */
  authHeaders(): Record<string, string> {
    if (!this.jwt) return {};
    return { 'Authorization': `Bearer ${this.jwt}` };
  }

  logout(): void {
    this.jwt = null;
    this.player = null;
  }
}

export const AuthManager = new AuthManagerClass();
```

### Step B.5: Update SocketManager Connection

**File:** `src/network/SocketManager.ts`

**OLD** (existing connect method):
```typescript
connect(): void {
    if (this.socket?.connected) {
      console.log("[SocketManager] Already connected, reusing.");
      this.actOnRoomAction();
      return;
    }

    console.log("[SocketManager] Connecting to server...");
    this.socket = io(this.serverUrl);
    // ...
```

**NEW** (add auth token to handshake):
```typescript
connect(): void {
    if (this.socket?.connected) {
      console.log("[SocketManager] Already connected, reusing.");
      this.actOnRoomAction();
      return;
    }

    console.log("[SocketManager] Connecting to server...");

    // Pass JWT token in socket handshake if user is authenticated
    const token = AuthManager.getToken();
    this.socket = io(this.serverUrl, {
      auth: token ? { token } : undefined,
    });
    // ... rest unchanged
```

**Add import at top of SocketManager.ts:**
```typescript
import { AuthManager } from '../auth/AuthManager';
```

### ✅ CHECKPOINT B
```
- [ ] GET /auth/nonce returns a nonce
- [ ] POST /auth/login with valid MetaMask signature returns JWT + player
- [ ] Second login for same wallet reuses existing player record
- [ ] Socket.io connections carry JWT in handshake
- [ ] Guest connections (no wallet) still work for free play
- [ ] Git commit: "feat: wallet-based authentication with JWT"
```

---

## Phase C: Card Collection System (Week 3)

> **Prerequisites:** Phase B (auth + player records)
> **Effort:** ~4-5 hours

### Step C.1: Collection Service (Server)

`server/src/services/CollectionService.ts`
```typescript
import type { Express, Request, Response } from 'express';
import { getDB } from '../config/database';
import { requireAuth } from '../middleware/authMiddleware';
import { CARD_POOL } from '../validation/CardPool';

/**
 * Initialize a new player's collection with ALL cards (MVP: no gatekeeping).
 * Called once during first login.
 */
export function initializeCollection(playerId: number): void {
  const db = getDB();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)'
  );

  const insertMany = db.transaction(() => {
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue; // King is pre-placed, never in collection
      insert.run(playerId, card.id, card.copies);
    }
  });

  insertMany();
  console.log(`[Collection] Initialized collection for player #${playerId}`);
}

export function setupCollectionRoutes(app: Express): void {

  // GET /collection — returns all cards with owned counts
  app.get('/collection', requireAuth, (req: Request, res: Response) => {
    const db = getDB();
    const rows = db.prepare(
      'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
    ).all(req.player!.playerId) as Array<{ card_id: string; owned_copies: number }>;

    // Merge with full card pool data
    const collection = CARD_POOL
      .filter(c => c.id !== 'king')
      .map(card => {
        const owned = rows.find(r => r.card_id === card.id);
        return {
          id: card.id,
          name: card.name,
          copies: card.copies,           // Max possible copies in a deck
          ownedCopies: owned?.owned_copies ?? 0,
        };
      });

    res.json({ collection });
  });
}
```

### Step C.2: Card Pool (Server's Card Data)

`server/src/validation/CardPool.ts`
```typescript
/**
 * Server-side card pool — minimal info needed for validation.
 * This is the SERVER's source of truth. Client's CardDefinitions.ts is for rendering.
 * Must stay in sync manually (or auto-generate from a shared source).
 */

export interface CardPoolEntry {
  id: string;
  name: string;
  copies: number;    // Max copies allowed in a single deck
  cost: number;
  cardClass: 'UNIT' | 'SPELL' | 'STRUCTURE';
}

// Keep this in sync with src/game/data/CardDefinitions.ts
export const CARD_POOL: CardPoolEntry[] = [
  { id: 'king',           name: 'King',           copies: 1, cost: 0, cardClass: 'UNIT' },
  { id: 'foot_soldier',   name: 'Foot Soldier',   copies: 3, cost: 1, cardClass: 'UNIT' },
  { id: 'pikeman',        name: 'Pikeman',        copies: 2, cost: 2, cardClass: 'UNIT' },
  { id: 'archer',         name: 'Archer',         copies: 2, cost: 3, cardClass: 'UNIT' },
  { id: 'assassin',       name: 'Assassin',       copies: 2, cost: 3, cardClass: 'UNIT' },
  { id: 'militia',        name: 'Militia',         copies: 2, cost: 1, cardClass: 'UNIT' },
  { id: 'scout',          name: 'Scout',           copies: 2, cost: 2, cardClass: 'UNIT' },
  { id: 'lancer',         name: 'Lancer',          copies: 2, cost: 3, cardClass: 'UNIT' },
  { id: 'messenger',      name: 'Messenger',       copies: 2, cost: 2, cardClass: 'UNIT' },
  { id: 'mystic',         name: 'Mystic',          copies: 1, cost: 4, cardClass: 'UNIT' },
  { id: 'swordsman',      name: 'Swordsman',       copies: 2, cost: 2, cardClass: 'UNIT' },
  { id: 'priest',         name: 'Priest',          copies: 2, cost: 3, cardClass: 'UNIT' },
  { id: 'inquisitor',     name: 'Inquisitor',      copies: 2, cost: 4, cardClass: 'UNIT' },
  { id: 'knight',         name: 'Knight',          copies: 2, cost: 5, cardClass: 'UNIT' },
  { id: 'scribe',         name: 'Scribe',          copies: 2, cost: 2, cardClass: 'UNIT' },
  { id: 'princess',       name: 'Princess',        copies: 1, cost: 4, cardClass: 'UNIT' },
  { id: 'commander',      name: 'Commander',       copies: 1, cost: 5, cardClass: 'UNIT' },
  { id: 'knights_guard',  name: "Knight's Guard",  copies: 1, cost: 4, cardClass: 'UNIT' },
  // Spells
  { id: 'casus_belli',    name: 'Casus Belli',     copies: 2, cost: 2, cardClass: 'SPELL' },
  { id: 'coup',           name: 'Coup',            copies: 1, cost: 5, cardClass: 'SPELL' },
  { id: 'treason',        name: 'Treason',         copies: 1, cost: 4, cardClass: 'SPELL' },
  { id: 'reform',         name: 'Reform',          copies: 2, cost: 3, cardClass: 'SPELL' },
  { id: 'disease',        name: 'Disease',         copies: 1, cost: 3, cardClass: 'SPELL' },
  { id: 'earthquake',     name: 'Earthquake',      copies: 1, cost: 4, cardClass: 'SPELL' },
  { id: 'peasant_revolt', name: 'Peasant Revolt',  copies: 1, cost: 3, cardClass: 'SPELL' },
  { id: 'civil_war',      name: 'Civil War',       copies: 1, cost: 5, cardClass: 'SPELL' },
  // Structures
  { id: 'castle',         name: 'Castle',          copies: 1, cost: 5, cardClass: 'STRUCTURE' },
  { id: 'temple',         name: 'Temple',          copies: 1, cost: 4, cardClass: 'STRUCTURE' },
  { id: 'village',        name: 'Village',          copies: 2, cost: 3, cardClass: 'STRUCTURE' },
  { id: 'motherland',     name: 'Motherland',      copies: 1, cost: 6, cardClass: 'STRUCTURE' },
];

export function getCardFromPool(id: string): CardPoolEntry | undefined {
  return CARD_POOL.find(c => c.id === id);
}
```

### ✅ CHECKPOINT C
```
- [ ] GET /collection returns all cards with owned_copies for logged-in player
- [ ] New player gets full collection on first login
- [ ] collection table populated correctly
- [ ] Git commit: "feat: card collection system (MVP: all unlocked)"
```

---

## Phase D: Deck Validation & Storage (Week 3-4)

> **Prerequisites:** Phase C (collection system)
> **Effort:** ~8-10 hours

### Step D.1: Shared Deck Validator

`server/src/validation/DeckValidator.ts`
```typescript
import { CARD_POOL, getCardFromPool } from './CardPool';

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

const DECK_SIZE = 31;

export function validateDeck(
  cardIds: string[],
  ownedCards?: Map<string, number>  // card_id → owned_copies (null = skip ownership check)
): DeckValidationResult {
  const errors: string[] = [];

  // Rule 1: Exactly 31 cards
  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}.`);
  }

  // Rule 2: No King in deck
  if (cardIds.includes('king')) {
    errors.push('King cannot be included in deck (pre-placed automatically).');
  }

  // Rule 3: Every card ID must exist
  const unknownIds = cardIds.filter(id => !getCardFromPool(id));
  if (unknownIds.length > 0) {
    errors.push(`Unknown card IDs: ${unknownIds.join(', ')}`);
  }

  // Rule 4: Respect max copies per card
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    const card = getCardFromPool(id);
    if (card && count > card.copies) {
      errors.push(`${card.name}: ${count} copies in deck, max allowed is ${card.copies}.`);
    }
  }

  // Rule 5: Ownership check (only if ownedCards provided)
  if (ownedCards) {
    for (const [id, count] of counts) {
      const owned = ownedCards.get(id) ?? 0;
      if (count > owned) {
        const card = getCardFromPool(id);
        errors.push(`${card?.name ?? id}: need ${count} but only own ${owned}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### Step D.2: Deck Service (Server CRUD)

`server/src/services/DeckService.ts`
```typescript
import type { Express, Request, Response } from 'express';
import { getDB } from '../config/database';
import { requireAuth } from '../middleware/authMiddleware';
import { validateDeck } from '../validation/DeckValidator';

const MAX_DECKS_PER_PLAYER = 10;

export function setupDeckRoutes(app: Express): void {

  // GET /decks — list all decks for current player
  app.get('/decks', requireAuth, (req: Request, res: Response) => {
    const db = getDB();
    const decks = db.prepare(
      'SELECT * FROM decks WHERE player_id = ? ORDER BY updated_at DESC'
    ).all(req.player!.playerId);

    res.json({
      decks: (decks as any[]).map(d => ({
        id: d.id,
        name: d.name,
        cardIds: JSON.parse(d.card_ids),
        isValid: !!d.is_valid,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }))
    });
  });

  // POST /decks — create new deck
  app.post('/decks', requireAuth, (req: Request, res: Response) => {
    const { name, cardIds } = req.body;
    const playerId = req.player!.playerId;
    const db = getDB();

    // Check deck limit
    const count = db.prepare(
      'SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?'
    ).get(playerId) as any;
    if (count.cnt >= MAX_DECKS_PER_PLAYER) {
      return res.status(400).json({ error: `Maximum ${MAX_DECKS_PER_PLAYER} decks allowed.` });
    }

    // Validate
    const ownedCards = getOwnedCardsMap(playerId);
    const validation = validateDeck(cardIds, ownedCards);

    const result = db.prepare(
      'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
    ).run(playerId, name ?? 'My Deck', JSON.stringify(cardIds), validation.valid ? 1 : 0);

    res.status(201).json({
      deck: {
        id: result.lastInsertRowid,
        name: name ?? 'My Deck',
        cardIds,
        isValid: validation.valid,
        errors: validation.errors,
      }
    });
  });

  // PUT /decks/:id — update deck
  app.put('/decks/:id', requireAuth, (req: Request, res: Response) => {
    const deckId = parseInt(req.params.id, 10);
    const playerId = req.player!.playerId;
    const db = getDB();

    const existing = db.prepare(
      'SELECT * FROM decks WHERE id = ? AND player_id = ?'
    ).get(deckId, playerId) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const name = req.body.name ?? existing.name;
    const cardIds = req.body.cardIds ?? JSON.parse(existing.card_ids);

    const ownedCards = getOwnedCardsMap(playerId);
    const validation = validateDeck(cardIds, ownedCards);

    db.prepare(
      'UPDATE decks SET name = ?, card_ids = ?, is_valid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name, JSON.stringify(cardIds), validation.valid ? 1 : 0, deckId);

    res.json({
      deck: { id: deckId, name, cardIds, isValid: validation.valid, errors: validation.errors }
    });
  });

  // DELETE /decks/:id
  app.delete('/decks/:id', requireAuth, (req: Request, res: Response) => {
    const deckId = parseInt(req.params.id, 10);
    const playerId = req.player!.playerId;
    const db = getDB();

    // If this was the active deck, clear it
    db.prepare(
      'UPDATE players SET active_deck_id = NULL WHERE id = ? AND active_deck_id = ?'
    ).run(playerId, deckId);

    const result = db.prepare(
      'DELETE FROM decks WHERE id = ? AND player_id = ?'
    ).run(deckId, playerId);

    res.json({ success: result.changes > 0 });
  });

  // POST /decks/:id/activate — set as active deck for matchmaking
  app.post('/decks/:id/activate', requireAuth, (req: Request, res: Response) => {
    const deckId = parseInt(req.params.id, 10);
    const playerId = req.player!.playerId;
    const db = getDB();

    const deck = db.prepare(
      'SELECT * FROM decks WHERE id = ? AND player_id = ?'
    ).get(deckId, playerId) as any;

    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    if (!deck.is_valid) return res.status(400).json({ error: 'Cannot activate an invalid deck.' });

    db.prepare('UPDATE players SET active_deck_id = ? WHERE id = ?').run(deckId, playerId);

    res.json({ success: true, activeDeckId: deckId });
  });

  // POST /decks/validate — validate without saving
  app.post('/decks/validate', requireAuth, (req: Request, res: Response) => {
    const { cardIds } = req.body;
    const ownedCards = getOwnedCardsMap(req.player!.playerId);
    const result = validateDeck(cardIds, ownedCards);
    res.json(result);
  });
}

function getOwnedCardsMap(playerId: number): Map<string, number> {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(playerId) as Array<{ card_id: string; owned_copies: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.card_id, row.owned_copies);
  }
  return map;
}
```

### Step D.3: Client Deck API

`src/deck/DeckAPI.ts`
```typescript
import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface DeckData {
  id: number;
  name: string;
  cardIds: string[];
  isValid: boolean;
  errors?: string[];
}

export class DeckAPI {

  static async listDecks(): Promise<DeckData[]> {
    const res = await fetch(`${API_BASE}/decks`, {
      headers: AuthManager.authHeaders(),
    });
    const data = await res.json();
    return data.decks;
  }

  static async createDeck(name: string, cardIds: string[]): Promise<DeckData> {
    const res = await fetch(`${API_BASE}/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ name, cardIds }),
    });
    const data = await res.json();
    return data.deck;
  }

  static async updateDeck(id: number, name?: string, cardIds?: string[]): Promise<DeckData> {
    const res = await fetch(`${API_BASE}/decks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ name, cardIds }),
    });
    const data = await res.json();
    return data.deck;
  }

  static async deleteDeck(id: number): Promise<boolean> {
    const res = await fetch(`${API_BASE}/decks/${id}`, {
      method: 'DELETE',
      headers: AuthManager.authHeaders(),
    });
    const data = await res.json();
    return data.success;
  }

  static async activateDeck(id: number): Promise<void> {
    await fetch(`${API_BASE}/decks/${id}/activate`, {
      method: 'POST',
      headers: AuthManager.authHeaders(),
    });
  }

  static async validateDeck(cardIds: string[]): Promise<{ valid: boolean; errors: string[] }> {
    const res = await fetch(`${API_BASE}/decks/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ cardIds }),
    });
    return res.json();
  }
}
```

### Step D.4: Client-Side Pre-Validator

`src/deck/DeckValidatorClient.ts`
```typescript
import { getCard, CARD_DEFINITIONS } from '../game/data/CardDefinitions';

const DECK_SIZE = 31;

export interface ClientValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    totalCards: number;
    avgCost: number;
    costCurve: Record<number, number>;   // cost → count
    typeBreakdown: Record<string, number>; // 'UNIT'→count, 'SPELL'→count, etc.
  };
}

/**
 * Client-side pre-validation for immediate UI feedback.
 * Server validates again on save/match start — this is purely for UX.
 */
export function validateDeckClient(cardIds: string[]): ClientValidationResult {
  const errors: string[] = [];

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Need exactly ${DECK_SIZE} cards (currently ${cardIds.length}).`);
  }

  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck.');
  }

  const counts = new Map<string, number>();
  const costCurve: Record<number, number> = {};
  const typeBreakdown: Record<string, number> = {};
  let totalCost = 0;

  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    try {
      const card = getCard(id);
      totalCost += card.cost;
      costCurve[card.cost] = (costCurve[card.cost] ?? 0) + 1;
      const cls = card.class;
      typeBreakdown[cls] = (typeBreakdown[cls] ?? 0) + 1;
    } catch {
      errors.push(`Unknown card: ${id}`);
    }
  }

  for (const [id, count] of counts) {
    try {
      const card = getCard(id);
      if (count > card.copies) {
        errors.push(`${card.name}: ${count}/${card.copies} copies.`);
      }
    } catch { /* already reported */ }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      totalCards: cardIds.length,
      avgCost: cardIds.length > 0 ? totalCost / cardIds.length : 0,
      costCurve,
      typeBreakdown,
    }
  };
}
```

### ✅ CHECKPOINT D
```
- [ ] POST /decks creates a deck, validates, stores in SQLite
- [ ] PUT /decks/:id updates, re-validates
- [ ] POST /decks/:id/activate sets player's active deck
- [ ] POST /decks/validate returns errors without saving
- [ ] Client DeckAPI calls work end-to-end
- [ ] Client validator gives instant feedback
- [ ] Git commit: "feat: deck CRUD + validation (server + client)"
```

---

## Phase E: Server-Side Deck Enforcement on Match Start (Week 4)

> **Prerequisites:** Phase D
> **Effort:** ~3-4 hours

### Step E.1: Match Start Flow Change

**Current flow:**
```
Client joins room → game_seed broadcast → both players start with deck.config.json
```

**New flow:**
```
Client joins room → client sends 'submitDeck' with deckIds
  → server validates deck
  → if both decks valid: server broadcasts 'bothDecksReady' + seeds
  → if invalid: server rejects with errors
```

**Update in `SessionManager.ts` — replace the existing `submitDeck` handler:**

**OLD** (from Phase B, placeholder):
```typescript
    socket.on('submitDeck', ({ roomCode, deckIds }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      // TODO: Validate deck server-side (Phase D)
      player.deckIds = deckIds;
      if (room.players.length === 2 && room.players.every(p => p.deckIds)) {
        io.to(roomCode).emit('bothDecksReady');
      }
    });
```

**NEW** (with full validation):
```typescript
    socket.on('submitDeck', ({ roomCode, deckIds }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Validate the deck server-side
      let ownedCards: Map<string, number> | undefined;
      if (player.playerId) {
        // Authenticated player — check ownership
        const db = getDB();
        const rows = db.prepare(
          'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
        ).all(player.playerId) as Array<{ card_id: string; owned_copies: number }>;
        ownedCards = new Map(rows.map(r => [r.card_id, r.owned_copies]));
      }

      const validation = validateDeck(deckIds, ownedCards);

      if (!validation.valid) {
        socket.emit('deckRejected', { errors: validation.errors });
        return;
      }

      player.deckIds = deckIds;
      socket.emit('deckAccepted');

      // Both decks ready?
      if (room.players.length === 2 && room.players.every(p => p.deckIds)) {
        io.to(roomCode).emit('bothDecksReady');
      }
    });
```

**Add imports at top of SessionManager.ts:**
```typescript
import { getDB } from '../config/database';
import { validateDeck } from '../validation/DeckValidator';
```

### Step E.2: Update DeckLoader on Client

The existing `DeckLoader.ts` currently loads from `deck.config.json`. After the deck builder exists, it needs to load the player's **active deck from the server** instead.

**File:** `src/config/DeckLoader.ts`

**OLD** entire class — replace with:

**NEW** `src/config/DeckLoader.ts`:
```typescript
import { UNITS_ONLY_DECK_IDS, getCard } from '../game/data/CardDefinitions';
import { AuthManager } from '../auth/AuthManager';
import { DeckAPI } from '../deck/DeckAPI';

class DeckLoaderClass {
  private deckIds: string[] | null = null;
  private readonly CONFIG_PATH = '/deck.config.json';

  /**
   * Load deck for the current match.
   * Priority:
   *   1. If authenticated + has active deck → fetch from server
   *   2. Else → fall back to deck.config.json
   *   3. Else → fall back to UNITS_ONLY_DECK_IDS
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    // Try server-stored active deck first
    if (AuthManager.isLoggedIn()) {
      try {
        const decks = await DeckAPI.listDecks();
        const player = AuthManager.getPlayer();
        const activeDeck = decks.find(d => d.id === player?.activeDeckId);
        if (activeDeck && activeDeck.isValid) {
          console.log(`[DeckLoader] Loaded active deck "${activeDeck.name}" from server (${activeDeck.cardIds.length} cards)`);
          this.deckIds = activeDeck.cardIds;
          return this.deckIds;
        }
      } catch (err) {
        console.warn('[DeckLoader] Failed to fetch deck from server, falling back', err);
      }
    }

    // Fall back to deck.config.json
    try {
      const res = await fetch(this.CONFIG_PATH);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.deckIds)) {
          const ids: string[] = json.deckIds;
          const invalid = ids.filter(id => {
            try { getCard(id); return false; }
            catch { return true; }
          });
          if (invalid.length === 0) {
            console.log(`[DeckLoader] Loaded ${ids.length} cards from deck.config.json`);
            this.deckIds = ids;
            return this.deckIds;
          }
        }
      }
    } catch { /* ignore */ }

    // Final fallback
    return this.useFallback();
  }

  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  invalidate(): void {
    this.deckIds = null;
  }

  private useFallback(): string[] {
    this.deckIds = [...UNITS_ONLY_DECK_IDS];
    return this.deckIds;
  }
}

export const DeckLoader = new DeckLoaderClass();
```

### ✅ CHECKPOINT E
```
- [ ] Server validates deck on submitDeck and rejects invalid decks
- [ ] Client receives deckRejected with error list if deck is bad
- [ ] Authenticated players load active deck from server
- [ ] Guests fall back to deck.config.json → UNITS_ONLY_DECK_IDS
- [ ] Both decks must be accepted before match starts
- [ ] Git commit: "feat: server-side deck enforcement on match start"
```

---

## Phase F: Deck Builder UI (Week 4-5)

> **Prerequisites:** Phase D (deck API + validation)
> **Effort:** ~10-14 hours (largest phase — it's a full Phaser scene)

### Step F.1: DeckBuilderScene

This is a **new Phaser scene** accessible from MainMenuScene. Architecture overview:

```
DeckBuilderScene.ts          ← Scene shell, ~80 LOC
  ├── DeckBuilderUI.ts       ← All rendering: card grid, deck panel, filters
  ├── DeckValidatorClient.ts ← Already built in Phase D
  └── DeckAPI.ts             ← Already built in Phase D
```

`src/deck/DeckBuilderScene.ts` — scene shell:
```typescript
import Phaser from 'phaser';
import { DeckBuilderUI } from './DeckBuilderUI';
import { DeckAPI, type DeckData } from './DeckAPI';
import { AuthManager } from '../auth/AuthManager';

export class DeckBuilderScene extends Phaser.Scene {
  private ui!: DeckBuilderUI;

  constructor() {
    super({ key: 'DeckBuilderScene' });
  }

  async create(): Promise<void> {
    // Load player's decks from server
    let decks: DeckData[] = [];
    if (AuthManager.isLoggedIn()) {
      try {
        decks = await DeckAPI.listDecks();
      } catch (err) {
        console.warn('[DeckBuilder] Failed to load decks:', err);
      }
    }

    this.ui = new DeckBuilderUI(this, decks);
    this.ui.create();
  }

  update(time: number, delta: number): void {
    this.ui?.update(time, delta);
  }
}
```

### Step F.2: Scene Registration

**File:** `src/main.ts`

**Add import:**
```typescript
import { DeckBuilderScene } from './deck/DeckBuilderScene';
```

**Add to Phaser config scenes array (existing code, add DeckBuilderScene):**
```typescript
scene: [PreloadScene, MainMenuScene, RoomScene, BattleScene, ResultScene, DeckBuilderScene],
```

### Step F.3: Navigation from MainMenu

**File:** `src/scenes/MainMenuScene.ts`

Add a "Deck Builder" button. The exact placement depends on your layout JSON, but the code pattern is:

```typescript
// In MainMenuScene.create(), after existing buttons:
const deckBuilderBtn = this.add.text(640, 500, 'DECK BUILDER', {
  fontSize: '18px', color: '#00FF88', fontFamily: 'Arial'
}).setOrigin(0.5).setInteractive({ useHandCursor: true });

deckBuilderBtn.on('pointerup', () => {
  if (!AuthManager.isLoggedIn()) {
    // Show toast: "Connect wallet to build decks"
    return;
  }
  this.scene.start('DeckBuilderScene');
});
```

### Step F.4: DeckBuilderUI Structure (Architecture Only)

`src/deck/DeckBuilderUI.ts` is the heaviest file. Here's the component architecture — each section is a method:

```typescript
export class DeckBuilderUI {
  private scene: Phaser.Scene;
  private decks: DeckData[];
  private currentDeck: string[];        // card IDs in current deck being edited
  private currentDeckId: number | null;  // server deck ID (null = new)
  private currentDeckName: string;

  // UI groups
  private cardGrid!: Phaser.GameObjects.Container;   // Left panel: all available cards
  private deckPanel!: Phaser.GameObjects.Container;   // Right panel: current deck contents
  private statsPanel!: Phaser.GameObjects.Container;  // Bottom: cost curve, type breakdown
  private filterBar!: Phaser.GameObjects.Container;   // Top: search, type filter, sort

  constructor(scene: Phaser.Scene, decks: DeckData[]) { ... }

  create(): void {
    this.drawBackground();
    this.drawFilterBar();      // Type filters, cost filter, search
    this.drawCardGrid();       // Scrollable grid of all available cards
    this.drawDeckPanel();      // Right side: 31-card deck list
    this.drawStatsPanel();     // Cost curve bar chart, type pie
    this.drawDeckSelector();   // Dropdown/tabs for saved decks
    this.drawActionButtons();  // Save, Delete, Back, Set Active
  }

  // Card grid: clicking a card adds to deck (if under copy limit)
  private onCardClicked(cardId: string): void { ... }

  // Deck panel: clicking a card removes from deck
  private onDeckCardClicked(index: number): void { ... }

  // Re-render deck stats after any change
  private refreshStats(): void { ... }

  // Save deck to server
  private async saveDeck(): Promise<void> { ... }

  // Load a saved deck into editor
  private loadDeck(deck: DeckData): void { ... }

  update(time: number, delta: number): void { ... }
}
```

**Layout concept (1280×720):**
```
┌──────────────────────────────────────────────────────────────┐
│ [Filter: ALL | UNIT | SPELL | STRUCT]  [Sort: Cost ▼] [🔍]  │
├─────────────────────────────┬────────────────────────────────┤
│                             │  DECK: "My Aggro Deck" [✏️]   │
│   CARD POOL                 │  ─────────────────────────     │
│   (scrollable grid)         │  31/31 cards                   │
│                             │  ┌──────────────────────┐      │
│   [Card][Card][Card][Card]  │  │ Foot Soldier  ×3     │      │
│   [Card][Card][Card][Card]  │  │ Pikeman       ×2     │      │
│   [Card][Card][Card][Card]  │  │ Archer        ×2     │      │
│   [Card][Card][Card][Card]  │  │ ...                  │      │
│                             │  └──────────────────────┘      │
├─────────────────────────────┤  ──────────────────────────    │
│ COST CURVE: █ █▓█▓█ █      │  [SAVE] [ACTIVATE] [DELETE]    │
│ Types: 20U 6S 5ST           │  [◄ BACK TO MENU]             │
└─────────────────────────────┴────────────────────────────────┘
```

### ✅ CHECKPOINT F
```
- [ ] DeckBuilderScene loads from MainMenu
- [ ] Card grid shows all available cards with copy counts
- [ ] Clicking a card adds/removes from deck
- [ ] Deck stats (cost curve, type breakdown) update live
- [ ] Save/Load/Delete deck works via DeckAPI
- [ ] "Set Active" sets the deck for matchmaking
- [ ] Invalid decks show error messages inline
- [ ] Back button returns to MainMenu
- [ ] Git commit: "feat: deck builder UI scene"
```

---

## Phase G: Match History Persistence (Week 5)

> **Prerequisites:** Phase B (auth)
> **Effort:** ~4-5 hours

### Step G.1: Match Service (Server)

`server/src/services/MatchService.ts`
```typescript
import type { Express, Request, Response } from 'express';
import { getDB } from '../config/database';
import { requireAuth } from '../middleware/authMiddleware';
import type { Room } from '../rooms/RoomManager';

export function recordMatch(
  room: Room,
  winnerIndex: number,
  totalTurns: number,
  txHash?: string
): void {
  const db = getDB();

  const playerA = room.players[0];
  const playerB = room.players[1];
  const winnerId = room.players[winnerIndex]?.playerId;

  db.prepare(`
    INSERT INTO match_history
      (room_code, player_a_id, player_b_id, winner_id,
       player_a_deck, player_b_deck, stake_amount, tx_hash,
       game_seed, total_turns, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    room.code,
    playerA.playerId,
    playerB?.playerId ?? null,
    winnerId ?? null,
    playerA.deckIds ? JSON.stringify(playerA.deckIds) : null,
    playerB?.deckIds ? JSON.stringify(playerB.deckIds) : null,
    0,       // stake — set from escrow data later
    txHash ?? null,
    room.gameSeed,
    totalTurns
  );

  // Update win/loss counts
  if (winnerId) {
    db.prepare('UPDATE players SET win_count = win_count + 1 WHERE id = ?').run(winnerId);
    const loserId = winnerIndex === 0 ? playerB?.playerId : playerA.playerId;
    if (loserId) {
      db.prepare('UPDATE players SET loss_count = loss_count + 1 WHERE id = ?').run(loserId);
    }
  }
}

export function setupMatchRoutes(app: Express): void {
  app.get('/matches', requireAuth, (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const playerId = req.player!.playerId;
    const db = getDB();

    const matches = db.prepare(`
      SELECT * FROM match_history
      WHERE player_a_id = ? OR player_b_id = ?
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(playerId, playerId, limit, offset);

    res.json({ matches });
  });
}
```

### Step G.2: Player Service

`server/src/services/PlayerService.ts`
```typescript
import type { Express, Request, Response } from 'express';
import { getDB } from '../config/database';
import { requireAuth } from '../middleware/authMiddleware';

export function setupPlayerRoutes(app: Express): void {

  // GET /player/me
  app.get('/player/me', requireAuth, (req: Request, res: Response) => {
    const db = getDB();
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as any;

    if (!player) return res.status(404).json({ error: 'Player not found' });

    res.json({
      id: player.id,
      wallet: player.wallet_address,
      displayName: player.display_name,
      winCount: player.win_count,
      lossCount: player.loss_count,
      eloRating: player.elo_rating,
      peakElo: player.peak_elo,
      activeDeckId: player.active_deck_id,
      createdAt: player.created_at,
    });
  });

  // PATCH /player/me
  app.patch('/player/me', requireAuth, (req: Request, res: Response) => {
    const { displayName } = req.body;
    const db = getDB();

    if (displayName) {
      if (displayName.length < 2 || displayName.length > 20) {
        return res.status(400).json({ error: 'Name must be 2-20 characters.' });
      }
      db.prepare('UPDATE players SET display_name = ? WHERE id = ?')
        .run(displayName, req.player!.playerId);
    }

    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as any;
    res.json({
      id: updated.id,
      wallet: updated.wallet_address,
      displayName: updated.display_name,
    });
  });
}
```

### Step G.3: Wire recordMatch into game_over handler

**File:** `server/src/rooms/SessionManager.ts`

**OLD** game_over handler (from Phase B):
```typescript
    socket.on('game_over', async ({ roomCode, winnerIndex }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room || room.settled) return;
      room.settled = true;

      const winner = room.players[winnerIndex];

      // Record match to DB (Phase E)
      // recordMatch(room, winnerIndex);

      if (winner?.wallet) {
        const result = await payoutService.payoutWinner(roomCode, winner.wallet);
        io.to(roomCode).emit('payout_result', result);
      }
    });
```

**NEW:**
```typescript
    socket.on('game_over', async ({ roomCode, winnerIndex, totalTurns }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room || room.settled) return;
      room.settled = true;

      const winner = room.players[winnerIndex];

      // Record match to database
      try {
        recordMatch(room, winnerIndex, totalTurns ?? 0);
      } catch (err) {
        console.error('[Server] Failed to record match:', err);
      }

      if (winner?.wallet) {
        const result = await payoutService.payoutWinner(roomCode, winner.wallet);
        io.to(roomCode).emit('payout_result', result);

        // Update match record with tx hash
        // (optional: update match_history.tx_hash here)
      }
    });
```

**Add import:**
```typescript
import { recordMatch } from '../services/MatchService';
```

### ✅ CHECKPOINT G
```
- [ ] game_over records match to match_history table
- [ ] win_count / loss_count update on players table
- [ ] GET /matches returns match history for authenticated player
- [ ] GET /player/me returns full profile with stats
- [ ] PATCH /player/me updates display name
- [ ] Git commit: "feat: persistent match history + player profiles"
```

---

# SECTION 4: INTEGRATION MAP

## 4.1 Updated GameState Changes

**File:** `src/GameState.ts`

**Fields to ADD** (append after existing fields):
```typescript
    // ─── Auth ─────────────────────────────────────────────
    authToken: string = '';             // JWT from server
    authenticatedPlayerId: number = 0;  // Server player.id
    displayName: string = 'Player';     // From server profile

    // ─── Deck ─────────────────────────────────────────────
    activeDeckId: number | null = null;
    activeDeckIds: string[] = [];       // Card IDs of active deck
```

**Methods to ADD:**
```typescript
    setAuthData(token: string, playerId: number, displayName: string): void {
      this.authToken = token;
      this.authenticatedPlayerId = playerId;
      this.displayName = displayName;
      this.playerName = displayName;
      console.log(`[GameState] Auth set: ${displayName} (#${playerId})`);
    }

    setActiveDeck(deckId: number, deckIds: string[]): void {
      this.activeDeckId = deckId;
      this.activeDeckIds = deckIds;
      console.log(`[GameState] Active deck set: #${deckId} (${deckIds.length} cards)`);
    }
```

## 4.2 Full Login → Match Flow

```
1. Player opens game
2. MainMenuScene: "CONNECT WALLET" button
3. AuthManager.login() → MetaMask popup → sign nonce → JWT returned
4. GameState.setAuthData(token, playerId, displayName)
5. Player enters MainMenu with their display name shown
6. Optional: "DECK BUILDER" → DeckBuilderScene → build/save/activate deck
7. Player clicks Create/Join room
8. SocketManager.connect() passes JWT in handshake auth
9. Both players in room → each client sends 'submitDeck' with active deck
10. Server validates both decks
11. Server broadcasts 'bothDecksReady' → game_seed → match starts
12. Match plays normally
13. game_over → server records match to DB + handles payout
14. ResultScene shows win/loss + updated W/L record from server
```

## 4.3 Guest Flow (No Wallet)

Everything still works without auth:

- No JWT → server treats as guest
- No deck from server → falls back to `deck.config.json` → `UNITS_ONLY_DECK_IDS`
- No ownership check on deck validation (guest deck skips ownership)
- No match history recorded (or recorded as guest with `player_id = NULL`)
- No deck builder access (button disabled or hidden)

---

# SECTION 5: MODULARITY & SUSTAINABILITY RECOMMENDATIONS

## 5.1 Shared Types Package

Long-term, extract a `shared/` directory that both client and server import:

```
shared/
  types/
    events.ts        ← Socket event payloads
    deck.ts          ← DeckData, ValidationResult
    player.ts        ← PlayerProfile
    card.ts          ← CardPoolEntry (shared subset of CardDefinition)
```

This eliminates the sync risk between `CardDefinitions.ts` (client) and `CardPool.ts` (server).

## 5.2 Server Auto-Generate CardPool from CardDefinitions

Create a build script that reads `CardDefinitions.ts` and generates `CardPool.ts` automatically, so you never have two card lists to maintain manually.

## 5.3 Database Migration Strategy

The `migrate.ts` approach works for MVP. Before mainnet, switch to a proper migration tool (e.g., `knex` or `drizzle-orm`) that supports:
- Rollback
- Migration checksums
- Schema versioning

## 5.4 Rate Limiting

Before going public, add rate limiting to all API endpoints:
- `/auth/nonce` — 10 requests/minute per IP
- `/auth/login` — 5 requests/minute per wallet
- `/decks` — 30 requests/minute per player

## 5.5 Environment Variable Checklist for Production

```
JWT_SECRET=<random-64-char-string>
DB_PATH=/var/data/ocb.sqlite
FUJI_PRIVATE_KEY=<server-wallet-key>
ESCROW_ADDRESS=<contract-address>
NODE_ENV=production
PORT=3001
```

---

# SECTION 6: TIMELINE SUMMARY

| Phase | What | Effort | Blocks |
|-------|------|--------|--------|
| **A** | Server TS + SQLite + migrations | 10-12h | Everything |
| **B** | Wallet auth + JWT + socket auth | 6-8h | C, D, E, F, G |
| **C** | Collection system (MVP: all unlocked) | 4-5h | D |
| **D** | Deck CRUD + validation (server+client) | 8-10h | E, F |
| **E** | Server-side deck enforcement | 3-4h | — |
| **F** | Deck Builder UI (Phaser scene) | 10-14h | — |
| **G** | Match history + player profiles | 4-5h | — |
| **Total** | | **~45-58h** | |

Phases C+D+E can overlap. Phase F is independent once D is done.
Phase G is independent once B is done.

**Realistic calendar: 4-5 weeks at 12-15 hours/week.**
