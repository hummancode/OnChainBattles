// ============================================================
// LayoutLoader.ts
// Fetches, validates, and caches Layout JSON files.
// Provides typed access to layout data for all scenes.
//
// PATCH v0.3.1:
//   - bottomBar defaults moved to right HUD area (no longer covers board)
//   - PASS button zeroed out (END TURN handles both phases)
//   - cardPlayZone zeroed out (not needed with right-side controls)
// ============================================================

import type {
  LayoutJSON,
  BattleLayoutJSON,
  MainMenuLayoutJSON,
  ResultLayoutJSON,
} from '../game/types/UITypes';

// Default fallback values — used if JSON is missing a field.
// This means you can ship partial JSON and the game still runs.
const DEFAULTS = {
  canvas: { width: 1280, height: 720 },

  grid: {
    cols: 7,
    rows: 7,
    cellSize: 102,
    originX: 283,
    originY: 3,
    coordsVisible: true,
    coordsFontSize: 11,
    gridLineWidth: 1,
  },

  cards: {
    full: {
      width: 140,
      height: 200,
      hoverWidth: 160,
      hoverHeight: 230,
      artAreaHeight: 90,
      nameBarHeight: 24,
      statRowHeight: 20,
      legPipSize: 24,
      typeIconSize: 16,
      cornerRadius: 6,
    },
    thumbnail: {
      width: 100,
      height: 100,
      margin: 1,
      hpBarHeight: 0,
      badgeFontSize: 13,
      badgeWidth: 24,
      badgeHeight: 18,
    },
    detail: {
      width: 220,
      height: 320,
      x: 640,
      y: 360,
      patternDiagramSize: 120,
    },
  },
} as const;

class LayoutLoaderClass {
  private cache: Map<string, LayoutJSON> = new Map();
  private basePath = '/layouts';

  async load(sceneName: string): Promise<LayoutJSON> {
    if (this.cache.has(sceneName)) {
      return this.cache.get(sceneName)!;
    }

    const url = `${this.basePath}/${sceneName}.layout.json`;

    let raw: any;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[LayoutLoader] ${url} not found — using defaults`);
        raw = this.buildDefault(sceneName);
      } else {
        raw = await res.json();
      }
    } catch (err) {
      console.warn(`[LayoutLoader] Failed to fetch ${url} — using defaults`, err);
      raw = this.buildDefault(sceneName);
    }

    const merged = this.mergeDefaults(raw, sceneName);
    this.cache.set(sceneName, merged);
    return merged;
  }

  get(sceneName: string): LayoutJSON | null {
    return this.cache.get(sceneName) ?? null;
  }

  getBattle(): BattleLayoutJSON | null {
    return this.cache.get('BattleScene') as BattleLayoutJSON ?? null;
  }

  getMainMenu(): MainMenuLayoutJSON | null {
    return this.cache.get('MainMenuScene') as MainMenuLayoutJSON ?? null;
  }

  getResult(): ResultLayoutJSON | null {
    return this.cache.get('ResultScene') as ResultLayoutJSON ?? null;
  }

  invalidate(sceneName?: string): void {
    if (sceneName) {
      this.cache.delete(sceneName);
    } else {
      this.cache.clear();
    }
  }

  cellCenterX(col: number, grid: { originX: number; cellSize: number }): number {
    return grid.originX + col * grid.cellSize + grid.cellSize / 2;
  }

  cellCenterY(row: number, grid: { originY: number; cellSize: number }): number {
    return grid.originY + row * grid.cellSize + grid.cellSize / 2;
  }

  pixelToCell(
    px: number,
    py: number,
    grid: { originX: number; originY: number; cellSize: number; cols: number; rows: number }
  ): { col: number; row: number } | null {
    const col = Math.floor((px - grid.originX) / grid.cellSize);
    const row = Math.floor((py - grid.originY) / grid.cellSize);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
    return { col, row };
  }

  getAssetSizeRequirements(layout: BattleLayoutJSON): Record<string, { w: number; h: number }> {
    const g = layout.grid;
    const c = layout.cards;
    return {
      board_cell:     { w: g.cellSize, h: g.cellSize },
      marker_move:    { w: g.cellSize, h: g.cellSize },
      marker_attack:  { w: g.cellSize, h: g.cellSize },
      marker_aura:    { w: g.cellSize, h: g.cellSize },
      card_frame:     { w: c.full.width, h: c.full.height },
      card_art_full:  { w: c.full.width, h: c.full.artAreaHeight },
      card_art_thumb: { w: c.thumbnail.width, h: c.thumbnail.height },
      icon_stat:      { w: c.full.typeIconSize * 2, h: c.full.typeIconSize * 2 },
      icon_type:      { w: c.full.typeIconSize, h: c.full.typeIconSize },
      leg_pip:        { w: c.full.legPipSize, h: c.full.legPipSize },
    };
  }

  // ─────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────

  private mergeDefaults(raw: any, sceneName: string): LayoutJSON {
    if (sceneName === 'BattleScene') {
      return {
        scene: 'BattleScene',
        canvas: { ...DEFAULTS.canvas, ...raw.canvas },
        grid: { ...DEFAULTS.grid, ...raw.grid },
        leftHUD: raw.leftHUD ?? this.defaultLeftHUD(),
        rightHUD: raw.rightHUD ?? this.defaultRightHUD(),
        bottomBar: raw.bottomBar ?? this.defaultBottomBar(),
        cards: {
          full: { ...DEFAULTS.cards.full, ...raw.cards?.full },
          thumbnail: { ...DEFAULTS.cards.thumbnail, ...raw.cards?.thumbnail },
          detail: { ...DEFAULTS.cards.detail, ...raw.cards?.detail },
        },
        overlays: raw.overlays ?? this.defaultOverlays(),
      } as BattleLayoutJSON;
    }

    if (sceneName === 'MainMenuScene') {
      return {
        scene: 'MainMenuScene',
        canvas: { ...DEFAULTS.canvas, ...raw.canvas },
        logo:          raw.logo          ?? { x: 640, y: 120, width: 300, height: 80 },
        title:         raw.title         ?? { x: 640, y: 220 },
        nameInput:     raw.nameInput     ?? { x: 640, y: 300, width: 360, height: 48 },
        roomCodeInput: raw.roomCodeInput ?? { x: 640, y: 370, width: 280, height: 48 },
        connectBtn:    raw.connectBtn    ?? { x: 640, y: 450, width: 220, height: 56 },
        cryptoToggle:  raw.cryptoToggle  ?? { x: 640, y: 530, width: 200, height: 40 },
        statusLabel:   raw.statusLabel   ?? { x: 640, y: 600 },
      } as MainMenuLayoutJSON;
    }

    if (sceneName === 'ResultScene') {
      return {
        scene: 'ResultScene',
        canvas:       { ...DEFAULTS.canvas, ...raw.canvas },
        panel:        raw.panel        ?? { x: 640, y: 360, width: 600, height: 420 },
        resultTitle:  raw.resultTitle  ?? { x: 640, y: 240 },
        winnerLabel:  raw.winnerLabel  ?? { x: 640, y: 310 },
        payoutLabel:  raw.payoutLabel  ?? { x: 640, y: 370 },
        txHashLabel:  raw.txHashLabel  ?? { x: 640, y: 420 },
        playAgainBtn: raw.playAgainBtn ?? { x: 640, y: 510, width: 200, height: 52 },
        menuBtn:      raw.menuBtn      ?? { x: 640, y: 580, width: 160, height: 44 },
      } as ResultLayoutJSON;
    }

    return raw as LayoutJSON;
  }

  private buildDefault(sceneName: string): any {
    return { scene: sceneName };
  }

  private defaultLeftHUD() {
    return {
      x: 0, y: 0, width: 280, height: 720,
      playerName: { x: 140, y: 20 },
      kingHPBar:  { x: 30, y: 50, width: 220, height: 12 },
      legCounter: { x: 140, y: 100 },
      legRate:    { x: 140, y: 130 },
      winLoss:    { x: 140, y: 160 },
      hand: {
        x: 140, y: 200,
        cardWidth: 70, cardHeight: 95,
        spacing: 10, maxVisible: 10,
        fanAngle: 3, selectedScale: 1.15,
      },
    };
  }

  private defaultRightHUD() {
    return {
      x: 1000, y: 0, width: 280, height: 720,
      opponentName: { x: 1160, y: 20 },
      kingHPBar:    { x: 1060, y: 50, width: 200, height: 12 },
      legCounter:   { x: 1160, y: 100 },
      hand: {
        x: 1160, y: 200,
        cardWidth: 70, cardHeight: 95,
        spacing: 10, maxVisible: 10,
        fanAngle: 0, selectedScale: 1.0,
      },
    };
  }

private defaultBottomBar() {
    return {
x: 997, y: 300, width: 70, height: 120,
      phaseLabel:   { x: 1035, y: 310 },
      endTurnBtn:   { x: 1035, y: 345, width: 76, height: 36 },
    };
  }

  private defaultOverlays() {
    return {
      dimmer:       { x: 0,   y: 0,   width: 1280, height: 720 },
      targetSelect: { x: 640, y: 360, width: 500,  height: 300 },
      gameOver:     { x: 640, y: 360, width: 600,  height: 400 },
      stakeSelect:  { x: 640, y: 360, width: 500,  height: 350 },
      deckPreview:  { x: 640, y: 360, width: 700,  height: 500 },
    };
  }
}

export const LayoutLoader = new LayoutLoaderClass();
