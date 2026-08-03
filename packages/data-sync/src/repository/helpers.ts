import { randomUUID } from 'node:crypto';
import { Prisma, type DatabaseExecutor, type DatabaseTransaction } from '@wb-bidder/database';
import type {
  AccountBindingCandidate,
  ExistingAccountBinding,
  PerformanceDayCandidate,
  SyncDataKind,
} from '../types.js';

/**
 * Quoted PostgreSQL account-binding row.
 */
export interface BindingRow {
  readonly accountCurrency: string;
  readonly accountSettingsChecksum: string;
  readonly accountTimezone: string;
  readonly bindingVersion: bigint | string;
  readonly sellerSid: string;
  readonly tokenAccessFingerprint: string;
  readonly tokenCategory: string;
  readonly tokenFor: string | null;
  readonly tokenType: AccountBindingCandidate['tokenType'];
  readonly wbEnvironment: AccountBindingCandidate['environment'];
}

/**
 * Maps a quoted PostgreSQL row to the domain binding.
 *
 * @param row - Database row.
 * @returns Existing binding.
 */
export function mapExistingBinding(row: BindingRow): ExistingAccountBinding {
  return Object.freeze({
    accountCurrency: row.accountCurrency.trim(),
    accountSettingsChecksum: row.accountSettingsChecksum,
    accountTimezone: row.accountTimezone,
    bindingVersion: BigInt(row.bindingVersion),
    environment: row.wbEnvironment,
    sellerSid: row.sellerSid,
    tokenCategory: row.tokenCategory,
    tokenFingerprint: row.tokenAccessFingerprint,
    tokenFor: row.tokenFor === null ? null : 'SELF',
    tokenType: row.tokenType,
  });
}

/**
 * Inserts or resolves one immutable source observation idempotently.
 *
 * @param database - Shared Prisma client or active transaction.
 * @param input - Immutable source observation.
 * @param input.campaignId - Related campaign, when applicable.
 * @param input.dataKind - Source evidence kind.
 * @param input.endpointProfile - WB endpoint contract profile.
 * @param input.fetchedAt - Observation time.
 * @param input.id - Candidate observation UUID.
 * @param input.invalidReason - Validation failure detail.
 * @param input.normalizedData - Normalized source payload.
 * @param input.sourceChecksum - Stable source content checksum.
 * @param input.sourceDate - Source business date, when applicable.
 * @param input.syncRunId - Owning synchronization run.
 * @param input.targetId - Related target, when applicable.
 * @param input.valid - Whether the observation passed validation.
 * @returns Existing or newly inserted observation UUID.
 */
export async function upsertSyncSourceSnapshot(
  database: DatabaseExecutor,
  input: {
    readonly campaignId: string | null;
    readonly dataKind: SyncDataKind;
    readonly endpointProfile: string;
    readonly fetchedAt: Date;
    readonly id: string;
    readonly invalidReason: string | null;
    readonly normalizedData: unknown;
    readonly sourceChecksum: string;
    readonly sourceDate: Date | null;
    readonly syncRunId: string;
    readonly targetId: string | null;
    readonly valid: boolean;
  },
): Promise<string> {
  const inserted = await database.syncSourceSnapshot.createManyAndReturn({
    data: {
      campaignId: input.campaignId,
      dataKind: input.dataKind,
      endpointProfile: input.endpointProfile,
      fetchedAt: input.fetchedAt,
      id: input.id,
      invalidReason: input.invalidReason,
      normalizedData:
        input.normalizedData === null
          ? Prisma.JsonNull
          : (input.normalizedData as Prisma.InputJsonValue),
      sourceChecksum: input.sourceChecksum,
      sourceDate: input.sourceDate,
      syncRunId: input.syncRunId,
      targetId: input.targetId,
      valid: input.valid,
    },
    select: { id: true },
    skipDuplicates: true,
  });
  if (inserted[0]?.id !== undefined) return inserted[0].id;
  const existing = await database.syncSourceSnapshot.findFirst({
    select: { id: true },
    where: {
      campaignId: input.campaignId,
      dataKind: input.dataKind,
      sourceChecksum: input.sourceChecksum,
      sourceDate: input.sourceDate,
      syncRunId: input.syncRunId,
      targetId: input.targetId,
    },
  });
  const id = existing?.id;
  if (id === undefined) throw new Error('SOURCE_SNAPSHOT_IDEMPOTENCY_LOOKUP_FAILED');
  return id;
}

/**
 * Checks whether historical business rows exist before first binding.
 *
 * @param client - Transaction client holding the binding lock.
 * @returns Whether initialization would reinterpret history.
 */
export async function hasBusinessData(client: DatabaseTransaction): Promise<boolean> {
  const [campaigns, statistics, decisions, audits] = await Promise.all([
    client.campaign.count(),
    client.campaignStatDaily.count(),
    client.bidDecision.count(),
    client.auditEvent.count(),
  ]);
  return campaigns + statistics + decisions + audits > 0;
}

/**
 * Redacted append-only audit write.
 */
export interface AuditWrite {
  readonly action: string;
  readonly actor: string;
  readonly after: unknown;
  readonly correlationId: string;
  readonly entityId: string;
  readonly entityType: string;
}

/**
 * Appends one redacted audit event inside the caller transaction.
 *
 * @param client - Transaction client.
 * @param event - Non-secret event.
 * @returns Nothing.
 */
export async function appendAudit(client: DatabaseTransaction, event: AuditWrite): Promise<void> {
  await client.auditEvent.create({
    data: {
      action: event.action,
      actor: event.actor,
      after: inputJson(event.after),
      correlationId: event.correlationId,
      entityId: event.entityId,
      entityType: event.entityType,
      id: randomUUID(),
    },
  });
}

/**
 * Derives card-target rows from WB placement flags.
 *
 * @param placements - Runtime-validated placement switches.
 * @param placements.recommendations - Whether recommendations traffic is active.
 * @param placements.search - Whether search traffic is active.
 * @returns Internal placement enum values.
 */
export function activeCardPlacements(placements: {
  readonly recommendations: boolean;
  readonly search: boolean;
}): readonly ('RECOMMENDATIONS' | 'SEARCH')[] {
  return Object.freeze([
    ...(placements.search ? (['SEARCH'] as const) : []),
    ...(placements.recommendations ? (['RECOMMENDATIONS'] as const) : []),
  ]);
}

/**
 * Produces JSON text without bigint serialization failures.
 *
 * @param value - Redacted evidence value.
 * @returns JSON text.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item instanceof Date ? item.toISOString() : item,
  );
}

/**
 * Converts normalized runtime evidence into a Prisma JSON input.
 *
 * @param value - JSON-compatible runtime value.
 * @returns Prisma JSON input.
 */
export function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(safeJson(value)) as Prisma.InputJsonValue;
}

/**
 * Narrows a stored JSON value to an object.
 *
 * @param value - Stored JSON value.
 * @returns Object value or an empty object.
 */
export function readJsonObject(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

/**
 * Redacts an arbitrary error to a bounded class/message.
 *
 * @param error - Worker failure.
 * @returns Bounded diagnostic.
 */
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown error';
  return message.slice(0, 512);
}

/**
 * Calculates the maximum adjacent bid-state gap.
 *
 * @param candidate - Performance-day evidence.
 * @returns Ceiling minutes.
 */
export function maximumObservationGap(candidate: PerformanceDayCandidate): number {
  const observations = [...candidate.bidStates].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
  );
  let maximum = 0;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (previous !== undefined && current !== undefined) {
      maximum = Math.max(
        maximum,
        (current.observedAt.getTime() - previous.observedAt.getTime()) / 60_000,
      );
    }
  }
  return Math.ceil(maximum);
}
