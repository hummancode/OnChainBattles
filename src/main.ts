// main.ts — Phaser game bootstrap
// STEP 3 PATCH: Added PreLoadScene as first scene.
// PreLoadScene loads all assets, then transitions to MainMenuScene.
// All other scenes now have textures available when they start.

import Phaser from 'phaser';
import PreLoadScene    from './scenes/PreloadScene';   // ← ADDED
import MainMenuScene   from './scenes/MainMenuScene';
import RoomScene       from './scenes/RoomScene';
import BattleScene     from './scenes/BattleScene';
import ResultScene     from './scenes/ResultScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    backgroundColor: '#1A1A2E',
    scene: [
        PreLoadScene,    // ← FIRST: loads all assets, then starts MainMenuScene
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