/* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-member-access */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../apps/bidder/src/app.module.js';
import { buildBidderOpenApi } from '../../apps/bidder/src/openapi.js';
import { configureBidderHttp } from '../../apps/bidder/src/main.js';

describe('Admin API authentication and error contract', () => {
  let application: NestExpressApplication;
  let server: Server;
  const serviceToken = 'contract-admin-token-with-32-characters';

  beforeAll(async () => {
    Object.assign(process.env, {
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: serviceToken,
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:59999/unused',
      LOG_LEVEL: 'silent',
      METRICS_ENABLED: 'false',
      PORT: '3000',
      SCHEDULER_ENABLED: 'false',
      WB_API_MODE: 'mock',
      WB_API_MOCK_BASE_URL: 'http://127.0.0.1:3001',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    application = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      bodyParser: false,
      logger: false,
    });
    configureBidderHttp(application);
    await application.listen(0, '127.0.0.1');
    server = application.getHttpServer() as unknown as Server;
  });

  afterAll(async () => {
    await application.close();
  });

  it('returns redacted application/problem+json for missing and invalid bearer tokens', async () => {
    const missing = await request(server).get('/api/v1/decisions').expect(401);
    expect(missing.type).toBe('application/problem+json');
    expect(missing.body).toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
      title: 'Unauthorized',
    });
    expect(missing.body.correlationId).toMatch(/^[0-9a-f-]{36}$/u);

    const invalid = await request(server)
      .get('/api/v1/audit-events')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    expect(JSON.stringify(invalid.body)).not.toContain(serviceToken);
    expect(JSON.stringify(invalid.body)).not.toContain('mock-test-token');
  });

  it('enforces idempotency and conditional headers before persistence', async () => {
    const response = await request(server)
      .put('/api/v1/product-economics/123456789')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({
        changeReason: 'contract validation',
        effectiveFrom: '2026-08-05T00:00:00.000Z',
        expectedContributionBeforeAdsMinor: '137500',
      })
      .expect(428);
    expect(response.type).toBe('application/problem+json');
    expect(response.body).toMatchObject({
      code: 'PRECONDITION_REQUIRED',
      status: 428,
    });
  });

  it('returns problem details for malformed JSON and rejects payloads above 20 MiB', async () => {
    const malformed = await request(server)
      .post('/api/v1/product-economics/imports')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Content-Type', 'application/json')
      .send('{"dryRun":')
      .expect(400);
    expect(malformed.type).toBe('application/problem+json');

    const oversized = await request(server)
      .post('/api/v1/product-economics/imports')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(20 * 1024 * 1024) }))
      .expect(413);
    expect(oversized.type).toBe('application/problem+json');
    expect(oversized.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });

  it('documents every required Admin path, bearer security, and explicit permission metadata', () => {
    const document = buildBidderOpenApi(application);
    const expectedPaths = [
      '/api/v1/product-economics/{nmId}',
      '/api/v1/product-economics/imports',
      '/api/v1/product-economics/imports/{importId}',
      '/api/v1/product-economics/imports/{importId}/items',
      '/api/v1/policies',
      '/api/v1/policies/{policyId}',
      '/api/v1/policies/{policyId}/activations',
      '/api/v1/policy-assignments',
      '/api/v1/policy-assignments/{scopeType}/{scopeId}',
      '/api/v1/automation',
      '/api/v1/automation/campaigns/{campaignId}',
      '/api/v1/automation/targets/{targetId}',
      '/api/v1/automation/global-kill',
      '/api/v1/jobs/resync',
      '/api/v1/jobs/recalculate',
      '/api/v1/jobs/{jobId}',
      '/api/v1/decisions',
      '/api/v1/decisions/{decisionId}',
      '/api/v1/queue/failures',
      '/api/v1/queue/failures/{decisionId}/retry',
      '/api/v1/audit-events',
    ];
    for (const path of expectedPaths) expect(document.paths).toHaveProperty(path);
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!path.startsWith('/api/v1/') || path === '/api/v1/service-info') continue;
      for (const operation of Object.values(pathItem ?? {})) {
        if (typeof operation !== 'object' || operation === null || !('responses' in operation))
          continue;
        expect(operation).toHaveProperty('security');
        expect(operation).toHaveProperty('x-required-permission');
        const responses = operation.responses as Record<
          string,
          { content?: Record<string, { schema?: unknown }> }
        >;
        const success = Object.entries(responses).find(([status]) => status.startsWith('2'))?.[1];
        expect(success?.content?.['application/json']?.schema).toBeDefined();
        expect(responses['401']?.content?.['application/problem+json']?.schema).toBeDefined();
        expect(responses['403']?.content?.['application/problem+json']?.schema).toBeDefined();
        expect(responses['422']?.content?.['application/problem+json']?.schema).toBeDefined();
        expect(responses['500']?.content?.['application/problem+json']?.schema).toBeDefined();
      }
    }
    expect(document.components?.schemas?.ProductEconomicsResponseDto).toHaveProperty(
      'properties.expectedContributionBeforeAdsMinor.pattern',
      '^-?[0-9]+$',
    );
    expect(document.components?.schemas?.PolicyResponseDto).toHaveProperty(
      'properties.configuration',
    );
    expect(document.paths['/api/v1/audit-events']?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'createdFrom' }),
        expect.objectContaining({ name: 'createdTo' }),
        expect.objectContaining({ name: 'cursor' }),
      ]),
    );
  });
});
