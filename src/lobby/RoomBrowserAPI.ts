// ============================================================
// RoomBrowserAPI.ts
// REST fetch for public room list (no auth required).
// ============================================================

import type { PublicRoomListing } from '../../shared/types/NetworkEvents';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function fetchPublicRooms(): Promise<PublicRoomListing[]> {
  try {
    const res = await fetch(`${API_BASE}/rooms`);
    if (!res.ok) return [];
    const { rooms } = await res.json();
    return rooms ?? [];
  } catch {
    return [];
  }
}
