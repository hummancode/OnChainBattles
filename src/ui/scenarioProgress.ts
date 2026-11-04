// Story-puzzle progress per browser: solved ids + fewest moves used (a convenience — safe to lose).
const KEY = 'ocb.scenarioProgress';

type Progress = Record<string, { solved: boolean; bestMoves: number }>;

function load(): Progress {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

export function getScenarioProgress(id: string): { solved: boolean; bestMoves: number } | null {
  return load()[id] ?? null;
}

export function recordScenarioWin(id: string, moves: number): void {
  try {
    const p = load();
    const prev = p[id];
    p[id] = { solved: true, bestMoves: prev?.solved ? Math.min(prev.bestMoves, moves) : moves };
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* storage blocked */ }
}
