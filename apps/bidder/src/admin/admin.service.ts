/* eslint-disable jsdoc/require-jsdoc */
import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient } from '@wb-bidder/database';
import { DATABASE_CLIENT } from '../database.js';
import { RuntimeClockService } from '../runtime-clock.service.js';
import { AdminOperationsServiceBase } from './admin-operations.service.js';

@Injectable()
export class AdminService extends AdminOperationsServiceBase {
  public constructor(
    @Inject(DATABASE_CLIENT) database: DatabaseClient,
    clock: RuntimeClockService,
  ) {
    super(database, clock);
  }
}
