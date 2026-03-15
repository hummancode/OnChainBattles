// ============================================================
// DeckListView.ts
// Renders the DECK_LIST view: saved decks with actions,
// plus the "currently playing" deck info (default or active).
// ============================================================

import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import type { DeckBuilderState, DeckBuilderCallbacks } from './DeckBuilderState';

const CX = 640;
const FONT = '"Courier New", monospace';
const MAX_DECKS = 10;
const LEFT = 180;

export function renderDeckList(
  scene: Phaser.Scene,
  state: DeckBuilderState,
  cb: DeckBuilderCallbacks,
): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];

  // ── Decks Section ──────────────────────────────────────────
  const deckCount = state.decks.length;
  const sectionY = 85;

  objs.push(scene.add.text(CX, sectionY, `── Your Decks (${deckCount}/${MAX_DECKS}) ──`, {
    fontSize: '15px', fontFamily: FONT, color: '#4fc3f7',
  }).setOrigin(0.5));

  if (deckCount === 0) {
    objs.push(scene.add.text(CX, sectionY + 60, 'No decks yet — creating starter deck...', {
      fontSize: '16px', fontFamily: FONT, color: '#555555',
    }).setOrigin(0.5));
  } else {
    // Column headers
    objs.push(scene.add.text(LEFT, sectionY + 25, 'Name', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));
    objs.push(scene.add.text(480, sectionY + 25, 'Cards', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));
    objs.push(scene.add.text(560, sectionY + 25, 'Status', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));
    objs.push(scene.add.text(680, sectionY + 25, 'Actions', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));

    let y = sectionY + 42;
    const rowH = 36;

    for (const deck of state.decks) {
      const isActive = deck.id === state.activeDeckId;
      const isDeleting = state.deleteConfirmId === deck.id;

      // Active row highlight
      if (isActive) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(0xf5a623, 0.06);
        rowBg.fillRoundedRect(LEFT - 10, y - 3, 920, rowH - 2, 4);
        objs.push(rowBg);
      }

      if (isDeleting) {
        objs.push(scene.add.text(LEFT, y + 2, `Delete "${deck.name}"?`, {
          fontSize: '14px', fontFamily: FONT, color: '#ff4444',
        }));

        const yesBtn = scene.add.text(620, y + 2, '[ YES, DELETE ]', {
          fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        yesBtn.on('pointerover', () => yesBtn.setColor('#ffffff'));
        yesBtn.on('pointerout', () => yesBtn.setColor('#ff4444'));
        yesBtn.on('pointerdown', () => cb.onConfirmDelete(deck.id));
        objs.push(yesBtn);

        const noBtn = scene.add.text(800, y + 2, '[ CANCEL ]', {
          fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
        }).setInteractive({ useHandCursor: true });
        noBtn.on('pointerover', () => noBtn.setColor('#ffffff'));
        noBtn.on('pointerout', () => noBtn.setColor('#4fc3f7'));
        noBtn.on('pointerdown', () => cb.onCancelDelete());
        objs.push(noBtn);

        y += rowH;
        continue;
      }

      // Deck name
      const nameColor = isActive ? '#f5a623' : '#FFFFFF';
      const prefix = isActive ? '\u25B6 ' : '  ';
      objs.push(scene.add.text(LEFT, y, `${prefix}${deck.name}`, {
        fontSize: '15px', fontFamily: FONT, fontStyle: 'bold', color: nameColor,
      }));

      // Card count
      const countColor = deck.cardIds.length === 31 ? '#AAAAAA' : '#ff4444';
      objs.push(scene.add.text(480, y + 2, `${deck.cardIds.length}/31`, {
        fontSize: '13px', fontFamily: FONT, color: countColor,
      }));

      // Validity badge
      const validColor = deck.isValid ? '#00ff88' : '#ff4444';
      const validLabel = deck.isValid ? 'VALID' : 'INVALID';
      objs.push(scene.add.text(560, y + 2, validLabel, {
        fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: validColor,
      }));

      // Action buttons
      let btnX = 680;

      if (isActive) {
        objs.push(scene.add.text(btnX, y + 2, 'ACTIVE', {
          fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
        }));
        btnX += 70;
      } else {
        const actBtn = scene.add.text(btnX, y + 2, '[ACTIVATE]', {
          fontSize: '12px', fontFamily: FONT, color: deck.isValid ? '#4fc3f7' : '#444444',
        });
        if (deck.isValid) {
          actBtn.setInteractive({ useHandCursor: true });
          actBtn.on('pointerover', () => actBtn.setColor('#ffffff'));
          actBtn.on('pointerout', () => actBtn.setColor('#4fc3f7'));
          actBtn.on('pointerdown', () => cb.onActivateDeck(deck.id));
        }
        objs.push(actBtn);
        btnX += 95;
      }

      const editBtn = scene.add.text(btnX, y + 2, '[EDIT]', {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }).setInteractive({ useHandCursor: true });
      editBtn.on('pointerover', () => editBtn.setColor('#ffffff'));
      editBtn.on('pointerout', () => editBtn.setColor('#4fc3f7'));
      editBtn.on('pointerdown', () => cb.onEditDeck(deck.id));
      objs.push(editBtn);
      btnX += 60;

      // Delete: not allowed for active deck or last remaining deck
      const canDelete = !isActive && deckCount > 1;
      if (canDelete) {
        const delBtn = scene.add.text(btnX, y + 2, '[DEL]', {
          fontSize: '12px', fontFamily: FONT, color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        delBtn.on('pointerover', () => delBtn.setColor('#ffffff'));
        delBtn.on('pointerout', () => delBtn.setColor('#ff4444'));
        delBtn.on('pointerdown', () => cb.onDeleteDeck(deck.id));
        objs.push(delBtn);
      }

      y += rowH;
    }
  }

  // ── New Deck Button ───────────────────────────────────────
  const emptyRows = deckCount === 0 ? 1 : deckCount;
  const btnY = Math.max(380, sectionY + 42 + emptyRows * 36 + 30);

  if (deckCount < MAX_DECKS) {
    const newBtn = new MenuButton(scene, CX, btnY, '[ + NEW DECK ]', {
      color: '#00ff88', fontSize: '22px',
      onPointerDown: () => cb.onCreateDeck(),
    });
    objs.push(newBtn.text);
  } else {
    objs.push(scene.add.text(CX, btnY, 'Maximum decks reached (10/10)', {
      fontSize: '14px', fontFamily: FONT, color: '#777777',
    }).setOrigin(0.5));
  }

  // Collection summary
  const ownedCount = state.collection.filter(c => c.ownedCopies > 0).length;
  objs.push(scene.add.text(CX, btnY + 50, `Card collection: ${ownedCount} unique cards owned`, {
    fontSize: '13px', fontFamily: FONT, color: '#555555',
  }).setOrigin(0.5));

  // Tip
  objs.push(scene.add.text(CX, 680, 'Create a deck and activate it to use in matches', {
    fontSize: '10px', fontFamily: FONT, color: '#3a3a3a',
  }).setOrigin(0.5));

  return objs;
}
