import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { MockController } from './mock.controller.js';
import { MOCK_CONFIGURATION, createMockConfiguration } from './mock-config.js';

/**
 * Root module for the isolated, database-free WB mock.
 */
@Module({
  controllers: [MockController],
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
      },
    }),
  ],
  providers: [
    {
      provide: MOCK_CONFIGURATION,
      useFactory: createMockConfiguration,
    },
  ],
})
export class MockAppModule {}
