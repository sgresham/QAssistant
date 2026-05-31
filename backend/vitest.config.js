import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['./src/__tests__/setup.js'],
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    hookTimeout: 60000,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/index.js', 'src/__tests__/**'],
    },
  },
});
