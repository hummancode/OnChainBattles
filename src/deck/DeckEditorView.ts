// ============================================================
// DeckEditorView.ts
// Renders the DECK_EDITOR view: left=deck contents, right=collection.
// ============================================================

import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import { DOMInputManager } from '../ui/DOMInputManager';
import { getCard } from '../game/data/CardRegistry';
import { CardClass } from '../game/types/CardTypes';
import { groupDeckCards, filterCollection, availableCopies, buildCostCurveLines } from './DeckBuilderHelpers';
import type { DeckBuilderState, DeckBuilderCallbacks } from './DeckBuilderState';

const FONT = '"Courier New", monospace';

// Layout constants — wider panel (100..1180)
const LEFT_X = 135;     // left panel content start
const DIVIDER_X = 620;  // vertical divider
const RIGHT_X = 650;    // right panel content start
const RIGHT_END = 1140;  // right panel end
const ROW_H = 22;
const DECK_MAX_ROWS = 20;
const COLL_PAGE_SIZE = 16;

export function renderDeckEditor(
  scene: Phaser.Scene,
  state: DeckBuilderState,
  cb: DeckBuilderCallbacks,
  inputManager: DOMInputManager,
): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const editor = state.editor!;

  // ── Header Bar ────────────────────────────────────────────
  // Left: back button
  const backBtn = new MenuButton(scene, 200, 40, '[ BACK TO DECKS ]', {
    color: '#ff4444', fontSize: '14px',
    onPointerDown: () => cb.onBackToList(),
  });
  objs.push(backBtn.text);

  // Center: deck name input
  const nameInput = inputManager.createInput({
    gameX: 490, gameY: 40, width: 200, height: 28,
    placeholder: 'Deck name...', maxLength: 30,
  });
  nameInput.value = editor.deckName;
  nameInput.addEventListener('input', () => {
    editor.deckName = nameInput.value;
    editor.dirty = true;
  });

  // Right: card count + validity + dirty flag
  const countColor = editor.validation.valid ? '#00ff88' : '#ff4444';
  const validLabel = editor.validation.valid ? 'VALID' : 'INVALID';
  const dirtyStr = editor.dirty ? '  *' : '';
  objs.push(scene.add.text(680, 34, `${editor.validation.cardCount}/31  ${validLabel}${dirtyStr}`, {
    fontSize: '18px', fontFamily: FONT, fontStyle: 'bold', color: countColor,
  }));

  // Separator line
  const sepLine = scene.add.graphics();
  sepLine.lineStyle(1, 0xf5a623, 0.3);
  sepLine.lineBetween(120, 62, 1160, 62);
  objs.push(sepLine);

  // ── Vertical Divider ─────────────────────────────────────
  const divider = scene.add.graphics();
  divider.lineStyle(1, 0x4fc3f7, 0.25);
  divider.lineBetween(DIVIDER_X, 62, DIVIDER_X, 645);
  objs.push(divider);

  // ══════════════════════════════════════════════════════════
  // LEFT PANEL: Deck Contents
  // ══════════════════════════════════════════════════════════
  objs.push(scene.add.text(LEFT_X, 72, 'DECK CONTENTS', {
    fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
  }));

  // Sort toggle
  const sortLabel = editor.sortBy === 'cost' ? 'COST' : 'NAME';
  const sortBtn = scene.add.text(LEFT_X + 330, 72, `Sort:[${sortLabel}]`, {
    fontSize: '11px', fontFamily: FONT, color: '#4fc3f7',
  }).setInteractive({ useHandCursor: true });
  sortBtn.on('pointerover', () => sortBtn.setColor('#ffffff'));
  sortBtn.on('pointerout', () => sortBtn.setColor('#4fc3f7'));
  sortBtn.on('pointerdown', () => {
    cb.onSortChange(editor.sortBy === 'cost' ? 'name' : 'cost');
  });
  objs.push(sortBtn);

  // Column header
  objs.push(scene.add.text(LEFT_X, 92, 'Card               Cost  Qty', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));

  const deckEntries = groupDeckCards(editor.cardIds, editor.sortBy);

  if (deckEntries.length === 0) {
    objs.push(scene.add.text(LEFT_X, 115, 'Empty — add cards from collection', {
      fontSize: '12px', fontFamily: FONT, color: '#555555',
    }));
  } else {
    let y = 108;
    for (const entry of deckEntries.slice(0, DECK_MAX_ROWS)) {
      // Card name (clickable)
      const nameText = scene.add.text(LEFT_X, y, entry.name, {
        fontSize: '13px', fontFamily: FONT, color: '#FFFFFF',
      }).setInteractive({ useHandCursor: true });
      nameText.on('pointerover', () => nameText.setColor('#4fc3f7'));
      nameText.on('pointerout', () => nameText.setColor('#FFFFFF'));
      nameText.on('pointerdown', () => cb.onShowCardDetail(entry.cardId));
      objs.push(nameText);

      // Cost
      objs.push(scene.add.text(LEFT_X + 230, y + 1, `${entry.cost}`, {
        fontSize: '12px', fontFamily: FONT, color: '#777777',
      }));

      // Count
      objs.push(scene.add.text(LEFT_X + 290, y + 1, `x${entry.count}`, {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }));

      // Remove button
      const removeBtn = scene.add.text(LEFT_X + 340, y, '[-]', {
        fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
      }).setInteractive({ useHandCursor: true });
      removeBtn.on('pointerover', () => removeBtn.setColor('#ffffff'));
      removeBtn.on('pointerout', () => removeBtn.setColor('#ff4444'));
      const capturedId = entry.cardId;
      removeBtn.on('pointerdown', () => cb.onRemoveCard(capturedId));
      objs.push(removeBtn);

      y += ROW_H;
    }

    if (deckEntries.length > DECK_MAX_ROWS) {
      objs.push(scene.add.text(LEFT_X, 108 + DECK_MAX_ROWS * ROW_H, `... +${deckEntries.length - DECK_MAX_ROWS} more`, {
        fontSize: '10px', fontFamily: FONT, color: '#555555',
      }));
    }
  }

  // ── Cost Curve (compact, inline) ──────────────────────────
  const curveY = 560;
  objs.push(scene.add.text(LEFT_X, curveY, 'MANA CURVE', {
    fontSize: '10px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
  }));

  const curveLines = buildCostCurveLines(editor.validation.costCurve);
  let cy = curveY + 14;
  for (const line of curveLines) {
    objs.push(scene.add.text(LEFT_X, cy, line, {
      fontSize: '10px', fontFamily: FONT, color: '#AAAAAA',
    }));
    cy += 12;
  }

  // ══════════════════════════════════════════════════════════
  // RIGHT PANEL: Collection Browser
  // ══════════════════════════════════════════════════════════
  objs.push(scene.add.text(RIGHT_X, 72, 'COLLECTION', {
    fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
  }));

  // Class filter tabs
  const filters: Array<{ key: CardClass | 'ALL'; label: string }> = [
    { key: 'ALL', label: 'ALL' },
    { key: CardClass.UNIT, label: 'UNIT' },
    { key: CardClass.SPELL, label: 'SPELL' },
    { key: CardClass.STRUCTURE, label: 'STRUCT' },
  ];

  let fx = RIGHT_X;
  for (const f of filters) {
    const isSelected = editor.classFilter === f.key;
    const baseColor = isSelected ? '#f5a623' : '#555555';

    const filterBtn = scene.add.text(fx, 92, `[${f.label}]`, {
      fontSize: '11px', fontFamily: FONT, fontStyle: isSelected ? 'bold' : 'normal', color: baseColor,
    }).setInteractive({ useHandCursor: true });
    filterBtn.on('pointerover', () => { if (!isSelected) filterBtn.setColor('#ffffff'); });
    filterBtn.on('pointerout', () => { if (!isSelected) filterBtn.setColor(baseColor); });
    const capturedKey = f.key;
    filterBtn.on('pointerdown', () => cb.onFilterChange(capturedKey));
    objs.push(filterBtn);

    fx += f.label.length * 8 + 28;
  }

  // Column headers
  objs.push(scene.add.text(RIGHT_X, 112, 'Card', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 200, 112, 'Cost', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 250, 112, 'A/D', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 300, 112, 'In Deck', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 370, 112, 'Own', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));

  // Filtered collection
  const filteredCards = filterCollection(state.collection, editor.classFilter, editor.sortBy);
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / COLL_PAGE_SIZE));
  const page = Math.min(editor.collectionPage, totalPages - 1);
  const pageCards = filteredCards.slice(page * COLL_PAGE_SIZE, (page + 1) * COLL_PAGE_SIZE);

  let ry = 128;
  for (const collCard of pageCards) {
    let cardDef;
    try { cardDef = getCard(collCard.id); } catch { continue; }

    const canAdd = availableCopies(collCard.id, editor.cardIds, state.collection);
    const inDeck = editor.cardIds.filter(id => id === collCard.id).length;
    const maxCopies = cardDef.copies;

    // Card name (clickable)
    const nameColor = inDeck > 0 ? '#FFFFFF' : '#BBBBBB';
    const nameText = scene.add.text(RIGHT_X, ry, cardDef.name, {
      fontSize: '12px', fontFamily: FONT, color: nameColor,
    }).setInteractive({ useHandCursor: true });
    nameText.on('pointerover', () => nameText.setColor('#4fc3f7'));
    nameText.on('pointerout', () => nameText.setColor(nameColor));
    const capturedId = collCard.id;
    nameText.on('pointerdown', () => cb.onShowCardDetail(capturedId));
    objs.push(nameText);

    // Cost
    objs.push(scene.add.text(RIGHT_X + 205, ry + 1, `${cardDef.cost}`, {
      fontSize: '11px', fontFamily: FONT, color: '#777777',
    }));

    // Stats (ATK/DEF)
    const statsStr = cardDef.stats ? `${cardDef.stats.atk}/${cardDef.stats.def}` : '--';
    objs.push(scene.add.text(RIGHT_X + 250, ry + 1, statsStr, {
      fontSize: '11px', fontFamily: FONT, color: '#777777',
    }));

    // In deck count (colored)
    const deckCountColor = inDeck >= maxCopies ? '#f5a623' : inDeck > 0 ? '#4fc3f7' : '#444444';
    objs.push(scene.add.text(RIGHT_X + 310, ry + 1, `${inDeck}/${maxCopies}`, {
      fontSize: '11px', fontFamily: FONT, color: deckCountColor,
    }));

    // Owned count
    objs.push(scene.add.text(RIGHT_X + 375, ry + 1, `${collCard.ownedCopies}`, {
      fontSize: '11px', fontFamily: FONT, color: '#777777',
    }));

    // Add button
    if (canAdd > 0) {
      const addBtn = scene.add.text(RIGHT_X + 410, ry, '[+]', {
        fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#00ff88',
      }).setInteractive({ useHandCursor: true });
      addBtn.on('pointerover', () => addBtn.setColor('#ffffff'));
      addBtn.on('pointerout', () => addBtn.setColor('#00ff88'));
      addBtn.on('pointerdown', () => cb.onAddCard(capturedId));
      objs.push(addBtn);
    } else {
      objs.push(scene.add.text(RIGHT_X + 410, ry, '[+]', {
        fontSize: '12px', fontFamily: FONT, color: '#2a2a2a',
      }));
    }

    ry += ROW_H;
  }

  // Pagination
  if (totalPages > 1) {
    const pageY = 128 + COLL_PAGE_SIZE * ROW_H + 8;

    if (page > 0) {
      const prevBtn = scene.add.text(RIGHT_X + 100, pageY, '< Prev', {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }).setInteractive({ useHandCursor: true });
      prevBtn.on('pointerover', () => prevBtn.setColor('#ffffff'));
      prevBtn.on('pointerout', () => prevBtn.setColor('#4fc3f7'));
      prevBtn.on('pointerdown', () => cb.onPageChange(-1));
      objs.push(prevBtn);
    }

    objs.push(scene.add.text(RIGHT_X + 190, pageY, `${page + 1} / ${totalPages}`, {
      fontSize: '12px', fontFamily: FONT, color: '#777777',
    }));

    if (page < totalPages - 1) {
      const nextBtn = scene.add.text(RIGHT_X + 280, pageY, 'Next >', {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }).setInteractive({ useHandCursor: true });
      nextBtn.on('pointerover', () => nextBtn.setColor('#ffffff'));
      nextBtn.on('pointerout', () => nextBtn.setColor('#4fc3f7'));
      nextBtn.on('pointerdown', () => cb.onPageChange(1));
      objs.push(nextBtn);
    }
  }

  // ══════════════════════════════════════════════════════════
  // BOTTOM BAR: Save buttons + validation errors
  // ══════════════════════════════════════════════════════════
  const bottomSep = scene.add.graphics();
  bottomSep.lineStyle(1, 0xf5a623, 0.3);
  bottomSep.lineBetween(120, 650, 1160, 650);
  objs.push(bottomSep);

  const saveBtn = new MenuButton(scene, 420, 672, '[ SAVE ]', {
    color: '#00ff88', fontSize: '18px',
    onPointerDown: () => cb.onSave(),
  });
  objs.push(saveBtn.text);

  const saveActivateBtn = new MenuButton(scene, 680, 672, '[ SAVE & ACTIVATE ]', {
    color: '#f5a623', fontSize: '18px',
    onPointerDown: () => cb.onSaveAndActivate(),
  });
  if (!editor.validation.valid) {
    saveActivateBtn.setDisabled(true);
  }
  objs.push(saveActivateBtn.text);

  // Validation errors
  if (editor.validation.errors.length > 0) {
    const errText = editor.validation.errors.slice(0, 2).join('  |  ');
    objs.push(scene.add.text(640, 696, errText, {
      fontSize: '10px', fontFamily: FONT, color: '#ff4444',
    }).setOrigin(0.5));
  }

  return objs;
}
