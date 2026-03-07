import Phaser from 'phaser';
import PreLoadScene    from './scenes/PreloadScene';
import MainMenuScene   from './scenes/MainMenuScene';
import RoomScene       from './scenes/RoomScene';
import BattleScene     from './scenes/BattleScene';
import ResultScene     from './scenes/ResultScene';

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
        MainMenuScene,
        RoomScene,
        BattleScene,
        ResultScene,
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const game = new Phaser.Game(config);
export default game;