// ============================================================
// ProfileScene.ts
// Player profile: stats, account linking, match history,
// puzzle stats, collection overview.
// ============================================================

import Phaser from 'phaser';
import { AuthManager } from '../auth/AuthManager';
import { CollectionAPI, CollectionCard } from '../deck/CollectionAPI';
import { ProfileAPI, ProfileData } from '../profile/ProfileAPI';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;
const FONT = '"Courier New", monospace';
type Tab = 'stats' | 'linking' | 'matches' | 'puzzles' | 'collection';

export default class ProfileScene extends Phaser.Scene {
  private profileData: ProfileData | null = null;
  private collection: CollectionCard[] = [];
  private currentTab: Tab = 'stats';
  private tabObjects: Phaser.GameObjects.GameObject[] = [];
  private tabBarObjects: Phaser.GameObjects.GameObject[] = [];
  private inputManager?: DOMInputManager;
  private transitioning = false;
  private collectionScroll = 0;

  constructor() { super('ProfileScene'); }

  create(): void {
    this.transitioning = false;
    this.currentTab = 'stats';
    this.collectionScroll = 0;
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
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(60, 15, 1160, 695, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Header
    this.add.text(CX, 42, 'PLAYER PROFILE', {
      fontSize: '24px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    new MenuButton(this, 160, 42, '[ BACK ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => this.goToHub(),
    });

    // Separator
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x4fc3f7, 0.3);
    sep.lineBetween(80, 60, 1200, 60);

    this.loadProfile();

    this.events.once('shutdown', () => {
      this.transitioning = false;
      this.inputManager?.destroyAll();
      this.inputManager = undefined;
    });
  }

  // ─── Data Loading ─────────────────────────────────────────

  private async loadProfile(): Promise<void> {
    if (!AuthManager.isLoggedIn()) {
      this.showError('Login required');
      return;
    }

    try {
      this.profileData = await ProfileAPI.getProfile();
    } catch {
      this.showError('Failed to load profile');
      return;
    }

    if (!this.scene.isActive('ProfileScene')) return;
    this.renderTabBar();
    this.renderTab();
  }

  private showError(msg: string): void {
    this.add.text(CX, 350, msg, {
      fontSize: '16px', fontFamily: FONT, color: '#ff4444',
    }).setOrigin(0.5);
  }

  // ─── Tab Bar ──────────────────────────────────────────────

  private renderTabBar(): void {
    for (const obj of this.tabBarObjects) obj.destroy();
    this.tabBarObjects = [];

    const tabs: { key: Tab; label: string }[] = [
      { key: 'stats', label: 'STATS' },
      { key: 'linking', label: 'ACCOUNTS' },
      { key: 'matches', label: 'MATCHES' },
      { key: 'puzzles', label: 'PUZZLES' },
      { key: 'collection', label: 'COLLECTION' },
    ];

    const startX = 200;
    const tabW = 160;

    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      const x = startX + i * tabW;
      const isActive = this.currentTab === t.key;

      const btn = this.add.text(x, 78, t.label, {
        fontSize: '13px', fontFamily: FONT, fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? '#4fc3f7' : '#555555',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => { if (this.currentTab !== t.key) btn.setColor('#AAAAAA'); });
      btn.on('pointerout', () => { if (this.currentTab !== t.key) btn.setColor('#555555'); });

      const capturedKey = t.key;
      btn.on('pointerdown', () => {
        if (this.currentTab === capturedKey) return;
        this.currentTab = capturedKey;
        this.collectionScroll = 0;
        this.renderTabBar();
        this.renderTab();
      });
      this.tabBarObjects.push(btn);

      // Active underline
      if (isActive) {
        const line = this.add.graphics();
        line.lineStyle(2, 0x4fc3f7, 1);
        line.lineBetween(x - 50, 90, x + 50, 90);
        this.tabBarObjects.push(line);
      }
    }

    // Tab separator line
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x253348, 0.6);
    sep.lineBetween(80, 95, 1200, 95);
    this.tabBarObjects.push(sep);
  }

  // ─── Tab Content ──────────────────────────────────────────

  private renderTab(): void {
    this.inputManager?.destroyAll();
    this.inputManager = undefined;
    for (const obj of this.tabObjects) obj.destroy();
    this.tabObjects = [];

    if (!this.profileData) return;

    switch (this.currentTab) {
      case 'stats': this.renderStatsTab(); break;
      case 'linking': this.renderLinkingTab(); break;
      case 'matches': this.renderMatchesTab(); break;
      case 'puzzles': this.renderPuzzlesTab(); break;
      case 'collection': this.renderCollectionTab(); break;
    }
  }

  // ─── Tab: Stats ───────────────────────────────────────────

  private renderStatsTab(): void {
    const objs = this.tabObjects;
    const p = this.profileData!.player;
    let y = 120;

    // Display name with edit
    objs.push(this.add.text(140, y, 'Display Name', {
      fontSize: '11px', fontFamily: FONT, color: '#555555',
    }));
    y += 18;

    objs.push(this.add.text(140, y, p.displayName, {
      fontSize: '22px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF',
    }));

    const editBtn = this.add.text(140 + p.displayName.length * 14 + 20, y + 4, '[ edit ]', {
      fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
    }).setInteractive({ useHandCursor: true });
    editBtn.on('pointerdown', () => this.showNameEditor());
    objs.push(editBtn);
    y += 40;

    // Account badges
    if (p.email) {
      objs.push(this.add.text(140, y, `Email: ${p.email}`, {
        fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
      }));
      y += 22;
    }
    if (p.wallet) {
      objs.push(this.add.text(140, y, `Wallet: ${p.wallet.slice(0, 6)}...${p.wallet.slice(-4)}`, {
        fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
      }));
      y += 22;
    }
    y += 10;

    // Tier badge
    const tierLabels = ['Guest', 'Free Player', 'Economy'];
    const tierColors = ['#AAAAAA', '#4fc3f7', '#f5a623'];
    const tier = p.accountTier ?? 1;
    objs.push(this.add.text(140, y, tierLabels[tier] ?? 'Free Player', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: tierColors[tier] ?? '#4fc3f7',
    }));
    if (p.foundingPlayer) {
      objs.push(this.add.text(340, y, 'FOUNDING PLAYER', {
        fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
      }));
    }
    y += 40;

    // Stats grid
    const stats = [
      { label: 'ELO Rating', value: String(p.eloRating), color: '#FFFFFF' },
      { label: 'Wins', value: String(p.winCount), color: '#00ff88' },
      { label: 'Losses', value: String(p.lossCount), color: '#ff4444' },
      { label: 'Win Rate', value: (p.winCount + p.lossCount) > 0 ? `${Math.round(p.winCount / (p.winCount + p.lossCount) * 100)}%` : '-', color: '#FFFFFF' },
    ];

    const cardW = 200;
    const cardH = 80;
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i];
      const cx = 140 + (i % 4) * (cardW + 20);
      const cy = y;

      const bg = this.add.graphics();
      bg.fillStyle(0x0a0f1e, 0.6);
      bg.fillRoundedRect(cx, cy, cardW, cardH, 6);
      bg.lineStyle(1, 0x253348, 0.6);
      bg.strokeRoundedRect(cx, cy, cardW, cardH, 6);
      objs.push(bg);

      objs.push(this.add.text(cx + cardW / 2, cy + 20, s.value, {
        fontSize: '26px', fontFamily: FONT, fontStyle: 'bold', color: s.color,
      }).setOrigin(0.5));
      objs.push(this.add.text(cx + cardW / 2, cy + 55, s.label, {
        fontSize: '11px', fontFamily: FONT, color: '#555555',
      }).setOrigin(0.5));
    }
    y += cardH + 30;

    // Puzzle stats
    const ps = this.profileData!.puzzleStats;
    objs.push(this.add.text(140, y, `Puzzles solved: ${ps.puzzlesSolved}  |  Attempts: ${ps.totalAttempts}`, {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }));
    y += 25;

    // Active deck
    const deck = this.profileData!.activeDeck;
    objs.push(this.add.text(140, y, `Active Deck: ${deck ? deck.name : 'None'}`, {
      fontSize: '13px', fontFamily: FONT, color: deck ? '#f5a623' : '#555555',
    }));
    y += 30;

    // Member since
    const since = new Date(p.createdAt).toLocaleDateString();
    objs.push(this.add.text(140, y, `Member since: ${since}`, {
      fontSize: '12px', fontFamily: FONT, color: '#444444',
    }));
  }

  private showNameEditor(): void {
    const objs = this.tabObjects;
    const p = this.profileData!.player;

    this.inputManager = new DOMInputManager(this);
    const nameInput = this.inputManager.createInput({
      gameX: 310, gameY: 140, width: 250, height: 32,
      placeholder: 'New display name', maxLength: 20,
    });
    nameInput.value = p.displayName;
    nameInput.focus();

    const saveBtn = new MenuButton(this, 480, 140, '[ SAVE ]', {
      color: '#00ff88', fontSize: '12px',
      onPointerDown: async () => {
        const newName = nameInput.value.trim();
        if (newName.length < 2) {
          ToastNotification.show(this, 'Name must be at least 2 characters', { color: '#ff4444' });
          return;
        }
        try {
          const updated = await ProfileAPI.updateDisplayName(newName);
          this.profileData!.player.displayName = updated;
          ToastNotification.show(this, 'Name updated!', { color: '#00ff88' });
          this.renderTab();
        } catch {
          ToastNotification.show(this, 'Failed to update name', { color: '#ff4444' });
        }
      },
    });
    objs.push(saveBtn.text);

    nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') saveBtn.text.emit('pointerdown');
      if (e.key === 'Escape') this.renderTab();
    });
  }

  // ─── Tab: Account Linking ─────────────────────────────────

  private renderLinkingTab(): void {
    const objs = this.tabObjects;
    const p = this.profileData!.player;
    let y = 120;

    objs.push(this.add.text(140, y, 'LINKED ACCOUNTS', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
    }));
    y += 35;

    // Email status
    const emailIcon = p.email ? '#00ff88' : '#555555';
    objs.push(this.add.text(140, y, p.email ? `Email: ${p.email}` : 'Email: Not linked', {
      fontSize: '14px', fontFamily: FONT, color: emailIcon,
    }));
    y += 28;

    // Wallet status
    const walletIcon = p.wallet ? '#00ff88' : '#555555';
    objs.push(this.add.text(140, y, p.wallet ? `Wallet: ${p.wallet.slice(0, 6)}...${p.wallet.slice(-4)}` : 'Wallet: Not linked', {
      fontSize: '14px', fontFamily: FONT, color: walletIcon,
    }));
    y += 40;

    // Link wallet button (email-only users)
    if (!p.wallet) {
      const linkWalletBtn = new MenuButton(this, 250, y, '[ LINK WALLET ]', {
        color: '#f5a623', fontSize: '18px',
        onPointerDown: async () => {
          try {
            await AuthManager.linkWallet();
            ToastNotification.show(this, 'Wallet linked!', { color: '#00ff88' });
            this.profileData = await ProfileAPI.getProfile();
            this.renderTab();
          } catch (err: any) {
            ToastNotification.show(this, err.message || 'Wallet linking failed', { color: '#ff4444' });
          }
        },
      });
      objs.push(linkWalletBtn.text);
      y += 50;
    }

    // Link email form (wallet-only users)
    if (!p.email) {
      objs.push(this.add.text(140, y, 'Link Email Address', {
        fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF',
      }));
      y += 28;

      this.inputManager = new DOMInputManager(this);
      const emailInput = this.inputManager.createInput({
        gameX: 310, gameY: y, width: 300, height: 32,
        placeholder: 'Email address', maxLength: 254,
      });
      y += 40;

      const passInput = this.inputManager.createInput({
        gameX: 310, gameY: y, width: 300, height: 32,
        placeholder: 'Password (min 8 chars)', maxLength: 128,
      });
      passInput.type = 'password';
      y += 40;

      const linkEmailBtn = new MenuButton(this, 250, y, '[ LINK EMAIL ]', {
        color: '#4fc3f7', fontSize: '16px',
        onPointerDown: async () => {
          const email = emailInput.value.trim();
          const password = passInput.value;
          if (!email || password.length < 8) {
            ToastNotification.show(this, 'Enter email and password (8+ chars)', { color: '#ff4444' });
            return;
          }
          try {
            await AuthManager.linkEmail(email, password);
            ToastNotification.show(this, 'Email linked!', { color: '#00ff88' });
            this.profileData = await ProfileAPI.getProfile();
            this.renderTab();
          } catch (err: any) {
            ToastNotification.show(this, err.message || 'Email linking failed', { color: '#ff4444' });
          }
        },
      });
      objs.push(linkEmailBtn.text);
    }

    // Both linked
    if (p.email && p.wallet) {
      objs.push(this.add.text(140, y, 'All accounts linked!', {
        fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#00ff88',
      }));
    }
  }

  // ─── Tab: Matches ─────────────────────────────────────────

  private renderMatchesTab(): void {
    const objs = this.tabObjects;
    const matches = this.profileData!.matchHistory;
    let y = 120;

    objs.push(this.add.text(140, y, 'MATCH HISTORY', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
    }));
    y += 30;

    if (matches.length === 0) {
      objs.push(this.add.text(140, y, 'No matches played yet.', {
        fontSize: '14px', fontFamily: FONT, color: '#555555',
      }));
      return;
    }

    // Column headers
    objs.push(this.add.text(140, y, 'Result', { fontSize: '10px', fontFamily: FONT, color: '#444444' }));
    objs.push(this.add.text(230, y, 'Opponent', { fontSize: '10px', fontFamily: FONT, color: '#444444' }));
    objs.push(this.add.text(500, y, 'Turns', { fontSize: '10px', fontFamily: FONT, color: '#444444' }));
    objs.push(this.add.text(580, y, 'Stake', { fontSize: '10px', fontFamily: FONT, color: '#444444' }));
    objs.push(this.add.text(700, y, 'Date', { fontSize: '10px', fontFamily: FONT, color: '#444444' }));
    y += 18;

    for (const m of matches.slice(0, 15)) {
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x0a0f1e, 0.4);
      rowBg.fillRoundedRect(130, y - 2, 900, 26, 3);
      objs.push(rowBg);

      // Result
      objs.push(this.add.text(140, y, m.won ? 'WIN' : 'LOSS', {
        fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: m.won ? '#00ff88' : '#ff4444',
      }));

      // Opponent
      objs.push(this.add.text(230, y, m.opponentName, {
        fontSize: '13px', fontFamily: FONT, color: '#FFFFFF',
      }));

      // Turns
      objs.push(this.add.text(500, y, String(m.totalTurns), {
        fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
      }));

      // Stake
      const stakeLabel = m.stakeAmount > 0 ? `${m.stakeAmount} AVAX` : 'Free';
      objs.push(this.add.text(580, y, stakeLabel, {
        fontSize: '13px', fontFamily: FONT, color: m.stakeAmount > 0 ? '#f5a623' : '#555555',
      }));

      // Date
      const date = new Date(m.startedAt).toLocaleDateString();
      objs.push(this.add.text(700, y, date, {
        fontSize: '12px', fontFamily: FONT, color: '#555555',
      }));

      y += 30;
    }
  }

  // ─── Tab: Puzzles ─────────────────────────────────────────

  private renderPuzzlesTab(): void {
    const objs = this.tabObjects;
    const ps = this.profileData!.puzzleStats;
    let y = 120;

    objs.push(this.add.text(140, y, 'PUZZLE STATS', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
    }));
    y += 40;

    // Stat cards
    const cards = [
      { label: 'Puzzles Solved', value: String(ps.puzzlesSolved), color: '#00ff88' },
      { label: 'Total Attempts', value: String(ps.totalAttempts), color: '#f5a623' },
    ];

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const cx = 140 + i * 250;
      const bg = this.add.graphics();
      bg.fillStyle(0x0a0f1e, 0.6);
      bg.fillRoundedRect(cx, y, 220, 100, 8);
      bg.lineStyle(1, 0x253348, 0.6);
      bg.strokeRoundedRect(cx, y, 220, 100, 8);
      objs.push(bg);

      objs.push(this.add.text(cx + 110, y + 30, c.value, {
        fontSize: '36px', fontFamily: FONT, fontStyle: 'bold', color: c.color,
      }).setOrigin(0.5));
      objs.push(this.add.text(cx + 110, y + 72, c.label, {
        fontSize: '12px', fontFamily: FONT, color: '#555555',
      }).setOrigin(0.5));
    }
  }

  // ─── Tab: Collection ──────────────────────────────────────

  private async renderCollectionTab(): Promise<void> {
    const objs = this.tabObjects;
    let y = 120;

    objs.push(this.add.text(140, y, 'CARD COLLECTION', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
    }));

    // Load collection if not cached
    if (this.collection.length === 0) {
      this.collection = await CollectionAPI.get();
      if (!this.scene.isActive('ProfileScene')) return;
    }

    const totalOwned = this.collection.filter(c => c.ownedCopies > 0).length;
    objs.push(this.add.text(400, y + 2, `${totalOwned} / ${this.collection.length} cards owned`, {
      fontSize: '12px', fontFamily: FONT, color: '#AAAAAA',
    }));
    y += 35;

    // Grid layout
    const thumbSize = 80;
    const gap = 10;
    const cols = 10;
    const gridX = 140;
    const maxRows = 5;

    // Scroll
    const totalRows = Math.ceil(this.collection.length / cols);
    const maxScroll = Math.max(0, totalRows - maxRows);
    if (this.collectionScroll > maxScroll) this.collectionScroll = maxScroll;

    const startIdx = this.collectionScroll * cols;
    const endIdx = Math.min(startIdx + maxRows * cols, this.collection.length);

    for (let i = startIdx; i < endIdx; i++) {
      const card = this.collection[i];
      const localIdx = i - startIdx;
      const col = localIdx % cols;
      const row = Math.floor(localIdx / cols);
      const cx = gridX + col * (thumbSize + gap);
      const cy = y + row * (thumbSize + gap + 20);

      const owned = card.ownedCopies > 0;

      // Card thumbnail
      const thumbKey = this.textures.exists(`thumb_${card.id}`) ? `thumb_${card.id}`
                      : this.textures.exists(`art_${card.id}`) ? `art_${card.id}`
                      : null;

      if (thumbKey) {
        const img = this.add.image(cx, cy, thumbKey).setDisplaySize(thumbSize, thumbSize).setOrigin(0);
        if (!owned) img.setTint(0x333333).setAlpha(0.4);
        objs.push(img);
      } else {
        const g = this.add.graphics();
        g.fillStyle(owned ? 0x333355 : 0x1a1a2e, 1);
        g.fillRect(cx, cy, thumbSize, thumbSize);
        objs.push(g);
      }

      // Border
      const border = this.add.graphics();
      border.lineStyle(1, owned ? 0x4fc3f7 : 0x253348, owned ? 0.6 : 0.3);
      border.strokeRect(cx, cy, thumbSize, thumbSize);
      objs.push(border);

      // Card name below
      objs.push(this.add.text(cx + thumbSize / 2, cy + thumbSize + 3, card.name, {
        fontSize: '8px', fontFamily: FONT, color: owned ? '#AAAAAA' : '#333333',
      }).setOrigin(0.5, 0));

      // Owned count badge
      if (owned) {
        objs.push(this.add.text(cx + thumbSize - 2, cy + 2, `x${card.ownedCopies}`, {
          fontSize: '10px', fontFamily: FONT, fontStyle: 'bold', color: '#00ff88',
          backgroundColor: '#000000',
          padding: { x: 2, y: 1 },
        }).setOrigin(1, 0));
      }
    }

    // Scroll buttons
    const scrollY = y + maxRows * (thumbSize + gap + 20) + 5;

    if (totalRows > maxRows) {
      objs.push(this.add.text(CX - 60, scrollY, `Page ${this.collectionScroll + 1} / ${maxScroll + 1}`, {
        fontSize: '11px', fontFamily: FONT, color: '#555555',
      }).setOrigin(0.5));

      if (this.collectionScroll > 0) {
        const upBtn = this.add.text(CX - 130, scrollY, '\u25C0 Prev', {
          fontSize: '13px', fontFamily: FONT, color: '#4fc3f7',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        upBtn.on('pointerdown', () => { this.collectionScroll--; this.renderTab(); });
        objs.push(upBtn);
      }

      if (this.collectionScroll < maxScroll) {
        const downBtn = this.add.text(CX + 20, scrollY, 'Next \u25B6', {
          fontSize: '13px', fontFamily: FONT, color: '#4fc3f7',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        downBtn.on('pointerdown', () => { this.collectionScroll++; this.renderTab(); });
        objs.push(downBtn);
      }
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
}
