// ============================================================
// SelectionManager.ts
// Owns all player input during the battle scene.
// Tracks selection state: which hand card or board unit is active.
// Routes selections to GameEngine API calls.
// Publishes highlight changes to EventBus for BoardRenderer.
//
// State machine:
//   idle          → click hand card → card_selected
//   card_selected → click valid deploy pos → GameEngine.playCard()
//   card_selected → click hand card again → idle (deselect)
//   idle          → click own unit → unit_selected
//   unit_selected → click valid move pos → GameEngine.moveUnit()
//   unit_selected → click valid attack → GameEngine.attackUnit()
//   unit_selected → click same unit again → idle (deselect)
//   any           → GameEngine.state === AWAITING_INPUT → awaiting_target
//   awaiting_target → click → GameEngine.selectTarget()
// ============================================================

import type { BattleLayoutJSON } from '../game/types/UITypes';
import type { SelectionState } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { LayoutLoader } from '../config/LayoutLoader';

// Minimal interface for what SelectionManager needs from GameEngine.
// This avoids importing the full GameEngine in the UI layer.
export interface IGameEngineAPI {
  getValidMoves(col: number, row: number): Array<{ col: number; row: number }>;
  getValidAttacks(col: number, row: number): Array<{ col: number; row: number }>;
  getValidDeployPositions(cardIndex: number): Array<{ col: number; row: number }>;
  playCard(handIndex: number, col: number, row: number): void;
  moveUnit(fromCol: number, fromRow: number, toCol: number, toRow: number): void;
  attackUnit(fromCol: number, fromRow: number, targetCol: number, targetRow: number): void;
  selectTarget(col: number, row: number): void;
  selectPosition(col: number, row: number): void;
  selectHandCard(handIndex: number): void;
  isAwaitingInput(): boolean;
  canAct(col: number, row: number): boolean;
  isPlayerUnit(col: number, row: number): boolean;
  isOccupied(col: number, row: number): boolean;
  getPhase(): string;
}

export class SelectionManager {
  private layout: BattleLayoutJSON;
  private engine: IGameEngineAPI;

  private state: SelectionState = {
    selectedHandIndex: null,
    selectedBoardCol: null,
    selectedBoardRow: null,
    validMoves: [],
    validAttacks: [],
    validDeploy: [],
    mode: 'idle',
  };

  private unsubs: Array<() => void> = [];

  constructor(layout: BattleLayoutJSON, engine: IGameEngineAPI) {
    this.layout = layout;
    this.engine = engine;
    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API (called by BattleScene or input hooks)
  // ─────────────────────────────────────────────

  /**
   * Process a click on a board cell.
   * Called by BoardRenderer's cell pointerdown callbacks.
   */
  onBoardCellClicked(col: number, row: number): void {
    if (this.engine.isAwaitingInput()) {
      // Engine is waiting for player to pick a target
      this.engine.selectTarget(col, row);
      this.clearSelection();
      return;
    }

    const phase = this.engine.getPhase();

    switch (this.state.mode) {
      case 'card_selected':
        this.handleCardToBoardClick(col, row);
        break;

      case 'unit_selected':
        this.handleUnitActionClick(col, row);
        break;

      case 'idle':
      default:
        this.handleIdleBoardClick(col, row, phase);
        break;
    }
  }

  /**
   * Process a click on a hand card.
   * Called by HandRenderer's card pointerdown callback.
   */
  onHandCardClicked(index: number): void {
    if (this.engine.isAwaitingInput()) {
      this.engine.selectHandCard(index);
      this.clearSelection();
      return;
    }

    const phase = this.engine.getPhase();
    if (phase !== 'PLAY') {
      // Hand cards only playable in PLAY phase
      this.clearSelection();
      return;
    }

    if (this.state.mode === 'card_selected' && this.state.selectedHandIndex === index) {
      // Clicking the same card again deselects
      this.clearSelection();
      return;
    }

    // Select this card and show valid deploy positions
    const deployPositions = this.engine.getValidDeployPositions(index);

    this.state = {
      ...this.state,
      mode: 'card_selected',
      selectedHandIndex: index,
      selectedBoardCol: null,
      selectedBoardRow: null,
      validMoves: [],
      validAttacks: [],
      validDeploy: deployPositions,
    };

    this.publishHighlights();
    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'hand',
      index,
      validDeploy: deployPositions,
    });
  }

  /** Externally clear the selection (e.g., after phase change). */
  clearSelection(): void {
    this.state = {
      selectedHandIndex: null,
      selectedBoardCol: null,
      selectedBoardRow: null,
      validMoves: [],
      validAttacks: [],
      validDeploy: [],
      mode: 'idle',
    };

    EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
      moves: [],
      attacks: [],
      auras: [],
    });

    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'clear',
      index: null,
    });
  }

  /** Get the current selection state (read-only snapshot). */
  getState(): Readonly<SelectionState> {
    return { ...this.state };
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
  }

  // ─────────────────────────────────────────────
  // PRIVATE — CLICK HANDLERS
  // ─────────────────────────────────────────────

  private handleIdleBoardClick(col: number, row: number, phase: string): void {
    if (!this.engine.isOccupied(col, row)) {
      // Click on empty cell in idle — do nothing
      return;
    }

    if (!this.engine.isPlayerUnit(col, row)) {
      // Click on enemy unit in idle — do nothing (no info mode for now)
      return;
    }

    if (phase !== 'ACT') {
      // Units can only act in ACT phase
      return;
    }

    if (!this.engine.canAct(col, row)) {
      // Unit already acted this turn (exhausted)
      return;
    }

    // Select this unit
    const moves   = this.engine.getValidMoves(col, row);
    const attacks = this.engine.getValidAttacks(col, row);

    this.state = {
      ...this.state,
      mode: 'unit_selected',
      selectedBoardCol: col,
      selectedBoardRow: row,
      selectedHandIndex: null,
      validMoves: moves,
      validAttacks: attacks,
      validDeploy: [],
    };

    this.publishHighlights();
    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'board',
      col, row,
      validMoves: moves,
      validAttacks: attacks,
    });
  }

  private handleCardToBoardClick(col: number, row: number): void {
    const idx = this.state.selectedHandIndex;
    if (idx === null) { this.clearSelection(); return; }

    // Is this a valid deploy position?
    const isValid = this.state.validDeploy.some(p => p.col === col && p.row === row);

    if (isValid) {
      this.engine.playCard(idx, col, row);
      this.clearSelection();
    } else {
      // Click outside valid deploy — deselect card, try to select a unit instead
      this.clearSelection();
      // If clicking own unit, switch to unit selection
      if (this.engine.isOccupied(col, row) && this.engine.isPlayerUnit(col, row)) {
        this.handleIdleBoardClick(col, row, this.engine.getPhase());
      }
    }
  }

  private handleUnitActionClick(col: number, row: number): void {
    const fromCol = this.state.selectedBoardCol;
    const fromRow = this.state.selectedBoardRow;
    if (fromCol === null || fromRow === null) { this.clearSelection(); return; }

    // Clicking the selected unit again → deselect
    if (col === fromCol && row === fromRow) {
      this.clearSelection();
      return;
    }

    // Is this a valid move?
    const isMoveTarget = this.state.validMoves.some(p => p.col === col && p.row === row);
    if (isMoveTarget) {
      this.engine.moveUnit(fromCol, fromRow, col, row);
      this.clearSelection();
      return;
    }

    // Is this a valid attack?
    const isAttackTarget = this.state.validAttacks.some(p => p.col === col && p.row === row);
    if (isAttackTarget) {
      this.engine.attackUnit(fromCol, fromRow, col, row);
      this.clearSelection();
      return;
    }

    // Click on a different own unit → switch selection to that unit
    if (this.engine.isOccupied(col, row) && this.engine.isPlayerUnit(col, row)) {
      this.clearSelection();
      this.handleIdleBoardClick(col, row, this.engine.getPhase());
      return;
    }

    // Click on empty or invalid cell → deselect
    this.clearSelection();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — HELPERS
  // ─────────────────────────────────────────────

  /** Publish current highlights to EventBus so BoardRenderer reacts. */
  private publishHighlights(): void {
    EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
      moves:   this.state.validMoves,
      attacks: this.state.validAttacks,
      deploy:  this.state.validDeploy,
      auras:   [],
    });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    // Board cell clicks routed from BoardRenderer
    this.unsubs.push(
      EventBus.on(EV.SELECTION_CHANGED, ({ source, col, row, index }) => {
        if (source === 'board' && col !== undefined && row !== undefined) {
          // Only process if SelectionManager didn't originate this event
          // (BoardRenderer fires this; we then decide what to do)
          this.onBoardCellClicked(col, row);
        }
        if (source === 'hand' && index !== undefined) {
          this.onHandCardClicked(index);
        }
      }),

      // When engine enters AWAITING_INPUT, set mode
      EventBus.on(EV.PENDING_TARGET, () => {
        this.state = { ...this.state, mode: 'awaiting_target' };
        EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
          moves: [], attacks: [], auras: [],
        });
      }),

      // When interaction resolves, back to idle
      EventBus.on(EV.INTERACTION_RESOLVED, () => {
        this.clearSelection();
      }),

      // Phase changes clear selection
      EventBus.on(EV.PHASE_CHANGED, () => {
        this.clearSelection();
      }),

      // Unit played/moved clears selection
      EventBus.on(EV.UNIT_PLACED, () => this.clearSelection()),
      EventBus.on(EV.UNIT_MOVED,  () => this.clearSelection()),
      EventBus.on(EV.UNIT_ATTACKED, () => this.clearSelection()),
    );
  }
}
