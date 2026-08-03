import { DataSyncPerformanceRepositoryBase } from './performance.js';

export * from './types.js';

/** PostgreSQL persistence boundary for synchronization, evidence, and leases. */
export class DataSyncRepository extends DataSyncPerformanceRepositoryBase {}
