/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param */
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { INestApplication } from '@nestjs/common';

/**
 * Builds the machine-readable bidder contract from runtime DTO metadata.
 *
 * @param application - Initialized Nest application.
 * @returns Generated OpenAPI 3.x document.
 */
export function buildBidderOpenApi(application: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle('WB Bidder Internal API')
    .setDescription('Internal single-seller bid-management service.')
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        bearerFormat: 'opaque service token',
        description: 'Internal service credential. Never use a WB API token here.',
        scheme: 'bearer',
        type: 'http',
      },
      'admin-service-token',
    )
    .build();

  return SwaggerModule.createDocument(application, configuration);
}

/**
 * Mounts protected-by-deployment Swagger UI and JSON routes.
 *
 * @param application - Initialized Nest application.
 * @param document - Generated OpenAPI document.
 * @returns Nothing after both documentation routes are registered.
 */
export function mountBidderOpenApi(
  application: INestApplication,
  document: OpenAPIObject,
  serviceToken: string,
): void {
  const authorizeDocs = (request: Request, response: Response, next: NextFunction): void => {
    const authorization = request.header('authorization');
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const suppliedDigest = createHash('sha256').update(supplied).digest();
    const expectedDigest = createHash('sha256').update(serviceToken).digest();
    if (!timingSafeEqual(suppliedDigest, expectedDigest)) {
      response.status(401).type('application/problem+json').json({
        code: 'UNAUTHENTICATED',
        correlationId: randomUUID(),
        detail: 'A valid Admin API service token is required.',
        status: 401,
        title: 'Unauthorized',
        type: 'urn:wb-bidder:problem:unauthenticated',
      });
      return;
    }
    next();
  };
  application.use('/docs', authorizeDocs);
  application.use('/docs-json', authorizeDocs);
  SwaggerModule.setup('/docs', application, document, {
    jsonDocumentUrl: '/docs-json',
    swaggerOptions: {
      persistAuthorization: false,
    },
  });
}
