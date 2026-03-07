// ============================================================
// UITypes.ts
// TypeScript contracts for all Layout JSON and Theme JSON data.
// These mirror the JSON Schema Contract exactly.
// Zero runtime logic — pure interfaces only.
// ============================================================

// ─────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────

export interface XYPoint {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasConfig {
  width: number;   // Default: 1280
  height: number;  // Default: 720
}

// ─────────────────────────────────────────────
// LAYOUT JSON — BATTLE SCENE
// ─────────────────────────────────────────────

/**
 * Grid config drives BoardRenderer entirely.
 * Change cols/rows → board changes size.
 * Change cellSize → every cell and all highlights scale.
 * Change originX/Y → board shifts on canvas.
 */
export interface GridConfig {
  cols: number;          // Default: 6. BoardRenderer loops 0..cols-1
  rows: number;          // Default: 6. BoardRenderer loops 0..rows-1
  cellSize: number;      // px per cell, square. Default: 120
  originX: number;       // px from left to top-left cell. Default: 280
  originY: number;       // px from top to top-left cell. Default: 0
  coordsVisible: boolean;  // Show A-F / 1-6 labels outside board
  coordsFontSize: number;  // px. Default: 11
  gridLineWidth: number;   // px. Default: 1
}

export interface HandLayoutConfig {
  x: number;           // Center X of hand area
  y: number;           // Top Y of hand area
  cardWidth: number;   // Thumbnail card width in hand
  cardHeight: number;  // Thumbnail card height in hand
  spacing: number;     // Gap between cards (px)
  maxVisible: number;  // Cards before scroll kicks in
  fanAngle: number;    // Degrees of tilt per card from center
  selectedScale: number; // Scale multiplier for selected card
}

export interface LeftHUDLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  playerName: XYPoint;
  kingHPBar: Rect;
  legCounter: XYPoint;
  legRate: XYPoint;
  winLoss: XYPoint;
  hand: HandLayoutConfig;
}

export interface RightHUDLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  opponentName: XYPoint;
  kingHPBar: Rect;
  legCounter: XYPoint;
  hand: HandLayoutConfig;
}

export interface BottomBarLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  phaseLabel: XYPoint;
  endTurnBtn: Rect;
  passBtn: Rect;
  cardPlayZone: Rect;
}

/**
 * Card rendering sizes — all proportions derive from these.
 * CardRenderer reads these to draw every card part:
 *   artArea, nameBar, statRow, legPip, typeIcon.
 * Changing width/height here rescales the entire card.
 */
export interface CardFullLayout {
  width: number;          // Base width in hand. Default: 140
  height: number;         // Base height in hand. Default: 200
  hoverWidth: number;     // Expanded width on hover. Default: 160
  hoverHeight: number;    // Expanded height on hover. Default: 230
  artAreaHeight: number;  // Portrait crop zone height. Default: 90
  nameBarHeight: number;  // Name strip height. Default: 24
  statRowHeight: number;  // ATK/DEF row height. Default: 20
  legPipSize: number;     // LEG cost circle diameter. Default: 24
  typeIconSize: number;   // Type icon square size. Default: 16
  cornerRadius: number;   // Card corner radius. Default: 6
}

export interface CardThumbnailLayout {
  width: number;       // On-board unit width. Default: 100
  height: number;      // On-board unit height. Default: 100
  margin: number;      // Inner margin inside cell. Default: 10
  hpBarHeight: number; // HP strip height at bottom. Default: 4
  badgeFontSize: number; // ATK/DEF badge font. Default: 12
  badgeWidth: number;  // Badge pill width. Default: 20
  badgeHeight: number; // Badge pill height. Default: 16
}

export interface CardDetailLayout {
  width: number;   // Full detail overlay width. Default: 220
  height: number;  // Full detail overlay height. Default: 320
  x: number;       // Center X of overlay. Default: 640
  y: number;       // Center Y of overlay. Default: 360
  patternDiagramSize: number; // Movement diagram square. Default: 120
}

export interface CardsLayout {
  full: CardFullLayout;
  thumbnail: CardThumbnailLayout;
  detail: CardDetailLayout;
}

export interface OverlaysLayout {
  dimmer: Rect;
  targetSelect: Rect;
  gameOver: Rect;
  stakeSelect: Rect;
  deckPreview: Rect;
}

export interface BattleLayoutJSON {
  scene: 'BattleScene';
  canvas: CanvasConfig;
  grid: GridConfig;
  leftHUD: LeftHUDLayout;
  rightHUD: RightHUDLayout;
  bottomBar: BottomBarLayout;
  cards: CardsLayout;
  overlays: OverlaysLayout;
}

// ─────────────────────────────────────────────
// LAYOUT JSON — MAIN MENU SCENE
// ─────────────────────────────────────────────

export interface MainMenuLayoutJSON {
  scene: 'MainMenuScene';
  canvas: CanvasConfig;
  logo: Rect;
  title: XYPoint;
  nameInput: Rect;
  roomCodeInput: Rect;
  connectBtn: Rect;
  cryptoToggle: Rect;
  statusLabel: XYPoint;
}

// ─────────────────────────────────────────────
// LAYOUT JSON — RESULT SCENE
// ─────────────────────────────────────────────

export interface ResultLayoutJSON {
  scene: 'ResultScene';
  canvas: CanvasConfig;
  panel: Rect;
  resultTitle: XYPoint;
  winnerLabel: XYPoint;
  payoutLabel: XYPoint;
  txHashLabel: XYPoint;
  playAgainBtn: Rect;
  menuBtn: Rect;
}

export type LayoutJSON = BattleLayoutJSON | MainMenuLayoutJSON | ResultLayoutJSON;

// ─────────────────────────────────────────────
// THEME JSON — COLOR TOKENS
// ─────────────────────────────────────────────

/**
 * The 14 OCB design tokens. All other theme fields reference
 * these names. Changing one token updates everything using it.
 */
export interface ColorTokens {
  BG_DEEP: string;        // #1A1A2E — primary background
  BG_MID: string;         // #16213E — panel background
  BG_BOARD: string;       // #0F3460 — board surface
  ACCENT_GOLD: string;    // #F5A623 — crypto/royal
  ACCENT_GREEN: string;   // #00FF88 — player/win
  ACCENT_RED: string;     // #FF4444 — enemy/lose
  ACCENT_BLUE: string;    // #4FC3F7 — info/neutral
  TEXT_PRIMARY: string;   // #FFFFFF — main text
  TEXT_SECONDARY: string; // #AAAAAA — muted text
  CARD_STANDARD: string;  // #2A2A4A
  CARD_ROYAL: string;     // #3D2B1F
  CARD_STATIC: string;    // #1B3A2A
  CARD_SPELL: string;     // #2A1B3D
  OVERLAY_BLACK: string;  // #000000 at 80%
}

// ─────────────────────────────────────────────
// THEME JSON — TYPOGRAPHY
// ─────────────────────────────────────────────

export interface FontDef {
  family: string;   // e.g. 'Arial', 'monospace'
  size: number;     // px
  color?: string;   // hex override; if absent, use token
}

export interface FontsConfig {
  title: FontDef;      // Scene titles
  heading: FontDef;    // HUD section headings
  body: FontDef;       // General body text
  small: FontDef;      // Small labels, tooltips
  cardName: FontDef;   // Card name bar
  cardStat: FontDef;   // ATK/DEF badges
  cardAbility: FontDef; // Ability text in detail view
  coordLabel: FontDef; // Board A-F / 1-6 coords
}

// ─────────────────────────────────────────────
// THEME JSON — ASSETS
// ─────────────────────────────────────────────

/**
 * All asset paths relative to /public/assets/.
 * PreloadScene iterates this object and loads every entry.
 * Card art keys follow pattern: art_[cardId]
 */
export interface AssetsConfig {
  // Backgrounds
  bg_main_menu: string;
  bg_battle: string;
  bg_result: string;
  // Board
  board_skin: string;
  // Card frames
  card_frame_standard: string;
  card_frame_royal: string;
  card_frame_static: string;
  card_frame_spell: string;
  card_back: string;
  // Stat icons
  icon_atk: string;
  icon_def: string;
  icon_leg: string;
  icon_move: string;
  icon_cavalry: string;
  icon_clock: string;
  icon_ranged: string;
  // Type icons
  icon_type_standard: string;
  icon_type_royal: string;
  icon_type_static: string;
  icon_type_spell: string;
  // Board FX markers
  marker_move: string;
  marker_attack: string;
  marker_aura: string;
  // UI
  logo: string;
  // Dynamic: card art — key = "art_" + cardId
  [key: string]: string;
}

// ─────────────────────────────────────────────
// THEME JSON — BOARD
// ─────────────────────────────────────────────

export interface CellVisual {
  fillColor: string;   // hex
  fillAlpha: number;   // 0..1
  strokeColor: string; // hex
  strokeWidth: number; // px
}

export interface BoardTheme {
  cellEvenFill: string;      // Checkerboard even
  cellOddFill: string;       // Checkerboard odd
  gridLineColor: string;
  playerHalfTint: string;    // ACCENT_GREEN ~8% rows 0-2
  enemyHalfTint: string;     // ACCENT_RED ~8% rows 3-5
  coordColor: string;
  // Cell states
  cellHover: string;
  cellSelected: string;
  cellValidMove: string;     // With alpha, e.g. #00FF8833
  cellValidAtk: string;      // With alpha
  cellAura: string;          // With alpha
  // Unit thumbnail markers
  unitBandPlayer: string;    // Bottom band on player units
  unitBandEnemy: string;     // Bottom band on enemy units
  unitBandHeight: number;    // px. Default: 8
  hpBarFull: string;
  hpBarMid: string;          // < 50% HP
  hpBarLow: string;          // < 25% HP
  hpBarBackground: string;
}

// ─────────────────────────────────────────────
// THEME JSON — CARDS
// ─────────────────────────────────────────────

export interface CardTypeTheme {
  bodyColor: string;
  bandColor: string;
  frameAsset: string;   // key in AssetsConfig
  legPipColor: string;
  borderColor: string;
  borderWidth: number;
  glowColor: string;    // '' = no glow
  glowSize: number;     // px outer glow
}

export interface CardsTheme {
  STANDARD: CardTypeTheme;
  ROYAL: CardTypeTheme;
  STATIC: CardTypeTheme;
  SPELL: CardTypeTheme;
  // Shared across all types
  atkBadgeColor: string;
  defBadgeColor: string;
  nameBarBg: string;       // Semi-transparent
  nameColor: string;
  abilityTextColor: string;
  exhaustedAlpha: number;  // 0..1, applied when unit has acted
  selectedGlowColor: string;
  selectedGlowSize: number;
}

// ─────────────────────────────────────────────
// THEME JSON — HUD
// ─────────────────────────────────────────────

export interface HUDTheme {
  panelBg: string;
  panelAlpha: number;
  playerNameColor: string;
  enemyNameColor: string;
  legColor: string;
  legRateColor: string;
  hpBarFull: string;
  hpBarMid: string;
  hpBarLow: string;
  hpBarBg: string;
  phaseLabelColor: string;
  cardPlayZoneBorderColor: string;
  cardPlayZoneBorderAlpha: number;
}

// ─────────────────────────────────────────────
// THEME JSON — BUTTONS
// ─────────────────────────────────────────────

export interface ButtonStyle {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  textColor: string;
  fontSize: number;
  hoverFillColor: string;
  hoverTextColor: string;
  cornerRadius: number;
  paddingX: number;
  paddingY: number;
}

export interface ButtonsTheme {
  primary: ButtonStyle;    // Standard action
  secondary: ButtonStyle;  // Secondary / cancel
  danger: ButtonStyle;     // Destructive
  endTurn: ButtonStyle;    // End turn — green accent
  pass: ButtonStyle;       // Pass — muted
}

// ─────────────────────────────────────────────
// THEME JSON — OVERLAYS
// ─────────────────────────────────────────────

export interface OverlayTheme {
  dimmerColor: string;
  dimmerAlpha: number;
  panelColor: string;
  panelAlpha: number;
  panelStroke: string;
  panelStrokeWidth: number;
  titleColor: string;
  bodyColor: string;
  cornerRadius: number;
}

// ─────────────────────────────────────────────
// THEME JSON — ROOT
// ─────────────────────────────────────────────

export interface ThemeJSON {
  scene: string;
  colors: ColorTokens;
  fonts: FontsConfig;
  assets: AssetsConfig;
  board: BoardTheme;
  cards: CardsTheme;
  hud: HUDTheme;
  buttons: ButtonsTheme;
  overlays: OverlayTheme;
}

// ─────────────────────────────────────────────
// RENDERER STATE TYPES (internal, not from JSON)
// ─────────────────────────────────────────────

/** The three rendering contexts for a card */
export type CardRenderMode = 'full' | 'thumbnail' | 'detail';

/** Snapshot of data HUDRenderer needs to draw */
export interface HUDSnapshot {
  playerName: string;
  opponentName: string;
  playerKingHP: number;
  playerKingMaxHP: number;
  opponentKingHP: number;
  opponentKingMaxHP: number;
  playerLEG: number;
  playerCrown: number;  
  opponentLEGCount: number;   // number of cards (hidden)
  currentPhase: string;
  turnNumber: number;
  isPlayerTurn: boolean;
  playerHandCount: number;
  opponentHandCount: number;
  playerWins: number;
  playerLosses: number;
}

/** SelectionManager internal state */
export interface SelectionState {
  selectedHandIndex: number | null;
  selectedBoardCol: number | null;
  selectedBoardRow: number | null;
  validMoves: Array<{ col: number; row: number }>;
  validAttacks: Array<{ col: number; row: number }>;
  validDeploy: Array<{ col: number; row: number }>;
  mode: 'idle' | 'card_selected' | 'unit_selected' | 'awaiting_target';
}

/** Data passed to CardRenderer per render call */
export interface CardRenderData {
  id: string;
  name: string;
  flavorText?: string;
  cardClass: string;   // 'UNIT' | 'SPELL' | 'STRUCTURE'
  allegiance: string;  // 'STANDARD' | 'ROYAL'
  cost: number;
  artKey: string;      // key in AssetsConfig, e.g. "art_foot_soldier"
  atk?: number;
  def?: number;
  currentHP?: number;
  maxHP?: number;
  abilityText?: string;
  isExhausted?: boolean;
  isSelected?: boolean;
  isEnemy?: boolean;
}

/** Data for a single board cell passed to BoardRenderer */
export interface CellRenderData {
  col: number;
  row: number;
  unit?: CardRenderData;
  highlight: 'none' | 'move' | 'attack' | 'aura' | 'selected' | 'hover';
}
