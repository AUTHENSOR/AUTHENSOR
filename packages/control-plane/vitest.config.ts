import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@authensor/engine': path.resolve(__dirname, '../engine/src/index.ts'),
      '@authensor/schemas': path.resolve(__dirname, '../schemas/src/index.js'),
    },
  },
});
