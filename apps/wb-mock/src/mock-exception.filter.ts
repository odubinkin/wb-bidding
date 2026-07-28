import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Emits deterministic WB-like quota headers for mock 429 responses.
 */
@Catch(HttpException)
export class MockHttpExceptionFilter implements ExceptionFilter<HttpException> {
  /**
   * Serializes a Nest HTTP exception and adds quota headers when required.
   *
   * @param exception - Controller/state exception.
   * @param host - Nest HTTP arguments host.
   * @returns Nothing after sending the response.
   */
  public catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const configuredHeaders = (
      exception as HttpException & {
        readonly mockHeaders?: Readonly<Record<string, string>>;
      }
    ).mockHeaders;
    for (const [name, value] of Object.entries(configuredHeaders ?? {})) {
      response.setHeader(name, value);
    }
    if (status === 429) {
      if (!response.hasHeader('Retry-After')) {
        response.setHeader('Retry-After', '1');
      }
      if (!response.hasHeader('X-Ratelimit-Limit')) {
        response.setHeader('X-Ratelimit-Limit', '1');
      }
      if (!response.hasHeader('X-Ratelimit-Remaining')) {
        response.setHeader('X-Ratelimit-Remaining', '0');
      }
      if (!response.hasHeader('X-Ratelimit-Retry')) {
        response.setHeader('X-Ratelimit-Retry', '1');
      }
    }
    response.status(status).json(exception.getResponse());
  }
}
