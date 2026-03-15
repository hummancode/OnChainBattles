// ============================================================
// DeckAPI.ts
// HTTP client for server-side deck CRUD operations.
// All calls require authentication via AuthManager.
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface DeckSummary {
  id: number;
  name: string;
  cardIds: string[];
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCreateResult {
  deck: DeckSummary & { errors: string[] };
}

async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...AuthManager.authHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export const DeckAPI = {
  /** List all decks for the authenticated player. */
  async list(): Promise<{ decks: DeckSummary[] }> {
    return apiCall('/decks');
  },

  /** Create a new deck. */
  async create(name: string, cardIds: string[]): Promise<DeckCreateResult> {
    return apiCall('/decks', {
      method: 'POST',
      body: JSON.stringify({ name, cardIds }),
    });
  },

  /** Update an existing deck. */
  async update(deckId: number, name: string, cardIds: string[]): Promise<DeckCreateResult> {
    return apiCall(`/decks/${deckId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, cardIds }),
    });
  },

  /** Delete a deck. */
  async remove(deckId: number): Promise<{ success: boolean }> {
    return apiCall(`/decks/${deckId}`, { method: 'DELETE' });
  },

  /** Activate a deck (set as active for matches). */
  async activate(deckId: number): Promise<{ success: boolean; activeDeckId: number }> {
    return apiCall(`/decks/${deckId}/activate`, { method: 'POST' });
  },

  /** Validate a deck server-side. */
  async validate(cardIds: string[]): Promise<{ valid: boolean; errors: string[] }> {
    return apiCall('/decks/validate', {
      method: 'POST',
      body: JSON.stringify({ cardIds }),
    });
  },
};
