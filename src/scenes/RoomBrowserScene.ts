// ============================================================
// RoomBrowserScene.ts
// Lists public rooms with auto-refresh. Click to join.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';
import { LobbySocketManager } from '../lobby/LobbySocketManager';
import { fetchPublicRooms } from '../lobby/RoomBrowserAPI';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import type { PublicRoomListing } from '../../shared/types/NetworkEvents';

const CX = 640;
const LIST_TOP = 130;
const ROW_HEIGHT = 50;
const MAX_VISIBLE = 8;

export default class RoomBrowserScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private rooms: PublicRoomListing[] = [];
  private roomTexts: Phaser.GameObjects.Text[] = [];
  private refreshTimer?: Phaser.Time.TimerEvent;
  private statusText!: Phaser.GameObjects.Text;
  private failCount = 0;
  private transitioning = false;

  constructor() { super('RoomBrowserScene'); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(CX - 380, 30, 760, 640, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(CX - 380, 30, 760, 640, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Header
    this.add.text(CX, 60, 'BROWSE GAMES', {
      fontSize: '28px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    new MenuButton(this, 320, 60, '[ BACK ]', {
      color: '#ff4444', fontSize: '16px',
      onPointerDown: () => this.goBack(),
    });

    // Column headers
    const headerY = 100;
    this.add.text(300, headerY, 'ROOM', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(550, headerY, 'HOST', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(730, headerY, 'PLAYERS', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(830, headerY, 'MODE', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(940, headerY, '', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);

    // Status
    this.statusText = this.add.text(CX, 640, 'Loading...', {
      fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
    }).setOrigin(0.5);

    // Connect + lobby socket
    if (!SocketManager.isConnected()) {
      SocketManager.connectOnly();
    }

    this.lobbySM = new LobbySocketManager({
      onJoined: (code) => {
        if (this.transitioning) return;
        this.transitioning = true;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('LobbyScene', { roomCode: code, isHost: false });
        });
      },
      onError: (msg) => ToastNotification.show(this, msg, { color: '#ff4444' }),
    });
    this.lobbySM.attach();

    // Initial fetch + auto-refresh
    this.fetchRooms();
    this.refreshTimer = this.time.addEvent({
      delay: 5000,
      callback: () => this.fetchRooms(),
      loop: true,
    });

    this.events.once('shutdown', () => this.cleanup());
  }

  private async fetchRooms(): Promise<void> {
    try {
      this.rooms = await fetchPublicRooms();
      this.failCount = 0;
      this.renderRoomList();
    } catch {
      this.failCount++;
      if (this.failCount >= 3) {
        this.statusText.setText('Server connection issues...').setColor('#ff4444');
      }
    }
  }

  private renderRoomList(): void {
    // Clear old room text objects
    for (const t of this.roomTexts) t.destroy();
    this.roomTexts = [];

    if (this.rooms.length === 0) {
      this.statusText.setText('No rooms available. Host one from the Hub!').setColor('#AAAAAA');
      return;
    }

    this.statusText.setText(`${this.rooms.length} room${this.rooms.length > 1 ? 's' : ''} available`).setColor('#4fc3f7');

    const visible = this.rooms.slice(0, MAX_VISIBLE);
    for (let i = 0; i < visible.length; i++) {
      const room = visible[i];
      const y = LIST_TOP + i * ROW_HEIGHT;

      const nameText = this.add.text(300, y, room.roomName.slice(0, 20), {
        fontSize: '16px', fontFamily: '"Courier New", monospace', color: '#FFFFFF',
      });

      const hostText = this.add.text(550, y, room.hostName.slice(0, 12), {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
      });

      const countText = this.add.text(730, y, `${room.playerCount}/${room.maxPlayers}`, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
      });

      const modeColor = room.isCrypto ? '#f5a623' : '#00ff88';
      const modeLabel = room.isCrypto ? 'CRYPTO' : 'FREE';
      const modeText = this.add.text(830, y, modeLabel, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: modeColor,
      });

      const joinBtn = this.add.text(940, y, '[ JOIN ]', {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#00ff88',
      }).setInteractive({ useHandCursor: true });

      joinBtn.on('pointerover', () => joinBtn.setColor('#ffffff'));
      joinBtn.on('pointerout', () => joinBtn.setColor('#00ff88'));
      joinBtn.on('pointerdown', () => {
        this.lobbySM.joinRoom(room.code, GameState.playerName || 'Guest');
      });

      this.roomTexts.push(nameText, hostText, countText, modeText, joinBtn);
    }
  }

  private goBack(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }

  private cleanup(): void {
    this.refreshTimer?.remove();
    this.refreshTimer = undefined;
    this.lobbySM?.detach();
  }
}
