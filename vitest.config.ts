// Tests for the game logic (the parts with no DOM or Pixi): npx vitest run
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@brand': resolve(__dirname, 'docs')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
