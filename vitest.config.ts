import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const mutationReplacements: Readonly<Record<string, readonly [string, string, string]>> =
  Object.freeze({
    BUDGET_CONTRACT_BYPASS: [
      '/packages/decision-engine/src/engine.ts',
      "budget.contractStatus !== 'VERIFIED' ||",
      "false || budget.contractStatus !== 'VERIFIED' &&",
    ],
    CLUSTER_CAPABILITY_BYPASS: [
      '/packages/decision-engine/src/engine.ts',
      "input.targetKey.targetKind === 'CLUSTER' && input.capability !== 'CLUSTER_WRITE_READY'",
      "false && input.targetKey.targetKind === 'CLUSTER' && input.capability !== 'CLUSTER_WRITE_READY'",
    ],
    COOLDOWN_BYPASS: [
      '/packages/decision-engine/src/engine.ts',
      'input.lastWriteAt !== null &&',
      'false && input.lastWriteAt !== null &&',
    ],
    HYSTERESIS_OR: [
      '/packages/decision-engine/src/engine.ts',
      'absolute >= input.policy.minAbsoluteChangeMinor &&',
      'absolute >= input.policy.minAbsoluteChangeMinor ||',
    ],
    MINIMUM_CAP_INVERSION: [
      '/packages/decision-engine/src/engine.ts',
      'input.wbMinimumBidMinor > input.policy.policyMaxBidMinor',
      'input.wbMinimumBidMinor < input.policy.policyMaxBidMinor',
    ],
    NEGATIVE_CONTRIBUTION_ZERO: [
      '/packages/decision-engine/src/engine.ts',
      'contribution <= 0n',
      'contribution < 0n',
    ],
    PROFIT_ADDS_SPEND: [
      '/packages/decision-engine/src/estimator.ts',
      'expectedUnits.multiply(contributionMinor).subtract(expectedSpend)',
      'expectedUnits.multiply(contributionMinor).add(expectedSpend)',
    ],
    QUANTUM_HALF_UP: [
      '/packages/decision-engine/src/rational.ts',
      'value - lower <= upper - value ? lower : upper',
      'value - lower < upper - value ? lower : upper',
    ],
    STALE_SNAPSHOT_BYPASS: [
      '/packages/decision-engine/src/engine.ts',
      '!input.snapshotApplyEligible || input.wbMinimumBidMinor === null',
      'false || input.wbMinimumBidMinor === null',
    ],
  });
const selectedMutation =
  process.env.WB_DECISION_MUTANT === undefined
    ? undefined
    : mutationReplacements[process.env.WB_DECISION_MUTANT];

/**
 * Defines isolated verification projects so CI can run each acceptance layer independently.
 *
 * @returns Vitest workspace configuration with deterministic timeouts and coverage gates.
 */
export default defineConfig({
  plugins:
    selectedMutation === undefined
      ? []
      : [
          {
            enforce: 'pre',
            name: `decision-mutant-${process.env.WB_DECISION_MUTANT ?? 'unknown'}`,
            /**
             * Applies one verified source mutation to its exact module anchor.
             *
             * @param code - Module source.
             * @param id - Absolute module identifier.
             * @returns Mutated source or null for unrelated modules.
             */
            transform(code, id) {
              const [fileSuffix, search, replacement] = selectedMutation;
              if (!id.endsWith(fileSuffix)) {
                return null;
              }
              return code.replace(search, replacement);
            },
          },
        ],
  resolve: {
    alias: {
      '@wb-bidder/config': fileURLToPath(
        new URL('./packages/config/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/database': fileURLToPath(
        new URL('./packages/database/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/data-sync': fileURLToPath(
        new URL('./packages/data-sync/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/decision-engine': fileURLToPath(
        new URL('./packages/decision-engine/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/write-pipeline': fileURLToPath(
        new URL('./packages/write-pipeline/src/index.ts', import.meta.url),
      ),
      '@wb-bidder/wb-api': fileURLToPath(
        new URL('./packages/wb-api/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    fileParallelism: false,
    coverage: {
      exclude: ['**/main.ts', '**/*.module.ts', '**/*.spec.ts', '**/generated/**', '**/prisma/**'],
      include: [
        'apps/bidder/src/pre-dispatch-validator.ts',
        'apps/bidder/src/runtime-coordinator.service.ts',
        'apps/bidder/src/runtime-clock.service.ts',
        'apps/bidder/src/runtime-state.ts',
        'apps/bidder/src/scheduler/scheduler.service.ts',
        'apps/bidder/src/worker-identity.ts',
        'apps/bidder/src/write-runtime.service.ts',
        'packages/config/**/*.ts',
        'packages/contracts/src/campaign-status.ts',
        'packages/contracts/src/money.ts',
        'packages/contracts/src/wb-endpoint-profile.ts',
        'packages/data-sync/src/binding.ts',
        'packages/data-sync/src/capacity.ts',
        'packages/data-sync/src/checksum.ts',
        'packages/data-sync/src/evidence.ts',
        'packages/decision-engine/src/checksum.ts',
        'packages/decision-engine/src/engine.ts',
        'packages/decision-engine/src/estimator.ts',
        'packages/decision-engine/src/experiments.ts',
        'packages/decision-engine/src/ids.ts',
        'packages/decision-engine/src/policy.ts',
        'packages/decision-engine/src/rational.ts',
        'packages/wb-api/src/client/**/*.ts',
        'packages/wb-api/src/endpoint-registry.ts',
        'packages/wb-api/src/money.ts',
        'packages/wb-api/src/rate-limiter.ts',
        'packages/wb-api/src/resilience.ts',
        'packages/wb-api/src/schemas.ts',
        'packages/wb-api/src/token.ts',
        'packages/wb-api/src/transport.ts',
        'packages/write-pipeline/src/executor.ts',
        'packages/write-pipeline/src/redaction.ts',
        'packages/write-pipeline/src/state-machine.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        branches: 35,
        functions: 30,
        lines: 45,
        perFile: true,
        statements: 45,
        'packages/config/src/**': {
          branches: 90,
          functions: 95,
          lines: 94,
          statements: 94,
        },
        'apps/bidder/src/scheduler/scheduler.service.ts': {
          branches: 40,
          functions: 30,
          lines: 60,
          statements: 55,
        },
        'apps/bidder/src/write-runtime.service.ts': {
          branches: 10,
          functions: 80,
          lines: 65,
          statements: 65,
        },
        'packages/decision-engine/src/**': {
          branches: 75,
          functions: 95,
          lines: 94,
          statements: 94,
        },
      },
    },
    environment: 'node',
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
