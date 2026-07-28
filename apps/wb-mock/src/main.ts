import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { pathToFileURL } from 'node:url';

import { MockAppModule } from './app.module.js';
import { MOCK_CONFIGURATION } from './mock-config.js';
import { buildMockOpenApi, mountMockOpenApi } from './openapi.js';
import type { MockConfiguration } from '@wb-bidder/config';

/**
 * Creates and starts the deterministic standalone WB mock.
 *
 * @returns Promise resolving after the mock HTTP server begins listening.
 */
export async function bootstrapMock(): Promise<void> {
  const application = await NestFactory.create(MockAppModule, { bufferLogs: true });
  application.enableShutdownHooks();
  const configuration = application.get<MockConfiguration>(MOCK_CONFIGURATION);
  const openApi = buildMockOpenApi(application);
  mountMockOpenApi(application, openApi);
  await application.listen(configuration.port, '0.0.0.0');
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  void bootstrapMock();
}
