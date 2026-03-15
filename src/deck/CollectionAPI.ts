// ============================================================
// CollectionAPI.ts
// Fetch authenticated player's card collection from server.
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface CollectionCard {
  id: string;
  name: string;
  maxCopies: number;
  ownedCopies: number;
}

export const CollectionAPI = {
  /** Fetch the authenticated player's card collection. */
  async get(): Promise<CollectionCard[]> {
    if (!AuthManager.isLoggedIn()) return [];

    const res = await fetch(`${API_BASE}/collection`, {
      headers: AuthManager.authHeaders(),
    });
    if (!res.ok) return [];

    const { collection } = await res.json();
    return collection;
  },
};
