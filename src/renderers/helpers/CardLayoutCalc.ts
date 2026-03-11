// ============================================================
// CardLayoutCalc.ts
// Shared card spacing and grid layout calculations.
// Used by HandRenderer (fan layout) and OverlayRenderer (grid).
// ============================================================

export interface GridLayout {
  /** Top-left X of first cell (centered in container). */
  startX: number;
  /** Top-left Y of first cell. */
  startY: number;
  /** Number of columns that fit. */
  cols: number;
}

/**
 * Calculate grid layout parameters for a panel of cards.
 * Cards are spaced with `gap` between them and centered
 * horizontally within `panelWidth`.
 */
export function calcCardGrid(
  panelWidth: number,
  panelHeight: number,
  cardW: number,
  _cardH: number,
  gap = 8,
  paddingX = 20,
  topOffset = 50,
): GridLayout {
  const cols = Math.floor((panelWidth - paddingX * 2) / (cardW + gap));
  const gridWidth = cols * (cardW + gap) - gap;
  const startX = -gridWidth / 2 + cardW / 2;
  const startY = -panelHeight / 2 + topOffset;
  return { startX, startY, cols };
}

/**
 * Get X,Y for a card at `index` in a grid layout.
 */
export function gridPosition(
  grid: GridLayout,
  index: number,
  cardW: number,
  cardH: number,
  gap = 8,
): { x: number; y: number } {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return {
    x: grid.startX + col * (cardW + gap),
    y: grid.startY + row * (cardH + gap),
  };
}

/**
 * Calculate vertical card fan position for hand display.
 * Returns position and rotation for the card at `index`.
 */
export function fanPosition(
  index: number,
  total: number,
  config: { x: number; y: number; cardWidth: number; cardHeight: number; spacing: number; fanAngle: number }
): { x: number; y: number; angle: number } {
  if (total === 1) {
    return { x: config.x - config.cardWidth / 2, y: config.y, angle: 0 };
  }
  const centerIdx = (total - 1) / 2;
  const angle = (index - centerIdx) * config.fanAngle;
  const xShift = (index - centerIdx) * (config.fanAngle * 0.8);
  return {
    x: config.x - config.cardWidth / 2 + xShift,
    y: config.y + index * (config.cardHeight + config.spacing),
    angle,
  };
}
