import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../../apps/bidder/src/app.module.js';
import { buildBidderOpenApi } from '../../apps/bidder/src/openapi.js';
import { MockAppModule } from '../../apps/wb-mock/src/app.module.js';
import { buildMockOpenApi } from '../../apps/wb-mock/src/openapi.js';

const applications: INestApplication[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close()));
});

describe('generated OpenAPI contracts', () => {
  it('documents bidder observability and service metadata without secret examples', async () => {
    Object.assign(process.env, {
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'test-admin-token-with-32-characters',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
      METRICS_ENABLED: 'true',
      PORT: '3000',
      SCHEDULER_ENABLED: 'false',
      WB_API_MODE: 'mock',
      WB_API_MOCK_BASE_URL: 'http://wb-mock:3001',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const application = await NestFactory.create(AppModule, {
      abortOnError: false,
      logger: false,
    });
    applications.push(application);

    const document = buildBidderOpenApi(application);
    const serialized = JSON.stringify(document);

    expect(document.openapi).toMatch(/^3\./u);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/v1/service-info', '/health/live', '/health/ready', '/metrics']),
    );
    expect(document.components?.securitySchemes).toHaveProperty('admin-service-token');
    expect(serialized).not.toContain('mock-test-token');
    expect(serialized).not.toContain('test-admin-token');
  });

  it('documents the mock control surface and synthetic API-key scheme', async () => {
    Object.assign(process.env, {
      MOCK_CLOCK_MODE: 'virtual',
      MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
      MOCK_SEED: 'foundation',
      PORT: '3001',
    });
    const application = await NestFactory.create(MockAppModule, {
      abortOnError: false,
      logger: false,
    });
    applications.push(application);

    const document = buildMockOpenApi(application);
    const serialized = JSON.stringify(document);
    const requiredWbPaths = [
      '/adv/v1/promotion/count',
      '/api/advert/v2/adverts',
      '/api/advert/v1/bids/min',
      '/api/advert/v1/bids',
      '/adv/v0/normquery/get-bids',
      '/adv/v0/normquery/list',
      '/adv/v0/normquery/bids',
      '/adv/v3/fullstats',
      '/adv/v1/normquery/stats',
      '/api/advert/v0/bids/recommendations',
      '/adv/v1/budget',
      '/api/v1/seller-info',
      '/ping',
    ];

    expect(document.openapi).toMatch(/^3\./u);
    expect(document.paths).toHaveProperty('/__mock/state');
    expect(document.paths).toHaveProperty('/__mock/reset');
    expect(document.paths).toHaveProperty('/__mock/seed/{scenario}');
    expect(document.paths).toHaveProperty('/__mock/faults');
    expect(document.paths).toHaveProperty('/__mock/time/advance');
    expect(document.paths).toHaveProperty('/__mock/requests');
    expect(document.paths).toHaveProperty('/health/live');
    for (const path of requiredWbPaths) {
      expect(document.paths).toHaveProperty(path);
    }
    expect(Object.keys(document.paths)).not.toContain('/adv/v1/promotion/adverts');
    expect(document.components?.securitySchemes).toHaveProperty('HeaderApiKey');
    expect(document.paths['/api/advert/v1/bids/min']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/MinimumBidsRequestDto' },
        },
      },
      required: true,
    });
    expect(document.components?.schemas?.CardNmBidDto).toMatchObject({
      properties: {
        bid_kopecks: {
          description: 'Kopecks (minor RUB units).',
          minimum: 1,
        },
      },
      required: ['bid_kopecks', 'nm_id', 'placement'],
    });
    expect(document.paths['/adv/v1/promotion/count']?.get?.responses).toHaveProperty('429');
    expect(serialized).not.toContain('mock-test-token');
  });
});
