import { Inject, Injectable } from '@nestjs/common';
import type { MockConfiguration } from '@wb-bidder/config';
import { MOCK_CONFIGURATION } from '../mock-config.js';
import { MockStateResponsesBase } from './mock-state-responses.service.js';

/** Nest injectable entry point for deterministic mock state. */
@Injectable()
export class MockStateService extends MockStateResponsesBase {
  /**
   * Creates the mock-state service.
   *
   * @param configuration - Validated mock runtime configuration.
   */
  public constructor(@Inject(MOCK_CONFIGURATION) configuration: MockConfiguration) {
    super(configuration);
  }
}
