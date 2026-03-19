// ============================================================
// DeckBuilderScene.ts
// Thin orchestrator: owns state, handles API calls, delegates
// rendering to DeckListView and DeckEditorView.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import { AuthManager } from '../auth/AuthManager';
import { DeckAPI, type DeckSummary } from '../deck/DeckAPI';
import { CollectionAPI } from '../deck/CollectionAPI';
import { validateDeckClient } from '../deck/DeckValidatorClient';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { DeckLoader } from '../config/DeckLoader';
import { DeckView, createInitialState, type DeckBuilderState, type DeckBuilderCallbacks } from '../deck/DeckBuilderState';
import { renderDeckList } from '../deck/DeckListView';
import { renderDeckEditor } from '../deck/DeckEditorView';
import { showCardDetail } from '../deck/CardDetailOverlay';
import { CardClass } from '../game/types/CardTypes';

const CX = 640;
const FONT = '"Courier New", monospace';

export default class DeckBuilderScene extends Phaser.Scene {
  private state!: DeckBuilderState;
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private inputManager!: DOMInputManager;
  private cardDetailContainer?: Phaser.GameObjects.Container;
  private transitioning = false;

  // Persistent background (always visible)
  private bgObjects: Phaser.GameObjects.GameObject[] = [];
  // Persistent header (hidden during editor view)
  private headerObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('DeckBuilderScene'); }

  create(): void {
    const { width, height } = this.scale;
    this.state = createInitialState();
    this.inputManager = new DOMInputManager(this);

    // Background
    if (this.textures.exists('bg_main_menu')) {
      this.bgObjects.push(this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height));
    } else {
      this.bgObjects.push(this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e));
    }

    // Main panel (wider for editor)
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.90);
    panel.fillRoundedRect(100, 15, 1080, 695, 10);
    panel.lineStyle(2, 0xf5a623, 0.4);
    panel.strokeRoundedRect(100, 15, 1080, 695, 10);
    this.bgObjects.push(panel);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Persistent header (only visible in DECK_LIST view)
    this.headerObjects.push(this.add.text(CX, 45, 'DECK BUILDER', {
      fontSize: '28px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5));

    const backBtn = new MenuButton(this, 200, 45, '[ BACK ]', {
      color: '#ff4444', fontSize: '16px',
      onPointerDown: () => this.callbacks.onBackToHub(),
    });
    this.headerObjects.push(backBtn.text);

    // Loading text
    const loadingText = this.add.text(CX, 350, 'Loading...', {
      fontSize: '16px', fontFamily: FONT, color: '#AAAAAA',
    }).setOrigin(0.5);

    this.loadData(loadingText);

    this.events.once('shutdown', () => this.cleanup());
  }

  // ─── Callbacks ────────────────────────────────────────────

  private callbacks: DeckBuilderCallbacks = {
    onEditDeck: (deckId) => {
      const deck = this.state.decks.find(d => d.id === deckId);
      if (!deck) return;
      this.state.editor = {
        deckId: deck.id,
        deckName: deck.name,
        cardIds: [...deck.cardIds],
        dirty: false,
        validation: validateDeckClient(deck.cardIds),
        classFilter: 'ALL',
        sortBy: 'cost',
        collectionPage: 0,
      };
      this.state.currentView = DeckView.DECK_EDITOR;
      this.renderCurrentView();
    },

    onCreateDeck: () => {
      this.state.editor = {
        deckId: null,
        deckName: 'New Deck',
        cardIds: [],
        dirty: false,
        validation: validateDeckClient([]),
        classFilter: 'ALL',
        sortBy: 'cost',
        collectionPage: 0,
      };
      this.state.currentView = DeckView.DECK_EDITOR;
      this.renderCurrentView();
    },

    onDeleteDeck: (deckId) => {
      this.state.deleteConfirmId = deckId;
      this.renderCurrentView();
    },

    onConfirmDelete: async (deckId) => {
      try {
        await DeckAPI.remove(deckId);
        if (this.state.activeDeckId === deckId) {
          this.state.activeDeckId = null;
          GameState.setActiveDeck(null, []);
          AuthManager.setActiveDeckId(null);
        }
        ToastNotification.show(this, 'Deck deleted', { color: '#AAAAAA' });
        await this.refreshDecks();
      } catch (err: any) {
        ToastNotification.show(this, err.message || 'Delete failed', { color: '#ff4444' });
      }
      this.state.deleteConfirmId = null;
      this.renderCurrentView();
    },

    onCancelDelete: () => {
      this.state.deleteConfirmId = null;
      this.renderCurrentView();
    },

    onActivateDeck: async (deckId) => {
      try {
        await DeckAPI.activate(deckId);
        const deck = this.state.decks.find(d => d.id === deckId);
        if (deck) {
          this.state.activeDeckId = deckId;
          GameState.setActiveDeck(deckId, deck.cardIds);
          AuthManager.setActiveDeckId(deckId);
          DeckLoader.invalidate();
        }
        ToastNotification.show(this, 'Deck activated!', { color: '#00ff88' });
        this.renderCurrentView();
      } catch (err: any) {
        ToastNotification.show(this, err.message || 'Activation failed', { color: '#ff4444' });
      }
    },

    onAddCard: (cardId) => {
      const editor = this.state.editor;
      if (!editor) return;
      editor.cardIds.push(cardId);
      editor.dirty = true;
      editor.validation = validateDeckClient(editor.cardIds);
      this.renderCurrentView();
    },

    onRemoveCard: (cardId) => {
      const editor = this.state.editor;
      if (!editor) return;
      const idx = editor.cardIds.indexOf(cardId);
      if (idx >= 0) {
        editor.cardIds.splice(idx, 1);
        editor.dirty = true;
        editor.validation = validateDeckClient(editor.cardIds);
        this.renderCurrentView();
      }
    },

    onSave: async () => {
      await this.saveDeck(false);
    },

    onSaveAndActivate: async () => {
      await this.saveDeck(true);
    },

    onBackToList: () => {
      if (this.state.editor?.dirty) {
        // Could add confirmation overlay; for now just go back
      }
      this.state.editor = null;
      this.state.currentView = DeckView.DECK_LIST;
      this.renderCurrentView();
    },

    onBackToHub: () => {
      if (this.transitioning) return;
      this.transitioning = true;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('HubScene');
      });
    },

    onShowCardDetail: (cardId) => {
      this.dismissCardDetail();
      this.cardDetailContainer = showCardDetail(
        this, cardId, this.state.collection,
        () => this.dismissCardDetail(),
      );
    },

    onDismissCardDetail: () => {
      this.dismissCardDetail();
    },

    onFilterChange: (filter: CardClass | 'ALL') => {
      if (!this.state.editor) return;
      this.state.editor.classFilter = filter;
      this.state.editor.collectionPage = 0;
      this.renderCurrentView();
    },

    onSortChange: (sort: 'cost' | 'name') => {
      if (!this.state.editor) return;
      this.state.editor.sortBy = sort;
      this.renderCurrentView();
    },

    onPageChange: (delta: number) => {
      if (!this.state.editor) return;
      this.state.editor.collectionPage = Math.max(0, this.state.editor.collectionPage + delta);
      this.renderCurrentView();
    },
  };

  // ─── Data Loading ─────────────────────────────────────────

  private async loadData(loadingText: Phaser.GameObjects.Text): Promise<void> {
    try {
      const [deckResult, collection] = await Promise.all([
        DeckAPI.list().catch(() => ({ decks: [] as DeckSummary[] })),
        CollectionAPI.get().catch(() => []),
      ]);

      if (!this.scene.isActive('DeckBuilderScene')) return;

      this.state.decks = deckResult.decks;
      this.state.collection = collection;

      // Auto-create starter deck if player has no decks
      if (this.state.decks.length === 0) {
        await this.createStarterDeck();
      }

      // Auto-activate the only valid deck if none is active
      if (this.state.activeDeckId == null && this.state.decks.length > 0) {
        const validDecks = this.state.decks.filter(d => d.isValid);
        if (validDecks.length === 1) {
          try {
            await DeckAPI.activate(validDecks[0].id);
            this.state.activeDeckId = validDecks[0].id;
            GameState.setActiveDeck(validDecks[0].id, validDecks[0].cardIds);
            AuthManager.setActiveDeckId(validDecks[0].id);
            DeckLoader.invalidate();
          } catch { /* activation failed — user can manually activate */ }
        }
      }

      this.state.loading = false;
    } catch {
      this.state.loading = false;
    }

    loadingText.destroy();
    this.renderCurrentView();
  }

  private async createStarterDeck(): Promise<void> {
    try {
      const res = await fetch('/default-deck.json');
      if (!res.ok) return;
      const config = await res.json();
      if (!Array.isArray(config.deckIds) || config.deckIds.length === 0) return;

      const name = config.name || 'Starter Deck';
      const result = await DeckAPI.create(name, config.deckIds);
      const deck = result.deck;

      // Auto-activate it
      if (deck.isValid) {
        await DeckAPI.activate(deck.id);
        this.state.activeDeckId = deck.id;
        GameState.setActiveDeck(deck.id, config.deckIds);
        DeckLoader.invalidate();
      }

      // Refresh deck list
      const refreshed = await DeckAPI.list();
      if (!this.scene.isActive('DeckBuilderScene')) return;
      this.state.decks = refreshed.decks;
    } catch (err) {
      console.warn('[DeckBuilder] Failed to create starter deck:', err);
    }
  }

  private async refreshDecks(): Promise<void> {
    try {
      const result = await DeckAPI.list();
      if (!this.scene.isActive('DeckBuilderScene')) return;
      this.state.decks = result.decks;
    } catch { /* keep stale data */ }
  }

  // ─── Save Logic ───────────────────────────────────────────

  private async saveDeck(andActivate: boolean): Promise<void> {
    const editor = this.state.editor;
    if (!editor) return;

    const name = editor.deckName.trim() || 'My Deck';
    const cardIds = editor.cardIds;

    try {
      let savedDeck: DeckSummary;

      if (editor.deckId) {
        const result = await DeckAPI.update(editor.deckId, name, cardIds);
        savedDeck = result.deck;
        ToastNotification.show(this, 'Deck saved!', { color: '#00ff88' });
      } else {
        const result = await DeckAPI.create(name, cardIds);
        savedDeck = result.deck;
        editor.deckId = savedDeck.id;
        ToastNotification.show(this, 'Deck created!', { color: '#00ff88' });
      }

      if (andActivate && savedDeck.isValid) {
        await DeckAPI.activate(savedDeck.id);
        this.state.activeDeckId = savedDeck.id;
        GameState.setActiveDeck(savedDeck.id, cardIds);
        AuthManager.setActiveDeckId(savedDeck.id);
        DeckLoader.invalidate();
        ToastNotification.show(this, 'Deck activated!', { color: '#00ff88' });
      } else if (andActivate && !savedDeck.isValid) {
        ToastNotification.show(this, 'Cannot activate invalid deck', { color: '#ff4444' });
      }

      editor.dirty = false;
      await this.refreshDecks();

      if (!this.scene.isActive('DeckBuilderScene')) return;

      this.state.editor = null;
      this.state.currentView = DeckView.DECK_LIST;
      this.renderCurrentView();
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Save failed', { color: '#ff4444' });
    }
  }

  // ─── Rendering ────────────────────────────────────────────

  private renderCurrentView(): void {
    // Tear down previous view objects
    for (const obj of this.viewObjects) obj.destroy();
    this.viewObjects = [];
    this.inputManager?.destroyAll();

    // Toggle persistent header visibility based on view
    const showHeader = this.state.currentView === DeckView.DECK_LIST;
    for (const obj of this.headerObjects) {
      (obj as Phaser.GameObjects.Components.Visible).setVisible(showHeader);
    }

    if (this.state.currentView === DeckView.DECK_LIST) {
      this.viewObjects = renderDeckList(this, this.state, this.callbacks);
    } else {
      this.inputManager = new DOMInputManager(this);
      this.viewObjects = renderDeckEditor(this, this.state, this.callbacks, this.inputManager);
    }
  }

  private dismissCardDetail(): void {
    this.cardDetailContainer?.destroy();
    this.cardDetailContainer = undefined;
  }

  private cleanup(): void {
    this.dismissCardDetail();
    this.inputManager?.destroyAll();
    for (const obj of this.viewObjects) obj.destroy();
    this.viewObjects = [];
    this.transitioning = false;
  }
}
