import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Defines isolated verification projects so CI can run each acceptance layer independently.
 *
 * @returns Vitest workspace configuration with deterministic timeouts and coverage gates.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@wb-bidder/config': fileURLToPath(
        new URL('./packages/config/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/wb-api': fileURLToPath(
        new URL('./packages/wb-api/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      exclude: ['**/main.ts', '**/*.module.ts', '**/*.spec.ts', '**/generated/**', '**/prisma/**'],
      include: [
        'packages/config/**/*.ts',
        'packages/contracts/src/money.ts',
        'packages/wb-api/src/money.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
    environment: 'node',
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
