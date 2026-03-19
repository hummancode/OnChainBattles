// ============================================================
// ProfileAPI.ts
// Fetch aggregated player profile data from server.
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface ProfilePlayer {
  id: number;
  displayName: string;
  email: string | null;
  wallet: string | null;
  accountTier: number;
  authProvider: string;
  eloRating: number;
  winCount: number;
  lossCount: number;
  foundingPlayer: boolean;
  createdAt: string;
}

export interface MatchHistoryEntry {
  id: number;
  roomCode: string;
  opponentName: string;
  opponentId: number | null;
  won: boolean;
  totalTurns: number;
  stakeAmount: number;
  startedAt: string;
}

export interface ProfileData {
  player: ProfilePlayer;
  matchHistory: MatchHistoryEntry[];
  puzzleStats: { totalAttempts: number; puzzlesSolved: number };
  activeDeck: { id: number; name: string; cardIds: string[] } | null;
  collectionStats: { totalOwned: number };
}

export const ProfileAPI = {
  async getProfile(): Promise<ProfileData> {
    const res = await fetch(`${API_BASE}/player/profile`, {
      headers: AuthManager.authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to load profile');
    return res.json();
  },

  async updateDisplayName(name: string): Promise<string> {
    const res = await fetch(`${API_BASE}/player/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
      body: JSON.stringify({ displayName: name }),
    });
    if (!res.ok) throw new Error('Failed to update name');
    const data = await res.json();
    // Update local auth state
    const player = AuthManager.getPlayer();
    if (player) player.displayName = data.displayName;
    return data.displayName;
  },
};
