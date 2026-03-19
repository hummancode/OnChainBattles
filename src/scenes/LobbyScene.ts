// ============================================================
// LobbyScene.ts
// Enhanced room: chat, ready, kick, host controls, deck submit.
// Receives { roomCode, isHost } from HubScene or RoomBrowserScene.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';
import { AuthManager } from '../auth/AuthManager';
import { LobbySocketManager } from '../lobby/LobbySocketManager';
import { DeckLoader } from '../config/DeckLoader';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';
import type { LobbyState, ChatMessage } from '../../shared/types/NetworkEvents';

interface LobbySceneData {
  roomCode: string;
  isHost: boolean;
}

const CX = 640;
const FONT = '"Courier New", monospace';

export default class LobbyScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private inputManager!: DOMInputManager;
  private roomCode = '';
  private isHost = false;
  private latestState: LobbyState | null = null;
  private transitioning = false;
  private disconnectHandler?: () => void;

  // UI handles
  private statusText!: Phaser.GameObjects.Text;
  private playerListTexts: Phaser.GameObjects.GameObject[] = [];
  private chatTexts: Phaser.GameObjects.Text[] = [];
  private chatInput?: HTMLInputElement;
  private readyBtn?: MenuButton;
  private startBtn?: MenuButton;

  constructor() { super('LobbyScene'); }

  init(data: LobbySceneData): void {
    this.roomCode = data.roomCode ?? '';
    this.isHost = data.isHost ?? false;
  }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Main Panel ──────────────────────────────────────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.90);
    panel.fillRoundedRect(60, 15, 1160, 695, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.3);
    panel.strokeRoundedRect(60, 15, 1160, 695, 10);

    // ── Header ──────────────────────────────────────────────
    this.add.text(CX, 38, `ROOM:  ${this.roomCode}`, {
      fontSize: '24px', fontFamily: FONT,
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    new MenuButton(this, CX + 160, 38, '[ Copy ]', {
      color: '#777777', fontSize: '12px', fontStyle: 'normal',
      onPointerDown: async () => {
        const ok = await ShareHelper.copyToClipboard(this.roomCode);
        if (ok) ToastNotification.show(this, `Copied: ${this.roomCode}`, { color: '#00ff88' });
      },
    });

    // Mode badge
    const modeLabel = this.isHost ? 'HOST' : 'PLAYER';
    const modeColor = this.isHost ? '#f5a623' : '#4fc3f7';
    this.add.text(CX + 240, 38, modeLabel, {
      fontSize: '11px', fontFamily: FONT, fontStyle: 'bold', color: modeColor,
    }).setOrigin(0.5);

    // Separator
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x4fc3f7, 0.2);
    sep.lineBetween(80, 58, 1200, 58);

    // ── Left Panel: Players ─────────────────────────────────
    const leftPanel = this.add.graphics();
    leftPanel.fillStyle(0x0a0f1e, 0.5);
    leftPanel.fillRoundedRect(80, 68, 480, 340, 8);
    leftPanel.lineStyle(1, 0x4fc3f7, 0.2);
    leftPanel.strokeRoundedRect(80, 68, 480, 340, 8);

    this.add.text(320, 82, 'PLAYERS', {
      fontSize: '14px', fontFamily: FONT,
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    // Column headers
    this.add.text(100, 102, 'Name', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    });
    this.add.text(370, 102, 'Status', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    });

    // ── Right Panel: Chat ───────────────────────────────────
    const rightPanel = this.add.graphics();
    rightPanel.fillStyle(0x0a0f1e, 0.5);
    rightPanel.fillRoundedRect(580, 68, 620, 340, 8);
    rightPanel.lineStyle(1, 0x4fc3f7, 0.2);
    rightPanel.strokeRoundedRect(580, 68, 620, 340, 8);

    this.add.text(890, 82, 'CHAT', {
      fontSize: '14px', fontFamily: FONT,
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    // Chat input
    this.inputManager = new DOMInputManager(this);
    this.chatInput = this.inputManager.createInput({
      gameX: 830, gameY: 430, width: 440, height: 30,
      placeholder: 'Type message...',
      maxLength: 200,
    });
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.sendChat();
    });

    new MenuButton(this, 1100, 430, '[ Send ]', {
      color: '#4fc3f7', fontSize: '12px', fontStyle: 'normal',
      onPointerDown: () => this.sendChat(),
    });

    // ── Status Bar ──────────────────────────────────────────
    this.statusText = this.add.text(CX, 480, 'Connecting...', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5);

    // ── Player Info ─────────────────────────────────────────
    const player = AuthManager.isLoggedIn() ? AuthManager.getPlayer() : null;
    const displayName = player?.displayName || GameState.playerName || 'Guest';
    let walletBadge = '';
    if (player?.wallet) walletBadge = ` (${player.wallet.slice(0, 6)}...)`;
    else if (player?.email) walletBadge = ` (${player.email})`;
    this.add.text(100, 510, `You: ${displayName}${walletBadge}`, {
      fontSize: '12px', fontFamily: FONT, color: '#555555',
    });

    // Deck info
    const deckIds = DeckLoader.get();
    this.add.text(500, 510, `Deck: ${deckIds.length} cards`, {
      fontSize: '12px', fontFamily: FONT, color: '#555555',
    });

    // ── Bottom Buttons ──────────────────────────────────────
    const btnY = 560;

    this.readyBtn = new MenuButton(this, CX - 200, btnY, '[ READY ]', {
      color: '#00ff88', fontSize: '24px',
      onPointerDown: () => this.lobbySM.toggleReady(this.roomCode),
    });

    if (this.isHost) {
      this.startBtn = new MenuButton(this, CX + 20, btnY, '[ START GAME ]', {
        color: '#f5a623', fontSize: '24px',
        onPointerDown: () => this.lobbySM.startGame(this.roomCode),
      });
    }

    new MenuButton(this, CX + 250, btnY, '[ LEAVE ]', {
      color: '#ff4444', fontSize: '18px',
      onPointerDown: () => this.leaveRoom(),
    });

    // ── Socket Setup ────────────────────────────────────────
    if (!SocketManager.isConnected()) {
      SocketManager.connectOnly();
    }

    if (AuthManager.isLoggedIn()) {
      SocketManager.registerPlayer(AuthManager.getToken()!);
    }

    this.lobbySM = new LobbySocketManager({
      onStateUpdate: (state) => this.onStateUpdate(state),
      onChatMessage: (msg) => this.addChatMessage(msg),
      onSystemMessage: (text) => this.addChatMessage({ sender: 'SYSTEM', text, timestamp: Date.now() }),
      onKicked: (reason) => {
        ToastNotification.show(this, `Kicked: ${reason}`, { color: '#ff4444' });
        this.time.delayedCall(1500, () => this.goToHub());
      },
      onGameStarting: () => {
        this.statusText.setText('Game starting!').setColor('#00ff88');
        this.time.delayedCall(800, () => this.enterBattle());
      },
      onDepositPhase: (stakeAmount) => {
        this.statusText.setText(`Deposit ${stakeAmount} AVAX to continue`).setColor('#f5a623');
      },
      onBothDeposited: () => {
        this.statusText.setText('Both deposited! Starting...').setColor('#00ff88');
      },
      onSubmitDecks: () => {
        const ids = DeckLoader.get();
        this.lobbySM.submitDeck(this.roomCode, ids);
      },
      onError: (msg) => {
        ToastNotification.show(this, msg, { color: '#ff4444' });
      },
    });
    this.lobbySM.attach();
    this.lobbySM.requestRoomState(this.roomCode);

    // Disconnect safety
    const rawSocket = SocketManager.getSocket();
    if (rawSocket) {
      this.disconnectHandler = () => {
        if (this.transitioning) return;
        this.statusText?.setText('Disconnected from server').setColor('#ff4444');
        this.time.delayedCall(2000, () => this.goToHub());
      };
      rawSocket.once('disconnect', this.disconnectHandler);
    }

    this.events.once('shutdown', () => this.cleanup());
  }

  // ─── State Updates ─────────────────────────────────────────

  private onStateUpdate(state: LobbyState): void {
    this.latestState = state;
    this.renderPlayerList(state);

    const modeLabel = state.settings.isCrypto ? 'CRYPTO' : 'FREE';
    const playerCount = state.players.length;
    const maxPlayers = state.settings.maxPlayers ?? 2;

    let statusLabel: string;
    let statusColor: string;

    if (state.status === 'waiting') {
      statusLabel = `Waiting for players... ${playerCount}/${maxPlayers} (${modeLabel})`;
      statusColor = '#f5a623';
    } else if (state.status === 'full') {
      const allReady = state.players.every(p => p.ready);
      statusLabel = allReady ? 'All ready! Host can start' : 'Room full — ready up!';
      statusColor = allReady ? '#00ff88' : '#4fc3f7';
    } else {
      statusLabel = state.status;
      statusColor = '#4fc3f7';
    }

    this.statusText.setText(statusLabel).setColor(statusColor);
  }

  private renderPlayerList(state: LobbyState): void {
    for (const t of this.playerListTexts) t.destroy();
    this.playerListTexts = [];

    state.players.forEach((p, i) => {
      const y = 125 + i * 65;

      // Player row background
      const rowBg = this.add.graphics();
      rowBg.fillStyle(p.ready ? 0x00ff88 : 0x4fc3f7, 0.04);
      rowBg.fillRoundedRect(95, y - 5, 450, 50, 6);
      this.playerListTexts.push(rowBg);

      // Name + badge
      const badge = p.isHost ? ' [HOST]' : '';
      this.playerListTexts.push(this.add.text(110, y + 4, `${p.name}${badge}`, {
        fontSize: '17px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF',
      }));

      // Role tag
      if (p.isHost) {
        this.playerListTexts.push(this.add.text(110, y + 28, 'Room Creator', {
          fontSize: '10px', fontFamily: FONT, color: '#777777',
        }));
      }

      // Ready status
      const readyColor = p.ready ? '#00ff88' : '#ff4444';
      const readyLabel = p.ready ? 'READY' : 'NOT READY';
      this.playerListTexts.push(this.add.text(380, y + 8, readyLabel, {
        fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: readyColor,
      }));

      // Ready indicator dot
      const dot = this.add.graphics();
      dot.fillStyle(p.ready ? 0x00ff88 : 0xff4444, 1);
      dot.fillCircle(365, y + 16, 5);
      this.playerListTexts.push(dot);

      // Kick button (host only, not self)
      if (this.isHost && !p.isHost) {
        const kickBtn = this.add.text(490, y + 8, '[KICK]', {
          fontSize: '11px', fontFamily: FONT, color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        kickBtn.on('pointerover', () => kickBtn.setColor('#ffffff'));
        kickBtn.on('pointerout', () => kickBtn.setColor('#ff4444'));
        kickBtn.on('pointerdown', () => this.lobbySM.kickPlayer(this.roomCode, p.name));
        this.playerListTexts.push(kickBtn);
      }
    });

    // Empty slot indicator
    const maxPlayers = state.settings.maxPlayers ?? 2;
    if (state.players.length < maxPlayers) {
      for (let i = state.players.length; i < maxPlayers; i++) {
        const y = 125 + i * 65;
        const slotBg = this.add.graphics();
        slotBg.lineStyle(1, 0x4fc3f7, 0.1);
        slotBg.strokeRoundedRect(95, y - 5, 450, 50, 6);
        this.playerListTexts.push(slotBg);

        this.playerListTexts.push(this.add.text(110, y + 10, 'Waiting for player...', {
          fontSize: '14px', fontFamily: FONT, fontStyle: 'italic', color: '#333333',
        }));
      }
    }
  }

  // ─── Chat ──────────────────────────────────────────────────

  private addChatMessage(msg: ChatMessage): void {
    const isSystem = msg.sender === 'SYSTEM';
    const color = isSystem ? '#f5a623' : '#FFFFFF';
    const prefix = isSystem ? '' : `${msg.sender}: `;

    const text = this.add.text(600, 0, `${prefix}${msg.text}`, {
      fontSize: '12px', fontFamily: FONT, color,
      wordWrap: { width: 580 },
    });
    this.chatTexts.push(text);

    // Keep last 10 messages visible
    if (this.chatTexts.length > 10) {
      this.chatTexts.shift()?.destroy();
    }
    this.chatTexts.forEach((t, i) => {
      t.setPosition(600, 105 + i * 26);
    });
  }

  private sendChat(): void {
    if (!this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;
    this.lobbySM.sendChat(this.roomCode, text);
    this.chatInput.value = '';
  }

  // ─── Navigation ──────────────────────────────────────────

  private leaveRoom(): void {
    this.lobbySM.leaveRoom(this.roomCode);
    this.goToHub();
  }

  private goToHub(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }

  private enterBattle(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    const opponent = this.latestState?.players.find(p =>
      (this.isHost && !p.isHost) || (!this.isHost && p.isHost)
    );
    const opponentName = opponent?.name || GameState.opponentName || 'Opponent';
    GameState.setOpponentName(opponentName);
    GameState.setRoomCode(this.roomCode);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName,
        opponentName,
        isCryptoMode: this.latestState?.settings.isCrypto ?? false,
        roomCode: this.roomCode,
      });
    });
  }

  private cleanup(): void {
    this.lobbySM?.detach();
    this.inputManager?.destroyAll();
    if (this.disconnectHandler) {
      SocketManager.getSocket()?.off('disconnect', this.disconnectHandler);
      this.disconnectHandler = undefined;
    }
  }
}
