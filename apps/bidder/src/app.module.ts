import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfiguration } from '@wb-bidder/config';

import { AdminController } from './admin.controller.js';
import { AdminAuthGuard } from './admin-security.js';
import { AdminService } from './admin.service.js';
import { APP_CONFIGURATION } from './application-config.js';
import { ApplicationConfigurationModule } from './application-config.module.js';
import { databasePoolProvider, DatabaseLifecycle } from './database.js';
import { HealthController } from './health.controller.js';
import { DecisionJobService } from './decision-job.service.js';
import { ExperimentRuntimeService } from './experiment-runtime.service.js';
import { ObservabilityService } from './observability.service.js';
import { DatabasePreDispatchValidator } from './pre-dispatch-validator.js';
import { ProblemDetailsFilter } from './problem-details.js';
import { RuntimeCoordinatorService } from './runtime-coordinator.service.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import { runtimeProviders } from './runtime.providers.js';
import { RuntimeSafetyState } from './runtime-state.js';
import { SchedulerService } from './scheduler.service.js';
import { ServiceInfoController } from './service-info.controller.js';
import { WriteRuntimeService } from './write-runtime.service.js';
import { createWbTokenProfile, WB_TOKEN_PROFILE } from './wb-integration.js';

/**
 * Root bidder composition module.
 *
 * Side effects are limited to constructing validated configuration and structured logging.
 */
@Module({
  controllers: [AdminController, HealthController, ServiceInfoController],
  imports: [
    ApplicationConfigurationModule,
    LoggerModule.forRootAsync({
      imports: [ApplicationConfigurationModule],
      inject: [APP_CONFIGURATION],
      useFactory: createLoggerConfiguration,
    }),
  ],
  providers: [
    {
      inject: [APP_CONFIGURATION],
      provide: WB_TOKEN_PROFILE,
      useFactory: createWbTokenProfile,
    },
    databasePoolProvider,
    DatabaseLifecycle,
    ObservabilityService,
    RuntimeSafetyState,
    RuntimeClockService,
    ...runtimeProviders,
    DatabasePreDispatchValidator,
    WriteRuntimeService,
    DecisionJobService,
    ExperimentRuntimeService,
    SchedulerService,
    RuntimeCoordinatorService,
    AdminAuthGuard,
    AdminService,
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}

/**
 * Creates structured logger settings from the already validated application configuration.
 *
 * @param configuration - Immutable startup configuration.
 * @returns Pino HTTP settings with mandatory credential redaction.
 */
function createLoggerConfiguration(configuration: AppConfiguration) {
  return {
    pinoHttp: {
      level: configuration.logLevel,
      redact: {
        censor: '[REDACTED]',
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.token',
          'req.body.serviceToken',
          'res.headers["set-cookie"]',
        ],
      },
    },
  };
}
