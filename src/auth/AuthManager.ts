// ============================================================
// AuthManager.ts
// Multi-provider authentication: wallet (MetaMask) + email/password.
// Singleton — survives scene changes.
// Session persisted to localStorage — survives page refresh.
// ============================================================

import WalletManager from '../web3/WalletManager';
import GameState from '../GameState';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const STORAGE_KEY = 'ocb_auth';
const GUEST_SESSION_KEY = 'ocb_guest_session';

export interface AuthPlayer {
  id: number;
  wallet: string | null;
  email: string | null;
  displayName: string;
  winCount: number;
  lossCount: number;
  eloRating: number;
  activeDeckId: number | null;
  accountTier: number;
  authProvider: string;
}

class AuthManagerClass {
  private _loggedIn = false;
  private _player: AuthPlayer | null = null;
  private _token: string | null = null;
  private _guestSessionId: string | null = null;

  constructor() {
    this._restoreSession();
    this._restoreGuestSession();
  }

  // ─── Wallet Login (existing flow) ─────────────────────────

  async login(): Promise<AuthPlayer> {
    let address: string;
    if (WalletManager.isConnected()) {
      const signer = WalletManager.getSigner();
      if (!signer) throw new Error('Wallet connected but no signer');
      address = await signer.getAddress();
    } else {
      address = await WalletManager.connect();
    }

    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address.toLowerCase()}`);
    if (!nonceRes.ok) throw new Error('Failed to get login nonce');
    const { message } = await nonceRes.json();

    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No signer available');
    const signature = await signer.signMessage(message);

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
    this._applyAuth(token, player);
    GameState.connectWallet(address);

    console.log(`[AuthManager] Wallet login: ${player.displayName} (#${player.id})`);
    return this._player!;
  }

  // ─── Email Auth ───────────────────────────────────────────

  async register(email: string, password: string, displayName?: string): Promise<AuthPlayer> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Registration failed');
    }

    const { token, player } = await res.json();
    this._applyAuth(token, player);

    console.log(`[AuthManager] Registered: ${player.displayName} (#${player.id})`);
    return this._player!;
  }

  async loginWithEmail(email: string, password: string): Promise<AuthPlayer> {
    const res = await fetch(`${API_BASE}/auth/email-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }

    const { token, player } = await res.json();
    this._applyAuth(token, player);
    if (player.wallet) GameState.connectWallet(player.wallet);

    console.log(`[AuthManager] Email login: ${player.displayName} (#${player.id})`);
    return this._player!;
  }

  // ─── Account Linking ──────────────────────────────────────

  async linkWallet(): Promise<AuthPlayer> {
    let address: string;
    if (WalletManager.isConnected()) {
      const signer = WalletManager.getSigner();
      if (!signer) throw new Error('Wallet connected but no signer');
      address = await signer.getAddress();
    } else {
      address = await WalletManager.connect();
    }

    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address.toLowerCase()}`);
    if (!nonceRes.ok) throw new Error('Failed to get nonce');
    const { message } = await nonceRes.json();

    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No signer available');
    const signature = await signer.signMessage(message);

    const res = await fetch(`${API_BASE}/auth/link-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ wallet: address.toLowerCase(), signature }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Wallet linking failed');
    }

    const { token, player } = await res.json();
    this._applyAuth(token, player);
    GameState.connectWallet(address);

    console.log(`[AuthManager] Wallet linked: ${address}`);
    return this._player!;
  }

  async linkEmail(email: string, password: string): Promise<AuthPlayer> {
    const res = await fetch(`${API_BASE}/auth/link-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Email linking failed');
    }

    const { token, player } = await res.json();
    this._applyAuth(token, player);

    console.log(`[AuthManager] Email linked: ${email}`);
    return this._player!;
  }

  // ─── Guest Session ───────────────────────────────────────

  /** Create a guest session with a unique ID, stored in sessionStorage. */
  enterAsGuest(): string {
    // Reuse existing guest session if still active
    if (this._guestSessionId) return this._guestSessionId;
    this._guestSessionId = crypto.randomUUID();
    try { sessionStorage.setItem(GUEST_SESSION_KEY, this._guestSessionId); } catch { /* */ }
    console.log(`[AuthManager] Guest session: ${this._guestSessionId}`);
    return this._guestSessionId;
  }

  getGuestSessionId(): string | null { return this._guestSessionId; }

  isGuest(): boolean { return !this._loggedIn && !!this._guestSessionId; }

  clearGuestSession(): void {
    this._guestSessionId = null;
    try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch { /* */ }
  }

  private _restoreGuestSession(): void {
    try {
      const id = sessionStorage.getItem(GUEST_SESSION_KEY);
      if (id) {
        this._guestSessionId = id;
        console.log(`[AuthManager] Guest session restored: ${id}`);
      }
    } catch { /* */ }
  }

  // ─── Getters ──────────────────────────────────────────────

  getToken(): string | null { return this._token; }
  getPlayer(): AuthPlayer | null { return this._player; }
  isLoggedIn(): boolean { return this._loggedIn; }

  authHeaders(): Record<string, string> {
    if (!this._token) return {};
    return { 'Authorization': `Bearer ${this._token}` };
  }

  /** Update the active deck on the in-memory player and re-persist to localStorage. */
  setActiveDeckId(deckId: number | null): void {
    if (this._player) {
      this._player.activeDeckId = deckId;
      // Re-persist so session restore picks up the change
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          token: this._token,
          player: this._player,
        }));
      } catch { /* storage full or disabled */ }
    }
  }

  logout(): void {
    this._loggedIn = false;
    this._player = null;
    this._token = null;
    localStorage.removeItem(STORAGE_KEY);
    GameState.clearAuth();
  }

  // ─── Internal ─────────────────────────────────────────────

  /** Apply auth state from any login path + persist to localStorage. */
  private _applyAuth(token: string, player: any): void {
    this._token = token;
    this._player = {
      id: player.id,
      wallet: player.wallet ?? null,
      email: player.email ?? null,
      displayName: player.displayName,
      winCount: player.winCount ?? 0,
      lossCount: player.lossCount ?? 0,
      eloRating: player.eloRating ?? 1000,
      activeDeckId: player.activeDeckId ?? null,
      accountTier: player.accountTier ?? 1,
      authProvider: player.authProvider ?? 'wallet',
    };
    this._loggedIn = true;
    GameState.setAuthData(token, player.id, player.displayName);

    // Persist session
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        token: this._token,
        player: this._player,
      }));
    } catch { /* storage full or disabled */ }
  }

  /** Restore session from localStorage on startup. */
  private _restoreSession(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const { token, player } = JSON.parse(raw);
      if (!token || !player?.id) return;

      // Restore state without re-persisting
      this._token = token;
      this._player = player;
      this._loggedIn = true;
      GameState.setAuthData(token, player.id, player.displayName);
      if (player.wallet) GameState.connectWallet(player.wallet);

      console.log(`[AuthManager] Session restored: ${player.displayName} (#${player.id})`);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /** Legacy support — used by external callers. */
  _setAuth(token: string, player: AuthPlayer): void {
    this._token = token;
    this._player = player;
    this._loggedIn = true;
  }
}

export const AuthManager = new AuthManagerClass();
