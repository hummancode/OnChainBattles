// ============================================================
// PuzzleScene.ts
// Player-facing puzzle browser and solver.
// Browse published puzzles, select one, place cards on 7x7 board,
// submit attempt.
// ============================================================

import Phaser from 'phaser';
import { AuthManager } from '../auth/AuthManager';
import { CollectionAPI, CollectionCard } from '../deck/CollectionAPI';
import WalletManager from '../web3/WalletManager';
import PuzzleEscrowManager from '../web3/PuzzleEscrowManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;
const FONT = '"Courier New", monospace';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const THUMB_SIZE = 40; // thumbnail size in card lists
const CELL_SIZE = 56;
const CELL_GAP = 2;

interface PuzzleData {
  id: number;
  title: string;
  description: string;
  difficulty: string;
  boardSetup: { blockedSquares: number[][]; preplacedCards: { cardId: string; col: number; row: number }[] };
  handCards: string[];
  hasRequiredCards: boolean;
  showRequiredCards: boolean;
  prize_card_id: string | null;
  prize_pool: number;
  attempt_fee: number;
  on_chain: number;
  solved: number;
  solved_by_id: number | null;
}

interface SolutionData {
  boardSetup: { blockedSquares: number[][]; preplacedCards: { cardId: string; col: number; row: number }[] };
  solution: { cardId: string; col: number; row: number }[];
  title: string;
  description: string;
  difficulty: string;
  solvedBy: string | null;
  solvedAt: string | null;
}

type ViewState = 'list' | 'solve' | 'view';

export default class PuzzleScene extends Phaser.Scene {
  private viewState: ViewState = 'list';
  private puzzles: PuzzleData[] = [];
  private activePuzzle: PuzzleData | null = null;
  private placements = new Map<string, string>(); // "col,row" → cardId
  private selectedHandCard: string | null = null;
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private transitioning = false;
  private collection: CollectionCard[] = [];
  /** True when puzzle has secret required cards — player picks from collection. */
  private isSecretMode = false;
  /** Scroll offset for card list panels. */
  private scrollOffset = 0;
  /** Search filter for collection panel. */
  private searchFilter = '';
  private inputManager?: DOMInputManager;
  private solutionData: SolutionData | null = null;

  constructor() { super('PuzzleScene'); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // Main panel
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.90);
    panel.fillRoundedRect(60, 15, 1160, 695, 10);
    panel.lineStyle(2, 0xf5a623, 0.4);
    panel.strokeRoundedRect(60, 15, 1160, 695, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.viewState = 'list';
    this.scrollOffset = 0;
    this.searchFilter = '';
    this.loadPuzzles();

    this.events.once('shutdown', () => {
      this.transitioning = false;
      this.inputManager?.destroyAll();
      this.inputManager = undefined;
    });
  }

  // ─── Data Loading ─────────────────────────────────────────

  private async loadPuzzles(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/puzzles`);
      if (!res.ok) throw new Error('Failed to load puzzles');
      const data = await res.json();
      this.puzzles = data.puzzles;
    } catch {
      this.puzzles = [];
    }

    if (!this.scene.isActive('PuzzleScene')) return;
    this.renderView();
  }

  // ─── Rendering ────────────────────────────────────────────

  private renderView(): void {
    // Destroy old DOM inputs when re-rendering
    this.inputManager?.destroyAll();
    this.inputManager = undefined;

    for (const obj of this.viewObjects) obj.destroy();
    this.viewObjects = [];

    if (this.viewState === 'list') {
      this.renderPuzzleList();
    } else if (this.viewState === 'view') {
      this.renderSolutionView();
    } else {
      this.renderSolver();
    }
  }

  // ─── Helpers: Card Thumbnail ───────────────────────────────

  /** Resolve the best texture key for a cardId (thumb → art → null). */
  private resolveTextureKey(cardId: string): string | null {
    const thumbKey = `thumb_${cardId}`;
    if (this.textures.exists(thumbKey)) return thumbKey;
    const artKey = `art_${cardId}`;
    if (this.textures.exists(artKey)) return artKey;
    return null;
  }

  /** Render a card thumbnail image at (x,y) with given size. Returns the image or a grey rect fallback. */
  private addCardThumb(x: number, y: number, cardId: string, size: number): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    const key = this.resolveTextureKey(cardId);
    if (key) {
      return this.add.image(x, y, key).setDisplaySize(size, size).setOrigin(0);
    }
    const g = this.add.graphics();
    g.fillStyle(0x333355, 1);
    g.fillRect(x, y, size, size);
    return g;
  }

  // ─── Puzzle List ──────────────────────────────────────────

  private renderPuzzleList(): void {
    const objs = this.viewObjects;

    // Header
    objs.push(this.add.text(CX, 45, 'PUZZLES', {
      fontSize: '28px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5));

    const backBtn = new MenuButton(this, 160, 45, '[ BACK ]', {
      color: '#ff4444', fontSize: '16px',
      onPointerDown: () => this.goToHub(),
    });
    objs.push(backBtn.text);

    if (this.puzzles.length === 0) {
      objs.push(this.add.text(CX, 300, 'No puzzles available yet.', {
        fontSize: '18px', fontFamily: FONT, color: '#555555',
      }).setOrigin(0.5));
      objs.push(this.add.text(CX, 340, 'Check back soon!', {
        fontSize: '14px', fontFamily: FONT, color: '#444444',
      }).setOrigin(0.5));
      return;
    }

    // Column headers
    objs.push(this.add.text(140, 85, 'Title', { fontSize: '11px', fontFamily: FONT, color: '#555555' }));
    objs.push(this.add.text(550, 85, 'Difficulty', { fontSize: '11px', fontFamily: FONT, color: '#555555' }));
    objs.push(this.add.text(700, 85, 'Prize', { fontSize: '11px', fontFamily: FONT, color: '#555555' }));
    objs.push(this.add.text(850, 85, 'Status', { fontSize: '11px', fontFamily: FONT, color: '#555555' }));
    objs.push(this.add.text(980, 85, '', { fontSize: '11px', fontFamily: FONT, color: '#555555' }));

    let y = 110;
    const rowH = 55;

    for (const puzzle of this.puzzles.slice(0, 9)) {
      // Row background
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x0a0f1e, 0.4);
      rowBg.fillRoundedRect(120, y - 5, 1040, rowH - 5, 4);
      objs.push(rowBg);

      // Title
      objs.push(this.add.text(140, y + 2, puzzle.title, {
        fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF',
      }));

      // Description preview
      const desc = puzzle.description.length > 50 ? puzzle.description.slice(0, 50) + '...' : puzzle.description;
      objs.push(this.add.text(140, y + 24, desc, {
        fontSize: '10px', fontFamily: FONT, color: '#555555',
      }));

      // Difficulty
      const diffColors: Record<string, string> = { easy: '#00ff88', medium: '#4fc3f7', hard: '#f5a623', legendary: '#ff4444' };
      objs.push(this.add.text(550, y + 8, puzzle.difficulty.toUpperCase(), {
        fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: diffColors[puzzle.difficulty] ?? '#777777',
      }));

      // Prize — show AVAX pool for on-chain puzzles, card prize otherwise
      let prizeLabel = puzzle.prize_card_id ?? 'None';
      let prizeColor = '#AAAAAA';
      if (puzzle.on_chain && puzzle.prize_pool > 0) {
        prizeLabel = `${puzzle.prize_pool} AVAX`;
        prizeColor = '#f5a623';
      }
      objs.push(this.add.text(700, y + 8, prizeLabel, {
        fontSize: '12px', fontFamily: FONT, color: prizeColor,
      }));

      // Status
      if (puzzle.solved) {
        objs.push(this.add.text(850, y + 8, 'SOLVED', {
          fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
        }));
      } else {
        objs.push(this.add.text(850, y + 8, 'UNSOLVED', {
          fontSize: '12px', fontFamily: FONT, color: '#00ff88',
        }));
      }

      // Secret badge
      if (puzzle.hasRequiredCards && !puzzle.showRequiredCards) {
        objs.push(this.add.text(950, y + 8, '?', {
          fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
        }));
      }

      // Action button
      if (puzzle.solved) {
        const viewBtn = this.add.text(980, y + 6, '[ VIEW ]', {
          fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
        }).setInteractive({ useHandCursor: true });
        viewBtn.on('pointerover', () => viewBtn.setColor('#ffffff'));
        viewBtn.on('pointerout', () => viewBtn.setColor('#f5a623'));
        const capturedPuzzle = puzzle;
        viewBtn.on('pointerdown', () => this.openSolutionView(capturedPuzzle));
        objs.push(viewBtn);
      } else {
        const attemptBtn = this.add.text(980, y + 6, '[ SOLVE ]', {
          fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: '#00ff88',
        }).setInteractive({ useHandCursor: true });
        attemptBtn.on('pointerover', () => attemptBtn.setColor('#ffffff'));
        attemptBtn.on('pointerout', () => attemptBtn.setColor('#00ff88'));
        const capturedPuzzle = puzzle;
        attemptBtn.on('pointerdown', () => this.openSolver(capturedPuzzle));
        objs.push(attemptBtn);
      }

      y += rowH;
    }
  }

  // ─── Puzzle Solver ────────────────────────────────────────

  private async openSolver(puzzle: PuzzleData): Promise<void> {
    this.activePuzzle = puzzle;
    this.placements.clear();
    this.scrollOffset = 0;
    this.searchFilter = '';
    this.isSecretMode = puzzle.hasRequiredCards && !puzzle.showRequiredCards;

    if (this.isSecretMode) {
      // Load player's collection so they can pick any owned card
      this.collection = await CollectionAPI.get();
      const firstOwned = this.collection.find(c => c.ownedCopies > 0);
      this.selectedHandCard = firstOwned?.id ?? null;
    } else {
      this.selectedHandCard = puzzle.handCards[0] ?? null;
    }

    this.viewState = 'solve';
    if (!this.scene.isActive('PuzzleScene')) return;
    this.renderView();
  }

  private renderSolver(): void {
    const objs = this.viewObjects;
    const puzzle = this.activePuzzle!;

    // Header
    objs.push(this.add.text(CX, 38, puzzle.title, {
      fontSize: '22px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5));

    const backBtn = new MenuButton(this, 160, 38, '[ BACK ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => { this.viewState = 'list'; this.renderView(); },
    });
    objs.push(backBtn.text);

    // Separator
    const sep = this.add.graphics();
    sep.lineStyle(1, 0xf5a623, 0.3);
    sep.lineBetween(80, 58, 1200, 58);
    objs.push(sep);

    // Description
    if (puzzle.description) {
      objs.push(this.add.text(140, 70, puzzle.description, {
        fontSize: '12px', fontFamily: FONT, color: '#AAAAAA',
        wordWrap: { width: 500 },
      }));
    }

    // ── Board (7x7) ─────────────────────────────────────────
    const boardX = 100;
    const boardY = 100;

    const blockedSet = new Set((puzzle.boardSetup.blockedSquares ?? []).map(s => `${s[0]},${s[1]}`));
    const preplacedMap = new Map<string, string>();
    for (const p of (puzzle.boardSetup.preplacedCards ?? [])) {
      preplacedMap.set(`${p.col},${p.row}`, p.cardId);
    }

    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const key = `${col},${row}`;
        const x = boardX + col * (CELL_SIZE + CELL_GAP);
        const y = boardY + row * (CELL_SIZE + CELL_GAP);

        const isBlocked = blockedSet.has(key);
        const isPreplaced = preplacedMap.has(key);
        const isPlaced = this.placements.has(key);

        // Cell background
        let fillColor = 0x1a2040;
        let borderColor = 0x253348;
        if (isBlocked) { fillColor = 0x331111; borderColor = 0x552222; }
        else if (isPreplaced) { fillColor = 0x112233; borderColor = 0x335577; }
        else if (isPlaced) { fillColor = 0x113311; borderColor = 0x225522; }

        const cellBg = this.add.graphics();
        cellBg.fillStyle(fillColor, 1);
        cellBg.fillRoundedRect(x, y, CELL_SIZE, CELL_SIZE, 3);
        cellBg.lineStyle(1, borderColor, 1);
        cellBg.strokeRoundedRect(x, y, CELL_SIZE, CELL_SIZE, 3);
        objs.push(cellBg);

        // Cell content — thumbnail image + small name label
        const cardId = isPreplaced ? preplacedMap.get(key)!
                     : isPlaced ? this.placements.get(key)!
                     : null;

        if (isBlocked) {
          objs.push(this.add.text(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 'X', {
            fontSize: '18px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
          }).setOrigin(0.5));
        } else if (cardId) {
          const thumbPad = 3;
          const thumbS = CELL_SIZE - thumbPad * 2;
          objs.push(this.addCardThumb(x + thumbPad, y + thumbPad, cardId, thumbS));
          // Border highlight for placed vs preplaced
          const bdr = this.add.graphics();
          bdr.lineStyle(2, isPreplaced ? 0x335577 : 0x00ff88, 0.8);
          bdr.strokeRoundedRect(x, y, CELL_SIZE, CELL_SIZE, 3);
          objs.push(bdr);
        }

        // Click handler (only for empty, non-blocked, non-preplaced cells)
        if (!isBlocked && !isPreplaced) {
          const hitZone = this.add.rectangle(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE, CELL_SIZE, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
          hitZone.on('pointerdown', () => this.handleCellClick(col, row));
          objs.push(hitZone);
        }
      }
    }

    // ── Right Panel: Hand Cards + Controls ──────────────────
    const rightX = 520;

    if (this.isSecretMode) {
      this.renderCollectionPanel(objs, rightX);
    } else {
      this.renderHandPanel(objs, rightX, puzzle);
    }

    // ── Submit Button ───────────────────────────────────────
    const submitY = 620;
    const totalPlaced = this.placements.size;
    const isGuest = !AuthManager.isLoggedIn();
    const hasEnoughCards = this.isSecretMode ? totalPlaced > 0 : totalPlaced === puzzle.handCards.length;
    const canSubmit = !isGuest && hasEnoughCards;

    if (isGuest) {
      // Guest mode: show login prompt instead of submit
      objs.push(this.add.text(CX, submitY, 'Log in to submit your solution', {
        fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
      }).setOrigin(0.5));
      const loginBtn = new MenuButton(this, CX, submitY + 30, '[ LOG IN ]', {
        color: '#4fc3f7', fontSize: '18px',
        onPointerDown: () => this.goToLogin(),
      });
      objs.push(loginBtn.text);
    } else {
      const submitBtn = new MenuButton(this, CX, submitY, '[ SUBMIT ATTEMPT ]', {
        color: canSubmit ? '#00ff88' : '#555555',
        fontSize: '22px',
        onPointerDown: () => this.submitAttempt(),
      });
      if (!canSubmit) submitBtn.setDisabled(true);
      objs.push(submitBtn.text);

      // Fee info for paid puzzles
      if (puzzle.attempt_fee > 0) {
        objs.push(this.add.text(CX, submitY + 30, `Attempt fee: ${puzzle.attempt_fee} AVAX`, {
          fontSize: '11px', fontFamily: FONT, color: '#f5a623',
        }).setOrigin(0.5));
      }

      // Wallet signature notice
      objs.push(this.add.text(CX, submitY + (puzzle.attempt_fee > 0 ? 48 : 30), 'Wallet signature required to submit', {
        fontSize: '10px', fontFamily: FONT, color: '#777777',
      }).setOrigin(0.5));
    }

    // Difficulty badge
    const diffColors: Record<string, string> = { easy: '#00ff88', medium: '#4fc3f7', hard: '#f5a623', legendary: '#ff4444' };
    objs.push(this.add.text(rightX, 680, `Difficulty: ${puzzle.difficulty.toUpperCase()}`, {
      fontSize: '11px', fontFamily: FONT, color: diffColors[puzzle.difficulty] ?? '#777777',
    }));
  }

  // ─── Card Row Helper ──────────────────────────────────────

  /** Render a card row with thumbnail, name, and count. Returns the row height used. */
  private renderCardRow(
    objs: Phaser.GameObjects.GameObject[],
    x: number, y: number,
    cardId: string, cardName: string,
    remaining: number, total: number,
    isSelected: boolean,
  ): number {
    const rowH = THUMB_SIZE + 6;
    const textColor = isSelected ? '#f5a623' : remaining > 0 ? '#FFFFFF' : '#444444';

    // Selection highlight background
    if (isSelected) {
      const hlBg = this.add.graphics();
      hlBg.fillStyle(0xf5a623, 0.1);
      hlBg.fillRoundedRect(x - 4, y - 2, 480, rowH, 4);
      hlBg.lineStyle(1, 0xf5a623, 0.4);
      hlBg.strokeRoundedRect(x - 4, y - 2, 480, rowH, 4);
      objs.push(hlBg);
    }

    // Thumbnail
    objs.push(this.addCardThumb(x, y, cardId, THUMB_SIZE));

    // Name + count
    objs.push(this.add.text(x + THUMB_SIZE + 10, y + 4, cardName, {
      fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: textColor,
    }));
    objs.push(this.add.text(x + THUMB_SIZE + 10, y + 22, `${remaining}/${total} available`, {
      fontSize: '10px', fontFamily: FONT, color: remaining > 0 ? '#888888' : '#444444',
    }));

    // Click zone
    const hitZone = this.add.rectangle(x + 200, y + rowH / 2, 440, rowH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    const capturedId = cardId;
    hitZone.on('pointerdown', () => {
      this.selectedHandCard = capturedId;
      this.renderView();
    });
    objs.push(hitZone);

    return rowH;
  }

  /** Standard hand panel — player places specific cards given by the puzzle. */
  private renderHandPanel(objs: Phaser.GameObjects.GameObject[], rightX: number, puzzle: PuzzleData): void {
    objs.push(this.add.text(rightX, 100, 'YOUR HAND', {
      fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
    }));

    objs.push(this.add.text(rightX, 118, 'Click a card, then click the board to place it.', {
      fontSize: '10px', fontFamily: FONT, color: '#555555',
    }));

    const cardCounts = new Map<string, number>();
    for (const id of puzzle.handCards) {
      cardCounts.set(id, (cardCounts.get(id) ?? 0) + 1);
    }

    const placedCounts = new Map<string, number>();
    for (const cardId of this.placements.values()) {
      placedCounts.set(cardId, (placedCounts.get(cardId) ?? 0) + 1);
    }

    let cardY = 140;
    for (const [cardId, total] of cardCounts) {
      const placed = placedCounts.get(cardId) ?? 0;
      const remaining = total - placed;
      const isSelected = this.selectedHandCard === cardId;

      const rowH = this.renderCardRow(objs, rightX, cardY, cardId, cardId, remaining, total, isSelected);
      cardY += rowH + 4;
    }

    // Clear all button
    cardY += 10;
    const clearBtn = new MenuButton(this, rightX + 60, cardY, '[ CLEAR ALL ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => { this.placements.clear(); this.renderView(); },
    });
    objs.push(clearBtn.text);

    // Placement count
    cardY += 35;
    const totalHand = puzzle.handCards.length;
    const totalPlaced = this.placements.size;
    const countColor = totalPlaced === totalHand ? '#00ff88' : '#AAAAAA';
    objs.push(this.add.text(rightX, cardY, `Placed: ${totalPlaced} / ${totalHand}`, {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: countColor,
    }));
  }

  /** Secret mode panel — player picks cards from their owned collection. */
  private renderCollectionPanel(objs: Phaser.GameObjects.GameObject[], rightX: number): void {
    objs.push(this.add.text(rightX, 100, 'YOUR COLLECTION', {
      fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }));

    objs.push(this.add.text(rightX, 118, 'Search and pick cards to solve the puzzle.', {
      fontSize: '10px', fontFamily: FONT, color: '#555555',
    }));

    // ── Search bar (DOM input) ───────────────────────────────
    this.inputManager = new DOMInputManager(this);
    const searchInput = this.inputManager.createInput({
      gameX: rightX + 230, gameY: 147, width: 440, height: 28,
      placeholder: 'Search cards...', maxLength: 30,
    });
    searchInput.style.fontSize = '12px';
    searchInput.style.textAlign = 'left';
    searchInput.value = this.searchFilter;

    // Debounced search — re-render on input
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    searchInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchFilter = searchInput.value.trim().toLowerCase();
        this.scrollOffset = 0;
        this.renderView();
      }, 200);
    });

    // ── Filter + paginate owned cards ────────────────────────
    const ownedCards = this.collection.filter(c => {
      if (c.ownedCopies <= 0) return false;
      if (this.searchFilter) {
        return c.name.toLowerCase().includes(this.searchFilter)
            || c.id.toLowerCase().includes(this.searchFilter);
      }
      return true;
    });

    if (ownedCards.length === 0) {
      const msg = this.searchFilter ? 'No cards match your search.' : 'No cards in your collection.';
      objs.push(this.add.text(rightX, 180, msg, {
        fontSize: '13px', fontFamily: FONT, color: '#ff4444',
      }));
      return;
    }

    // Count placed
    const placedCounts = new Map<string, number>();
    for (const cardId of this.placements.values()) {
      placedCounts.set(cardId, (placedCounts.get(cardId) ?? 0) + 1);
    }

    // Visible window
    const ROW_H = THUMB_SIZE + 10;
    const LIST_TOP = 172;
    const LIST_BOTTOM = 560;
    const maxVisible = Math.floor((LIST_BOTTOM - LIST_TOP) / ROW_H);

    // Clamp scroll
    const maxScroll = Math.max(0, ownedCards.length - maxVisible);
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;
    if (this.scrollOffset < 0) this.scrollOffset = 0;

    const visibleCards = ownedCards.slice(this.scrollOffset, this.scrollOffset + maxVisible);
    let cardY = LIST_TOP;

    for (const card of visibleCards) {
      const placed = placedCounts.get(card.id) ?? 0;
      const remaining = card.ownedCopies - placed;
      const isSelected = this.selectedHandCard === card.id;

      this.renderCardRow(objs, rightX, cardY, card.id, card.name, remaining, card.ownedCopies, isSelected);
      cardY += ROW_H;
    }

    // ── Scroll indicator ─────────────────────────────────────
    const scrollBarX = rightX + 470;
    if (ownedCards.length > maxVisible) {
      // Scroll info
      objs.push(this.add.text(scrollBarX - 40, LIST_TOP - 2, `${this.scrollOffset + 1}-${Math.min(this.scrollOffset + maxVisible, ownedCards.length)} / ${ownedCards.length}`, {
        fontSize: '9px', fontFamily: FONT, color: '#555555',
      }).setOrigin(1, 0));

      // Up button
      if (this.scrollOffset > 0) {
        const upBtn = this.add.text(scrollBarX, LIST_TOP + 10, '\u25B2', {
          fontSize: '18px', fontFamily: FONT, color: '#4fc3f7',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        upBtn.on('pointerdown', () => { this.scrollOffset = Math.max(0, this.scrollOffset - maxVisible); this.renderView(); });
        objs.push(upBtn);
      }

      // Down button
      if (this.scrollOffset + maxVisible < ownedCards.length) {
        const downBtn = this.add.text(scrollBarX, LIST_BOTTOM - 10, '\u25BC', {
          fontSize: '18px', fontFamily: FONT, color: '#4fc3f7',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        downBtn.on('pointerdown', () => { this.scrollOffset = Math.min(maxScroll, this.scrollOffset + maxVisible); this.renderView(); });
        objs.push(downBtn);
      }
    }

    // ── Clear all + placement count ──────────────────────────
    const bottomY = LIST_BOTTOM + 8;
    const clearBtn = new MenuButton(this, rightX + 60, bottomY, '[ CLEAR ALL ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => { this.placements.clear(); this.renderView(); },
    });
    objs.push(clearBtn.text);

    objs.push(this.add.text(rightX + 200, bottomY - 5, `Placed: ${this.placements.size}`, {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: this.placements.size > 0 ? '#00ff88' : '#AAAAAA',
    }));
  }

  // ─── Solution View (read-only) ──────────────────────────

  private async openSolutionView(puzzle: PuzzleData): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/puzzles/${puzzle.id}/solution`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        ToastNotification.show(this, err.error || 'Could not load solution', { color: '#ff4444' });
        return;
      }
      const data = await res.json();
      this.solutionData = data.puzzle;
      this.viewState = 'view';
      if (!this.scene.isActive('PuzzleScene')) return;
      this.renderView();
    } catch {
      ToastNotification.show(this, 'Network error loading solution', { color: '#ff4444' });
    }
  }

  private renderSolutionView(): void {
    const objs = this.viewObjects;
    const sol = this.solutionData!;

    // Header
    objs.push(this.add.text(CX, 38, sol.title, {
      fontSize: '22px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5));

    const backBtn = new MenuButton(this, 160, 38, '[ BACK ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => { this.viewState = 'list'; this.renderView(); },
    });
    objs.push(backBtn.text);

    // "SOLVED" badge
    objs.push(this.add.text(CX, 58, 'SOLVED', {
      fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5));

    // Separator
    const sep = this.add.graphics();
    sep.lineStyle(1, 0xf5a623, 0.3);
    sep.lineBetween(80, 72, 1200, 72);
    objs.push(sep);

    // Description
    if (sol.description) {
      objs.push(this.add.text(140, 82, sol.description, {
        fontSize: '12px', fontFamily: FONT, color: '#AAAAAA',
        wordWrap: { width: 500 },
      }));
    }

    // ── Board (7x7) — read-only with solution placed ────────
    const boardX = 100;
    const boardY = 110;

    const blockedSet = new Set((sol.boardSetup.blockedSquares ?? []).map(s => `${s[0]},${s[1]}`));
    const preplacedMap = new Map<string, string>();
    for (const p of (sol.boardSetup.preplacedCards ?? [])) {
      preplacedMap.set(`${p.col},${p.row}`, p.cardId);
    }
    const solutionMap = new Map<string, string>();
    for (const p of sol.solution) {
      solutionMap.set(`${p.col},${p.row}`, p.cardId);
    }

    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const key = `${col},${row}`;
        const x = boardX + col * (CELL_SIZE + CELL_GAP);
        const y = boardY + row * (CELL_SIZE + CELL_GAP);

        const isBlocked = blockedSet.has(key);
        const isPreplaced = preplacedMap.has(key);
        const isSolution = solutionMap.has(key);

        // Cell background
        let fillColor = 0x1a2040;
        let borderColor = 0x253348;
        if (isBlocked) { fillColor = 0x331111; borderColor = 0x552222; }
        else if (isPreplaced) { fillColor = 0x112233; borderColor = 0x335577; }
        else if (isSolution) { fillColor = 0x112211; borderColor = 0x337733; }

        const cellBg = this.add.graphics();
        cellBg.fillStyle(fillColor, 1);
        cellBg.fillRoundedRect(x, y, CELL_SIZE, CELL_SIZE, 3);
        cellBg.lineStyle(1, borderColor, 1);
        cellBg.strokeRoundedRect(x, y, CELL_SIZE, CELL_SIZE, 3);
        objs.push(cellBg);

        // Cell content
        const cardId = isPreplaced ? preplacedMap.get(key)!
                     : isSolution ? solutionMap.get(key)!
                     : null;

        if (isBlocked) {
          objs.push(this.add.text(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 'X', {
            fontSize: '18px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
          }).setOrigin(0.5));
        } else if (cardId) {
          const thumbPad = 3;
          const thumbS = CELL_SIZE - thumbPad * 2;
          objs.push(this.addCardThumb(x + thumbPad, y + thumbPad, cardId, thumbS));
          const bdr = this.add.graphics();
          bdr.lineStyle(2, isPreplaced ? 0x335577 : 0xf5a623, 0.8);
          bdr.strokeRoundedRect(x, y, CELL_SIZE, CELL_SIZE, 3);
          objs.push(bdr);
        }
      }
    }

    // ── Right Panel: Solution info ──────────────────────────
    const rightX = 520;
    let infoY = 110;

    objs.push(this.add.text(rightX, infoY, 'SOLUTION', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }));
    infoY += 30;

    // Solver info
    if (sol.solvedBy) {
      objs.push(this.add.text(rightX, infoY, `Solved by: ${sol.solvedBy}`, {
        fontSize: '13px', fontFamily: FONT, color: '#00ff88',
      }));
      infoY += 22;
    }
    if (sol.solvedAt) {
      const date = new Date(sol.solvedAt).toLocaleDateString();
      objs.push(this.add.text(rightX, infoY, `Date: ${date}`, {
        fontSize: '12px', fontFamily: FONT, color: '#888888',
      }));
      infoY += 28;
    }

    // Difficulty
    const diffColors: Record<string, string> = { easy: '#00ff88', medium: '#4fc3f7', hard: '#f5a623', legendary: '#ff4444' };
    objs.push(this.add.text(rightX, infoY, `Difficulty: ${sol.difficulty.toUpperCase()}`, {
      fontSize: '12px', fontFamily: FONT, color: diffColors[sol.difficulty] ?? '#777777',
    }));
    infoY += 30;

    // Solution cards legend
    objs.push(this.add.text(rightX, infoY, 'Cards placed:', {
      fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#AAAAAA',
    }));
    infoY += 24;

    for (const p of sol.solution) {
      const rowH = this.renderCardRow(objs, rightX, infoY, p.cardId, p.cardId, 0, 0, false);
      // Override the count text with position
      // Add position label on top
      objs.push(this.add.text(rightX + THUMB_SIZE + 10, infoY + 22, `at (${p.col}, ${p.row})`, {
        fontSize: '10px', fontFamily: FONT, color: '#666666',
      }));
      infoY += rowH + 4;
    }
  }

  private handleCellClick(col: number, row: number): void {
    const key = `${col},${row}`;

    // If cell already has a placement, remove it
    if (this.placements.has(key)) {
      this.placements.delete(key);
      this.renderView();
      return;
    }

    // Place selected card if one is available
    if (!this.selectedHandCard) return;

    // Check if we have remaining copies of this card
    let total: number;
    if (this.isSecretMode) {
      const collCard = this.collection.find(c => c.id === this.selectedHandCard);
      total = collCard?.ownedCopies ?? 0;
    } else {
      total = this.activePuzzle!.handCards.filter(id => id === this.selectedHandCard).length;
    }
    let placed = 0;
    for (const v of this.placements.values()) { if (v === this.selectedHandCard) placed++; }
    if (placed >= total) {
      ToastNotification.show(this, `No more ${this.selectedHandCard} remaining`, { color: '#ff4444' });
      return;
    }

    this.placements.set(key, this.selectedHandCard);
    this.renderView();
  }

  // ─── Submit ───────────────────────────────────────────────

  private async submitAttempt(): Promise<void> {
    if (!this.activePuzzle || !AuthManager.isLoggedIn()) return;

    // All puzzle attempts require a connected wallet
    if (!WalletManager.isConnected()) {
      try {
        await WalletManager.connect();
      } catch {
        ToastNotification.show(this, 'Wallet required to submit solutions', { color: '#ff4444' });
        return;
      }
    }

    const placement = [...this.placements].map(([key, cardId]) => {
      const [col, row] = key.split(',').map(Number);
      return { cardId, col, row };
    });

    // Sign the attempt to prove wallet ownership
    let signature: string;
    let walletAddress: string;
    try {
      const signer = WalletManager.getSigner();
      if (!signer) throw new Error('No signer');
      walletAddress = await signer.getAddress();
      const message = `Puzzle attempt: puzzle #${this.activePuzzle.id} by ${walletAddress}`;
      ToastNotification.show(this, 'Sign in wallet to confirm attempt...', { color: '#f5a623', duration: 8000 });
      signature = await signer.signMessage(message);
    } catch (err: any) {
      if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) {
        ToastNotification.show(this, 'Signature rejected', { color: '#ff4444' });
      } else {
        ToastNotification.show(this, err.message || 'Wallet signature failed', { color: '#ff4444' });
      }
      return;
    }

    // On-chain payment for paid puzzles (after signature)
    let txHash: string | undefined;
    if (this.activePuzzle.on_chain && this.activePuzzle.attempt_fee > 0) {
      if (!PuzzleEscrowManager.isEnabled()) {
        ToastNotification.show(this, 'On-chain puzzles not available yet', { color: '#ff4444' });
        return;
      }
      try {
        ToastNotification.show(this, 'Confirm payment in wallet...', { color: '#f5a623', duration: 8000 });
        txHash = await PuzzleEscrowManager.submitAttempt(this.activePuzzle.id, this.activePuzzle.attempt_fee);
      } catch (err: any) {
        ToastNotification.show(this, err.message || 'Wallet transaction failed', { color: '#ff4444' });
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/puzzles/${this.activePuzzle.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AuthManager.authHeaders() },
        body: JSON.stringify({ placement, txHash, signature, walletAddress }),
      });

      const data = await res.json();

      if (res.status === 429) {
        ToastNotification.show(this, `Cooldown active. Try again later.`, { color: '#f5a623' });
        return;
      }

      if (!res.ok) {
        ToastNotification.show(this, data.error || 'Attempt failed', { color: '#ff4444' });
        return;
      }

      if (data.correct) {
        ToastNotification.show(this, 'Correct! You solved the puzzle!', { color: '#00ff88', duration: 4000 });
        this.viewState = 'list';
        await this.loadPuzzles();
      } else {
        ToastNotification.show(this, 'Incorrect. Try again in 24 hours.', { color: '#ff4444', duration: 3000 });
        this.viewState = 'list';
        this.renderView();
      }
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Network error', { color: '#ff4444' });
    }
  }

  // ─── Navigation ───────────────────────────────────────────

  private goToHub(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }

  private goToLogin(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LoginScene');
    });
  }
}
