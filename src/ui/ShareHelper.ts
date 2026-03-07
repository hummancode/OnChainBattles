// ============================================================
// ShareHelper.ts
// Utility class for clipboard operations and room sharing.
//
// Provides:
//   - copyToClipboard()  → copies text with fallback for older browsers
//   - buildRoomLink()    → generates a joinable URL with room code
//   - shareRoom()        → uses Web Share API if available, else copies
//
// All methods are static — no instantiation needed.
// ============================================================

export class ShareHelper {

  /**
   * Copy arbitrary text to the clipboard.
   * Returns true on success, false on failure.
   */
  static async copyToClipboard(text: string): Promise<boolean> {
    // Modern API
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to legacy approach
      }
    }

    // Legacy fallback: invisible textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * Build a URL that a second player can open to auto-join a room.
   * Format: {origin}?room={code}
   *
   * If the current page is file:// or about:blank (dev), returns
   * a placeholder string the user can still share manually.
   */
  static buildRoomLink(roomCode: string): string {
    const base = window.location.origin + window.location.pathname;
    // Avoid broken links in dev / iframe contexts
    if (base.startsWith('file://') || base === 'about:blank') {
      return `[Room Code: ${roomCode}]`;
    }
    return `${base}?room=${roomCode}`;
  }

  /**
   * Try the native Web Share API (mobile-friendly).
   * Falls back to copying the link to clipboard.
   * Returns 'shared' | 'copied' | 'failed'.
   */
  static async shareRoom(roomCode: string): Promise<'shared' | 'copied' | 'failed'> {
    const link = ShareHelper.buildRoomLink(roomCode);

    // Try native share (mobile browsers, some desktops)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'OnChainBattles — Join My Room',
          text: `Join my OnChainBattles match! Room code: ${roomCode}`,
          url: link,
        });
        return 'shared';
      } catch {
        // User cancelled or API error — fall through to copy
      }
    }

    // Fallback: copy link
    const ok = await ShareHelper.copyToClipboard(link);
    return ok ? 'copied' : 'failed';
  }

  /**
   * Read room code from URL query params if present.
   * Returns empty string if not found.
   * Used by MainMenuScene to auto-fill the room code input.
   */
  static getRoomCodeFromURL(): string {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.trim().toUpperCase() ?? '';
    } catch {
      return '';
    }
  }
}
