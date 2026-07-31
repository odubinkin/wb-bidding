export {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseClientOptions,
  type DatabaseExecutor,
  type DatabaseTransaction,
} from './client.js';
export { withTransaction, type DatabaseTransactionOptions } from './transactions.js';
export { advisoryTransactionLock } from './locks.js';
export {
  claimEconomicsImportRecord,
  countTargetsWithoutCurrentEconomics,
  type ClaimedEconomicsImportRecord,
} from './economics-queries.js';
export { claimManualJobRecord, type ClaimedManualJobRecord } from './manual-job-queries.js';
export { listAppliedMigrationNames } from './migration-queries.js';
export { readDatabaseConnectionUtilization } from './observability-queries.js';
export {
  loadAuditEventPage,
  type AuditEventPageQuery,
  type AuditEventRow,
} from './admin-queries.js';
export {
  loadDataSyncCampaignWorkPage,
  loadDataSyncPerformanceCandidates,
  upsertCardCampaignTarget,
  upsertClusterCampaignTarget,
  upsertClusterStatisticRecord,
  upsertSyncSourceSnapshot,
  type DataSyncCampaignWorkRow,
  type DataSyncPerformanceCandidateRow,
} from './data-sync-queries.js';
export {
  loadDecisionTargetPage,
  type DecisionTargetPageQuery,
  type DecisionTargetRow,
} from './decision-queries.js';
export {
  claimDecisionQueueItems,
  cleanupTerminalWriteAttempts,
  loadReconciliationWorkPage,
  type WriteClaimRow,
  type WriteReconciliationRow,
} from './write-pipeline-queries.js';
export { Prisma } from './generated/prisma/client.js';
export * from './generated/prisma/enums.js';
export { createTestDatabaseClient, type TestDatabaseClient } from './test-support.js';
