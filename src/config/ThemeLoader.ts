// ============================================================
// ThemeLoader.ts
// Fetches, validates, and caches Theme JSON files.
// Provides typed access to colors, fonts, assets, and styles.
// Renderers use this — never hardcode hex values in renderer code.
// ============================================================

import type { ThemeJSON, ColorTokens, ButtonStyle, CardTypeTheme } from '../game/types/UITypes';

// Complete default theme. Renderers always get a valid value even
// if the theme file is missing or partially defined.
const DEFAULT_THEME: ThemeJSON = {
  scene: 'default',

  colors: {
    BG_DEEP:        '#1A1A2E',
    BG_MID:         '#16213E',
    BG_BOARD:       '#0F3460',
    ACCENT_GOLD:    '#F5A623',
    ACCENT_GREEN:   '#00FF88',
    ACCENT_RED:     '#FF4444',
    ACCENT_BLUE:    '#4FC3F7',
    TEXT_PRIMARY:   '#FFFFFF',
    TEXT_SECONDARY: '#AAAAAA',
    CARD_STANDARD:  '#2A2A4A',
    CARD_ROYAL:     '#3D2B1F',
    CARD_STATIC:    '#1B3A2A',
    CARD_SPELL:     '#2A1B3D',
    OVERLAY_BLACK:  '#000000',
  },

  fonts: {
    title:       { family: 'Arial', size: 32, color: '#FFFFFF' },
    heading:     { family: 'Arial', size: 18, color: '#FFFFFF' },
    body:        { family: 'Arial', size: 14, color: '#FFFFFF' },
    small:       { family: 'Arial', size: 11, color: '#AAAAAA' },
    cardName:    { family: 'Arial', size: 12, color: '#FFFFFF' },
    cardStat:    { family: 'Arial', size: 12, color: '#FFFFFF' },
    cardAbility: { family: 'Arial', size: 11, color: '#AAAAAA' },
    coordLabel:  { family: 'Arial', size: 11, color: '#AAAAAA' },
  },

  assets: {
    bg_main_menu:         'backgrounds/bg_main_menu.png',
    bg_battle:            'backgrounds/bg_battle.png',
    bg_result:            'backgrounds/bg_result.png',
    board_skin:           'board/board_skin.png',
    card_frame_standard:  'cards/card_frame_standard.png',
    card_frame_royal:     'cards/card_frame_royal.png',
    card_frame_static:    'cards/card_frame_static.png',
    card_frame_spell:     'cards/card_frame_spell.png',
    card_back:            'cards/card_back_pattern.png',
    icon_atk:             'icons/icon_atk.png',
    icon_def:             'icons/icon_def.png',
    icon_leg:             'icons/icon_leg.png',
    icon_move:            'icons/icon_move.png',
    icon_cavalry:         'icons/icon_cavalry.png',
    icon_clock:           'icons/icon_clock.png',
    icon_ranged:          'icons/icon_ranged.png',
    icon_type_standard:   'icons/icon_type_standard.png',
    icon_type_royal:      'icons/icon_type_royal.png',
    icon_type_static:     'icons/icon_type_static.png',
    icon_type_spell:      'icons/icon_type_spell.png',
    marker_move:          'fx/marker_move.png',
    marker_attack:        'fx/marker_attack.png',
    marker_aura:          'fx/marker_aura.png',
    logo:                 'ui/logo.png',
  },

  board: {
    cellEvenFill:     '#0F3460',
    cellOddFill:      '#0D2B4E',
    gridLineColor:    '#1A3A6A',
    playerHalfTint:   '#00FF8814',
    enemyHalfTint:    '#FF444414',
    coordColor:       '#AAAAAA',
    cellHover:        '#FFFFFF1F',
    cellSelected:     '#00FF88',
    cellValidMove:    '#00FF8833',
    cellValidAtk:     '#FF444433',
    cellAura:         '#4FC3F71A',
    unitBandPlayer:   '#00FF88',
    unitBandEnemy:    '#FF4444',
    unitBandHeight:   8,
    hpBarFull:        '#00FF88',
    hpBarMid:         '#F5A623',
    hpBarLow:         '#FF4444',
    hpBarBackground:  '#333333',
  },

  cards: {
    STANDARD: {
      bodyColor:   '#2A2A4A',
      bandColor:   '#2A2A4A',
      frameAsset:  'card_frame_standard',
      legPipColor: '#4FC3F7',
      borderColor: '#4A4A8A',
      borderWidth: 2,
      glowColor:   '',
      glowSize:    0,
    },
    ROYAL: {
      bodyColor:   '#3D2B1F',
      bandColor:   '#F5A623',
      frameAsset:  'card_frame_royal',
      legPipColor: '#F5A623',
      borderColor: '#F5A623',
      borderWidth: 2,
      glowColor:   '#F5A623',
      glowSize:    4,
    },
    STATIC: {
      bodyColor:   '#1B3A2A',
      bandColor:   '#1B3A2A',
      frameAsset:  'card_frame_static',
      legPipColor: '#4FC3F7',
      borderColor: '#2A6A4A',
      borderWidth: 2,
      glowColor:   '#00FF88',
      glowSize:    2,
    },
    SPELL: {
      bodyColor:   '#2A1B3D',
      bandColor:   '#9B59B6',
      frameAsset:  'card_frame_spell',
      legPipColor: '#4FC3F7',
      borderColor: '#8A4ACA',
      borderWidth: 2,
      glowColor:   '#9B59B6',
      glowSize:    4,
    },
    atkBadgeColor:      '#FF4444',
    defBadgeColor:      '#4FC3F7',
    nameBarBg:          '#1A1A2EB3',
    nameColor:          '#FFFFFF',
    abilityTextColor:   '#AAAAAA',
    exhaustedAlpha:     0.4,
    selectedGlowColor:  '#00FF88',
    selectedGlowSize:   6,
  },

  hud: {
    panelBg:             '#16213E',
    panelAlpha:          0.97,
    playerNameColor:     '#00FF88',
    enemyNameColor:      '#FF4444',
    legColor:            '#F5A623',
    legRateColor:        '#AAAAAA',
    hpBarFull:           '#00FF88',
    hpBarMid:            '#F5A623',
    hpBarLow:            '#FF4444',
    hpBarBg:             '#333333',
    phaseLabelColor:     '#F5A623',
    cardPlayZoneBorderColor: '#4FC3F7',
    cardPlayZoneBorderAlpha: 0.6,
  },

  buttons: {
    primary: {
      fillColor: '#4FC3F7', strokeColor: '#FFFFFF', strokeWidth: 1,
      textColor: '#000000', fontSize: 14,
      hoverFillColor: '#81D4FA', hoverTextColor: '#000000',
      cornerRadius: 6, paddingX: 16, paddingY: 8,
    },
    secondary: {
      fillColor: '#2A2A4A', strokeColor: '#4A4A8A', strokeWidth: 1,
      textColor: '#AAAAAA', fontSize: 13,
      hoverFillColor: '#3A3A6A', hoverTextColor: '#FFFFFF',
      cornerRadius: 6, paddingX: 12, paddingY: 6,
    },
    danger: {
      fillColor: '#FF4444', strokeColor: '#FF6666', strokeWidth: 1,
      textColor: '#FFFFFF', fontSize: 14,
      hoverFillColor: '#FF6666', hoverTextColor: '#FFFFFF',
      cornerRadius: 6, paddingX: 16, paddingY: 8,
    },
    endTurn: {
      fillColor: '#00FF88', strokeColor: '#00CC66', strokeWidth: 2,
      textColor: '#000000', fontSize: 14,
      hoverFillColor: '#33FFAA', hoverTextColor: '#000000',
      cornerRadius: 6, paddingX: 16, paddingY: 8,
    },
    pass: {
      fillColor: '#16213E', strokeColor: '#AAAAAA', strokeWidth: 1,
      textColor: '#AAAAAA', fontSize: 13,
      hoverFillColor: '#1E2E50', hoverTextColor: '#FFFFFF',
      cornerRadius: 6, paddingX: 12, paddingY: 6,
    },
  },

  overlays: {
    dimmerColor:    '#000000',
    dimmerAlpha:    0.8,
    panelColor:     '#16213E',
    panelAlpha:     0.97,
    panelStroke:    '#4FC3F7',
    panelStrokeWidth: 1,
    titleColor:     '#FFFFFF',
    bodyColor:      '#AAAAAA',
    cornerRadius:   10,
  },
};

class ThemeLoaderClass {
  private cache: Map<string, ThemeJSON> = new Map();
  private basePath = '/themes';

  async load(sceneName: string): Promise<ThemeJSON> {
    if (this.cache.has(sceneName)) {
      return this.cache.get(sceneName)!;
    }

    const url = `${this.basePath}/${sceneName}.theme.json`;
    let raw: any;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[ThemeLoader] ${url} not found — using defaults`);
        raw = {};
      } else {
        raw = await res.json();
      }
    } catch (err) {
      console.warn(`[ThemeLoader] Failed to fetch ${url} — using defaults`, err);
      raw = {};
    }

    const merged = this.mergeWithDefaults(raw);
    this.cache.set(sceneName, merged);
    return merged;
  }

  get(sceneName: string): ThemeJSON {
    return this.cache.get(sceneName) ?? DEFAULT_THEME;
  }

  /** Convert a hex color string to a Phaser-compatible number. */
  hexToNum(hex: string): number {
    return parseInt(hex.replace('#', '0x'), 16);
  }

  /**
   * Parse a hex color that may include alpha (8-digit).
   * Returns { color: number, alpha: number }.
   */
  hexToColorAlpha(hex: string): { color: number; alpha: number } {
    const clean = hex.replace('#', '');
    if (clean.length === 8) {
      const alpha = parseInt(clean.slice(6, 8), 16) / 255;
      const color = parseInt('0x' + clean.slice(0, 6), 16);
      return { color, alpha };
    }
    return { color: parseInt('0x' + clean, 16), alpha: 1.0 };
  }

  /** Get a color token as a Phaser number. */
  colorNum(theme: ThemeJSON, token: keyof ColorTokens): number {
    return this.hexToNum(theme.colors[token]);
  }

  /** Get card type theme by class string: 'STANDARD' | 'ROYAL' | 'STATIC' | 'SPELL' */
cardTypeTheme(theme: ThemeJSON, cardClass: string): CardTypeTheme {
  if (!cardClass || typeof cardClass !== 'string') return theme.cards.STANDARD;
  const key = cardClass.toUpperCase() as keyof typeof theme.cards;
    const t = theme.cards[key];
    if (t && typeof t === 'object' && 'bodyColor' in t) {
      return t as CardTypeTheme;
    }
    return theme.cards.STANDARD;
  }

  /** Get button style by name */
  button(theme: ThemeJSON, name: keyof ThemeJSON['buttons']): ButtonStyle {
    return theme.buttons[name];
  }

  /** Get full asset URL (prefixed with /assets/) */
  assetUrl(theme: ThemeJSON, key: string): string {
    const path = theme.assets[key];
    if (!path) {
      console.warn(`[ThemeLoader] Asset key "${key}" not found in theme`);
      return '';
    }
    return `/assets/${path}`;
  }

  /** Get the frame asset key for a card type */
  frameAssetKey(theme: ThemeJSON, cardClass: string): string {
    return this.cardTypeTheme(theme, cardClass).frameAsset;
  }

  /** Returns all asset entries as [key, fullUrl] pairs for PreloadScene */
  getAllAssetPairs(theme: ThemeJSON): Array<[string, string]> {
    return Object.entries(theme.assets).map(([key, path]) => [
      key,
      `/assets/${path}`,
    ]);
  }

  invalidate(sceneName?: string): void {
    if (sceneName) {
      this.cache.delete(sceneName);
    } else {
      this.cache.clear();
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────

  private mergeWithDefaults(raw: any): ThemeJSON {
    return {
      scene:    raw.scene    ?? 'default',
      colors:   { ...DEFAULT_THEME.colors,  ...raw.colors },
      fonts:    { ...DEFAULT_THEME.fonts,   ...raw.fonts },
      assets:   { ...DEFAULT_THEME.assets,  ...raw.assets },
      board:    { ...DEFAULT_THEME.board,   ...raw.board },
      cards:    {
        ...DEFAULT_THEME.cards,
        ...raw.cards,
        STANDARD: { ...DEFAULT_THEME.cards.STANDARD, ...raw.cards?.STANDARD },
        ROYAL:    { ...DEFAULT_THEME.cards.ROYAL,    ...raw.cards?.ROYAL },
        STATIC:   { ...DEFAULT_THEME.cards.STATIC,   ...raw.cards?.STATIC },
        SPELL:    { ...DEFAULT_THEME.cards.SPELL,    ...raw.cards?.SPELL },
      },
      hud:      { ...DEFAULT_THEME.hud,     ...raw.hud },
      buttons:  {
        primary:   { ...DEFAULT_THEME.buttons.primary,   ...raw.buttons?.primary },
        secondary: { ...DEFAULT_THEME.buttons.secondary, ...raw.buttons?.secondary },
        danger:    { ...DEFAULT_THEME.buttons.danger,    ...raw.buttons?.danger },
        endTurn:   { ...DEFAULT_THEME.buttons.endTurn,   ...raw.buttons?.endTurn },
        pass:      { ...DEFAULT_THEME.buttons.pass,      ...raw.buttons?.pass },
      },
      overlays: { ...DEFAULT_THEME.overlays, ...raw.overlays },
    };
  }
}

export const ThemeLoader = new ThemeLoaderClass();
