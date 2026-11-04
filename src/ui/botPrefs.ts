// Remembers the practice-bot difficulty per browser (a convenience only — safe to lose).
import type { BotDifficulty } from '../game/ai/SimpleBot';

const KEY = 'ocb.botDifficulty';
const LEVELS: BotDifficulty[] = ['easy', 'normal', 'hard'];

export function getBotDifficulty(): BotDifficulty {
  try {
    const v = localStorage.getItem(KEY) as BotDifficulty | null;
    if (v && LEVELS.includes(v)) return v;
  } catch { /* storage blocked */ }
  return 'normal';
}

export function setBotDifficulty(d: BotDifficulty): void {
  try { localStorage.setItem(KEY, d); } catch { /* storage blocked */ }
}

export function botName(d: BotDifficulty): string {
  return `Bot (${d[0].toUpperCase()}${d.slice(1)})`;
}
