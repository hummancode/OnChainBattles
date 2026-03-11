// ============================================================
// IBoard.ts
// Interface for the game board — Dependency Inversion.
// Consumers depend on this interface, not the concrete Board.
// ============================================================

import type { Unit, BoardCell, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';

export interface IBoard {
  readonly cols: number;
  readonly rows: number;

  // READ QUERIES
  getCell(col: number, row: number): BoardCell;
  getUnit(col: number, row: number): Unit | null;
  getUnitById(instanceId: string): Unit | null;
  isEmpty(col: number, row: number): boolean;
  isInBounds(col: number, row: number): boolean;
  isOwnHalf(col: number, row: number, player: Player): boolean;
  getUnitsOf(player: Player): Unit[];
  getKing(player: Player): Unit | null;
  getStructures(player?: Player): Unit[];
  getAllUnits(): Unit[];
  getCells(): BoardCell[];
  getAdjacentUnits(col: number, row: number): Unit[];
  getHVAdjacentUnits(col: number, row: number): Unit[];
  getFreeSquaresInHalf(player: Player): Position[];
  getUnitsInColumn(col: number): Unit[];

  // MUTATIONS
  placeUnit(unit: Unit): void;
  removeUnit(instanceId: string): Unit | null;
  moveUnit(instanceId: string, toCol: number, toRow: number): void;
  updateUnitStats(instanceId: string, updates: Partial<Unit>): void;
  resetTurnFlags(player: Player): void;

  // SERIALIZATION
  serialize(): Array<{ col: number; row: number; unit: Unit | null }>;
  clear(): void;
}
