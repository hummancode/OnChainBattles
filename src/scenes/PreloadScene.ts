// ============================================================
// PreloadScene.ts
// Loads ALL game assets before MainMenuScene starts.
// Must be the FIRST scene in main.ts scene array.
//
// Asset key naming conventions (must match CardRenderer/BoardRenderer):
//   art_<cardId>          → card artwork
//   card_frame_<type>     → card frame overlays
//   icon_<name>           → stat icons
//   icon_type_<allegiance>→ allegiance type icons
//   marker_<type>         → board highlight markers
//
// All loads use silent error handling — missing files fall through
// to CardRenderer's built-in fallback (grey rectangle).
// This means the game runs even with 0 art files on disk.
// ============================================================

import Phaser from 'phaser';

export default class PreLoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreLoadScene' });
  }

  // ─── preload() is called automatically by Phaser before create() ──────────
  preload(): void {
    const W = this.scale.width;   // 1280
    const H = this.scale.height;  // 720

    // ── Loading bar UI ────────────────────────────────────────────────────────
    // Dark background so bar is readable before any assets load
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, W, H);

    // Logo / title text (no texture needed — pure text)
    this.add.text(W / 2, H / 2 - 80, 'OnChainBattles', {
      fontFamily: 'Arial',
      fontSize: '36px',
      color: '#F5A623',
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2 - 36, 'Loading...', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#888888',
    }).setOrigin(0.5);

    // Progress bar track
    const barX   = W / 2 - 300;
    const barY   = H / 2;
    const barW   = 600;
    const barH   = 20;

    const barTrack = this.add.graphics();
    barTrack.lineStyle(1, 0x444466, 1);
    barTrack.strokeRect(barX, barY, barW, barH);

    // Progress bar fill (updates on 'progress' event)
    const barFill = this.add.graphics();

    // Percent text
    const pctText = this.add.text(W / 2, barY + barH + 12, '0%', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#aaaaaa',
    }).setOrigin(0.5, 0);

    // File name text (shows what's loading)
    const fileText = this.add.text(W / 2, barY + barH + 32, '', {
      fontFamily: 'Arial',
      fontSize: '11px',
      color: '#666688',
    }).setOrigin(0.5, 0);

    // Wire Phaser loader events
    this.load.on('progress', (value: number) => {
      barFill.clear();
      barFill.fillStyle(0xF5A623, 1);
      barFill.fillRect(barX + 1, barY + 1, (barW - 2) * value, barH - 2);
      pctText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      fileText.setText(file.key);
    });

    // Silent fail — CardRenderer already draws grey rect for missing textures.
    // Log to console so developer can see what's missing, but never crash.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[PreloadScene] Asset not found (ok — fallback active): ${file.key}  →  ${file.url}`);
    });

    // ── Now queue all assets ──────────────────────────────────────────────────
    this.loadCardArt();
    this.loadCardFrames();
    this.loadIcons();
    this.loadBoardMarkers();
    this.loadBackgrounds();
    this.loadUI();
  }

  create(): void {
    console.log('[PreloadScene] All assets loaded. Starting MainMenuScene.');
    this.scene.start('MainMenuScene');
  }

  // ─── CARD ART ─────────────────────────────────────────────────────────────
  // Sourced from DEMO_DECK_IDS + king (pre-placed, not in deck).
  // Key pattern: art_<cardId>   Path: assets/cards/art/<cardId>.png
  // Any missing file falls through to CardRenderer grey-rect fallback.
  private loadCardArt(): void {
    const BASE = 'assets/cards/art/';

    // ── All card IDs used in the game ────────────────────────────────────────
    // This list is the union of DEMO_DECK_IDS (unique) + 'king'.
    // Kept inline here so PreloadScene has no import from game logic.
    // If you add a card to CardDefinitions, add its id here too.
    const ALL_CARD_IDS: string[] = [
      // King (pre-placed, not in deck)
      'king',
      // Standard units
      'foot_soldier',   // 3 copies
      'pikeman',        // 2
      'archer',         // 2
      'assassin',       // 2
      'militia',        // 2
      'scout',          // 2
      'lancer',         // 2
      'mystic',         // 1
      'messenger',      // 2
      // Royal units
      'swordsman',      // 2
      'princess',       // 1
      'priest',         // 2
      'commander',      // 1
      'inquisitor',     // 2
      'knight',         // 2
      'knights_guard',  // 1
      'scribe',         // 2
      // Structures
      'castle',         // 1
      'temple',         // 2
      'village',        // 2
      // Spells
      'disease',        // 2
      'casus_belli',    // 1
      'reform',         // 2
      'civil_war',      // 1
      'earthquake',     // 1
      'war_horn',       // 2
      'coup',           // 1
      'treason',        // 2
      'motherland',     // 1
      'peasant_revolt', // 1
    ];

    ALL_CARD_IDS.forEach(id => {
      this.load.image(`art_${id}`, `${BASE}${id}.png`);
    });
  }

  // ─── CARD FRAMES ──────────────────────────────────────────────────────────
  // Used by CardRenderer as frame overlay on full cards.
  // Keys must match theme.cards.STANDARD/ROYAL/STATIC/SPELL.frameAsset
  private loadCardFrames(): void {
    const BASE = 'assets/cards/';

    // Frame overlays — one per allegiance/class combo
    ['standard', 'royal', 'static', 'spell'].forEach(type => {
      this.load.image(`card_frame_${type}`, `${BASE}card_frame_${type}.png`);
    });

    // Card back — used for opponent hand face-down cards
    this.load.image('card_back', `${BASE}card_back_pattern.png`);
  }

  // ─── ICONS ────────────────────────────────────────────────────────────────
  // Stat icons (atk/def/leg/move) and allegiance type icons.
  // Missing icons simply don't render — no crash.
  private loadIcons(): void {
    const BASE = 'assets/icons/';

    // Stat icons — shown on card stat rows and board thumbnails
    ['atk', 'def', 'leg', 'move', 'cavalry', 'clock', 'ranged'].forEach(name => {
      this.load.image(`icon_${name}`, `${BASE}icon_${name}.png`);
    });

    // Allegiance type icons — top-right corner of full cards
    ['standard', 'royal', 'static', 'spell'].forEach(type => {
      this.load.image(`icon_type_${type}`, `${BASE}icon_type_${type}.png`);
    });
  }

  // ─── BOARD MARKERS ────────────────────────────────────────────────────────
  // Semi-transparent overlay tiles used for move/attack/aura highlights.
  // BoardRenderer falls back to fillStyle graphics if these are missing.
  private loadBoardMarkers(): void {
    const BASE = 'assets/fx/';

    ['move', 'attack', 'aura', 'selected', 'danger'].forEach(type => {
      this.load.image(`marker_${type}`, `${BASE}marker_${type}.png`);
    });
  }

  // ─── BACKGROUNDS ──────────────────────────────────────────────────────────
  private loadBackgrounds(): void {
    const BASE = 'assets/backgrounds/';

    this.load.image('bg_main_menu', `${BASE}bg_main_menu.png`);
    this.load.image('bg_battle',    `${BASE}bg_battle.png`);
    this.load.image('bg_result',    `${BASE}bg_result.png`);
    this.load.image('board_skin',   'assets/board/board_skin.png');
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  private loadUI(): void {
    this.load.image('logo', 'assets/ui/logo.png');
  }
}