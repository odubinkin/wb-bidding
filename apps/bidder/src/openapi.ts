import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
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
export function mountBidderOpenApi(application: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('/docs', application, document, {
    jsonDocumentUrl: '/docs-json',
    swaggerOptions: {
      persistAuthorization: false,
    },
  });
}
