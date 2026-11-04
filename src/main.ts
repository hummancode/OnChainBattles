import './game/abilities/registerAll';
import Phaser from 'phaser';
import PreLoadScene       from './scenes/PreloadScene';
import LoginScene         from './scenes/LoginScene';
import HubScene           from './scenes/HubScene';
import DeckBuilderScene   from './scenes/DeckBuilderScene';
import PuzzleScene        from './scenes/PuzzleScene';
import ProfileScene       from './scenes/ProfileScene';
import RoomBrowserScene   from './scenes/RoomBrowserScene';
import LobbyScene         from './scenes/LobbyScene';
import BattleScene        from './scenes/BattleScene';
import ResultScene        from './scenes/ResultScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL, 
    width: 1280,
    height: 720,
    backgroundColor: '#1A1A2E',
    parent: 'game-container',

    roundPixels: true,
    antialias: true,

    dom: {
        createContainer: true,
    },
    scene: [
        PreLoadScene,
        LoginScene,
        HubScene,
        DeckBuilderScene,
        PuzzleScene,
        ProfileScene,
        RoomBrowserScene,
        LobbyScene,
        BattleScene,
        ResultScene,
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const game = new Phaser.Game(config);
// Dev only: expose the game for Playwright QA / DevTools inspection.
if (import.meta.env.DEV) (window as any).game = game;
export default game;