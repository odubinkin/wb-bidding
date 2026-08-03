import { WriteControlRepositoryBase } from './control.js';

export * from './types.js';

/** PostgreSQL persistence boundary for writes and reconciliation. */
export class WritePipelineRepository extends WriteControlRepositoryBase {}
