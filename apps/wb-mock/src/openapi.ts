import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/**
 * Builds the mock HTTP contract from runtime DTO metadata.
 *
 * @param application - Initialized mock Nest application.
 * @returns Generated OpenAPI 3.x document.
 */
export function buildMockOpenApi(application: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle('WB Promotion deterministic mock')
    .setDescription('Synthetic, in-memory WB-compatible test surface. Never send real credentials.')
    .setVersion('0.1.0')
    .addApiKey(
      {
        description: 'Synthetic HeaderApiKey used only by tests.',
        in: 'header',
        name: 'Authorization',
        type: 'apiKey',
      },
      'HeaderApiKey',
    )
    .build();
  return SwaggerModule.createDocument(application, configuration);
}

/**
 * Mounts the mock Swagger UI and machine-readable JSON document.
 *
 * @param application - Initialized mock application.
 * @param document - Generated OpenAPI object.
 * @returns Nothing after documentation routes are registered.
 */
export function mountMockOpenApi(application: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('/docs', application, document, {
    jsonDocumentUrl: '/docs-json',
    swaggerOptions: {
      persistAuthorization: false,
    },
  });
}
