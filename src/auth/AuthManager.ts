// ============================================================
// AuthManager.ts
// Wallet-based authentication: nonce → sign → JWT.
// Singleton — survives scene changes.
//
// Flow:
//   1. WalletManager.connect() → get signer
//   2. GET /api/auth/nonce?wallet=... → get nonce + message
//   3. signer.signMessage(message) → signature
//   4. POST /api/auth/login → JWT + player record
//   5. Store in GameState + AuthManager
// ============================================================

import WalletManager from '../web3/WalletManager';
import GameState from '../GameState';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
  private _loggedIn = false;
  private _player: AuthPlayer | null = null;
  private _token: string | null = null;

  /** Wallet login: connect → nonce → sign → JWT. */
  async login(): Promise<AuthPlayer> {
    // 1. Connect wallet (may already be connected)
    let address: string;
    if (WalletManager.isConnected()) {
      const signer = WalletManager.getSigner();
      if (!signer) throw new Error('Wallet connected but no signer');
      address = await signer.getAddress();
    } else {
      address = await WalletManager.connect();
    }

    // 2. Get nonce from server
    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address.toLowerCase()}`);
    if (!nonceRes.ok) throw new Error('Failed to get login nonce');
    const { message } = await nonceRes.json();

    // 3. Sign the nonce message
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No signer available');
    const signature = await signer.signMessage(message);

    // 4. Login with signature
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address.toLowerCase(), signature }),
    });
    if (!loginRes.ok) {
      const err = await loginRes.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }

    const { token, player } = await loginRes.json();

    // 5. Store auth state
    this._setAuth(token, {
      id: player.id,
      wallet: player.wallet,
      displayName: player.displayName,
      winCount: player.winCount,
      lossCount: player.lossCount,
      eloRating: player.eloRating,
      activeDeckId: player.activeDeckId,
    });

    // Sync to GameState
    GameState.setAuthData(token, player.id, player.displayName);
    GameState.connectWallet(address);

    console.log(`[AuthManager] Logged in as ${player.displayName} (#${player.id})`);
    return this._player!;
  }

  getToken(): string | null { return this._token; }
  getPlayer(): AuthPlayer | null { return this._player; }
  isLoggedIn(): boolean { return this._loggedIn; }

  /** Auth headers for REST API calls. Empty object if not logged in. */
  authHeaders(): Record<string, string> {
    if (!this._token) return {};
    return { 'Authorization': `Bearer ${this._token}` };
  }

  logout(): void {
    this._loggedIn = false;
    this._player = null;
    this._token = null;
    GameState.clearAuth();
  }

  /** Internal — set auth state directly. */
  _setAuth(token: string, player: AuthPlayer): void {
    this._token = token;
    this._player = player;
    this._loggedIn = true;
  }
}

export const AuthManager = new AuthManagerClass();
