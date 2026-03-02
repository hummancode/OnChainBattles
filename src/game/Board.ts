// ============================================================
// Board.ts
// 6×6 (or any cols×rows) grid state.
// Pure TypeScript — zero Phaser imports.
// Stores Unit objects on a 2D grid.
// All mutations go through Board methods.
// ============================================================

import type { Unit, BoardCell, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';

export class Board {
  readonly cols: number;
  readonly rows: number;
  private cells: BoardCell[][];
  private unitIndex: Map<string, Unit> = new Map(); // instanceId → Unit

  constructor(cols = 6, rows = 6) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.cells[r][c] = { col: c, row: r, unit: null };
      }
    }
  }

  // ─────────────────────────────────────────────
  // READ QUERIES
  // ─────────────────────────────────────────────

  getCell(col: number, row: number): BoardCell {
    this.assertInBounds(col, row);
    return this.cells[row][col];
  }

  getUnit(col: number, row: number): Unit | null {
    return this.getCell(col, row).unit;
  }

  getUnitById(instanceId: string): Unit | null {
    return this.unitIndex.get(instanceId) ?? null;
  }

  isEmpty(col: number, row: number): boolean {
    return this.getCell(col, row).unit === null;
  }

  isInBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  /** P1 owns rows 0..(halfRows-1). P2 owns halfRows..(rows-1). */
  isOwnHalf(col: number, row: number, player: Player): boolean {
    const half = Math.floor(this.rows / 2);
    return player === Player.P1 ? row < half : row >= half;
  }

  /** Returns all units belonging to a player. */
  getUnitsOf(player: Player): Unit[] {
    return Array.from(this.unitIndex.values()).filter(u => u.owner === player);
  }

  /** Returns the King unit for a player, or null if dead. */
  getKing(player: Player): Unit | null {
    return this.getUnitsOf(player).find(u => u.cardId === 'king') ?? null;
  }

  /** Returns all structure units (STATIC subtype) on the board. */
  getStructures(player?: Player): Unit[] {
    const all = Array.from(this.unitIndex.values()).filter(u =>
      ['castle', 'temple', 'village'].includes(u.cardId)
    );
    return player !== undefined ? all.filter(u => u.owner === player) : all;
  }

  /** Returns all units. */
  getAllUnits(): Unit[] {
    return Array.from(this.unitIndex.values());
  }

  /** Returns all cells as a flat array (for serialization). */
  getCells(): BoardCell[] {
    const out: BoardCell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        out.push(this.cells[r][c]);
      }
    }
    return out;
  }

  /** Get units adjacent to a position (4 cardinal + 4 diagonal = up to 8). */
  getAdjacentUnits(col: number, row: number): Unit[] {
    const units: Unit[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (this.isInBounds(nc, nr)) {
          const u = this.cells[nr][nc].unit;
          if (u) units.push(u);
        }
      }
    }
    return units;
  }

  /** Get units adjacent using HV only (4 cardinal). */
  getHVAdjacentUnits(col: number, row: number): Unit[] {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const units: Unit[] = [];
    for (const [dc, dr] of dirs) {
      const nc = col + dc, nr = row + dr;
      if (this.isInBounds(nc, nr)) {
        const u = this.cells[nr][nc].unit;
        if (u) units.push(u);
      }
    }
    return units;
  }

  /** Get all free squares in a player's half. */
  getFreeSquaresInHalf(player: Player): Position[] {
    const half = Math.floor(this.rows / 2);
    const result: Position[] = [];
    const startRow = player === Player.P1 ? 0 : half;
    const endRow   = player === Player.P1 ? half : this.rows;
    for (let r = startRow; r < endRow; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c].unit === null) {
          result.push({ col: c, row: r });
        }
      }
    }
    return result;
  }

  /** Get all units in a specific column. */
  getUnitsInColumn(col: number): Unit[] {
    const units: Unit[] = [];
    for (let r = 0; r < this.rows; r++) {
      const u = this.cells[r][col].unit;
      if (u) units.push(u);
    }
    return units;
  }

  // ─────────────────────────────────────────────
  // MUTATIONS
  // ─────────────────────────────────────────────

  /** Place a unit on the board. Throws if cell is occupied. */
  placeUnit(unit: Unit): void {
    const { col, row } = unit.position;
    this.assertInBounds(col, row);
    if (this.cells[row][col].unit !== null) {
      throw new Error(`[Board] Cell (${col},${row}) is already occupied`);
    }
    this.cells[row][col].unit = unit;
    this.unitIndex.set(unit.instanceId, unit);
  }

  /** Remove a unit from the board (death, capture, return). */
  removeUnit(instanceId: string): Unit | null {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) return null;
    const { col, row } = unit.position;
    this.cells[row][col].unit = null;
    this.unitIndex.delete(instanceId);
    return unit;
  }

  /**
   * Move a unit from its current position to a new position.
   * Throws if target cell is occupied or unit not found.
   */
  moveUnit(instanceId: string, toCol: number, toRow: number): void {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) throw new Error(`[Board] Unit ${instanceId} not found`);
    this.assertInBounds(toCol, toRow);
    if (this.cells[toRow][toCol].unit !== null) {
      throw new Error(`[Board] Target cell (${toCol},${toRow}) is occupied`);
    }

    // Clear old cell
    this.cells[unit.position.row][unit.position.col].unit = null;

    // Update unit position
    unit.position = { col: toCol, row: toRow };

    // Set new cell
    this.cells[toRow][toCol].unit = unit;
  }

  /**
   * Directly update a unit's stats in place.
   * Used by AuraSystem after recalculation.
   */
  updateUnitStats(instanceId: string, updates: Partial<Unit>): void {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) return;
    Object.assign(unit, updates);
  }

  /** Reset all units' turn flags (hasMoved, hasActed). Called at START of each turn. */
  resetTurnFlags(player: Player): void {
    this.getUnitsOf(player).forEach(u => {
      u.hasMoved = false;
      u.hasActed = false;
      // Treason exhausted flag clears at end of opponent turn
    });
  }

  // ─────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────

  /** Returns a plain-object snapshot (for network sync, state inspection). */
  serialize(): Array<{ col: number; row: number; unit: Unit | null }> {
    return this.getCells().map(cell => ({
      col: cell.col,
      row: cell.row,
      unit: cell.unit ? { ...cell.unit } : null, // Shallow copy
    }));
  }

  /** Clear the entire board. Used for game reset. */
  clear(): void {
    this.unitIndex.clear();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.cells[r][c].unit = null;
      }
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────

  private assertInBounds(col: number, row: number): void {
    if (!this.isInBounds(col, row)) {
      throw new Error(`[Board] Out of bounds: (${col},${row})`);
    }
  }
}
