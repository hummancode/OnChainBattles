@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

echo.
echo  ============================================================
echo   OnChainBattles -- Project Generator
echo   Creates folders, source stubs, JSONs, placeholder PNGs
echo  ============================================================
echo.

:: ROOT = directory where this bat lives
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
echo [ROOT] %ROOT%
echo.

:: ==============================================================
:: STEP 1 - DIRECTORIES
:: ==============================================================
echo [1/5] Creating directory structure...

for %%D in (
    "public\assets\backgrounds"
    "public\assets\board"
    "public\assets\cards\art"
    "public\assets\cards\thumb"
    "public\assets\icons"
    "public\assets\fx"
    "public\assets\ui"
    "public\layouts"
    "public\themes"
    "src\game\types"
    "src\game\data"
    "src\config"
    "src\events"
    "src\scenes"
    "src\renderers"
    "src\input"
    "src\network"
    "src\wallet"
    "server"
    "tools\layout-editor"
) do (
    if not exist "%ROOT%\%%~D" (
        mkdir "%ROOT%\%%~D" >nul 2>&1
        echo    + %%~D
    )
)
echo    Done.
echo.

:: ==============================================================
:: STEP 2 - ROOT CONFIG FILES
:: ==============================================================
echo [2/5] Writing root config files...

:: -- package.json
if not exist "%ROOT%\package.json" (
    (
        echo {
        echo   "name": "onchainbattles",
        echo   "version": "0.2.0",
        echo   "private": true,
        echo   "scripts": {
        echo     "dev":     "vite",
        echo     "build":   "vite build",
        echo     "preview": "vite preview",
        echo     "server":  "node server/index.js"
        echo   },
        echo   "dependencies": {
        echo     "phaser":           "^4.0.0",
        echo     "socket.io-client": "^4.7.5",
        echo     "ethers":           "^6.11.0"
        echo   },
        echo   "devDependencies": {
        echo     "typescript": "^5.4.5",
        echo     "vite":       "^5.2.0"
        echo   }
        echo }
    ) > "%ROOT%\package.json"
    echo    + package.json
)

:: -- tsconfig.json
if not exist "%ROOT%\tsconfig.json" (
    (
        echo {
        echo   "compilerOptions": {
        echo     "target":                      "ES2020",
        echo     "module":                      "ESNext",
        echo     "moduleResolution":            "bundler",
        echo     "strict":                      false,
        echo     "noImplicitAny":               false,
        echo     "skipLibCheck":                true,
        echo     "esModuleInterop":             true,
        echo     "allowSyntheticDefaultImports": true,
        echo     "resolveJsonModule":           true,
        echo     "outDir":                      "./dist",
        echo     "rootDir":                     "./src",
        echo     "baseUrl":                     ".",
        echo     "paths":                       { "@/*": ["src/*"] }
        echo   },
        echo   "include":  ["src/**/*"],
        echo   "exclude":  ["node_modules", "dist"]
        echo }
    ) > "%ROOT%\tsconfig.json"
    echo    + tsconfig.json
)

:: -- vite.config.ts
if not exist "%ROOT%\vite.config.ts" (
    (
        echo import { defineConfig } from 'vite';
        echo.
        echo export default defineConfig({
        echo   server: { port: 3000, open: true },
        echo   build:  { target: 'es2020', sourcemap: true },
        echo   resolve: { alias: { '@': '/src' } },
        echo });
    ) > "%ROOT%\vite.config.ts"
    echo    + vite.config.ts
)

:: -- index.html
if not exist "%ROOT%\index.html" (
    (
        echo ^<!DOCTYPE html^>
        echo ^<html lang="en"^>
        echo ^<head^>
        echo   ^<meta charset="UTF-8" /^>
        echo   ^<meta name="viewport" content="width=device-width, initial-scale=1.0" /^>
        echo   ^<title^>OnChainBattles^</title^>
        echo   ^<style^>
        echo     * { margin:0; padding:0; box-sizing:border-box; }
        echo     body { background:#1A1A2E; display:flex; justify-content:center; align-items:center; height:100vh; overflow:hidden; }
        echo   ^</style^>
        echo ^</head^>
        echo ^<body^>
        echo   ^<div id="game"^>^</div^>
        echo   ^<script type="module" src="/src/main.ts"^>^</script^>
        echo ^</body^>
        echo ^</html^>
    ) > "%ROOT%\index.html"
    echo    + index.html
)

:: -- .gitignore
if not exist "%ROOT%\.gitignore" (
    (
        echo node_modules/
        echo dist/
        echo .env
        echo *.local
    ) > "%ROOT%\.gitignore"
    echo    + .gitignore
)

:: -- .env.example
if not exist "%ROOT%\.env.example" (
    (
        echo # Copy to .env and fill in values
        echo VITE_ESCROW_ADDRESS=0xYOUR_CONTRACT_ADDRESS
        echo VITE_SOCKET_URL=http://localhost:3001
        echo VITE_CHAIN_ID=43113
    ) > "%ROOT%\.env.example"
    echo    + .env.example
)

:: -- dev_start.bat
if not exist "%ROOT%\dev_start.bat" (
    (
        echo @echo off
        echo echo Starting OnChainBattles dev environment...
        echo start "OCB Server" cmd /k "node server/index.js"
        echo timeout /t 1 ^>nul
        echo npm run dev
    ) > "%ROOT%\dev_start.bat"
    echo    + dev_start.bat
)

echo    Done.
echo.

:: ==============================================================
:: STEP 3 - SOURCE FILE STUBS
:: ==============================================================
echo [3/5] Writing source file stubs (skips existing files)...

:: -- src\main.ts
if not exist "%ROOT%\src\main.ts" (
    (
        echo // main.ts - Phaser 4 game bootstrap
        echo import Phaser from 'phaser';
        echo import { PreloadScene }   from './scenes/PreloadScene';
        echo import { MainMenuScene }  from './scenes/MainMenuScene';
        echo import { BattleScene }    from './scenes/BattleScene';
        echo import { ResultScene }    from './scenes/ResultScene';
        echo.
        echo const config: Phaser.Types.Core.GameConfig = {
        echo   type:            Phaser.AUTO,
        echo   width:           1280,
        echo   height:          720,
        echo   backgroundColor: '#1A1A2E',
        echo   parent:          'game',
        echo   scene:           [PreloadScene, MainMenuScene, BattleScene, ResultScene],
        echo   scale: {
        echo     mode:       Phaser.Scale.FIT,
        echo     autoCenter: Phaser.Scale.CENTER_BOTH,
        echo   },
        echo };
        echo.
        echo new Phaser.Game(config);
    ) > "%ROOT%\src\main.ts"
    echo    + src/main.ts
)

:: -- src\scenes\PreloadScene.ts
if not exist "%ROOT%\src\scenes\PreloadScene.ts" (
    (
        echo // PreloadScene.ts
        echo import Phaser from 'phaser';
        echo.
        echo export class PreloadScene extends Phaser.Scene {
        echo   constructor() { super({ key: 'PreloadScene' }); }
        echo.
        echo   preload() {
        echo     const bar = this.add.graphics();
        echo     this.load.on('progress', (v: number) =^> {
        echo       bar.clear().fillStyle(0xF5A623).fillRect(340, 348, 600 * v, 24);
        echo     });
        echo     const A = 'assets/';
        echo     const cards = [
        echo       'foot_soldier','pikeman','archer','assassin','militia','scout',
        echo       'lancer','mystic','messenger','king','swordsman','princess','priest',
        echo       'commander','inquisitor','knight','knights_guard','scribe','castle',
        echo       'temple','village','disease','casus_belli','reform','civil_war',
        echo       'earthquake','war_horn','coup','treason','motherland','peasant_revolt'
        echo     ];
        echo     cards.forEach(id =^> {
        echo       this.load.image(`art_${id}`,   `${A}cards/art/${id}.png`);
        echo       this.load.image(`thumb_${id}`, `${A}cards/thumb/${id}_thumb.png`);
        echo     });
        echo     ['standard','royal','static','spell'].forEach(t =^>
        echo       this.load.image(`card_frame_${t}`, `${A}cards/card_frame_${t}.png`)
        echo     );
        echo     this.load.image('card_back', `${A}cards/card_back_pattern.png`);
        echo     ['atk','def','leg','move','cavalry','clock','ranged'].forEach(i =^>
        echo       this.load.image(`icon_${i}`, `${A}icons/icon_${i}.png`)
        echo     );
        echo     ['standard','royal','static','spell'].forEach(t =^>
        echo       this.load.image(`icon_type_${t}`, `${A}icons/icon_type_${t}.png`)
        echo     );
        echo     ['move','attack','aura','selected','danger'].forEach(m =^>
        echo       this.load.image(`marker_${m}`, `${A}fx/marker_${m}.png`)
        echo     );
        echo     this.load.image('board_skin',   `${A}board/board_skin.png`);
        echo     this.load.image('bg_battle',    `${A}backgrounds/bg_battle.png`);
        echo     this.load.image('bg_main_menu', `${A}backgrounds/bg_main_menu.png`);
        echo     this.load.image('bg_result',    `${A}backgrounds/bg_result.png`);
        echo     this.load.image('logo',         `${A}ui/logo.png`);
        echo   }
        echo.
        echo   create() {
        echo     this.scene.start('MainMenuScene');
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\PreloadScene.ts"
    echo    + src/scenes/PreloadScene.ts
)

:: -- src\scenes\MainMenuScene.ts
if not exist "%ROOT%\src\scenes\MainMenuScene.ts" (
    (
        echo // MainMenuScene.ts - stub
        echo import Phaser from 'phaser';
        echo.
        echo export class MainMenuScene extends Phaser.Scene {
        echo   constructor() { super({ key: 'MainMenuScene' }); }
        echo.
        echo   create() {
        echo     this.add.image(640, 360, 'bg_main_menu').setDisplaySize(1280, 720);
        echo     this.add.image(640, 120, 'logo');
        echo     this.add.text(640, 300, 'OnChainBattles', {
        echo       fontSize: '32px', color: '#F5A623', fontFamily: 'Arial'
        echo     }).setOrigin(0.5);
        echo     this.add.text(640, 400, 'Click to Start', {
        echo       fontSize: '20px', color: '#FFFFFF', fontFamily: 'Arial'
        echo     }).setOrigin(0.5);
        echo     this.input.once('pointerdown', () =^> this.scene.start('BattleScene'));
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\MainMenuScene.ts"
    echo    + src/scenes/MainMenuScene.ts
)

:: -- src\scenes\BattleScene.ts
if not exist "%ROOT%\src\scenes\BattleScene.ts" (
    (
        echo // BattleScene.ts - stub
        echo import Phaser from 'phaser';
        echo import { GameEngine } from '../game/GameEngine';
        echo.
        echo export class BattleScene extends Phaser.Scene {
        echo   private engine!: GameEngine;
        echo.
        echo   constructor() { super({ key: 'BattleScene' }); }
        echo.
        echo   create() {
        echo     this.add.image(640, 360, 'bg_battle').setDisplaySize(1280, 720);
        echo     this.add.text(640, 360, 'BattleScene - stub', {
        echo       fontSize: '20px', color: '#FFFFFF', align: 'center'
        echo     }).setOrigin(0.5);
        echo     // TODO: BoardRenderer, CardRenderer, HandRenderer, HUDRenderer,
        echo     //       OverlayRenderer, SelectionManager, engine.startGame()
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\BattleScene.ts"
    echo    + src/scenes/BattleScene.ts
)

:: -- src\scenes\ResultScene.ts
if not exist "%ROOT%\src\scenes\ResultScene.ts" (
    (
        echo // ResultScene.ts - stub
        echo import Phaser from 'phaser';
        echo.
        echo export class ResultScene extends Phaser.Scene {
        echo   constructor() { super({ key: 'ResultScene' }); }
        echo.
        echo   create(data: { winner: number; turns: number }) {
        echo     this.add.image(640, 360, 'bg_result').setDisplaySize(1280, 720);
        echo     const msg = data?.winner === 0 ? 'Player 1 Wins!' : 'Player 2 Wins!';
        echo     this.add.text(640, 360, msg, {
        echo       fontSize: '40px', color: '#F5A623', fontFamily: 'Arial'
        echo     }).setOrigin(0.5);
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\ResultScene.ts"
    echo    + src/scenes/ResultScene.ts
)

:: -- src\network\SocketManager.ts
if not exist "%ROOT%\src\network\SocketManager.ts" (
    (
        echo // SocketManager.ts - stub
        echo import { io, Socket } from 'socket.io-client';
        echo.
        echo export class SocketManager {
        echo   private socket: Socket ^| null = null;
        echo   private static instance: SocketManager;
        echo.
        echo   static getInstance(): SocketManager {
        echo     if (!SocketManager.instance) SocketManager.instance = new SocketManager();
        echo     return SocketManager.instance;
        echo   }
        echo.
        echo   connect(url: string): void {
        echo     this.socket = io(url);
        echo     this.socket.on('connect',    () =^> console.log('[Socket] Connected'));
        echo     this.socket.on('disconnect', () =^> console.log('[Socket] Disconnected'));
        echo   }
        echo.
        echo   emit(event: string, data: any): void { this.socket?.emit(event, data); }
        echo   on(event: string, fn: (d: any) =^> void): void { this.socket?.on(event, fn); }
        echo   disconnect(): void { this.socket?.disconnect(); }
        echo }
    ) > "%ROOT%\src\network\SocketManager.ts"
    echo    + src/network/SocketManager.ts
)

:: -- src\wallet\WalletManager.ts
if not exist "%ROOT%\src\wallet\WalletManager.ts" (
    (
        echo // WalletManager.ts - stub
        echo import { BrowserProvider, JsonRpcSigner } from 'ethers';
        echo.
        echo export class WalletManager {
        echo   private static signer:  JsonRpcSigner ^| null = null;
        echo   private static address: string = '';
        echo.
        echo   static async connect(): Promise^<string^> {
        echo     if (!(window as any).ethereum) throw new Error('MetaMask not found');
        echo     const provider = new BrowserProvider((window as any).ethereum);
        echo     await provider.send('eth_requestAccounts', []);
        echo     WalletManager.signer  = await provider.getSigner();
        echo     WalletManager.address = await WalletManager.signer.getAddress();
        echo     return WalletManager.address;
        echo   }
        echo.
        echo   static getSigner():   JsonRpcSigner ^| null { return WalletManager.signer;  }
        echo   static getAddress():  string              { return WalletManager.address;  }
        echo   static isConnected(): boolean             { return !!WalletManager.signer; }
        echo }
    ) > "%ROOT%\src\wallet\WalletManager.ts"
    echo    + src/wallet/WalletManager.ts
)

:: -- src\wallet\EscrowManager.ts
if not exist "%ROOT%\src\wallet\EscrowManager.ts" (
    (
        echo // EscrowManager.ts - stub
        echo import { Contract, parseEther } from 'ethers';
        echo import { WalletManager } from './WalletManager';
        echo.
        echo const ESCROW_ADDRESS = (import.meta as any).env.VITE_ESCROW_ADDRESS ?? '';
        echo const ESCROW_ABI = [
        echo   'function deposit(string roomId) payable',
        echo   'function payout(string roomId, address winner)',
        echo   'function refund(string roomId)',
        echo   'event Deposited(string roomId, address player, uint256 amount)',
        echo   'event Paid(string roomId, address winner, uint256 amount)',
        echo ];
        echo.
        echo export class EscrowManager {
        echo   static async deposit(roomId: string, amountEth: string): Promise^<void^> {
        echo     const signer = WalletManager.getSigner();
        echo     if (!signer) throw new Error('Wallet not connected');
        echo     const c = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
        echo     const tx = await c.deposit(roomId, { value: parseEther(amountEth) });
        echo     await tx.wait();
        echo   }
        echo }
    ) > "%ROOT%\src\wallet\EscrowManager.ts"
    echo    + src/wallet/EscrowManager.ts
)

:: -- server\index.js
if not exist "%ROOT%\server\index.js" (
    (
        echo // server/index.js - Socket.io matchmaking + relay server
        echo // Run: node server/index.js
        echo const { createServer } = require('http');
        echo const { Server }       = require('socket.io');
        echo.
        echo const PORT = process.env.PORT ^|^| 3001;
        echo const http = createServer();
        echo const io   = new Server(http, { cors: { origin: '*' } });
        echo.
        echo const rooms = {};
        echo.
        echo io.on('connection', socket =^> {
        echo   console.log('[Server] +', socket.id);
        echo.
        echo   socket.on('join_room', ({ roomId, playerName }) =^> {
        echo     if (!rooms[roomId]) rooms[roomId] = { players: [] };
        echo     const room = rooms[roomId];
        echo     if (room.players.length ^>= 2) { socket.emit('room_full'); return; }
        echo     room.players.push({ id: socket.id, name: playerName });
        echo     socket.join(roomId);
        echo     socket.emit('room_joined', { playerIndex: room.players.length - 1, roomId });
        echo     if (room.players.length === 2)
        echo       io.to(roomId).emit('game_start', { players: room.players });
        echo   });
        echo.
        echo   socket.on('game_action', ({ roomId, action }) =^>
        echo     socket.to(roomId).emit('opponent_action', action)
        echo   );
        echo.
        echo   socket.on('disconnect', () =^> {
        echo     console.log('[Server] -', socket.id);
        echo     for (const id in rooms)
        echo       rooms[id].players = rooms[id].players.filter((p) =^> p.id !== socket.id);
        echo   });
        echo });
        echo.
        echo http.listen(PORT, () =^> console.log(`[Server] Listening :${PORT}`));
    ) > "%ROOT%\server\index.js"
    echo    + server/index.js
)

echo    Done.
echo.

:: ==============================================================
:: STEP 4 - PLACEHOLDER JSON CONFIGS
:: ==============================================================
echo [4/5] Writing placeholder JSON configs (skips existing)...

if not exist "%ROOT%\public\layouts\BattleScene.layout.json" (
    (
        echo { "schemaVersion":"2.0","scene":"BattleScene","canvas":{"width":1280,"height":720},"board":{"x":280,"y":360,"cellSize":80},"handP1":{"x":640,"y":660},"handP2":{"x":640,"y":60},"hud":{"timerX":640,"timerY":360} }
    ) > "%ROOT%\public\layouts\BattleScene.layout.json"
    echo    + public/layouts/BattleScene.layout.json
)

if not exist "%ROOT%\public\layouts\MainMenuScene.layout.json" (
    (
        echo { "schemaVersion":"2.0","scene":"MainMenuScene","canvas":{"width":1280,"height":720},"logo":{"x":640,"y":120,"width":300,"height":80},"title":{"x":640,"y":220},"nameInput":{"x":640,"y":300,"width":360,"height":48},"roomCodeInput":{"x":640,"y":370,"width":280,"height":48},"connectBtn":{"x":640,"y":450,"width":220,"height":56},"cryptoToggle":{"x":640,"y":530,"width":200,"height":40},"statusLabel":{"x":640,"y":600} }
    ) > "%ROOT%\public\layouts\MainMenuScene.layout.json"
    echo    + public/layouts/MainMenuScene.layout.json
)

if not exist "%ROOT%\public\layouts\ResultScene.layout.json" (
    (
        echo { "schemaVersion":"2.0","scene":"ResultScene","canvas":{"width":1280,"height":720},"panel":{"x":640,"y":360,"width":600,"height":420},"resultTitle":{"x":640,"y":240},"winnerLabel":{"x":640,"y":310},"payoutLabel":{"x":640,"y":370},"txHashLabel":{"x":640,"y":420},"playAgainBtn":{"x":640,"y":510,"width":200,"height":52},"menuBtn":{"x":640,"y":580,"width":160,"height":44} }
    ) > "%ROOT%\public\layouts\ResultScene.layout.json"
    echo    + public/layouts/ResultScene.layout.json
)

if not exist "%ROOT%\public\themes\BattleScene.theme.json" (
    (
        echo { "schemaVersion":"2.0","scene":"BattleScene","colors":{"BG_DEEP":"#1A1A2E","ACCENT_GOLD":"#F5A623","ACCENT_GREEN":"#00FF88","TEXT_PRIMARY":"#FFFFFF","TEXT_SECONDARY":"#AAAAAA"},"fonts":{"title":{"family":"Arial","size":32},"body":{"family":"Arial","size":16}},"assets":{"board_skin":"assets/board/board_skin.png","bg_battle":"assets/backgrounds/bg_battle.png"} }
    ) > "%ROOT%\public\themes\BattleScene.theme.json"
    echo    + public/themes/BattleScene.theme.json
)

if not exist "%ROOT%\public\themes\MainMenuScene.theme.json" (
    (
        echo { "schemaVersion":"2.0","scene":"MainMenuScene","colors":{"BG_DEEP":"#1A1A2E","ACCENT_GOLD":"#F5A623","ACCENT_GREEN":"#00FF88","TEXT_PRIMARY":"#FFFFFF","TEXT_SECONDARY":"#AAAAAA"},"fonts":{"title":{"family":"Arial","size":32},"body":{"family":"Arial","size":16}},"assets":{"logo":"assets/ui/logo.png","bg_main_menu":"assets/backgrounds/bg_main_menu.png"},"buttons":{"primary":{"fillColor":"#1A3A5C","strokeColor":"#F5A623","strokeWidth":2,"textColor":"#FFFFFF","fontSize":18,"hoverFillColor":"#2A4A6C","hoverTextColor":"#F5A623","cornerRadius":6,"paddingX":20,"paddingY":10}} }
    ) > "%ROOT%\public\themes\MainMenuScene.theme.json"
    echo    + public/themes/MainMenuScene.theme.json
)

if not exist "%ROOT%\public\themes\ResultScene.theme.json" (
    (
        echo { "schemaVersion":"2.0","scene":"ResultScene","colors":{"BG_DEEP":"#1A1A2E","ACCENT_GOLD":"#F5A623","ACCENT_GREEN":"#00FF88","ACCENT_RED":"#FF4444","TEXT_PRIMARY":"#FFFFFF","TEXT_SECONDARY":"#AAAAAA"},"fonts":{"title":{"family":"Arial","size":32},"body":{"family":"Arial","size":16}},"assets":{"bg_result":"assets/backgrounds/bg_result.png"},"buttons":{"primary":{"fillColor":"#1A3A5C","strokeColor":"#F5A623","strokeWidth":2,"textColor":"#FFFFFF","fontSize":18,"hoverFillColor":"#2A4A6C","hoverTextColor":"#F5A623","cornerRadius":6,"paddingX":20,"paddingY":10}} }
    ) > "%ROOT%\public\themes\ResultScene.theme.json"
    echo    + public/themes/ResultScene.theme.json
)

echo    Done.
echo.

:: ==============================================================
:: STEP 5 - PLACEHOLDER PNGs via Python script written to a file
:: ==============================================================
echo [5/5] Generating placeholder PNGs via Python + Pillow...
echo       (If you see SKIP below, run: pip install Pillow)
echo.

:: Write Python script to a temp file to avoid all inline escaping issues
set "PYFILE=%TEMP%\ocb_gen_pngs.py"

(
echo import sys, os
echo.
echo try:
echo     from PIL import Image, ImageDraw, ImageFont
echo except ImportError:
echo     print('  [SKIP] Pillow not installed. Run: pip install Pillow')
echo     sys.exit(0)
echo.
echo ROOT = r'%ROOT%'
echo.
echo FONT_PATHS = [
echo     r'C:\Windows\Fonts\arialbd.ttf',
echo     r'C:\Windows\Fonts\arial.ttf',
echo     r'C:\Windows\Fonts\segoeui.ttf',
echo     '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
echo     '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
echo ]
echo.
echo def load_font(size):
echo     for fp in FONT_PATHS:
echo         try:
echo             return ImageFont.truetype(fp, size)
echo         except:
echo             pass
echo     return ImageFont.load_default()
echo.
echo def rgb(h):
echo     h = h.lstrip('#')
echo     return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
echo.
echo created = 0
echo.
echo def make(rel, w, h, bg, label, lc='#BBBBBB', border=None, alpha=255):
echo     global created
echo     path = os.path.join(ROOT, 'public', 'assets', rel)
echo     os.makedirs(os.path.dirname(path), exist_ok=True)
echo     if os.path.exists(path):
echo         return
echo     img  = Image.new('RGBA', (w, h), (*rgb(bg), alpha))
echo     draw = ImageDraw.Draw(img)
echo     stripe_color = (*rgb(lc), 18)
echo     for i in range(-h, w + h, 18):
echo         draw.line([(i, 0), (i + h, h)], fill=stripe_color, width=1)
echo     if border:
echo         bw = max(2, w // 60)
echo         draw.rectangle([bw, bw, w - bw - 1, h - bw - 1], outline=(*rgb(border), 220), width=bw)
echo     font_size = max(8, min(16, h // 6, w // 8))
echo     font = load_font(font_size)
echo     lines = label.split('\n')
echo     total_h = len(lines) * (font_size + 2)
echo     for li, line in enumerate(lines):
echo         bb = draw.textbbox((0, 0), line, font=font)
echo         tw = bb[2] - bb[0]
echo         tx = (w - tw) // 2
echo         ty = (h - total_h) // 2 + li * (font_size + 2)
echo         draw.text((tx, ty), line, fill=(*rgb(lc), 210), font=font)
echo     img.save(path, 'PNG')
echo     created += 1
echo.
echo def t(rel, w, h, bg, label, lc='#AAAAAA', border=None, a=255):
echo     make(rel, w, h, bg, label, lc, border, a)
echo.
echo # Backgrounds
echo t('backgrounds/bg_battle.png',    1280, 720, '#0A1520', 'BG BATTLE',    '#334455', '#1A2A3A')
echo t('backgrounds/bg_main_menu.png', 1280, 720, '#10101E', 'BG MAIN MENU', '#2A2A44', '#1A1A3A')
echo t('backgrounds/bg_result.png',    1280, 720, '#0A1520', 'BG RESULT',    '#334455', '#1A2A3A')
echo t('backgrounds/bg_lobby.png',     1280, 720, '#10101E', 'BG LOBBY',     '#2A2A44', '#1A1A3A')
echo.
echo # Board
echo t('board/board_skin.png', 720, 720, '#0C2D4A', 'BOARD SKIN', '#1A5A8A', '#1A3A6A')
echo.
echo # UI
echo t('ui/logo.png', 300, 80, '#1A1A2E', 'ONCHAINBATTLES', '#F5A623', '#F5A623')
echo.
echo # Card frames
echo t('cards/card_frame_standard.png', 140, 200, '#12122A', 'STANDARD\nFRAME', '#5A5A9A', '#4A4A8A')
echo t('cards/card_frame_royal.png',    140, 200, '#1A1200', 'ROYAL\nFRAME',    '#C8960C', '#A07800')
echo t('cards/card_frame_static.png',   140, 200, '#0A1A0A', 'STATIC\nFRAME',   '#3A8A4A', '#2A6A3A')
echo t('cards/card_frame_spell.png',    140, 200, '#140A1E', 'SPELL\nFRAME',    '#8A3AAA', '#6A1A8A')
echo t('cards/card_back_pattern.png',   140, 200, '#101028', 'CARD\nBACK',      '#3A3A66', '#2A2A55')
echo.
echo # Card art + thumbnails
echo CARDS = [
echo     ('foot_soldier',   '#1A2A1A', '#4A8A4A'),
echo     ('pikeman',        '#1A1A2A', '#4A4A8A'),
echo     ('archer',         '#1A2A2A', '#4A7A7A'),
echo     ('assassin',       '#080810', '#3A3A5A'),
echo     ('militia',        '#1A1A08', '#6A6A2A'),
echo     ('scout',          '#081A08', '#3A6A3A'),
echo     ('lancer',         '#1A0808', '#7A3A3A'),
echo     ('mystic',         '#080818', '#5A3A8A'),
echo     ('messenger',      '#0A1A14', '#3A7A6A'),
echo     ('king',           '#1A1000', '#C8960C'),
echo     ('swordsman',      '#161608', '#8A8A2A'),
echo     ('princess',       '#1A0814', '#9A3A6A'),
echo     ('priest',         '#140808', '#7A3A4A'),
echo     ('commander',      '#080812', '#3A3A8A'),
echo     ('inquisitor',     '#0A0000', '#6A1A1A'),
echo     ('knight',         '#080818', '#3A3A7A'),
echo     ('knights_guard',  '#04040E', '#1A1A4A'),
echo     ('scribe',         '#141000', '#7A6A2A'),
echo     ('castle',         '#14100A', '#6A5A3A'),
echo     ('temple',         '#0A0A18', '#4A3A7A'),
echo     ('village',        '#0A1808', '#3A6A3A'),
echo     ('disease',        '#001400', '#2A7A2A'),
echo     ('casus_belli',    '#1A0A00', '#7A4A1A'),
echo     ('reform',         '#0A1A0A', '#4A7A4A'),
echo     ('civil_war',      '#140000', '#6A1A1A'),
echo     ('earthquake',     '#1A1000', '#8A6A1A'),
echo     ('war_horn',       '#001020', '#1A5A8A'),
echo     ('coup',           '#180004', '#7A1A3A'),
echo     ('treason',        '#100A00', '#6A5A1A'),
echo     ('motherland',     '#001800', '#1A7A1A'),
echo     ('peasant_revolt', '#0A1400', '#4A7A2A'),
echo ]
echo for cid, bg, accent in CARDS:
echo     label = cid.replace('_', ' ').upper()
echo     t(f'cards/art/{cid}.png',         140,  90, bg, label, accent, accent)
echo     t(f'cards/thumb/{cid}_thumb.png', 200, 200, bg, label, accent, accent)
echo.
echo # Icons (32x32)
echo ICONS = [
echo     ('icon_atk',           '#3A0A0A', '#FF6666', 'ATK'),
echo     ('icon_def',           '#0A1A3A', '#4FC3F7', 'DEF'),
echo     ('icon_leg',           '#2A1A00', '#F5A623', 'LEG'),
echo     ('icon_move',          '#002A1A', '#00FF88', 'MOV'),
echo     ('icon_cavalry',       '#2A1A00', '#F5B833', 'CAV'),
echo     ('icon_clock',         '#1A1A1A', '#AAAAAA', 'CLK'),
echo     ('icon_ranged',        '#0A1A2A', '#4FC3F7', 'RNG'),
echo     ('icon_type_standard', '#1A1A2A', '#6A6A9A', 'STD'),
echo     ('icon_type_royal',    '#1A1200', '#C8960C', 'ROY'),
echo     ('icon_type_static',   '#0A1A0A', '#4A8A4A', 'STC'),
echo     ('icon_type_spell',    '#12001A', '#8A3AAA', 'SPL'),
echo ]
echo for name, bg, accent, label in ICONS:
echo     t(f'icons/{name}.png', 32, 32, bg, label, accent, accent)
echo.
echo # FX markers (semi-transparent)
echo t('fx/marker_move.png',     120, 120, '#001A08', 'MOVE',   '#00CC66', '#00AA44', 180)
echo t('fx/marker_attack.png',   120, 120, '#1A0000', 'ATTACK', '#CC3333', '#AA2222', 200)
echo t('fx/marker_aura.png',     120, 120, '#00081A', 'AURA',   '#3399CC', '#2277AA', 160)
echo t('fx/marker_selected.png', 120, 120, '#001A0A', 'SELECT', '#00FF88', '#00CC66', 200)
echo t('fx/marker_danger.png',   120, 120, '#1A0000', 'DANGER', '#FF4444', '#CC2222', 180)
echo.
echo total = sum(
echo     sum(1 for f in files if f.endswith('.png'))
echo     for _, _, files in os.walk(os.path.join(ROOT, 'public', 'assets'))
echo )
echo print(f'  Created {created} new PNGs.  Total on disk: {total} PNGs.')
) > "%PYFILE%"

python "%PYFILE%"
del "%PYFILE%" >nul 2>&1

echo.
echo ============================================================
echo  Project scaffold complete.
echo ============================================================
echo.
echo  public/
echo    assets/backgrounds/   4 PNGs  (bg_battle, bg_main_menu, ...)
echo    assets/board/         1 PNG   (board_skin)
echo    assets/cards/art/    31 PNGs  (one per card)
echo    assets/cards/thumb/  31 PNGs  (200x200 thumbnails)
echo    assets/icons/        11 PNGs  (atk/def/leg/move + type icons)
echo    assets/fx/            5 PNGs  (move/attack/aura/selected/danger)
echo    assets/ui/            1 PNG   (logo)
echo    layouts/              3 JSONs (Battle, MainMenu, Result)
echo    themes/               3 JSONs (Battle, MainMenu, Result)
echo.
echo  src/
echo    main.ts               game bootstrap
echo    scenes/               4 stubs (Preload/MainMenu/Battle/Result)
echo    network/              SocketManager stub
echo    wallet/               WalletManager + EscrowManager stubs
echo.
echo  server/index.js         Socket.io relay server
echo.
echo  NEXT STEPS:
echo    1. npm install
echo    2. dev_start.bat   (opens localhost:3000 + server on :3001)
echo    3. Replace placeholder PNGs with real art as it arrives
echo    4. JSON files in public/layouts/ and public/themes/ are
echo       managed by the Layout Editor -- avoid manual edits
echo.
pause
