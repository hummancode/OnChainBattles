// Minimal Phaser mock for game engine tests.
// Game logic (GameEngine, phases, abilities) doesn't use Phaser directly,
// but some imports pull it in transitively. This stub prevents errors.

export default {
  Scene: class {},
  GameObjects: { Container: class {}, Graphics: class {}, Text: class {} },
  Geom: { Rectangle: class { static Contains() { return false; } } },
};

export const Scene = class {};
export const GameObjects = {
  Container: class {},
  Graphics: class {},
  Text: class {},
};
export const Geom = {
  Rectangle: class { static Contains() { return false; } },
};
