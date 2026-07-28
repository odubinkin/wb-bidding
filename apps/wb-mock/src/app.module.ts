import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { MockController } from './mock.controller.js';
import { MockHttpExceptionFilter } from './mock-exception.filter.js';
import { MockStateService } from './mock-state.service.js';
import { PromotionController } from './promotion.controller.js';
import { MOCK_CONFIGURATION, createMockConfiguration } from './mock-config.js';

/**
 * Root module for the isolated, database-free WB mock.
 */
@Module({
  controllers: [MockController, PromotionController],
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
      },
    }),
  ],
  providers: [
    MockStateService,
    {
      provide: APP_FILTER,
      useClass: MockHttpExceptionFilter,
    },
    {
      provide: MOCK_CONFIGURATION,
      useFactory: createMockConfiguration,
    },
  ],
})
export class MockAppModule {}
