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

const testArguments = [
  'exec',
  'vitest',
  'run',
  'tests/unit/decision-engine.spec.ts',
  'tests/unit/decision-engine-boundaries.spec.ts',
  '--coverage.enabled=false',
  '--silent',
];

const baseline = runDecisionTests();
if (baseline.status !== 0) {
  throw new Error(`Decision Engine mutation baseline failed:\n${diagnosticTail(baseline)}`);
}

let killed = 0;
const survivors = [];
for (const name of Object.keys(mutants)) {
  const run = runDecisionTests(name);
  if (run.status === 0) {
    survivors.push(name);
    continue;
  }
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  if (run.status !== 1 || !/Failed Tests?\s+\d+/u.test(output)) {
    throw new Error(
      `${name} did not produce an assertion-test failure and cannot be counted as killed:\n${diagnosticTail(run)}`,
    );
  }
  killed += 1;
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

function runDecisionTests(mutantName) {
  const env = { ...process.env };
  delete env.WB_DECISION_MUTANT;
  if (mutantName !== undefined) {
    env.WB_DECISION_MUTANT = mutantName;
  }
  const run = spawnSync('pnpm', testArguments, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
    timeout: 60_000,
  });
  if (run.error !== undefined || run.signal !== null || run.status === null) {
    throw new Error(
      `Unable to complete Decision Engine tests${mutantName === undefined ? '' : ` for ${mutantName}`}: ${run.error?.message ?? run.signal ?? 'missing exit status'}\n${diagnosticTail(run)}`,
    );
  }
  return run;
}

function diagnosticTail(run) {
  return `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim().slice(-4_000);
}
