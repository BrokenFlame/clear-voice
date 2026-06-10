import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom to simulate the browser DOM in unit tests
    environment: 'jsdom',

    // Load Angular's zone.js before every test file
    setupFiles: ['zone.js/testing'],

    // Glob patterns for test files
    include: ['src/**/*.spec.ts'],

    // Coverage via v8 (built into Node, no instrumentation overhead)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/app/**/*.ts'],
      exclude: [
        'src/app/**/*.spec.ts',
        'src/app/**/*.config.ts',
        'src/main.ts',
        'src/environments/**',
      ],
    },

    // Globals: describe/it/expect available without importing
    globals: true,
  },
});
