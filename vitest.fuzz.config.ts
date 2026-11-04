// Slow engine fuzz — kept out of `npm run test:game`. Run with `npm run test:fuzz`.
// (Standalone on purpose: mergeConfig would concatenate `include` with the base suite.)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/engine/fuzz.slow.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    testTimeout: 600_000,
  },
  resolve: { alias: { phaser: './tests/mocks/phaser.ts' } },
});
