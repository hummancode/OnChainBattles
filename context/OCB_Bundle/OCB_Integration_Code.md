# OCB Integration Plan — Deck Building, Auth, Card Ownership, Server Persistence

## ACTUAL CODE — Works Against Current Unmodified Codebase

> Every file listed here is either a **NEW file** (drop in) or an **existing file edit**
> (shown as OLD → NEW with the exact function/block that changes).
> The current `server/index.js` stays alive until Phase A is done.

---

# PHASE A: Server-Side Foundation (Additive — Runs Alongside Current server/index.js)

## Strategy: Don't Rewrite the Server Yet

Instead of converting `server/index.js` to TypeScript immediately, we **add a parallel Express REST API** that coexists with the existing socket server. The socket relay stays untouched. Only REST endpoints are new.

This means:
- Zero risk to existing multiplayer functionality
- Auth + Deck + Collection APIs come online independently
- Socket auth can be wired later with a one-line change
- Server TS migration can happen whenever convenient

---

## NEW FILE: `server/db.js`

```js
// ─── server/db.js ────────────────────────────────────────────
// SQLite database setup. Runs migrations on first call.
// Uses better-sqlite3 (synchronous, no callback hell).
//
// Install: npm install better-sqlite3
// ──────────────────────────────────────────────────────────────

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'ocb.sqlite');

let _db = null;

function getDB() {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  runMigrations(_db);
  return _db;
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const check = db.prepare('SELECT id FROM _migrations WHERE id = ?');
  const mark = db.prepare('INSERT INTO _migrations (id) VALUES (?)');

  const migrations = [
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
      );`
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
      );`
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
      );`
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
      );`
    }
  ];

  for (const m of migrations) {
    if (!check.get(m.id)) {
      console.log(`[DB] Running migration: ${m.id}`);
      db.exec(m.sql);
      mark.run(m.id);
    }
  }

  console.log('[DB] Ready.');
}

function closeDB() {
  if (_db) { _db.close(); _db = null; }
}

module.exports = { getDB, closeDB };
```

---

## NEW FILE: `server/cardPool.js`

```js
// ─── server/cardPool.js ──────────────────────────────────────
// Server-side card pool — minimal subset of CardDefinitions.ts.
// Keep in sync manually or build a codegen script.
//
// Used by: DeckValidator, CollectionService
// ──────────────────────────────────────────────────────────────

const CARD_POOL = [
  { id: 'king',           name: 'King',           copies: 1, cost: 0 },
  { id: 'foot_soldier',   name: 'Foot Soldier',   copies: 3, cost: 1 },
  { id: 'pikeman',        name: 'Pikeman',        copies: 2, cost: 2 },
  { id: 'archer',         name: 'Archer',         copies: 2, cost: 3 },
  { id: 'assassin',       name: 'Assassin',       copies: 2, cost: 3 },
  { id: 'militia',        name: 'Militia',         copies: 2, cost: 1 },
  { id: 'scout',          name: 'Scout',           copies: 2, cost: 2 },
  { id: 'lancer',         name: 'Lancer',          copies: 2, cost: 3 },
  { id: 'messenger',      name: 'Messenger',       copies: 2, cost: 2 },
  { id: 'mystic',         name: 'Mystic',          copies: 1, cost: 4 },
  { id: 'swordsman',      name: 'Swordsman',       copies: 2, cost: 2 },
  { id: 'priest',         name: 'Priest',          copies: 2, cost: 3 },
  { id: 'inquisitor',     name: 'Inquisitor',      copies: 2, cost: 4 },
  { id: 'knight',         name: 'Knight',          copies: 2, cost: 5 },
  { id: 'scribe',         name: 'Scribe',          copies: 2, cost: 2 },
  { id: 'princess',       name: 'Princess',        copies: 1, cost: 4 },
  { id: 'commander',      name: 'Commander',       copies: 1, cost: 5 },
  { id: 'knights_guard',  name: "Knight's Guard",  copies: 1, cost: 4 },
  { id: 'casus_belli',    name: 'Casus Belli',     copies: 2, cost: 2 },
  { id: 'coup',           name: 'Coup',            copies: 1, cost: 5 },
  { id: 'treason',        name: 'Treason',         copies: 1, cost: 4 },
  { id: 'reform',         name: 'Reform',          copies: 2, cost: 3 },
  { id: 'disease',        name: 'Disease',         copies: 1, cost: 3 },
  { id: 'earthquake',     name: 'Earthquake',      copies: 1, cost: 4 },
  { id: 'peasant_revolt', name: 'Peasant Revolt',  copies: 1, cost: 3 },
  { id: 'civil_war',      name: 'Civil War',       copies: 1, cost: 5 },
  { id: 'castle',         name: 'Castle',          copies: 1, cost: 5 },
  { id: 'temple',         name: 'Temple',          copies: 1, cost: 4 },
  { id: 'village',        name: 'Village',          copies: 2, cost: 3 },
  { id: 'motherland',     name: 'Motherland',      copies: 1, cost: 6 },
];

function getCardFromPool(id) {
  return CARD_POOL.find(c => c.id === id);
}

module.exports = { CARD_POOL, getCardFromPool };
```

---

## NEW FILE: `server/deckValidator.js`

```js
// ─── server/deckValidator.js ─────────────────────────────────
// Shared deck validation logic.
// Works standalone — no Express/Socket dependency.
//
// Used by: REST API (decks endpoint), Socket (submitDeck event)
// ──────────────────────────────────────────────────────────────

const { getCardFromPool } = require('./cardPool');

const DECK_SIZE = 31;

/**
 * @param {string[]} cardIds
 * @param {Map<string,number>|null} ownedCards - card_id → owned_copies (null = skip ownership check)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDeck(cardIds, ownedCards) {
  const errors = [];

  if (!Array.isArray(cardIds)) {
    return { valid: false, errors: ['cardIds must be an array'] };
  }

  // Rule 1: exact size
  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}.`);
  }

  // Rule 2: no King
  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck (pre-placed automatically).');
  }

  // Rule 3: every ID exists
  const unknown = cardIds.filter(id => !getCardFromPool(id));
  if (unknown.length > 0) {
    errors.push(`Unknown card IDs: ${[...new Set(unknown)].join(', ')}`);
  }

  // Rule 4: respect copies limit
  const counts = new Map();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  for (const [id, count] of counts) {
    const card = getCardFromPool(id);
    if (card && count > card.copies) {
      errors.push(`${card.name}: ${count} copies, max ${card.copies}.`);
    }
  }

  // Rule 5: ownership check (optional)
  if (ownedCards) {
    for (const [id, count] of counts) {
      const owned = ownedCards.get(id) || 0;
      if (count > owned) {
        const card = getCardFromPool(id);
        errors.push(`${card?.name || id}: need ${count}, own ${owned}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateDeck, DECK_SIZE };
```

---

## NEW FILE: `server/api.js`

```js
// ─── server/api.js ───────────────────────────────────────────
// REST API router. Mounted on the same Express app as the socket server.
// Provides: auth, player, decks, collection, matches endpoints.
//
// This file is the ONLY new require() in server/index.js.
// ──────────────────────────────────────────────────────────────

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const { getDB } = require('./db');
const { validateDeck } = require('./deckValidator');
const { CARD_POOL } = require('./cardPool');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'ocb-dev-secret-change-in-prod';

// ─── NONCE STORE (in-memory, 5min TTL) ──────────────────────

const nonceStore = new Map(); // wallet → { nonce, expiresAt }

function cleanNonces() {
  const now = Date.now();
  for (const [k, v] of nonceStore) {
    if (v.expiresAt < now) nonceStore.delete(k);
  }
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.player = payload; // { playerId, wallet }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── HELPERS ────────────────────────────────────────────────

function getOwnedCardsMap(playerId) {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(playerId);
  const map = new Map();
  for (const r of rows) map.set(r.card_id, r.owned_copies);
  return map;
}

function initializeCollection(playerId) {
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
  console.log(`[API] Initialized collection for player #${playerId}`);
}

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

router.get('/auth/nonce', (req, res) => {
  const wallet = (req.query.wallet || '').toLowerCase();
  if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  cleanNonces();
  const nonce = crypto.randomBytes(32).toString('hex');
  nonceStore.set(wallet, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });

  const message = `Sign this message to log in to OnChainBattles.\n\nNonce: ${nonce}\n\nThis does not cost any gas.`;
  res.json({ nonce, message });
});

router.post('/auth/login', (req, res) => {
  const { wallet, signature } = req.body || {};
  const w = (wallet || '').toLowerCase();

  if (!w || !signature) {
    return res.status(400).json({ error: 'Missing wallet or signature' });
  }

  const stored = nonceStore.get(w);
  if (!stored || stored.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Nonce expired. Request a new one.' });
  }

  const message = `Sign this message to log in to OnChainBattles.\n\nNonce: ${stored.nonce}\n\nThis does not cost any gas.`;

  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== w) {
      return res.status(401).json({ error: 'Signature does not match wallet.' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  nonceStore.delete(w);

  const db = getDB();
  let player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(w);

  if (!player) {
    const result = db.prepare(
      'INSERT INTO players (wallet_address, display_name) VALUES (?, ?)'
    ).run(w, `Player_${w.slice(-6)}`);
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);
    initializeCollection(player.id);
  }

  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);

  const token = jwt.sign({ playerId: player.id, wallet: w }, JWT_SECRET, { expiresIn: '24h' });

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

// ═══════════════════════════════════════════════════════════
// PLAYER ROUTES
// ═══════════════════════════════════════════════════════════

router.get('/player/me', requireAuth, (req, res) => {
  const db = getDB();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.playerId);
  if (!p) return res.status(404).json({ error: 'Player not found' });
  res.json({
    id: p.id, wallet: p.wallet_address, displayName: p.display_name,
    winCount: p.win_count, lossCount: p.loss_count,
    eloRating: p.elo_rating, activeDeckId: p.active_deck_id,
  });
});

router.patch('/player/me', requireAuth, (req, res) => {
  const { displayName } = req.body || {};
  const db = getDB();
  if (displayName && displayName.length >= 2 && displayName.length <= 20) {
    db.prepare('UPDATE players SET display_name = ? WHERE id = ?')
      .run(displayName, req.player.playerId);
  }
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.playerId);
  res.json({ id: p.id, displayName: p.display_name });
});

// ═══════════════════════════════════════════════════════════
// DECK ROUTES
// ═══════════════════════════════════════════════════════════

router.get('/decks', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM decks WHERE player_id = ? ORDER BY updated_at DESC'
  ).all(req.player.playerId);

  res.json({
    decks: rows.map(d => ({
      id: d.id, name: d.name,
      cardIds: JSON.parse(d.card_ids),
      isValid: !!d.is_valid,
      createdAt: d.created_at, updatedAt: d.updated_at,
    }))
  });
});

router.post('/decks', requireAuth, (req, res) => {
  const { name, cardIds } = req.body || {};
  if (!Array.isArray(cardIds)) {
    return res.status(400).json({ error: 'cardIds must be an array' });
  }

  const db = getDB();
  const count = db.prepare('SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?')
    .get(req.player.playerId);
  if (count.cnt >= 10) {
    return res.status(400).json({ error: 'Maximum 10 decks.' });
  }

  const owned = getOwnedCardsMap(req.player.playerId);
  const validation = validateDeck(cardIds, owned);

  const result = db.prepare(
    'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
  ).run(req.player.playerId, name || 'My Deck', JSON.stringify(cardIds), validation.valid ? 1 : 0);

  res.status(201).json({
    deck: {
      id: Number(result.lastInsertRowid), name: name || 'My Deck',
      cardIds, isValid: validation.valid, errors: validation.errors,
    }
  });
});

router.put('/decks/:id', requireAuth, (req, res) => {
  const db = getDB();
  const existing = db.prepare(
    'SELECT * FROM decks WHERE id = ? AND player_id = ?'
  ).get(req.params.id, req.player.playerId);

  if (!existing) return res.status(404).json({ error: 'Deck not found' });

  const name = req.body.name || existing.name;
  const cardIds = req.body.cardIds || JSON.parse(existing.card_ids);
  const owned = getOwnedCardsMap(req.player.playerId);
  const validation = validateDeck(cardIds, owned);

  db.prepare(
    'UPDATE decks SET name=?, card_ids=?, is_valid=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(name, JSON.stringify(cardIds), validation.valid ? 1 : 0, req.params.id);

  res.json({ deck: { id: existing.id, name, cardIds, isValid: validation.valid, errors: validation.errors } });
});

router.delete('/decks/:id', requireAuth, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE players SET active_deck_id=NULL WHERE id=? AND active_deck_id=?')
    .run(req.player.playerId, req.params.id);
  const r = db.prepare('DELETE FROM decks WHERE id=? AND player_id=?')
    .run(req.params.id, req.player.playerId);
  res.json({ success: r.changes > 0 });
});

router.post('/decks/:id/activate', requireAuth, (req, res) => {
  const db = getDB();
  const deck = db.prepare('SELECT * FROM decks WHERE id=? AND player_id=?')
    .get(req.params.id, req.player.playerId);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  if (!deck.is_valid) return res.status(400).json({ error: 'Cannot activate invalid deck.' });
  db.prepare('UPDATE players SET active_deck_id=? WHERE id=?').run(deck.id, req.player.playerId);
  res.json({ success: true, activeDeckId: deck.id });
});

router.post('/decks/validate', requireAuth, (req, res) => {
  const { cardIds } = req.body || {};
  const owned = getOwnedCardsMap(req.player.playerId);
  res.json(validateDeck(cardIds || [], owned));
});

// ═══════════════════════════════════════════════════════════
// COLLECTION ROUTES
// ═══════════════════════════════════════════════════════════

router.get('/collection', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(req.player.playerId);

  const collection = CARD_POOL.filter(c => c.id !== 'king').map(card => {
    const owned = rows.find(r => r.card_id === card.id);
    return {
      id: card.id, name: card.name,
      maxCopies: card.copies, ownedCopies: owned ? owned.owned_copies : 0,
    };
  });
  res.json({ collection });
});

// ═══════════════════════════════════════════════════════════
// MATCH HISTORY ROUTES
// ═══════════════════════════════════════════════════════════

router.get('/matches', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM match_history
    WHERE player_a_id = ? OR player_b_id = ?
    ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(req.player.playerId, req.player.playerId, limit, offset);
  res.json({ matches: rows });
});

// ── Exported for use by socket handler ──
router.recordMatch = function(roomCode, playerAId, playerBId, winnerId, opts = {}) {
  const db = getDB();
  db.prepare(`
    INSERT INTO match_history
    (room_code, player_a_id, player_b_id, winner_id,
     player_a_deck, player_b_deck, tx_hash, game_seed, total_turns, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    roomCode, playerAId, playerBId, winnerId,
    opts.playerADeck ? JSON.stringify(opts.playerADeck) : null,
    opts.playerBDeck ? JSON.stringify(opts.playerBDeck) : null,
    opts.txHash || null, opts.gameSeed || 0, opts.totalTurns || 0
  );
  if (winnerId) {
    db.prepare('UPDATE players SET win_count = win_count + 1 WHERE id = ?').run(winnerId);
    const loserId = winnerId === playerAId ? playerBId : playerAId;
    if (loserId) {
      db.prepare('UPDATE players SET loss_count = loss_count + 1 WHERE id = ?').run(loserId);
    }
  }
};

module.exports = router;
```

---

## EDIT: `server/index.js` — 3 Surgical Changes

### Change 1: Add imports at top (after existing imports)

**OLD (top of file, after `dotenv.config();`):**
```js
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
```

**NEW:**
```js
const cors = require('cors');
const apiRouter = require('./api');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api', apiRouter);       // ← Mount REST API under /api

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
```

> **npm install:** `npm install better-sqlite3 jsonwebtoken cors`

### Change 2: Add `playerId` + `deckIds` to room player objects

**OLD (inside `socket.on('createRoom', ...)`):**
```js
    rooms[roomCode] = {
      players: [{ id: socket.id, name: playerName, roll: null, wallet: null }],
      cryptoReady: { count: 0 }
    };
```

**NEW:**
```js
    rooms[roomCode] = {
      players: [{ id: socket.id, name: playerName, roll: null, wallet: null, playerId: null, deckIds: null }],
      cryptoReady: { count: 0 }
    };
```

**OLD (inside `socket.on('joinRoom', ...)`):**
```js
    room.players.push({ id: socket.id, name: playerName, roll: null, wallet: null });
```

**NEW:**
```js
    room.players.push({ id: socket.id, name: playerName, roll: null, wallet: null, playerId: null, deckIds: null });
```

### Change 3: Add `submitDeck` + `registerPlayer` events (before `socket.on('disconnect', ...)`):

**Add this block BEFORE the disconnect handler:**
```js
  // Player identifies themselves with JWT (optional — guests skip this)
  socket.on('registerPlayer', ({ token }) => {
    if (!token) return;
    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'ocb-dev-secret-change-in-prod');
      socket._playerId = payload.playerId;
      // Update any rooms this socket is in
      for (const code in rooms) {
        const p = rooms[code].players.find(p => p.id === socket.id);
        if (p) p.playerId = payload.playerId;
      }
      console.log(`[Server] Player #${payload.playerId} identified on socket ${socket.id}`);
    } catch (err) {
      console.warn('[Server] Invalid player token:', err.message);
    }
  });

  // Player submits their deck before match start
  socket.on('submitDeck', ({ roomCode, deckIds }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const { validateDeck } = require('./deckValidator');

    // If authenticated, check ownership
    let ownedCards = null;
    if (player.playerId) {
      const { getDB } = require('./db');
      const db = getDB();
      const rows = db.prepare(
        'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
      ).all(player.playerId);
      ownedCards = new Map(rows.map(r => [r.card_id, r.owned_copies]));
    }

    const result = validateDeck(deckIds, ownedCards);
    if (!result.valid) {
      socket.emit('deckRejected', { errors: result.errors });
      return;
    }

    player.deckIds = deckIds;
    socket.emit('deckAccepted', { cardCount: deckIds.length });
    console.log(`[Server] Deck accepted for ${player.name} in ${roomCode} (${deckIds.length} cards)`);

    // If both players submitted valid decks, signal ready
    if (room.players.length === 2 && room.players.every(p => p.deckIds)) {
      io.to(roomCode).emit('bothDecksReady');
      console.log(`[Server] Both decks ready in ${roomCode}`);
    }
  });
```

### Change 4: Wire match recording into game_over handler

**OLD (existing `socket.on('game_over', ...)`):**
```js
socket.on('game_over', async ({ roomCode, winnerIndex }) => {
  const room = rooms[roomCode];
  if (!room || room.settled) return;
  room.settled = true;

  const winner = room.players[winnerIndex];
  if (!winner?.wallet) {
    console.log(`[Server] game_over in ${roomCode} but winner has no wallet (free mode)`);
    return;
  }

  console.log(`[Server] game_over: ${winner.name} wins room ${roomCode}`);
  const result = await payoutWinner(roomCode, winner.wallet);

  // Notify both clients
  io.to(roomCode).emit('payout_result', result);
});
```

**NEW:**
```js
socket.on('game_over', async ({ roomCode, winnerIndex, totalTurns }) => {
  const room = rooms[roomCode];
  if (!room || room.settled) return;
  room.settled = true;

  const winner = room.players[winnerIndex];
  const loserIndex = winnerIndex === 0 ? 1 : 0;

  // Record match to database (safe — no-op if players are guests)
  try {
    const api = require('./api');
    const pA = room.players[0];
    const pB = room.players[1];
    if (pA?.playerId || pB?.playerId) {
      api.recordMatch(roomCode, pA?.playerId, pB?.playerId, winner?.playerId, {
        playerADeck: pA?.deckIds, playerBDeck: pB?.deckIds,
        gameSeed: room.gameSeed, totalTurns: totalTurns || 0,
      });
    }
  } catch (err) {
    console.error('[Server] Failed to record match:', err.message);
  }

  if (!winner?.wallet) {
    console.log(`[Server] game_over in ${roomCode} but winner has no wallet (free mode)`);
    return;
  }

  console.log(`[Server] game_over: ${winner.name} wins room ${roomCode}`);
  const result = await payoutWinner(roomCode, winner.wallet);
  io.to(roomCode).emit('payout_result', result);
});
```

---

# PHASE B: Client Auth Layer (All New Files)

## NEW FILE: `src/auth/AuthManager.ts`

```typescript
// ─── src/auth/AuthManager.ts ─────────────────────────────────
// Wallet-based authentication. Completely self-contained.
// No modifications to existing files required.
// ──────────────────────────────────────────────────────────────

import WalletManager from '../web3/WalletManager';

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001/api';

export interface AuthPlayer {
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
  private player: AuthPlayer | null = null;

  async login(): Promise<AuthPlayer> {
    // 1. Ensure wallet connected
    const address = WalletManager.isConnected()
      ? WalletManager.getAddress()
      : await WalletManager.connect();

    // 2. Get nonce
    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address}`);
    if (!nonceRes.ok) throw new Error('Failed to get nonce from server');
    const { message } = await nonceRes.json();

    // 3. Sign
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No signer');
    const signature = await signer.signMessage(message);

    // 4. Authenticate
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
  getPlayer(): AuthPlayer | null { return this.player; }
  isLoggedIn(): boolean { return !!this.jwt && !!this.player; }

  authHeaders(): Record<string, string> {
    if (!this.jwt) return {};
    return { 'Authorization': `Bearer ${this.jwt}` };
  }

  logout(): void {
    this.jwt = null;
    this.player = null;
    console.log('[AuthManager] Logged out.');
  }
}

export const AuthManager = new AuthManagerClass();
```

---

## NEW FILE: `src/deck/DeckAPI.ts`

```typescript
// ─── src/deck/DeckAPI.ts ─────────────────────────────────────
// HTTP client for deck CRUD operations.
// No dependency on any existing file except AuthManager.
// ──────────────────────────────────────────────────────────────

import { AuthManager } from '../auth/AuthManager';

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001/api';

export interface DeckData {
  id: number;
  name: string;
  cardIds: string[];
  isValid: boolean;
  errors?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export class DeckAPI {

  static async list(): Promise<DeckData[]> {
    const res = await fetch(`${API_BASE}/decks`, { headers: AuthManager.authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch decks');
    const data = await res.json();
    return data.decks;
  }

  static async create(name: string, cardIds: string[]): Promise<DeckData> {
    const res = await fetch(`${API_BASE}/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ name, cardIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Create failed');
    }
    return (await res.json()).deck;
  }

  static async update(id: number, name?: string, cardIds?: string[]): Promise<DeckData> {
    const res = await fetch(`${API_BASE}/decks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ name, cardIds }),
    });
    if (!res.ok) throw new Error('Update failed');
    return (await res.json()).deck;
  }

  static async remove(id: number): Promise<boolean> {
    const res = await fetch(`${API_BASE}/decks/${id}`, {
      method: 'DELETE',
      headers: AuthManager.authHeaders(),
    });
    return (await res.json()).success;
  }

  static async activate(id: number): Promise<void> {
    await fetch(`${API_BASE}/decks/${id}/activate`, {
      method: 'POST',
      headers: AuthManager.authHeaders(),
    });
  }

  static async validate(cardIds: string[]): Promise<{ valid: boolean; errors: string[] }> {
    const res = await fetch(`${API_BASE}/decks/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ cardIds }),
    });
    return res.json();
  }
}
```

---

## NEW FILE: `src/deck/DeckValidatorClient.ts`

```typescript
// ─── src/deck/DeckValidatorClient.ts ─────────────────────────
// Client-side instant validation for deck builder UX.
// Uses existing CardDefinitions — no new dependencies.
// ──────────────────────────────────────────────────────────────

import { getCard } from '../game/data/CardDefinitions';

const DECK_SIZE = 31;

export interface ClientDeckValidation {
  valid: boolean;
  errors: string[];
  cardCount: number;
  avgCost: number;
  costCurve: Record<number, number>;
  typeBreakdown: Record<string, number>;
}

export function validateDeckClient(cardIds: string[]): ClientDeckValidation {
  const errors: string[] = [];
  const costCurve: Record<number, number> = {};
  const typeBreakdown: Record<string, number> = {};
  let totalCost = 0;

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Need ${DECK_SIZE} cards (have ${cardIds.length}).`);
  }
  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck.');
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    try {
      const card = getCard(id);
      totalCost += card.cost;
      costCurve[card.cost] = (costCurve[card.cost] ?? 0) + 1;
      typeBreakdown[card.class] = (typeBreakdown[card.class] ?? 0) + 1;
    } catch {
      errors.push(`Unknown: ${id}`);
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
    cardCount: cardIds.length,
    avgCost: cardIds.length > 0 ? +(totalCost / cardIds.length).toFixed(1) : 0,
    costCurve,
    typeBreakdown,
  };
}
```

---

# PHASE C: Integration Touchpoints (Minimal Edits to Existing Files)

## EDIT: `src/network/SocketManager.ts`

### Change 1: Add `submitDeck` and `registerPlayer` methods

**Location:** Inside `class SocketManagerClass`, after `sendGameOver()`, before `disconnect()`.

**Add these 3 new methods (no existing code changes):**
```typescript
  // ── NEW: Register authenticated player identity with server ──
  registerPlayer(token: string): void {
    this.socket?.emit('registerPlayer', { token });
    console.log('[SocketManager] Registered player identity with server');
  }

  // ── NEW: Submit deck for server validation before match ──
  submitDeck(deckIds: string[]): void {
    this.socket?.emit('submitDeck', {
      roomCode: GameState.roomCode,
      deckIds,
    });
    console.log(`[SocketManager] Submitted deck (${deckIds.length} cards)`);
  }
```

### Change 2: Add callback types for deck events

**OLD (in `RoomCallbacks` interface, after `onHostDepositConfirmed`):**
```typescript
  onHostDepositConfirmed?: () => void;
  // ← ADD
}
```

**NEW:**
```typescript
  onHostDepositConfirmed?: () => void;
  onDeckAccepted?: () => void;
  onDeckRejected?: (errors: string[]) => void;
  onBothDecksReady?: () => void;
}
```

> Note: `onBothCryptoReady` already exists. `onBothDecksReady` is a separate event for deck validation.

### Change 3: Register the new socket events

**Location:** Inside `registerEvents()`, after the `tieReroll` listener block. Add:

```typescript
    this.socket.on('deckAccepted', () => {
      console.log('[SocketManager] Server accepted our deck');
      this.callbacks?.onDeckAccepted?.();
    });

    this.socket.on('deckRejected', (data: { errors: string[] }) => {
      console.warn('[SocketManager] Server rejected deck:', data.errors);
      this.callbacks?.onDeckRejected?.(data.errors);
    });

    this.socket.on('bothDecksReady', () => {
      console.log('[SocketManager] Both decks validated — ready to start');
      this.callbacks?.onBothDecksReady?.();
    });
```

### Change 4: Add auth token to socket connection

**OLD (in `connect()` method):**
```typescript
    console.log("[SocketManager] Connecting to server...");
    this.socket = io(this.serverUrl);
```

**NEW:**
```typescript
    console.log("[SocketManager] Connecting to server...");

    // Pass auth token if available (import AuthManager at top)
    const authToken = typeof AuthManager !== 'undefined' ? AuthManager?.getToken?.() : null;
    this.socket = io(this.serverUrl, authToken ? { auth: { token: authToken } } : {});
```

**Add import at top of file:**
```typescript
import { AuthManager } from '../auth/AuthManager';
```

> **If AuthManager isn't imported yet** (e.g. building phases incrementally), the typeof check prevents crashes.

---

## EDIT: `src/GameState.ts`

### Add auth fields (append inside `GameStateClass`, after `lastMatch`):

```typescript
    // ─── Auth (NEW) ───────────────────────────────────────────
    authToken: string = '';
    authenticatedPlayerId: number = 0;
    displayName: string = '';
    activeDeckId: number | null = null;
    activeDeckCardIds: string[] = [];

    // ─── Auth Setters (NEW) ───────────────────────────────────
    setAuthData(token: string, playerId: number, displayName: string): void {
      this.authToken = token;
      this.authenticatedPlayerId = playerId;
      this.displayName = displayName;
      this.playerName = displayName; // sync with existing playerName
      console.log(`[GameState] Auth: ${displayName} (#${playerId})`);
    }

    setActiveDeck(deckId: number | null, cardIds: string[]): void {
      this.activeDeckId = deckId;
      this.activeDeckCardIds = cardIds;
      console.log(`[GameState] Active deck: #${deckId} (${cardIds.length} cards)`);
    }

    isAuthenticated(): boolean {
      return this.authenticatedPlayerId > 0;
    }
```

---

## EDIT: `src/config/DeckLoader.ts` — Full Rewrite

The current file is ~60 LOC. The new version is ~70 LOC. Same interface, new priority chain.

**OLD (entire `DeckLoaderClass`):**
```typescript
class DeckLoaderClass {
  private deckIds: string[] | null = null;
  private readonly CONFIG_PATH = '/deck.config.json';

  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;
    try {
      const res = await fetch(this.CONFIG_PATH);
      if (!res.ok) {
        console.warn('[DeckLoader] deck.config.json not found — using built-in deck');
        return this.useFallback();
      }
      const json = await res.json();
      if (!Array.isArray(json.deckIds)) {
        console.error('[DeckLoader] deck.config.json missing "deckIds" array — using built-in deck');
        return this.useFallback();
      }
      const ids: string[] = json.deckIds;
      const invalid = ids.filter(id => {
        try { getCard(id); return false; }
        catch { return true; }
      });
      if (invalid.length > 0) {
        console.error(`[DeckLoader] Unknown card IDs in deck.config.json: ${invalid.join(', ')} — using built-in deck`);
        return this.useFallback();
      }
      if (ids.length !== 31) {
        console.warn(`[DeckLoader] deck.config.json has ${ids.length} cards, expected 31. Loading anyway.`);
      }
      console.log(`[DeckLoader] Loaded ${ids.length} cards from deck.config.json`);
      this.deckIds = ids;
      return this.deckIds;
    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch deck.config.json — using built-in deck', err);
      return this.useFallback();
    }
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
```

**NEW (entire `DeckLoaderClass`):**
```typescript
class DeckLoaderClass {
  private deckIds: string[] | null = null;
  private deckSource: string = 'none';
  private readonly CONFIG_PATH = '/deck.config.json';

  /**
   * Load deck with priority chain:
   *   1. GameState.activeDeckCardIds (set by auth/deck selection)
   *   2. deck.config.json (developer override)
   *   3. UNITS_ONLY_DECK_IDS (hardcoded fallback)
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    // Priority 1: Server-selected active deck (via GameState)
    const GameStateModule = await import('../GameState');
    const gs = GameStateModule.default;
    if (gs.activeDeckCardIds && gs.activeDeckCardIds.length > 0) {
      const serverIds = gs.activeDeckCardIds;
      const invalid = serverIds.filter((id: string) => {
        try { getCard(id); return false; } catch { return true; }
      });
      if (invalid.length === 0) {
        console.log(`[DeckLoader] Loaded ${serverIds.length} cards from server active deck`);
        this.deckIds = serverIds;
        this.deckSource = 'server';
        return this.deckIds;
      }
      console.warn(`[DeckLoader] Server deck has invalid cards: ${invalid.join(', ')} — falling through`);
    }

    // Priority 2: deck.config.json
    try {
      const res = await fetch(this.CONFIG_PATH);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.deckIds)) {
          const ids: string[] = json.deckIds;
          const invalid = ids.filter(id => {
            try { getCard(id); return false; } catch { return true; }
          });
          if (invalid.length === 0) {
            console.log(`[DeckLoader] Loaded ${ids.length} cards from deck.config.json`);
            this.deckIds = ids;
            this.deckSource = 'config';
            return this.deckIds;
          }
          console.warn(`[DeckLoader] deck.config.json invalid cards: ${invalid.join(', ')}`);
        }
      }
    } catch { /* silent — fall through */ }

    // Priority 3: Hardcoded fallback
    return this.useFallback();
  }

  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  getSource(): string {
    return this.deckSource;
  }

  invalidate(): void {
    this.deckIds = null;
    this.deckSource = 'none';
  }

  private useFallback(): string[] {
    console.log('[DeckLoader] Using built-in UNITS_ONLY_DECK_IDS fallback');
    this.deckIds = [...UNITS_ONLY_DECK_IDS];
    this.deckSource = 'fallback';
    return this.deckIds;
  }
}
```

**Import stays the same:** `import { UNITS_ONLY_DECK_IDS, getCard } from '../game/data/CardDefinitions';`

---

## EDIT: `src/scenes/RoomScene.ts` — Wire Deck Submission

### Change: In `onOpponentJoined()`, add deck submission after free play branch

**OLD (free play branch at end of `onOpponentJoined`):**
```typescript
  } else {
    this.statusText.setText('Opponent joined! Entering battle...');
    this.time.delayedCall(800, () => this.enterBattle());
  }
```

**NEW:**
```typescript
  } else {
    // Submit deck to server before entering battle
    this.statusText.setText('Opponent joined! Validating decks...');
    this.submitDeckAndEnter();
  }
```

### Add new method to `RoomScene` class:

```typescript
  private submitDeckAndEnter(): void {
    const deckIds = DeckLoader.get();

    // If server deck validation is available, use it
    SocketManager.submitDeck(deckIds);

    // Set a timeout fallback — if server doesn't respond in 3s, enter anyway
    // (handles case where server doesn't have submitDeck handler yet)
    const fallbackTimer = this.time.delayedCall(3000, () => {
      console.log('[RoomScene] Deck validation timeout — entering battle directly');
      this.enterBattle();
    });

    // Override socket callbacks to catch deck events
    const existingCallbacks = { ...SocketManager['callbacks'] };

    SocketManager.setCallbacks({
      ...existingCallbacks,
      onDeckAccepted: () => {
        this.statusText.setText('Deck accepted! Waiting for opponent...');
      },
      onDeckRejected: (errors: string[]) => {
        fallbackTimer.remove();
        this.statusText.setText('Deck rejected!').setColor('#ff4444');
        this.subStatusText.setText(errors.join(' | '));
        // Fall back to built-in deck after 2s
        this.time.delayedCall(2000, () => {
          DeckLoader.invalidate();
          GameState.setActiveDeck(null, []);
          this.submitDeckAndEnter();
        });
      },
      onBothDecksReady: () => {
        fallbackTimer.remove();
        this.statusText.setText('Both decks validated! Entering battle...');
        this.time.delayedCall(500, () => this.enterBattle());
      },
    } as any);
  }
```

### Add imports at top of RoomScene.ts:

```typescript
import { DeckLoader } from '../config/DeckLoader';
```

> GameState is already imported.

---

## EDIT: `src/network/SocketManager.ts` — Add `sendGameOver` totalTurns

**OLD:**
```typescript
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean): void {
  console.log(`[SocketManager] Sending game_over, won: ${localPlayerWon}`);
  this.socket?.emit('game_over', {
    roomCode: GameState.roomCode,
    winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
  });
}
```

**NEW:**
```typescript
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean, totalTurns?: number): void {
  console.log(`[SocketManager] Sending game_over, won: ${localPlayerWon}`);
  this.socket?.emit('game_over', {
    roomCode: GameState.roomCode,
    winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
    totalTurns: totalTurns ?? 0,
  });
}
```

## EDIT: `src/scenes/BattleScene.ts` — Pass turn count in game_over

**OLD (inside `EventBus.on(EV.GAME_OVER, ...)`):**
```typescript
      if (this.sceneData.isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
```

**NEW:**
```typescript
      const turnCount = this.engine.getState().turn?.turnNumber ?? 0;
      SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);
```

> Note: `sendGameOver` is always called now, not just in crypto mode. The server records matches for ALL modes if players are authenticated.

Actually, let's keep backward compat and just update the crypto call plus add free-play:

**OLD:**
```typescript
      if (this.sceneData.isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
```

**NEW:**
```typescript
      const turnCount = this.engine.getState().turn?.turnNumber ?? 0;
      // Always notify server (records match if players are authenticated)
      SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);
```

---

# PHASE D: Connection Flow — How Everything Wires Together

## Complete Login → Battle Flow (No Existing Flow Broken)

```
GUEST FLOW (unchanged):
  MainMenuScene → type name → "PLAY FREE" →
  RoomScene → socket connect → opponent joins →
  submitDeck(deck.config.json fallback) → 3s timeout → enterBattle →
  BattleScene → DeckLoader.get() → game plays normally

AUTHENTICATED FLOW (new):
  MainMenuScene → "CONNECT WALLET" →
  AuthManager.login() → JWT + player profile →
  GameState.setAuthData(token, id, name) →
  Fetch active deck from server → GameState.setActiveDeck(id, cardIds) →
  "PLAY FREE" or "PLAY CRYPTO" →
  RoomScene → socket connect → registerPlayer(JWT) →
  opponent joins → submitDeck(active deck) →
  server validates → bothDecksReady → enterBattle →
  BattleScene → DeckLoader.get() → reads GameState.activeDeckCardIds →
  game plays with custom deck
```

## Editing MainMenuScene for Auth (Minimal)

### Add auth button and flow to `MainMenuScene.create()`:

After the `cryptoBtn` creation block, add:

```typescript
    // ── Auth Status / Login Button ──────────────────────────
    if (AuthManager.isLoggedIn()) {
      this.add.text(CX, 40, `Logged in: ${AuthManager.getPlayer()!.displayName}`, {
        fontSize: '12px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
      }).setOrigin(0.5);
    } else {
      const loginBtn = new MenuButton(this, CX, BASE_Y + GAP * 5 + 10,
        '[ CONNECT WALLET & LOGIN ]', {
          color: '#4fc3f7', fontSize: '14px',
          onPointerDown: () => this.handleLogin(loginBtn),
        });
    }
```

### Add the login handler method to MainMenuScene:

```typescript
  private async handleLogin(btn: MenuButton): Promise<void> {
    btn.setLabel('Connecting...');
    btn.setDisabled(true);
    try {
      const player = await AuthManager.login();
      GameState.setAuthData(AuthManager.getToken()!, player.id, player.displayName);

      // Fetch active deck
      const { DeckAPI } = await import('../deck/DeckAPI');
      const decks = await DeckAPI.list();
      const active = decks.find(d => d.id === player.activeDeckId);
      if (active?.isValid) {
        GameState.setActiveDeck(active.id, active.cardIds);
        DeckLoader.invalidate(); // Force reload with server deck
      }

      // Refresh scene to show logged-in state
      this.scene.restart();
    } catch (err: any) {
      ToastNotification.show(this, `Login failed: ${err.message}`, { color: '#ff4444' });
      btn.setLabel('[ CONNECT WALLET & LOGIN ]');
      btn.setDisabled(false);
    }
  }
```

### Add imports at top of MainMenuScene.ts:

```typescript
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
```

### Modify `onPlayCrypto` to use existing auth if available:

**OLD (start of `onPlayCrypto`):**
```typescript
  private async onPlayCrypto(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    this.playFreeBtn.setDisabled(true);
    this.cryptoBtn.setDisabled(true);
    this.cryptoBtn.setLabel('Connecting wallet...');

    try {
      const address = await WalletManager.connect();
      GameState.connectWallet(address);
      GameState.setPlayerName(name);
```

**NEW:**
```typescript
  private async onPlayCrypto(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    this.playFreeBtn.setDisabled(true);
    this.cryptoBtn.setDisabled(true);
    this.cryptoBtn.setLabel('Connecting wallet...');

    try {
      // If already authenticated, reuse wallet. Otherwise connect fresh.
      let address: string;
      if (AuthManager.isLoggedIn() && WalletManager.isConnected()) {
        address = WalletManager.getAddress();
      } else {
        address = await WalletManager.connect();
      }
      GameState.connectWallet(address);
      GameState.setPlayerName(AuthManager.isLoggedIn() ? GameState.displayName || name : name);
```

> The rest of `onPlayCrypto` stays the same.

---

## EDIT: `src/scenes/RoomScene.ts` — Register player after socket connects

### In `connectSocket()`, add registerPlayer call:

**OLD:**
```typescript
  private connectSocket(): void {
    SocketManager.connect({
  onRoomCreated: (code) => this.onRoomCreated(code),
```

**NEW:**
```typescript
  private connectSocket(): void {
    SocketManager.connect({
  onRoomCreated: (code) => {
    this.onRoomCreated(code);
    // Register authenticated player with server
    if (GameState.authToken) {
      SocketManager.registerPlayer(GameState.authToken);
    }
  },
```

Also update `onRoomJoined`:

**OLD:**
```typescript
  onRoomJoined: (code) => this.onRoomJoined(code),
```

**NEW:**
```typescript
  onRoomJoined: (code) => {
    this.onRoomJoined(code);
    if (GameState.authToken) {
      SocketManager.registerPlayer(GameState.authToken);
    }
  },
```

---

# SUMMARY: File Change Map

```
NEW FILES (drop in, no conflicts):
  server/db.js                      Database setup + migrations
  server/cardPool.js                Server card data
  server/deckValidator.js           Deck validation logic
  server/api.js                     Full REST API router
  src/auth/AuthManager.ts           Client auth flow
  src/deck/DeckAPI.ts               Deck CRUD HTTP client
  src/deck/DeckValidatorClient.ts   Client-side instant validation

EDITED FILES (search OLD → replace with NEW):
  server/index.js
    ├─ Top: add cors, api require, express.json, router mount
    ├─ createRoom: add playerId+deckIds to player object
    ├─ joinRoom: add playerId+deckIds to player object
    ├─ NEW EVENTS: registerPlayer, submitDeck (add before disconnect)
    └─ game_over: add match recording + totalTurns

  src/GameState.ts
    └─ Add: authToken, authenticatedPlayerId, displayName,
           activeDeckId, activeDeckCardIds, setAuthData(),
           setActiveDeck(), isAuthenticated()

  src/config/DeckLoader.ts
    └─ Rewrite DeckLoaderClass (same interface, new priority chain)

  src/network/SocketManager.ts
    ├─ Add import: AuthManager
    ├─ connect(): add auth token to socket handshake
    ├─ RoomCallbacks: add onDeckAccepted, onDeckRejected, onBothDecksReady
    ├─ registerEvents(): add 3 new socket.on handlers
    ├─ NEW METHODS: registerPlayer(), submitDeck()
    └─ sendGameOver(): add totalTurns parameter

  src/scenes/MainMenuScene.ts
    ├─ Add imports: AuthManager, DeckLoader
    ├─ create(): add login button / auth status display
    ├─ NEW METHOD: handleLogin()
    └─ onPlayCrypto(): reuse existing auth if available

  src/scenes/RoomScene.ts
    ├─ Add import: DeckLoader
    ├─ connectSocket(): add registerPlayer in onRoomCreated/onRoomJoined
    ├─ onOpponentJoined(): call submitDeckAndEnter instead of direct enterBattle
    └─ NEW METHOD: submitDeckAndEnter()

  src/scenes/BattleScene.ts
    └─ GAME_OVER handler: always call sendGameOver (not just crypto),
       pass turnCount

UNTOUCHED (zero changes):
  src/game/GameEngine.ts            ← startGame() still calls DeckLoader.get()
  src/game/data/CardDefinitions.ts  ← No changes
  src/web3/WalletManager.ts         ← No changes
  src/web3/EscrowManager.ts         ← No changes
  src/renderers/*                   ← No changes
  src/events/EventBus.ts            ← No changes
  All layout/theme JSONs            ← No changes
```

---

# INSTALL COMMANDS

```bash
# Server dependencies (run in project root)
npm install better-sqlite3 jsonwebtoken cors

# If using TypeScript types (optional for server since it's JS)
npm install -D @types/better-sqlite3 @types/jsonwebtoken @types/cors
```

# `.env` additions

```
JWT_SECRET=replace-with-random-64-char-string-in-production
```
