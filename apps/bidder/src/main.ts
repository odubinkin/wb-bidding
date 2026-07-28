import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
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
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  application.enableShutdownHooks();
  const configuration = application.get<AppConfiguration>(APP_CONFIGURATION);
  const openApi = buildBidderOpenApi(application);
  mountBidderOpenApi(application, openApi);
  await application.listen(configuration.port, '0.0.0.0');
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  void bootstrapBidder();
}
