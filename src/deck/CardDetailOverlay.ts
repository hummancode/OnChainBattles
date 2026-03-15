// ============================================================
// CardDetailOverlay.ts
// Popup overlay showing full card stats. Dimmer + panel.
// ============================================================

import Phaser from 'phaser';
import { getCard } from '../game/data/CardRegistry';
import type { CollectionCard } from './CollectionAPI';

const FONT = '"Courier New", monospace';

export function showCardDetail(
  scene: Phaser.Scene,
  cardId: string,
  collection: CollectionCard[],
  onDismiss: () => void,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0);

  // Dimmer
  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
    .setInteractive();
  dim.on('pointerdown', onDismiss);
  container.add(dim);

  // Panel
  const pw = 420, ph = 380;
  const px = width / 2 - pw / 2, py = height / 2 - ph / 2;

  const g = scene.add.graphics();
  g.fillStyle(0x16213e, 0.97);
  g.fillRoundedRect(px, py, pw, ph, 10);
  g.lineStyle(2, 0xf5a623, 0.6);
  g.strokeRoundedRect(px, py, pw, ph, 10);
  container.add(g);

  let card;
  try { card = getCard(cardId); } catch {
    container.add(scene.add.text(width / 2, height / 2, `Unknown card: ${cardId}`, {
      fontSize: '16px', fontFamily: FONT, color: '#ff4444',
    }).setOrigin(0.5));
    return container;
  }

  const cx = width / 2;
  let y = py + 25;
  const left = px + 20;

  // Title
  container.add(scene.add.text(cx, y, card.name, {
    fontSize: '22px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
  }).setOrigin(0.5));
  y += 35;

  // Class + Cost
  container.add(scene.add.text(left, y, `Class: ${card.class}`, {
    fontSize: '14px', fontFamily: FONT, color: '#FFFFFF',
  }));
  container.add(scene.add.text(left + 220, y, `Cost: ${card.cost}`, {
    fontSize: '14px', fontFamily: FONT, color: '#4fc3f7',
  }));
  y += 22;

  // Allegiance
  container.add(scene.add.text(left, y, `Allegiance: ${card.allegiance}`, {
    fontSize: '14px', fontFamily: FONT, color: '#AAAAAA',
  }));
  y += 22;

  // Stats (if unit/structure)
  if (card.stats) {
    container.add(scene.add.text(left, y, `ATK: ${card.stats.atk}  DEF: ${card.stats.def}`, {
      fontSize: '14px', fontFamily: FONT, color: '#FFFFFF',
    }));
    y += 22;

    container.add(scene.add.text(left, y, `Move: ${card.stats.movement}`, {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }));
    container.add(scene.add.text(left + 220, y, `Atk: ${card.stats.attackPattern}`, {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }));
    y += 22;
  }

  y += 5;

  // Ability text
  if (card.abilityText) {
    const abilityLines = wordWrap(card.abilityText, 48);
    for (const line of abilityLines) {
      container.add(scene.add.text(left, y, line, {
        fontSize: '12px', fontFamily: FONT, color: '#00ff88',
      }));
      y += 16;
    }
    y += 5;
  }

  // Flavor text
  if (card.flavorText) {
    container.add(scene.add.text(left, y, `"${card.flavorText}"`, {
      fontSize: '11px', fontFamily: FONT, fontStyle: 'italic', color: '#777777',
    }));
    y += 20;
  }

  // Ownership
  const owned = collection.find(c => c.id === cardId)?.ownedCopies ?? 0;
  container.add(scene.add.text(left, y, `Max per deck: ${card.copies}  |  You own: ${owned}`, {
    fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
  }));
  y += 30;

  // Close button
  const closeBtn = scene.add.text(cx, py + ph - 30, '[ CLOSE ]', {
    fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerout', () => closeBtn.setColor('#ff4444'));
  closeBtn.on('pointerdown', onDismiss);
  container.add(closeBtn);

  // ESC key
  const escKey = scene.input.keyboard?.addKey('ESC');
  const escHandler = () => { onDismiss(); };
  escKey?.once('down', escHandler);

  // Cleanup when container is destroyed
  container.once('destroy', () => {
    escKey?.off('down', escHandler);
  });

  return container;
}

function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
