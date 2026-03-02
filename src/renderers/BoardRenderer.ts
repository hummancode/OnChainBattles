// ============================================================
// BoardRenderer.ts
// Renders the tactical game board.
//
// ALL positions and sizes come from layout.grid:
//   cellSize, originX, originY, cols, rows
// ALL colors come from theme.board
//
// Change grid.cellSize in JSON → board rescales automatically.
// Change grid.cols/rows → board resizes.
// No hardcoded pixel values.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CellRenderData, CardRenderData } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { CardRenderer } from './CardRenderer';

type HighlightType = 'none' | 'move' | 'attack' | 'aura' | 'selected' | 'hover';

export class BoardRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;
  private cardRenderer: CardRenderer;

  // Phaser containers
  private rootContainer: Phaser.GameObjects.Container;
  private cellContainer: Phaser.GameObjects.Container;    // Static grid
  private highlightContainer: Phaser.GameObjects.Container; // Move/attack highlights
  private unitContainer: Phaser.GameObjects.Container;    // Unit thumbnails
  private overlayContainer: Phaser.GameObjects.Container; // Hover, selection overlays
  private coordContainer: Phaser.GameObjects.Container;   // A-F / 1-6 labels

  // State
  private cellGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private unitContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private highlights: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private hoveredCell: string | null = null;
  private selectedCell: string | null = null;

  private unsubs: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
    this.cardRenderer = new CardRenderer(scene, layout, theme);

    // Build container hierarchy
    this.rootContainer      = scene.add.container(0, 0);
    this.cellContainer      = scene.add.container(0, 0);
    this.highlightContainer = scene.add.container(0, 0);
    this.unitContainer      = scene.add.container(0, 0);
    this.overlayContainer   = scene.add.container(0, 0);
    this.coordContainer     = scene.add.container(0, 0);

    this.rootContainer.add([
      this.cellContainer,
      this.highlightContainer,
      this.unitContainer,
      this.overlayContainer,
      this.coordContainer,
    ]);

    this.buildGrid();
    this.buildCoords();
    this.buildHalfTints();
    this.attachEventListeners();
  }
  // Add field to BoardRenderer class:
private localPlayerIndex: number = 0;

// Add public setter:
setLocalPlayer(index: number): void {
  this.localPlayerIndex = index;
}

// Add private helper:
private mirrorRow(row: number): number {
  if (this.localPlayerIndex === 1) {
    return (this.layout.grid.rows - 1) - row;
  }
  return row;
}
  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Place a unit thumbnail on the board at (col, row). */
  renderUnit(data: CardRenderData, col: number, row: number): void {
    const key = this.cellKey(col, row);
    this.clearUnit(col, row);

    const L = this.layout.cards.thumbnail;
    const g = this.layout.grid;
    const cx = g.originX + col * g.cellSize + (g.cellSize - L.width) / 2;
    const displayRow = this.mirrorRow(row);
    const cy = g.originY + displayRow * g.cellSize + (g.cellSize - L.height) / 2;

    const unit = this.cardRenderer.render(data, 'thumbnail', cx, cy);
    unit.setName(key);

    // Add interactivity for selection
    unit.setSize(L.width, L.height);
    unit.setInteractive();
    unit.on('pointerover', () => this.onCellHover(col, row));
    unit.on('pointerout',  () => this.onCellHoverEnd(col, row));
    unit.on('pointerdown', () => EventBus.emit(EV.SELECTION_CHANGED, { col, row, source: 'board' }));

    this.unitContainer.add(unit);
    this.unitContainers.set(key, unit);
  }

  /** Remove a unit thumbnail from a cell. */
  clearUnit(col: number, row: number): void {
    const key = this.cellKey(col, row);
    const existing = this.unitContainers.get(key);
    if (existing) {
      existing.destroy();
      this.unitContainers.delete(key);
    }
  }

  /** Clear all units from the board. */
  clearAllUnits(): void {
    this.unitContainers.forEach(c => c.destroy());
    this.unitContainers.clear();
  }

  /** Update unit state overlay (exhausted, selected) without full re-render. */
  updateUnitState(col: number, row: number, data: CardRenderData): void {
    const key = this.cellKey(col, row);
    const container = this.unitContainers.get(key);
    if (container) {
      this.cardRenderer.updateState(container, data, 'thumbnail');
    }
  }

  /** Show move-valid highlights on listed cells. */
  highlightMoves(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('move');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'move'));
  }

  /** Show attack-valid highlights on listed cells. */
  highlightAttacks(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('attack');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'attack'));
  }

  /** Show aura range highlights. */
  highlightAuras(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('aura');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'aura'));
  }

  /** Set which cell is the current selection. */
  setSelected(col: number | null, row: number | null): void {
    // Clear old
    if (this.selectedCell) {
      this.clearHighlightType('selected');
    }

    if (col !== null && row !== null) {
      this.selectedCell = this.cellKey(col, row);
      this.addHighlight(col, row, 'selected');
    } else {
      this.selectedCell = null;
    }
  }

  /** Clear all highlights of all types. */
  clearAllHighlights(): void {
    this.highlights.forEach(g => g.destroy());
    this.highlights.clear();
    this.selectedCell = null;
  }

  /** Clear highlights of a specific type only. */
  clearHighlightType(type: HighlightType): void {
    const toRemove: string[] = [];
    this.highlights.forEach((g, key) => {
      if (key.endsWith(`_${type}`)) {
        g.destroy();
        toRemove.push(key);
      }
    });
    toRemove.forEach(k => this.highlights.delete(k));
  }

  /** Full board redraw from a cell data array. */
  redrawBoard(cells: CellRenderData[]): void {
    this.clearAllUnits();
    this.clearAllHighlights();
    cells.forEach(cell => {
      if (cell.unit) {
        this.renderUnit(cell.unit, cell.col, cell.row);
      }
      if (cell.highlight !== 'none') {
        this.addHighlight(cell.col, cell.row, cell.highlight);
      }
    });
  }

  /** Animate a unit moving from one cell to another. */
  animateUnitMove(
    from: { col: number; row: number },
    to: { col: number; row: number },
    onComplete?: () => void
  ): void {
    const key = this.cellKey(from.col, from.row);
    const unit = this.unitContainers.get(key);
    if (!unit) { onComplete?.(); return; }

    const g = this.layout.grid;
    const L = this.layout.cards.thumbnail;
    const targetX = g.originX + to.col * g.cellSize + (g.cellSize - L.width) / 2;
    const targetY = g.originY + to.row * g.cellSize + (g.cellSize - L.height) / 2;

    this.scene.tweens.add({
      targets: unit,
      x: targetX,
      y: targetY,
      duration: 220,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        // Update key tracking
        this.unitContainers.delete(key);
        this.unitContainers.set(this.cellKey(to.col, to.row), unit);
        unit.setName(this.cellKey(to.col, to.row));
        onComplete?.();
      },
    });
  }

  /** Animate attack flash (red tint on target cell). */
  animateAttack(
    from: { col: number; row: number },
    target: { col: number; row: number },
    onComplete?: () => void
  ): void {
    const g = this.layout.grid;
    const flash = this.scene.add.graphics();
    flash.fillStyle(0xFF4444, 0.5);
    flash.fillRect(
      g.originX + target.col * g.cellSize,
      g.originY + target.row * g.cellSize,
      g.cellSize,
      g.cellSize
    );
    this.overlayContainer.add(flash);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        flash.destroy();
        onComplete?.();
      },
    });
  }

  /** Show floating damage number above a cell. */
  showDamageNumber(col: number, row: number, amount: number, isHeal = false): void {
    const g = this.layout.grid;
    const cx = g.originX + col * g.cellSize + g.cellSize / 2;
    const cy = g.originY + row * g.cellSize + g.cellSize / 2;

    const color = isHeal ? '#00FF88' : '#FF4444';
    const label = isHeal ? `+${amount}` : `-${amount}`;

    const txt = this.scene.add.text(cx, cy, label, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${Math.round(g.cellSize * 0.2)}px`,
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    this.overlayContainer.add(txt);

    this.scene.tweens.add({
      targets: txt,
      y: cy - g.cellSize * 0.5,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.rootContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — GRID BUILD
  // ─────────────────────────────────────────────

  private buildGrid(): void {
    const g = this.layout.grid;
    const T = this.theme.board;

    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const px = g.originX + col * g.cellSize;
        const py = g.originY + row * g.cellSize;
        const isEven = (col + row) % 2 === 0;

        const cell = this.scene.add.graphics();
        const fillHex = isEven ? T.cellEvenFill : T.cellOddFill;
        cell.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
        cell.fillRect(px, py, g.cellSize, g.cellSize);

        // Grid line
        cell.lineStyle(g.gridLineWidth, ThemeLoader.hexToNum(T.gridLineColor), 1);
        cell.strokeRect(px, py, g.cellSize, g.cellSize);

        // Interactivity for empty cells
        cell.setInteractive(
          new Phaser.Geom.Rectangle(px, py, g.cellSize, g.cellSize),
          Phaser.Geom.Rectangle.Contains
        );
        cell.on('pointerover', () => this.onCellHover(col, row));
        cell.on('pointerout',  () => this.onCellHoverEnd(col, row));
        cell.on('pointerdown', () => EventBus.emit(EV.SELECTION_CHANGED, { col, row, source: 'board' }));

        this.cellContainer.add(cell);
        this.cellGraphics.set(this.cellKey(col, row), cell);
      }
    }
  }

  /** Player / enemy half tints — subtle color overlay on each half */
  private buildHalfTints(): void {
    const g = this.layout.grid;
    const T = this.theme.board;

    const playerHalf = ThemeLoader.hexToColorAlpha(T.playerHalfTint);
    const enemyHalf  = ThemeLoader.hexToColorAlpha(T.enemyHalfTint);

    const halfRows = Math.floor(g.rows / 2);

    // Player half = bottom rows (own side)
    const playerTint = this.scene.add.graphics();
    playerTint.fillStyle(playerHalf.color, playerHalf.alpha);
    playerTint.fillRect(
      g.originX,
      g.originY + halfRows * g.cellSize,
      g.cols * g.cellSize,
      halfRows * g.cellSize
    );

    // Enemy half = top rows
    const enemyTint = this.scene.add.graphics();
    enemyTint.fillStyle(enemyHalf.color, enemyHalf.alpha);
    enemyTint.fillRect(
      g.originX,
      g.originY,
      g.cols * g.cellSize,
      halfRows * g.cellSize
    );

    // Insert tints above cell graphics but below highlights
    this.cellContainer.add([playerTint, enemyTint]);
  }

  private buildCoords(): void {
    if (!this.layout.grid.coordsVisible) return;

    const g = this.layout.grid;
    const T = this.theme.board;
    const fontSize = `${g.coordsFontSize}px`;
    const fontConfig = {
      fontFamily: this.theme.fonts.coordLabel.family,
      fontSize,
      color: T.coordColor,
    };

    const colLabels = 'ABCDEFGHIJKL'.slice(0, g.cols);

    // Column labels (A-F) above the grid
    for (let col = 0; col < g.cols; col++) {
      const cx = g.originX + col * g.cellSize + g.cellSize / 2;
      const cy = g.originY - g.coordsFontSize - 2;
      const lbl = this.scene.add.text(cx, cy, colLabels[col], fontConfig).setOrigin(0.5, 0.5);
      this.coordContainer.add(lbl);
    }

    // Row labels (1-6) left of the grid
    for (let row = 0; row < g.rows; row++) {
      const rx = g.originX - g.coordsFontSize - 2;
      const ry = g.originY + row * g.cellSize + g.cellSize / 2;
      const lbl = this.scene.add.text(rx, ry, String(row + 1), fontConfig).setOrigin(0.5, 0.5);
      this.coordContainer.add(lbl);
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — HIGHLIGHTS
  // ─────────────────────────────────────────────

  private addHighlight(col: number, row: number, type: HighlightType): void {
    const key = `${this.cellKey(col, row)}_${type}`;
    if (this.highlights.has(key)) return;

    const g = this.layout.grid;
    const T = this.theme.board;

    const px = g.originX + col * g.cellSize;
    const py = g.originY + row * g.cellSize;

    const gfx = this.scene.add.graphics();

    switch (type) {
      case 'move': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellValidMove);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
      case 'attack': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellValidAtk);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(px, py, g.cellSize, g.cellSize);
        // Inner X marker
        gfx.lineStyle(2, ThemeLoader.hexToNum('#FF4444'), 0.6);
        gfx.lineBetween(px + 8, py + 8, px + g.cellSize - 8, py + g.cellSize - 8);
        gfx.lineBetween(px + g.cellSize - 8, py + 8, px + 8, py + g.cellSize - 8);
        break;
      }
      case 'aura': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellAura);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
      case 'selected': {
        gfx.lineStyle(3, ThemeLoader.hexToNum(T.cellSelected), 1);
        gfx.strokeRect(px + 1, py + 1, g.cellSize - 2, g.cellSize - 2);
        break;
      }
      case 'hover': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellHover);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
    }

    this.highlightContainer.add(gfx);
    this.highlights.set(key, gfx);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — INTERACTION
  // ─────────────────────────────────────────────

  private onCellHover(col: number, row: number): void {
    if (this.hoveredCell) {
      this.clearHighlightType('hover');
    }
    this.hoveredCell = this.cellKey(col, row);
    this.addHighlight(col, row, 'hover');
    EventBus.emit(EV.CARD_HOVERED, { col, row });
  }

  private onCellHoverEnd(col: number, row: number): void {
    this.clearHighlightType('hover');
    this.hoveredCell = null;
    EventBus.emit(EV.CARD_HOVER_END, { col, row });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.UNIT_PLACED, ({ data, col, row }) => {
        this.renderUnit(data, col, row);
      }),

      EventBus.on(EV.UNIT_MOVED, ({ data, from, to }) => {
        this.animateUnitMove(from, to, () => {
          this.clearUnit(from.col, from.row);
          this.renderUnit(data, to.col, to.row);
        });
      }),

      EventBus.on(EV.UNIT_ATTACKED, ({ from, target, damage }) => {
        this.animateAttack(from, target, () => {
          if (damage) this.showDamageNumber(target.col, target.row, damage);
        });
      }),

      EventBus.on(EV.UNIT_DIED, ({ col, row }) => {
        this.clearUnit(col, row);
      }),

      EventBus.on(EV.UNIT_HEALED, ({ col, row, amount }) => {
        this.showDamageNumber(col, row, amount, true);
      }),

      EventBus.on(EV.HIGHLIGHTS_CHANGED, ({ moves, attacks, auras }) => {
        this.clearAllHighlights();
        if (moves)   this.highlightMoves(moves);
        if (attacks) this.highlightAttacks(attacks);
        if (auras)   this.highlightAuras(auras);
      }),

      EventBus.on(EV.UNIT_EXHAUSTED, ({ col, row, data }) => {
        this.updateUnitState(col, row, { ...data, isExhausted: true });
      }),

      EventBus.on(EV.UNIT_REFRESHED, ({ col, row, data }) => {
        this.updateUnitState(col, row, { ...data, isExhausted: false });
      }),
    );
  }

  // ─────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────

  private cellKey(col: number, row: number): string {
    return `${col}_${row}`;
  }
}

// Patch ThemeLoader with static helpers for BoardRenderer's direct calls
ThemeLoader.hexToNum = function(hex: string): number {
  return parseInt(hex.replace('#', '').slice(0, 6), 16);
};
ThemeLoader.hexToColorAlpha = function(hex: string): { color: number; alpha: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    return {
      color: parseInt('0x' + clean.slice(0, 6), 16),
      alpha: parseInt(clean.slice(6, 8), 16) / 255,
    };
  }
  return { color: parseInt('0x' + clean, 16), alpha: 1.0 };
};
