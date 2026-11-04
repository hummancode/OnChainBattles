// One result per match: the local engine's GAME_OVER (GameOverHandler) and a server-decided
// end (NetworkCoordinator.showServerResult) can both fire — only the first one records W/L
// and opens the result screen. Reset when a battle is set up.
let shown = false;

/** True for the first caller of a match, false afterwards. */
export function claimResult(): boolean {
  if (shown) return false;
  shown = true;
  return true;
}

export function resetResult(): void { shown = false; }
