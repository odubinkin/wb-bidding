/** Atomic lower-only experiment creation accompanying its starting decision. */
export interface ExperimentPlanWrite {
  readonly experimentBidMinor: bigint;
  readonly maxConcurrentPerAccount: number;
  readonly maxConcurrentPerCampaign: number;
  readonly plannedFullDays: number;
  readonly sourceBidMinor: bigint;
  readonly spendLimitMinor: bigint;
  readonly spendSafetyBufferMinor: bigint;
}

/** Conditional immutable product-economics mutation. */
export interface EconomicsMutation {
  readonly actor: string;
  readonly changeReason?: string;
  readonly contributionMinor: bigint;
  readonly correlationId: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
  readonly expectedCurrentVersion: bigint;
  readonly mutationKey: string;
  readonly idempotencyKey?: string;
  readonly nmId: bigint;
  readonly source: 'IMPORT' | 'MANUAL';
  readonly sourceReference?: string;
  readonly sourceUpdatedAt?: Date;
}

/** One asynchronous economics import row. */
export interface EconomicsImportRow {
  readonly contributionMinor: bigint;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
  readonly expectedCurrentVersion: bigint;
  readonly nmId: bigint;
  readonly rowId: string;
  readonly sourceReference?: string;
  readonly sourceUpdatedAt?: Date;
}

/** Prisma persistence for immutable economics, policies, snapshots, and decisions. */
