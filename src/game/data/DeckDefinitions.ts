// ============================================================
// DeckDefinitions.ts
// Deck configurations — card ID lists for game modes.
// ============================================================

// UNITS-ONLY DECK — 31 cards (King pre-placed, not included)
// No spells or structures. Focused on unit combat for MVP playtesting.
// Both players use identical pool, each gets an independently shuffled copy.
export const UNITS_ONLY_DECK_IDS: string[] = [
  // Standard units
  'foot_soldier', 'foot_soldier', 'foot_soldier',  // 3 copies — cheap backbone
  'pikeman',      'pikeman',                        // 2 — anti-cavalry
  'archer',       'archer',                         // 2 — ranged
  'assassin',     'assassin',                       // 2 — fast striker
  'militia',      'militia',                        // 2 — expendable
  'scout',        'scout',                          // 2 — board info
  'lancer',       'lancer',                         // 2 — cavalry charge
  'messenger',    'messenger',                      // 2 — utility
  'mystic',                                         // 1 — revive wildcard
  // Royal units
  'swordsman',    'swordsman',                      // 2 — reliable fighter
  'priest',       'priest',                         // 2 — healer
  'inquisitor',   'inquisitor',                     // 2 — LEG drain threat
  'knight',       'knight',                         // 2 — heavy cavalry
  'scribe',       'scribe',                         // 2 — deck utility
  'princess',                                       // 1 — CROWN boost
  'commander',                                      // 1 — aura leader
  'knights_guard',                                  // 1 — defensive elite
];

// Sanity check — must be exactly 31
if (UNITS_ONLY_DECK_IDS.length !== 31) {
  console.error(`[DeckDefinitions] UNITS_ONLY_DECK_IDS has ${UNITS_ONLY_DECK_IDS.length} entries, expected 31`);
}

// Alias for backwards compatibility
export const DEMO_DECK_IDS = UNITS_ONLY_DECK_IDS;
