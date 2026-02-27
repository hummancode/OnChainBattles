import Phaser from "phaser";
import MainMenuScene from "./scenes/MainMenuScene";
import RoomScene from "./scenes/RoomScene";
import ResultScene from "./scenes/ResultScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    backgroundColor: "#1A1A2E",
    scene: [MainMenuScene, RoomScene, ResultScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const game = new Phaser.Game(config);
export default game;