// ============================================================
// GameLogger.ts
// Comprehensive game session logger.
//
// Records every engine event + periodic full game state snapshots
// every 30 seconds. Designed for post-game debugging.
//
// Logs include: units (stats, buffs, position), player hands,
// LEG economy (pool, rate, bonuses, penalties), crown discounts,
// combat breakdowns (base ATK, aura buffs, positional bonuses),
// card placements, deaths, and all phase transitions.
//
// Usage:
//   const logger = new GameLogger(roomCode, playerIndex, seed, () => engine.getState());
//   engine.on(e => logger.record(e));
//   // On game end or scene shutdown:
//   logger.stop();
//
// Auto-saves to localStorage every 30s. Downloads JSON on stop().
// ============================================================

import type { GameEvent } from './types/EventTypes';
import type { GameStateSnapshot, StatBuff, GameModifiers, PlayerStateSnapshot } from './types/GameTypes';
import { getCard } from './data/CardRegistry';

const AUTO_SAVE_INTERVAL_MS = 30_000;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface SessionMeta {
  roomCode: string;
  localPlayerIndex: number;
  seed: number;
  startedAt: string;
  endedAt?: string;
}

export interface LogEntry {
  seq: number;
  ts: number;                 // ms since session start
  event: string;              // event.type
  detail: string;             // human-readable summary
  raw: Record<string, any>;   // full event payload
}

export interface UnitSnap {
  instanceId: string;
  cardId: string;
  name: string;
  owner: number;
  col: number;
  row: number;
  baseAtk: number;
  currentAtk: number;
  currentDef: number;
  maxDef: number;
  isActive: boolean;
  hasMoved: boolean;
  hasActed: boolean;
  activeBuffs: StatBuff[];
}

export interface PlayerSnap {
  player: number;
  hand: string[];             // card IDs
  handNames: string[];        // human-readable card names
  handCount: number;
  deckCount: number;
  discardCount: number;
  leg: number;                // current LEG pool
  legRate: number;            // effective LEG rate (base + bonus - penalty)
  legRateBase: number;
  legRateBonus: number;
  legRatePenalty: number;
  crownDiscount: number;      // royal cost discount
  crownPenalty: number;       // royal cost penalty
}

export interface FullSnapshot {
  ts: number;
  turn: number;
  phase: string;
  activePlayer: number;
  units: UnitSnap[];
  players: [PlayerSnap, PlayerSnap];
}

export interface SessionLog {
  meta: SessionMeta;
  events: LogEntry[];
  snapshots: FullSnapshot[];
}

// ─────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────

export class GameLogger {
  private meta: SessionMeta;
  private events: LogEntry[] = [];
  private snapshots: FullSnapshot[] = [];
  private seq = 0;
  private startMs: number;
  private stopped = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private getState: () => GameStateSnapshot;
  private storageKey: string;

  constructor(
    roomCode: string,
    localPlayerIndex: number,
    seed: number,
    getState: () => GameStateSnapshot
  ) {
    this.startMs = Date.now();
    this.getState = getState;
    this.meta = {
      roomCode,
      localPlayerIndex,
      seed,
      startedAt: new Date().toISOString(),
    };
    this.storageKey = `gamelog_session_${roomCode}_${this.meta.startedAt.replace(/[:.]/g, '-')}`;

    // Periodic auto-save every 30 seconds
    if (typeof window !== 'undefined') {
      this.autoSaveTimer = setInterval(() => this.autoSave(), AUTO_SAVE_INTERVAL_MS);
    }
  }

  /**
   * Record a game engine event.
   */
  record(event: GameEvent): void {
    if (this.stopped) return;

    const entry: LogEntry = {
      seq: this.seq++,
      ts: Date.now() - this.startMs,
      event: event.type,
      detail: describeEvent(event),
      raw: { ...event } as any,
    };
    this.events.push(entry);

    // Take a full snapshot on key structural events
    if (SNAPSHOT_EVENTS.has(event.type)) {
      this.takeSnapshot();
    }
  }

  /** Take a full game state snapshot. */
  takeSnapshot(): void {
    if (this.stopped) return;
    try {
      const state = this.getState();
      this.snapshots.push(buildFullSnapshot(state, Date.now() - this.startMs));
    } catch { /* engine not ready yet */ }
  }

  /** Auto-save to localStorage (called every 30s). */
  private autoSave(): void {
    if (this.stopped) return;
    // Take a periodic snapshot
    this.takeSnapshot();
    this.saveToStorage();
  }

  /** Save current log to localStorage without stopping. */
  private saveToStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const log = this.buildLog();
      const json = JSON.stringify(log, null, 2);
      localStorage.setItem(this.storageKey, json);
    } catch { /* storage full or unavailable */ }
  }

  /** Stop logging, save final state, and download. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.meta.endedAt = new Date().toISOString();

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Final snapshot
    try {
      const state = this.getState();
      this.snapshots.push(buildFullSnapshot(state, Date.now() - this.startMs));
    } catch { /* engine may be gone */ }

    // Save and download
    if (typeof window !== 'undefined') {
      const log = this.buildLog();
      const json = JSON.stringify(log, null, 2);

      try { localStorage.setItem(this.storageKey, json); } catch { /* */ }

      const filename = `session_${this.meta.roomCode}_${this.meta.startedAt.replace(/[:.]/g, '-')}.json`;
      downloadJSON(json, filename);
      console.log(`[GameLogger] Session log saved: ${filename} (${this.events.length} events, ${this.snapshots.length} snapshots)`);
    }
  }

  /** Build the full log object. */
  private buildLog(): SessionLog {
    return {
      meta: { ...this.meta },
      events: this.events,
      snapshots: this.snapshots,
    };
  }

  /** Get the log without stopping (for console inspection). */
  getLog(): SessionLog {
    return this.buildLog();
  }

  get entryCount(): number { return this.events.length; }

  /** Alias for stop() — backwards compatibility. */
  flush(): void { this.stop(); }
}

// ─────────────────────────────────────────────
// SNAPSHOT BUILDERS
// ─────────────────────────────────────────────

// Events that warrant a full snapshot
const SNAPSHOT_EVENTS = new Set([
  'TURN_STARTED', 'UNIT_PLACED', 'UNIT_DIED', 'UNIT_ATTACKED',
  'UNIT_MOVED', 'UNIT_TRANSFORMED', 'AURA_APPLIED', 'GAME_OVER',
  'LEG_GAINED', 'LEG_SPENT', 'LEG_RATE_CHANGED',
]);

function buildFullSnapshot(state: GameStateSnapshot, ts: number): FullSnapshot {
  const units: UnitSnap[] = [];
  for (const cell of state.board) {
    if (!cell.unit) continue;
    const u = cell.unit;
    units.push({
      instanceId: u.instanceId,
      cardId: u.cardId,
      name: cardName(u.cardId),
      owner: u.owner,
      col: cell.col,
      row: cell.row,
      baseAtk: u.baseAtk,
      currentAtk: u.currentAtk,
      currentDef: u.currentDef,
      maxDef: u.maxDef,
      isActive: u.isActive,
      hasMoved: u.hasMoved,
      hasActed: u.hasActed,
      activeBuffs: u.activeBuffs ?? [],
    });
  }

  const players: [PlayerSnap, PlayerSnap] = [
    buildPlayerSnap(state.players[0], state.modifiers[0]),
    buildPlayerSnap(state.players[1], state.modifiers[1]),
  ];

  return {
    ts,
    turn: state.turn?.turnNumber ?? 0,
    phase: state.turn?.phase ?? 'UNKNOWN',
    activePlayer: state.turn?.activePlayer ?? 0,
    units,
    players,
  };
}

function buildPlayerSnap(ps: PlayerStateSnapshot, mod: GameModifiers): PlayerSnap {
  const effectiveRate = Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
  return {
    player: ps.player,
    hand: [...ps.hand],
    handNames: ps.hand.map(id => cardName(id)),
    handCount: ps.hand.length,
    deckCount: ps.deckCount,
    discardCount: ps.discardCount,
    leg: mod.legPool,
    legRate: mod.legRateFrozen ? 0 : effectiveRate,
    legRateBase: mod.legRateBase,
    legRateBonus: mod.legRateBonus,
    legRatePenalty: mod.legRatePenalty,
    crownDiscount: mod.royalCostDiscount,
    crownPenalty: mod.royalCostPenalty,
  };
}

// ─────────────────────────────────────────────
// EVENT DESCRIPTION — human-readable summaries
// ─────────────────────────────────────────────

function cardName(cardId: string): string {
  try { return getCard(cardId).name; } catch { return cardId; }
}

function playerLabel(p: number): string {
  return p === 0 ? 'P1' : 'P2';
}

function describeEvent(e: GameEvent): string {
  switch (e.type) {
    case 'TURN_STARTED':
      return `Turn ${e.turn} — ${playerLabel(e.activePlayer)}'s turn`;
    case 'PHASE_CHANGED':
      return `Phase → ${e.phase} (${playerLabel(e.activePlayer)}, turn ${e.turn})`;

    case 'CARD_DRAWN':
      return `${playerLabel(e.player)} drew ${cardName(e.cardId)} (hand[${e.handIndex}], deck: ${e.deckRemaining})`;
    case 'CARD_PLAYED':
      return `${playerLabel(e.player)} played ${cardName(e.cardId)} (cost ${e.legCost})`;
    case 'CARD_DISCARDED':
      return `${playerLabel(e.player)} discarded ${cardName(e.cardId)}`;

    case 'UNIT_PLACED':
      return `${playerLabel(e.owner)} placed ${cardName(e.cardId)} [${e.instanceId}] at (${e.col},${e.row})${e.isActive ? '' : ' [BUILD_DELAY]'}`;
    case 'UNIT_MOVED':
      return `${playerLabel(e.owner)} moved ${cardName(e.cardId)} [${e.instanceId}] (${e.from.col},${e.from.row}) → (${e.to.col},${e.to.row})`;
    case 'UNIT_ATTACKED': {
      let desc = `[${e.attackerInstanceId}] attacked [${e.targetInstanceId}] at (${e.targetCol},${e.targetRow}) — ${e.damage} dmg → HP ${e.targetNewHP}${e.isKingHit ? ' [KING HIT]' : ''}`;
      if (e.breakdown) {
        const b = e.breakdown;
        const parts: string[] = [`base:${b.baseAtk}`];
        if (b.cavalryCounter) parts.push(`cavalry:+${b.cavalryCounter}`);
        if (b.backstabBonus) parts.push(`backstab:+${b.backstabBonus}`);
        if (b.ambushBonus) parts.push(`ambush:+${b.ambushBonus}`);
        if (b.auraBuffs.length > 0) {
          for (const buff of b.auraBuffs) {
            if (buff.atkDelta !== 0) parts.push(`${buff.source}:atk${buff.atkDelta > 0 ? '+' : ''}${buff.atkDelta}`);
          }
        }
        desc += ` (${parts.join(', ')})`;
      }
      return desc;
    }
    case 'UNIT_DIED':
      return `${cardName(e.cardId)} [${e.instanceId}] (${playerLabel(e.owner)}) died at (${e.col},${e.row}) — cause: ${e.cause}`;
    case 'UNIT_HEALED':
      return `${cardName(e.cardId)} [${e.instanceId}] healed +${e.amount} → HP ${e.newHP}/${e.maxHP}`;
    case 'UNIT_TRANSFORMED':
      return `${cardName(e.fromCardId)} [${e.oldInstanceId}] → ${cardName(e.toCardId)} [${e.newInstanceId}] at (${e.col},${e.row})`;

    case 'LEG_GAINED':
      return `${playerLabel(e.player)} gained ${e.amount} LEG (total: ${e.total}, rate: ${e.rate})`;
    case 'LEG_SPENT':
      return `${playerLabel(e.player)} spent ${e.amount} LEG (remaining: ${e.remaining})`;
    case 'LEG_STOLEN':
      return `${playerLabel(e.from)} → ${playerLabel(e.to)}: stole ${e.amount} LEG`;
    case 'LEG_RATE_CHANGED':
      return `${playerLabel(e.player)} LEG rate ${e.oldRate} → ${e.newRate} (${e.reason})`;

    case 'AURA_APPLIED': {
      if (e.changes.length === 0) return 'Auras recalculated (no stat changes)';
      const parts = e.changes.map(c => {
        let s = `[${c.instanceId}] atk${c.atkDelta >= 0 ? '+' : ''}${c.atkDelta} def${c.defDelta >= 0 ? '+' : ''}${c.defDelta} mov${c.moveDelta >= 0 ? '+' : ''}${c.moveDelta}`;
        if (c.buffs && c.buffs.length > 0) {
          const sources = c.buffs.map(b => b.source).join(', ');
          s += ` [from: ${sources}]`;
        }
        return s;
      });
      return `Auras: ${parts.join(', ')}`;
    }

    case 'PENDING_TARGET':
      return `Awaiting target selection: ${e.reason}`;
    case 'PENDING_POSITION':
      return `Awaiting position selection: ${e.reason}`;
    case 'INTERACTION_RESOLVED':
      return `Interaction resolved${e.cancelled ? ' (cancelled)' : ''}`;

    case 'GAME_OVER':
      return `GAME OVER — ${playerLabel(e.result.winner)} wins (${e.result.reason}, ${e.result.turns} turns)`;

    default:
      return e.type;
  }
}

// ─────────────────────────────────────────────
// FILE DOWNLOAD (browser)
// ─────────────────────────────────────────────

function downloadJSON(json: string, filename: string): void {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  } catch { /* non-browser environment */ }
}
