import { DecisionPersistenceRepositoryBase } from './decision.js';

export type * from './types.js';

/** PostgreSQL persistence boundary for economics, policies, and decisions. */
export class DecisionRepository extends DecisionPersistenceRepositoryBase {}
