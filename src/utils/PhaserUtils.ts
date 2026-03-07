import Phaser from 'phaser';

/**
 * Set up a top-left-origin hit area on a Phaser Container.
 * 
 * IMPORTANT: We intentionally do NOT call container.setSize().
 * setSize() shifts displayOriginX/Y to center (w/2, h/2),
 * which offsets Phaser's hit testing coordinates.
 * Without setSize(), displayOrigin stays at (0,0) and the
 * Rectangle(0, 0, w, h) matches the visual bounds exactly.
 */
export function setContainerHitArea(
  container: Phaser.GameObjects.Container,
  w: number,
  h: number
): void {
  container.setInteractive(
    new Phaser.Geom.Rectangle(0, 0, w, h),
    Phaser.Geom.Rectangle.Contains
  );
}