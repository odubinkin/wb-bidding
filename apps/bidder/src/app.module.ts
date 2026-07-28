import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { APP_CONFIGURATION, createApplicationConfiguration } from './application-config.js';
import { HealthController } from './health.controller.js';
import { ServiceInfoController } from './service-info.controller.js';

/**
 * Root bidder composition module.
 *
 * Side effects are limited to constructing validated configuration and structured logging.
 */
@Module({
  controllers: [HealthController, ServiceInfoController],
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
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
    }),
  ],
  providers: [
    {
      provide: APP_CONFIGURATION,
      useFactory: createApplicationConfiguration,
    },
  ],
})
export class AppModule {}
