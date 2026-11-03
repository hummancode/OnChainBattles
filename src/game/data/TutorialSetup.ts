// ============================================================
// TutorialSetup.ts — fixed, cheap deck + fixed seed for the guided
// tutorial, so every new player gets the same playable opening
// (a 1-LEG unit in the first hand). Verified by tests/tutorial.
// ============================================================

import { UNITS_ONLY_DECK_IDS } from './DeckDefinitions';

export const TUTORIAL_DECK: string[] = [
  ...Array(10).fill('foot_soldier'),
  ...Array(4).fill('messenger'),
  ...Array(5).fill('pikeman'),
  ...Array(4).fill('scout'),
  ...Array(4).fill('archer'),
  ...Array(4).fill('swordsman'),
];

export const TUTORIAL_BOT_DECK: string[] = [...UNITS_ONLY_DECK_IDS];

/** Chosen so P1's opening hand contains a 1-cost unit (see tutorialSetup test). */
export const TUTORIAL_SEED = 1;
