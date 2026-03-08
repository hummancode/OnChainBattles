// ============================================================
// BoardRenderer.ts v0.5 — Dual-index OOP refactor
//
// Two maps index thumbnails:
//   unitsByCell:  "col_row"    → UnitThumbnail (position-based)
//   unitsById:    instanceId   → UnitThumbnail (identity-based)
//
// Why: During a tween (220ms), the cell key is stale but the
// instanceId always resolves. Stats update by instanceId.
//
// UNIT_MOVED: tween re-keys only — NO destroy+recreate.
// UNIT_STATS_CHANGED: looks up by instanceId — works mid-tween.
// UNIT_DIED: looks up by instanceId — works mid-tween.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CellRenderData, CardRenderData } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { UnitThumbnail } from './UnitThumbnail';
import { setContainerHitArea } from '../utils/PhaserUtils';

type HighlightType = 'none' | 'move' | 'attack' | 'attackRange' | 'aura' | 'selected' | 'hover';

export class BoardRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  private rootContainer: Phaser.GameObjects.Container;
  private cellContainer: Phaser.GameObjects.Container;
  private highlightContainer: Phaser.GameObjects.Container;
  private unitContainer: Phaser.GameObjects.Container;
  private attackMarkerContainer: Phaser.GameObjects.Container;
  private overlayContainer: Phaser.GameObjects.Container;
  private coordContainer: Phaser.GameObjects.Container;

  // ── DUAL-INDEX ──
  private unitsByCell: Map<string, UnitThumbnail> = new Map();
  private unitsById: Map<string, UnitThumbnail> = new Map();

  private cellGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private highlights: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private hoveredCell: string | null = null;
  private selectedCell: string | null = null;
  private localPlayerIndex: number = 0;
  private unsubs: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON, localPlayerIndex: number) {
    this.localPlayerIndex = localPlayerIndex;
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;

    this.rootContainer         = scene.add.container(0, 0);
    this.cellContainer         = scene.add.container(0, 0);
    this.highlightContainer    = scene.add.container(0, 0);
    this.unitContainer         = scene.add.container(0, 0);
    this.attackMarkerContainer = scene.add.container(0, 0);
    this.overlayContainer      = scene.add.container(0, 0);
    this.coordContainer        = scene.add.container(0, 0);

    this.cellContainer.setDepth(1);
    this.highlightContainer.setDepth(3);
    this.unitContainer.setDepth(5);
    this.attackMarkerContainer.setDepth(7);
    this.overlayContainer.setDepth(8);

    this.rootContainer.add([
      this.cellContainer, this.highlightContainer, this.unitContainer,
      this.attackMarkerContainer, this.overlayContainer, this.coordContainer,
    ]);

    this.buildGrid();
    this.buildCoords();
    this.buildHalfTints();
    this.attachEventListeners();
  }

  setLocalPlayer(index: number): void { this.localPlayerIndex = index; }

  private mirrorRow(row: number): number {
    return this.localPlayerIndex === 0 ? (this.layout.grid.rows - 1) - row : row;
  }

  // ─────────────────────────────────────────────
  // UNIT MANAGEMENT — dual-indexed
  // ─────────────────────────────────────────────

  renderUnit(data: CardRenderData, col: number, row: number): void {
    // Clear any existing thumbnail at this cell
    this.clearUnitByCell(col, row);

    const g = this.layout.grid;
    const L = this.layout.cards.thumbnail;
    const displayRow = this.mirrorRow(row);
    const cx = g.originX + col * g.cellSize + (g.cellSize - L.width) / 2;
    const cy = g.originY + displayRow * g.cellSize + (g.cellSize - L.height) / 2;

const thumb = new UnitThumbnail(this.scene, this.layout, this.theme, data, cx, cy);
    thumb.col = col;   // Set logical position
    thumb.row = row;

    // Interactivity — read col/row from thumbnail (survives moves)
    setContainerHitArea(thumb.container, L.width, L.height);
    thumb.container.on('pointerover', () => this.onCellHover(thumb.col, thumb.row));
    thumb.container.on('pointerout',  () => this.onCellHoverEnd(thumb.col, thumb.row));
    thumb.container.on('pointerdown', () => EventBus.emit(EV.INPUT_BOARD_CLICK, { col: thumb.col, row: thumb.row }));

    this.unitContainer.add(thumb.container);

    // Index in BOTH maps
    this.unitsByCell.set(this.cellKey(col, row), thumb);
    this.unitsById.set(thumb.instanceId, thumb);
  }

  /** Remove thumbnail by cell position. */
  clearUnitByCell(col: number, row: number): void {
    const key = this.cellKey(col, row);
    const thumb = this.unitsByCell.get(key);
    if (thumb) {
      this.unitsByCell.delete(key);
      this.unitsById.delete(thumb.instanceId);
      thumb.destroy();
    }
  }

  /** Remove thumbnail by instanceId — works even during tween. */
  clearUnitById(instanceId: string): void {
    const thumb = this.unitsById.get(instanceId);
    if (!thumb) return;
    this.unitsById.delete(instanceId);
    // Also remove from cell map
    for (const [key, t] of this.unitsByCell) {
      if (t === thumb) { this.unitsByCell.delete(key); break; }
    }
    thumb.destroy();
  }

  clearAllUnits(): void {
    this.unitsByCell.forEach(t => t.destroy());
    this.unitsByCell.clear();
    this.unitsById.clear();
  }

  /** Update stats by instanceId — always resolves, even mid-tween. */
  updateStatsByInstanceId(instanceId: string, atk: number | undefined, currentHP: number | undefined, maxHP: number | undefined, canAct: boolean): void {
    const thumb = this.unitsById.get(instanceId);
    if (thumb) thumb.updateStats(atk, currentHP, maxHP, canAct);
  }

  // ─────────────────────────────────────────────
  // HIGHLIGHTS
  // ─────────────────────────────────────────────

  highlightMoves(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('move');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'move'));
  }

  highlightAttacks(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('attack');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'attack'));
  }

  highlightAuras(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('aura');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'aura'));
  }

  highlightAttackRange(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('attackRange');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'attackRange'));
  }

  setSelected(col: number | null, row: number | null): void {
    if (this.selectedCell) this.clearHighlightType('selected');
    if (col !== null && row !== null) {
      this.selectedCell = this.cellKey(col, row);
      this.addHighlight(col, row, 'selected');
    } else {
      this.selectedCell = null;
    }
  }

  clearAllHighlights(): void {
    this.highlights.forEach(g => g.destroy());
    this.highlights.clear();
    this.selectedCell = null;
  }

  clearHighlightType(type: HighlightType): void {
    const toRemove: string[] = [];
    this.highlights.forEach((g, key) => {
      if (key.endsWith(`_${type}`) || key.endsWith(`_${type}_marker`)) {
        g.destroy();
        toRemove.push(key);
      }
    });
    toRemove.forEach(k => this.highlights.delete(k));
  }

  // ─────────────────────────────────────────────
  // ANIMATIONS
  // ─────────────────────────────────────────────

  /** Tween thumbnail from old cell to new cell. Re-keys in both maps. NO destroy+recreate. */
  animateUnitMove(
    from: { col: number; row: number },
    to: { col: number; row: number },
    onComplete?: () => void
  ): void {
    const fromKey = this.cellKey(from.col, from.row);
    const thumb = this.unitsByCell.get(fromKey);
    if (!thumb) { onComplete?.(); return; }

    const g = this.layout.grid;
    const L = this.layout.cards.thumbnail;
    const displayRow = this.mirrorRow(to.row);
    const targetX = g.originX + to.col * g.cellSize + (g.cellSize - L.width) / 2;
    const targetY = g.originY + displayRow * g.cellSize + (g.cellSize - L.height) / 2;

    this.scene.tweens.add({
      targets: thumb.container,
      x: targetX,
      y: targetY,
      duration: 220,
      ease: 'Quad.easeInOut',
onComplete: () => {
        // Re-key in cell map (instanceId map unchanged — same object)
        this.unitsByCell.delete(fromKey);
        this.unitsByCell.set(this.cellKey(to.col, to.row), thumb);
        // Update logical position so pointer closures report correct cell
        thumb.col = to.col;
        thumb.row = to.row;
        onComplete?.();
      },
    });
  }

  animateAttack(
    from: { col: number; row: number },
    target: { col: number; row: number },
    onComplete?: () => void
  ): void {
    const g = this.layout.grid;
    const displayRow = this.mirrorRow(target.row);
    const flash = this.scene.add.graphics();
    flash.fillStyle(0xFF4444, 0.5);
    flash.fillRect(
      g.originX + target.col * g.cellSize,
      g.originY + displayRow * g.cellSize,
      g.cellSize, g.cellSize
    );
    this.overlayContainer.add(flash);
    this.scene.tweens.add({
      targets: flash, alpha: 0, duration: 300, ease: 'Power2',
      onComplete: () => { flash.destroy(); onComplete?.(); },
    });
  }

  showDamageNumber(col: number, row: number, amount: number, isHeal = false): void {
    const g = this.layout.grid;
    const displayRow = this.mirrorRow(row);
    const cx = g.originX + col * g.cellSize + g.cellSize / 2;
    const cy = g.originY + displayRow * g.cellSize + g.cellSize / 2;
    const color = isHeal ? '#00FF88' : '#FF4444';
    const label = isHeal ? `+${amount}` : `-${amount}`;

    const txt = this.scene.add.text(cx, cy, label, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${Math.round(g.cellSize * 0.2)}px`,
      color, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    this.overlayContainer.add(txt);
    this.scene.tweens.add({
      targets: txt, y: cy - g.cellSize * 0.5, alpha: 0,
      duration: 900, ease: 'Power2', onComplete: () => txt.destroy(),
    });
  }

  redrawBoard(cells: CellRenderData[]): void {
    this.clearAllUnits();
    this.clearAllHighlights();
    cells.forEach(cell => {
      if (cell.unit) this.renderUnit(cell.unit, cell.col, cell.row);
      if (cell.highlight !== 'none') this.addHighlight(cell.col, cell.row, cell.highlight);
    });
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.clearAllUnits();
    this.rootContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — GRID
  // ─────────────────────────────────────────────

  private buildGrid(): void {
    const g = this.layout.grid;
    const T = this.theme.board;
    const boardW = g.cols * g.cellSize, boardH = g.rows * g.cellSize;

    if (this.scene.textures.exists('board_skin')) {
      this.cellContainer.add(
        this.scene.add.image(g.originX + boardW / 2, g.originY + boardH / 2, 'board_skin')
          .setDisplaySize(boardW, boardH)
      );
    }

    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const px = g.originX + col * g.cellSize;
        const displayRow = this.mirrorRow(row);
        const py = g.originY + displayRow * g.cellSize;
        const isEven = (col + row) % 2 === 0;

        const cell = this.scene.add.graphics();
        cell.fillStyle(ThemeLoader.hexToNum(isEven ? T.cellEvenFill : T.cellOddFill), 0.6);
        cell.fillRect(px, py, g.cellSize, g.cellSize);
        cell.lineStyle(g.gridLineWidth, ThemeLoader.hexToNum(T.gridLineColor), 1);
        cell.strokeRect(px, py, g.cellSize, g.cellSize);

        cell.setInteractive(
          new Phaser.Geom.Rectangle(px, py, g.cellSize, g.cellSize),
          Phaser.Geom.Rectangle.Contains
        );
        cell.on('pointerover', () => this.onCellHover(col, row));
        cell.on('pointerout',  () => this.onCellHoverEnd(col, row));
        cell.on('pointerdown', () => EventBus.emit(EV.INPUT_BOARD_CLICK, { col, row }));

        this.cellContainer.add(cell);
        this.cellGraphics.set(this.cellKey(col, row), cell);
      }
    }
  }

  private buildHalfTints(): void {
    const g = this.layout.grid;
    const T = this.theme.board;
    const playerHalf = ThemeLoader.hexToColorAlpha(T.playerHalfTint);
    const enemyHalf  = ThemeLoader.hexToColorAlpha(T.enemyHalfTint);
    const deployRows = 3;

    const pt = this.scene.add.graphics();
    pt.fillStyle(playerHalf.color, playerHalf.alpha);
    pt.fillRect(g.originX, g.originY + (g.rows - deployRows) * g.cellSize,
                g.cols * g.cellSize, deployRows * g.cellSize);
    const et = this.scene.add.graphics();
    et.fillStyle(enemyHalf.color, enemyHalf.alpha);
    et.fillRect(g.originX, g.originY, g.cols * g.cellSize, deployRows * g.cellSize);
    this.cellContainer.add([pt, et]);
  }

  private buildCoords(): void {
    if (!this.layout.grid.coordsVisible) return;
    const g = this.layout.grid;
    const fc = {
      fontFamily: this.theme.fonts.coordLabel.family,
      fontSize: `${g.coordsFontSize}px`,
      color: this.theme.board.coordColor,
    };
    const labels = 'ABCDEFGHIJKL'.slice(0, g.cols);
    for (let col = 0; col < g.cols; col++) {
      this.coordContainer.add(
        this.scene.add.text(g.originX + col * g.cellSize + g.cellSize / 2,
          g.originY - g.coordsFontSize - 2, labels[col], fc).setOrigin(0.5, 0.5)
      );
    }
    for (let row = 0; row < g.rows; row++) {
      const dr = this.mirrorRow(row);
      this.coordContainer.add(
        this.scene.add.text(g.originX - g.coordsFontSize - 2,
          g.originY + dr * g.cellSize + g.cellSize / 2, String(row + 1), fc).setOrigin(0.5, 0.5)
      );
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
    const displayRow = this.mirrorRow(row);
    const py = g.originY + displayRow * g.cellSize;
    const gfx = this.scene.add.graphics();

    switch (type) {
      case 'move': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellValidMove);
        gfx.fillStyle(color, alpha); gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
      case 'attackRange': {
        const cx = px + g.cellSize / 2, cy = py + g.cellSize / 2, s = g.cellSize * 0.2;
        const m = this.scene.add.graphics();
        m.lineStyle(1.5, 0xFF4444, 0.4);
        m.lineBetween(cx - s, cy - s, cx + s, cy + s);
        m.lineBetween(cx + s, cy - s, cx - s, cy + s);
        m.lineStyle(1, 0xFF4444, 0.3); m.strokeCircle(cx, cy, s * 0.8);
        this.attackMarkerContainer.add(m);
        this.highlights.set(`${this.cellKey(col, row)}_attackRange_marker`, m);
        break;
      }
      case 'attack': {
        const cx = px + g.cellSize / 2, cy = py + g.cellSize / 2, s = g.cellSize * 0.3;
        const m = this.scene.add.graphics();
        m.fillStyle(0x000000, 0.6); m.fillCircle(cx, cy, s * 0.7);
        m.lineStyle(3, 0xFF4444, 1.0);
        m.lineBetween(cx - s * 0.5, cy - s * 0.5, cx + s * 0.5, cy + s * 0.5);
        m.lineBetween(cx + s * 0.5, cy - s * 0.5, cx - s * 0.5, cy + s * 0.5);
        m.lineStyle(2, 0xFF4444, 0.9); m.strokeCircle(cx, cy, s * 0.7);
        this.attackMarkerContainer.add(m);
        this.highlights.set(`${this.cellKey(col, row)}_attack_marker`, m);
        break;
      }
      case 'aura': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellAura);
        gfx.fillStyle(color, alpha); gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
      case 'selected': {
        gfx.lineStyle(3, ThemeLoader.hexToNum(T.cellSelected), 1);
        gfx.strokeRect(px + 1, py + 1, g.cellSize - 2, g.cellSize - 2);
        break;
      }
      case 'hover': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellHover);
        gfx.fillStyle(color, alpha); gfx.fillRect(px, py, g.cellSize, g.cellSize);
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
    if (this.hoveredCell) this.clearHighlightType('hover');
    this.hoveredCell = this.cellKey(col, row);
    this.addHighlight(col, row, 'hover');
    EventBus.emit(EV.CARD_HOVERED, { col, row });
  }

  private onCellHoverEnd(_col: number, _row: number): void {
    this.clearHighlightType('hover');
    this.hoveredCell = null;
    EventBus.emit(EV.CARD_HOVER_END, { col: _col, row: _row });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.UNIT_PLACED, ({ data, col, row }) => {
        this.renderUnit(data, col, row);
      }),

      // UNIT_MOVED: tween re-keys only. NO destroy+recreate.
      // Badge updates arrive via UNIT_STATS_CHANGED by instanceId.
      EventBus.on(EV.UNIT_MOVED, ({ from, to }) => {
        this.animateUnitMove(from, to);
      }),

      EventBus.on(EV.UNIT_ATTACKED, ({ from, target, damage }) => {
        this.animateAttack(from, target, () => {
          if (damage) this.showDamageNumber(target.col, target.row, damage);
        });
      }),

      // UNIT_DIED: remove by instanceId — works even mid-tween
      EventBus.on(EV.UNIT_DIED, ({ instanceId, col, row }) => {
        if (instanceId) {
          this.clearUnitById(instanceId);
        } else {
          // Fallback: legacy events without instanceId
          this.clearUnitByCell(col, row);
        }
      }),

      EventBus.on(EV.UNIT_HEALED, ({ col, row, amount }) => {
        this.showDamageNumber(col, row, amount, true);
      }),

      EventBus.on(EV.HIGHLIGHTS_CHANGED, ({ moves, attacks, attackRange, auras }) => {
        this.clearAllHighlights();
        if (attackRange) this.highlightAttackRange(attackRange);
        if (moves)       this.highlightMoves(moves);
        if (attacks)     this.highlightAttacks(attacks);
        if (auras)       this.highlightAuras(auras);
      }),

      // Exhausted/refreshed — placeholder for future visual state
      EventBus.on(EV.UNIT_EXHAUSTED, () => { /* future: thumbnail.setExhausted(true) */ }),
      EventBus.on(EV.UNIT_REFRESHED, () => { /* future: thumbnail.setExhausted(false) */ }),

      // UNIT_STATS_CHANGED: look up by instanceId — always resolves, even mid-tween
      EventBus.on('UNIT_STATS_CHANGED' as any, ({ instanceId, atk, currentHP, maxHP, canAct }: {
        instanceId: string; atk?: number; currentHP?: number; maxHP?: number; canAct: boolean;
      }) => {
        this.updateStatsByInstanceId(instanceId, atk, currentHP, maxHP, canAct);
      }),

      // CAN_ACT_UPDATE: toggle glow per unit on turn boundary
      EventBus.on('CAN_ACT_UPDATE' as any, ({ cells }: { cells: Array<{ col: number; row: number }> }) => {
        const activeKeys = new Set(cells.map(c => this.cellKey(c.col, c.row)));
        this.unitsByCell.forEach((thumb, key) => {
          thumb.setCanAct(activeKeys.has(key));
        });
      }),
    );
  }

  private cellKey(col: number, row: number): string { return `${col}_${row}`; }
}

ThemeLoader.hexToNum = function(hex: string): number {
  return parseInt(hex.replace('#', '').slice(0, 6), 16);
};
ThemeLoader.hexToColorAlpha = function(hex: string): { color: number; alpha: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    return { color: parseInt('0x' + clean.slice(0, 6), 16), alpha: parseInt(clean.slice(6, 8), 16) / 255 };
  }
  return { color: parseInt('0x' + clean, 16), alpha: 1.0 };
};
