import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { pathToFileURL } from 'node:url';

import { AppModule } from './app.module.js';
import { APP_CONFIGURATION } from './application-config.js';
import { buildBidderOpenApi, mountBidderOpenApi } from './openapi.js';
import type { AppConfiguration } from '@wb-bidder/config';

/**
 * Creates and starts the bidder HTTP process.
 *
 * The startup sequence validates configuration before listening and does not enable writes by
 * default.
 *
 * @returns Promise resolving after the HTTP server begins listening.
 */
export async function bootstrapBidder(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  configureBidderHttp(application);
  const configuration = application.get<AppConfiguration>(APP_CONFIGURATION);
  const openApi = buildBidderOpenApi(application);
  mountBidderOpenApi(application, openApi, configuration.adminApiServiceToken);
  await application.listen(configuration.port, '0.0.0.0');
}

/**
 * Applies the production HTTP parser, validation, and shutdown contract.
 *
 * @param application - Nest Express application before it begins listening.
 */
export function configureBidderHttp(application: NestExpressApplication): void {
  application.useBodyParser('json', { limit: 20 * 1024 * 1024, strict: true });
  application.enableShutdownHooks();
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  void bootstrapBidder();
}
