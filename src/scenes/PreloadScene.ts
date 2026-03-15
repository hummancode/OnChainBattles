// ============================================================
// PreloadScene.ts
// Loads ALL game assets before MainMenuScene starts.
// Must be the FIRST scene in main.ts scene array.
//
// Asset key naming conventions (must match CardRenderer/BoardRenderer):
//   art_<cardId>          → card artwork (full 440×320)
//   thumb_<cardId>        → card thumbnail (200×200) ← NEW
//   card_frame_<type>     → card frame overlays
//   icon_<n>              → stat icons
//   icon_type_<allegiance>→ allegiance type icons
//   marker_<type>         → board highlight markers
//   bg_<scene>            → scene backgrounds
//
// All loads use silent error handling — missing files fall through
// to CardRenderer's built-in fallback (grey rectangle).
// This means the game runs even with 0 art files on disk.
// ============================================================

import Phaser from 'phaser';
import { DeckLoader } from '../config/DeckLoader';
import { MipmapHelper } from '../ui/MipmapHelper';


export default class PreLoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreLoadScene' });
  }

  async init(): Promise<void> {
    await DeckLoader.load();
  }

  // ─── preload() is called automatically by Phaser before create() ──────────
  preload(): void {
    const W = this.scale.width;   // 1280
    const H = this.scale.height;  // 720

    // ── Loading bar UI ────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, W, H);

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

    const barFill = this.add.graphics();

    const pctText = this.add.text(W / 2, barY + barH + 12, '0%', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#aaaaaa',
    }).setOrigin(0.5, 0);

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

    // Silent fail — CardRenderer draws grey rect for missing textures.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[PreloadScene] Asset not found (ok — fallback active): ${file.key}  →  ${file.url}`);
    });

    // ── Now queue all assets ──────────────────────────────────────────────────
    this.loadCardArt();
    this.loadCardThumbnails();   // ← NEW: loads 200×200 thumb images
    this.loadCardFrames();
    this.loadIcons();
    this.loadBoardMarkers();
    this.loadBackgrounds();
    this.loadUI();
  }

create(): void {
    console.log('[PreloadScene] All assets loaded. Starting LoginScene.');
    MipmapHelper.enableAll(this);
    this.scene.start('LoginScene');
  }

  /** Generate mipmaps for a texture (drastically improves downscale quality). */
  /** Generate mipmaps for a texture (improves downscale quality). */
  private enableMipmaps(key: string, gl: WebGLRenderingContext): void {
    if (!this.textures.exists(key)) return;

    const texture = this.textures.get(key);
    const source = texture.source?.[0];
    if (!source) return;

    // Phaser 4 stores the WebGL texture in varying paths — find it
    const glTex = (source as any).glTexture
      ?? (source as any).texture
      ?? (source as any).webGLTexture;

    if (!glTex || !(glTex instanceof WebGLTexture)) {
      // Log once so we can find the right path
      if (key === 'art_king') {
        console.log('[Mipmap] source keys:', Object.keys(source));
        console.log('[Mipmap] source:', source);
      }
      return;
    }

    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // ─── ALL CARD IDS (shared by art + thumb loaders) ─────────────────────────
  // Union of DEMO_DECK_IDS (unique) + 'king'.
  // Kept inline so PreloadScene has no import from game logic.
  // If you add a card to CardDefinitions, add its id here too.
  private static readonly ALL_CARD_IDS: string[] = [
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

  // ─── CARD ART ─────────────────────────────────────────────────────────────
  // Full card art (440×320) used in hand display and detail overlay.
  // Key pattern: art_<cardId>   Path: assets/cards/art/<cardId>.png
  //
  // NOTE: The file on disk for "knights_guard" is named "kings_guard.png".
  // We handle this mismatch explicitly below.
  private loadCardArt(): void {
    const BASE = 'assets/cards/art/';

    PreLoadScene.ALL_CARD_IDS.forEach(id => {
      // ── Filename mismatch fix ──────────────────────────
      // CardDefinitions uses id "knights_guard" but the art
      // file on disk is "kings_guard.png".
      const filename = id === 'knights_guard' ? 'kings_guard' : id;
      this.load.image(`art_${id}`, `${BASE}${filename}.png`);
    });
  }

  // ─── CARD THUMBNAILS (NEW) ────────────────────────────────────────────────
  // Dedicated 200×200 thumbnail images for board unit rendering.
  // Using these instead of downscaling 440×320 full art to 100×100
  // eliminates the blurriness on board units.
  //
  // Key pattern: thumb_<cardId>   Path: assets/cards/thumb/<cardId>_thumb.png
  // If thumb is missing, CardRenderer falls back to art_<cardId>.
  private loadCardThumbnails(): void {
    const BASE = 'assets/cards/thumb/';

    PreLoadScene.ALL_CARD_IDS.forEach(id => {
      // Thumb files use the consistent naming: <id>_thumb.png
      // knights_guard → knights_guard_thumb.png (correct on disk)
      this.load.image(`thumb_${id}`, `${BASE}${id}_thumb.png`);
    });
  }

  // ─── CARD FRAMES ──────────────────────────────────────────────────────────
  private loadCardFrames(): void {
    const BASE = 'assets/cards/';

    ['standard', 'royal', 'static', 'spell'].forEach(type => {
      this.load.image(`card_frame_${type}`, `${BASE}card_frame_${type}.png`);
    });

    this.load.image('card_back', `${BASE}card_back_pattern.png`);
  }

  // ─── ICONS ────────────────────────────────────────────────────────────────
  private loadIcons(): void {
    const BASE = 'assets/icons/';

    ['atk', 'def', 'leg', 'move', 'cavalry', 'clock', 'ranged'].forEach(name => {
      this.load.image(`icon_${name}`, `${BASE}icon_${name}.png`);
    });

    ['standard', 'royal', 'static', 'spell'].forEach(type => {
      this.load.image(`icon_type_${type}`, `${BASE}icon_type_${type}.png`);
    });
  }

  // ─── BOARD MARKERS ────────────────────────────────────────────────────────
  private loadBoardMarkers(): void {
    const BASE = 'assets/fx/';

    ['move', 'attack', 'aura', 'selected', 'danger'].forEach(type => {
      this.load.image(`marker_${type}`, `${BASE}marker_${type}.png`);
    });
  }

  // ─── BACKGROUNDS ──────────────────────────────────────────────────────────
  // Load ALL background images from assets/backgrounds/.
  // Scenes check textures.exists() before using — missing is safe.
  private loadBackgrounds(): void {
    const BASE = 'assets/backgrounds/';

    // Scene backgrounds
    this.load.image('bg_main_menu', `${BASE}bg_main_menu.png`);
    this.load.image('bg_battle',    `${BASE}bg_battle.png`);
    this.load.image('bg_result',    `${BASE}bg_result.png`);

    // Additional backgrounds available on disk
    this.load.image('bg_board',     `${BASE}bg_board.png`);
    this.load.image('bg_lobby',     `${BASE}bg_lobby.png`);
    this.load.image('bg_menu',      `${BASE}bg_menu.png`);

    // Board skin overlay
    this.load.image('board_skin',   'assets/board/board_skin.png');
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  private loadUI(): void {
    this.load.image('logo', 'assets/ui/logo.png');
  }
}