import { Global, Module } from '@nestjs/common';

import { APP_CONFIGURATION, createApplicationConfiguration } from './application-config.js';

/**
 * Supplies one validated immutable configuration instance to every bidder component.
 */
@Global()
@Module({
  exports: [APP_CONFIGURATION],
  providers: [
    {
      provide: APP_CONFIGURATION,
      useFactory: createApplicationConfiguration,
    },
  ],
})
export class ApplicationConfigurationModule {}
