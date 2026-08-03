import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient } from '@wb-bidder/database';
import { DATABASE_CLIENT } from '../database.js';
import { RuntimeClockService } from '../runtime-clock.service.js';
import { AdminOperationsServiceBase } from './admin-operations.service.js';

/**
 * Coordinates admin service behavior and its runtime dependencies.
 */
@Injectable()
export class AdminService extends AdminOperationsServiceBase {
  /**
   * Creates a admin service instance with its required dependencies.
   *
   * @param database Database client used for the transactional operation.
   * @param clock Clock supplying deterministic operation timestamps.
   */
  public constructor(
    @Inject(DATABASE_CLIENT) database: DatabaseClient,
    clock: RuntimeClockService,
  ) {
    super(database, clock);
  }
}
