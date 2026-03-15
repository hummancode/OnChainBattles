// ============================================================
// deckRoutes.ts
// Deck CRUD: list, create, update, delete, activate, validate.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { validateDeck } from '../validation/DeckValidator.js';
import { sanitizeText } from '../utils/sanitize.js';

export const deckRouter = Router();

const MAX_DECKS = 10;

function getOwnedCards(playerId: number): Map<string, number> {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(playerId) as Array<{ card_id: string; owned_copies: number }>;
  return new Map(rows.map(r => [r.card_id, r.owned_copies]));
}

// GET /api/decks
deckRouter.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM decks WHERE player_id = ? ORDER BY updated_at DESC'
  ).all(req.player!.playerId) as Array<Record<string, unknown>>;

  res.json({
    decks: rows.map(d => {
      let cardIds: string[] = [];
      try { cardIds = JSON.parse(d.card_ids as string); } catch { /* corrupted */ }
      return {
        id: d.id, name: d.name, cardIds,
        isValid: !!d.is_valid,
        createdAt: d.created_at, updatedAt: d.updated_at,
      };
    }),
  });
});

// POST /api/decks
deckRouter.post('/', requireAuth, (req, res) => {
  const { name, cardIds } = req.body ?? {};
  if (!Array.isArray(cardIds)) {
    res.status(400).json({ error: 'cardIds must be an array.' });
    return;
  }
  const db = getDB();
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?'
  ).get(req.player!.playerId) as { cnt: number };

  if (count.cnt >= MAX_DECKS) {
    res.status(400).json({ error: `Maximum ${MAX_DECKS} decks.` });
    return;
  }

  const owned = getOwnedCards(req.player!.playerId);
  const validation = validateDeck(cardIds, owned);

  const safeName = sanitizeText(name, 40) || 'My Deck';
  const result = db.prepare(
    'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
  ).run(req.player!.playerId, safeName, JSON.stringify(cardIds), validation.valid ? 1 : 0);

  res.status(201).json({
    deck: {
      id: Number(result.lastInsertRowid), name: name ?? 'My Deck',
      cardIds, isValid: validation.valid, errors: validation.errors,
    },
  });
});

// PUT /api/decks/:id
deckRouter.put('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const existing = db.prepare(
    'SELECT * FROM decks WHERE id = ? AND player_id = ?'
  ).get(req.params.id, req.player!.playerId) as Record<string, unknown> | undefined;

  if (!existing) { res.status(404).json({ error: 'Deck not found.' }); return; }

  const name = req.body.name ?? existing.name;
  const cardIds = req.body.cardIds ?? JSON.parse(existing.card_ids as string);
  const owned = getOwnedCards(req.player!.playerId);
  const validation = validateDeck(cardIds, owned);

  db.prepare(
    'UPDATE decks SET name=?, card_ids=?, is_valid=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(name, JSON.stringify(cardIds), validation.valid ? 1 : 0, req.params.id);

  res.json({ deck: { id: existing.id, name, cardIds, isValid: validation.valid, errors: validation.errors } });
});

// DELETE /api/decks/:id
deckRouter.delete('/:id', requireAuth, (req, res) => {
  const db = getDB();

  // Prevent deleting the last deck
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?'
  ).get(req.player!.playerId) as { cnt: number };
  if (count.cnt <= 1) {
    res.status(400).json({ error: 'Cannot delete your last deck.' });
    return;
  }

  db.prepare('UPDATE players SET active_deck_id=NULL WHERE id=? AND active_deck_id=?')
    .run(req.player!.playerId, req.params.id);
  const r = db.prepare('DELETE FROM decks WHERE id=? AND player_id=?')
    .run(req.params.id, req.player!.playerId);
  res.json({ success: r.changes > 0 });
});

// POST /api/decks/:id/activate
deckRouter.post('/:id/activate', requireAuth, (req, res) => {
  const db = getDB();
  const deck = db.prepare('SELECT * FROM decks WHERE id=? AND player_id=?')
    .get(req.params.id, req.player!.playerId) as Record<string, unknown> | undefined;
  if (!deck) { res.status(404).json({ error: 'Deck not found.' }); return; }
  if (!deck.is_valid) { res.status(400).json({ error: 'Cannot activate invalid deck.' }); return; }
  db.prepare('UPDATE players SET active_deck_id=? WHERE id=?').run(deck.id, req.player!.playerId);
  res.json({ success: true, activeDeckId: deck.id });
});

// POST /api/decks/validate
deckRouter.post('/validate', requireAuth, (req, res) => {
  const owned = getOwnedCards(req.player!.playerId);
  res.json(validateDeck(req.body?.cardIds ?? [], owned));
});
