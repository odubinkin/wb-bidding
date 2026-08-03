import { parseDecisionPolicy } from '../decision-job/decision-policy.parser.js';
import { type DecisionPolicy } from '@wb-bidder/decision-engine';
import type { DatabaseClient } from '@wb-bidder/database';
import type { ExperimentRuntimeRow } from './experiment-runtime.types.js';

/**
 * Resolves the active policy using target, campaign, deployment precedence.
 *
 * @param database - Authoritative persistence client.
 * @param targetId - Target UUID.
 * @param campaignId - Parent campaign UUID.
 * @param now - Stable model time.
 * @returns Most specific active policy, or null.
 */
export async function resolveExperimentPolicy(
  database: DatabaseClient,
  targetId: string,
  campaignId: string,
  now: Date,
): Promise<{
  readonly configuration: unknown;
  readonly id: string;
  readonly version: bigint;
} | null> {
  const common = {
    enabled: true,
    validFrom: { lte: now },
    OR: [{ validTo: null }, { validTo: { gt: now } }],
  };
  const selection = {
    configuration: true,
    id: true,
    version: true,
  } as const;
  const [target, campaign, deployment] = await Promise.all([
    database.biddingPolicy.findFirst({
      orderBy: { version: 'desc' },
      select: selection,
      where: { ...common, scope: 'TARGET', targetId },
    }),
    database.biddingPolicy.findFirst({
      orderBy: { version: 'desc' },
      select: selection,
      where: { ...common, campaignId, scope: 'CAMPAIGN' },
    }),
    database.biddingPolicy.findFirst({
      orderBy: { version: 'desc' },
      select: selection,
      where: { ...common, scope: 'DEPLOYMENT' },
    }),
  ]);
  return target ?? campaign ?? deployment;
}

/**
 * Parses the currently resolved policy, returning null on missing/invalid state.
 *
 * @param row - Runtime row.
 * @returns Valid policy or null.
 */
export function currentExperimentPolicy(row: ExperimentRuntimeRow): DecisionPolicy | null {
  if (row.activePolicyConfiguration === null || row.activePolicyVersion === null) return null;
  try {
    return parseDecisionPolicy(row.activePolicyConfiguration, row.activePolicyVersion);
  } catch {
    return null;
  }
}
