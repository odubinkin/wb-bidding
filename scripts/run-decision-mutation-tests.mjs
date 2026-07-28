import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const mutants = Object.freeze({
  BUDGET_CONTRACT_BYPASS: {
    file: 'packages/decision-engine/src/engine.ts',
    search: "budget.contractStatus !== 'VERIFIED' ||",
  },
  CLUSTER_CAPABILITY_BYPASS: {
    file: 'packages/decision-engine/src/engine.ts',
    search:
      "input.targetKey.targetKind === 'CLUSTER' && input.capability !== 'CLUSTER_WRITE_READY'",
  },
  COOLDOWN_BYPASS: {
    file: 'packages/decision-engine/src/engine.ts',
    search: 'input.lastWriteAt !== null &&',
  },
  HYSTERESIS_OR: {
    file: 'packages/decision-engine/src/engine.ts',
    search: 'absolute >= input.policy.minAbsoluteChangeMinor &&',
  },
  MINIMUM_CAP_INVERSION: {
    file: 'packages/decision-engine/src/engine.ts',
    search: 'input.wbMinimumBidMinor > input.policy.policyMaxBidMinor',
  },
  NEGATIVE_CONTRIBUTION_ZERO: {
    file: 'packages/decision-engine/src/engine.ts',
    search: 'contribution <= 0n',
  },
  PROFIT_ADDS_SPEND: {
    file: 'packages/decision-engine/src/estimator.ts',
    search: 'expectedUnits.multiply(contributionMinor).subtract(expectedSpend)',
  },
  QUANTUM_HALF_UP: {
    file: 'packages/decision-engine/src/rational.ts',
    search: 'value - lower <= upper - value ? lower : upper',
  },
  STALE_SNAPSHOT_BYPASS: {
    file: 'packages/decision-engine/src/engine.ts',
    search: '!input.snapshotApplyEligible || input.wbMinimumBidMinor === null',
  },
});

for (const [name, mutant] of Object.entries(mutants)) {
  const source = await readFile(new URL(`../${mutant.file}`, import.meta.url), 'utf8');
  const occurrences = source.split(mutant.search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${name} source anchor count is ${String(occurrences)}, expected 1`);
  }
}

let killed = 0;
const survivors = [];
for (const name of Object.keys(mutants)) {
  const run = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      'tests/unit/decision-engine.spec.ts',
      'tests/unit/decision-engine-boundaries.spec.ts',
      '--coverage.enabled=false',
      '--silent',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, WB_DECISION_MUTANT: name },
      timeout: 60_000,
    },
  );
  if (run.status === 0) {
    survivors.push(name);
  } else {
    killed += 1;
  }
}

const score = (killed / Object.keys(mutants).length) * 100;
process.stdout.write(
  `Decision Engine source mutation score: ${score.toFixed(2)}% (${String(killed)}/${String(
    Object.keys(mutants).length,
  )} killed)\n`,
);
if (score < 80 || survivors.length > 0) {
  process.stderr.write(`Surviving critical mutants: ${survivors.join(', ') || 'none'}\n`);
  process.exitCode = 1;
}
