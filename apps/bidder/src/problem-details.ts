/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-enum-comparison */
import { Catch, type ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

import type { AdminRequest } from './admin-security.js';

/** Typed application error that maps a known Admin API failure to an HTTP response. */
export class AdminApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}

/**
 * Serializes all Admin failures as RFC 9457-compatible problem details.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AdminRequest>();
    const response = http.getResponse<Response>();
    const correlationId =
      request.correlationId ?? request.header('x-correlation-id') ?? randomUUID();
    const problem = toProblem(exception, correlationId);
    response
      .status(problem.status)
      .type('application/problem+json')
      .setHeader('x-correlation-id', correlationId)
      .json(problem);
  }
}

function toProblem(exception: unknown, correlationId: string) {
  if (exception instanceof AdminApiError) {
    return {
      code: exception.code,
      correlationId,
      detail: exception.message,
      status: exception.status,
      title: titleFor(exception.status),
      type: `urn:wb-bidder:problem:${exception.code.toLowerCase()}`,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const detail =
      typeof response === 'string'
        ? response
        : typeof response === 'object' && response !== null && 'message' in response
          ? String(response.message)
          : titleFor(status);
    const code =
      status === HttpStatus.UNAUTHORIZED
        ? 'UNAUTHENTICATED'
        : status === HttpStatus.FORBIDDEN
          ? 'FORBIDDEN'
          : 'INVALID_REQUEST';
    return {
      code,
      correlationId,
      detail,
      status,
      title: titleFor(status),
      type: `urn:wb-bidder:problem:${code.toLowerCase()}`,
    };
  }
  const mapped = mapDatabaseError(exception);
  return {
    code: mapped.code,
    correlationId,
    detail: mapped.detail,
    status: mapped.status,
    title: titleFor(mapped.status),
    type: `urn:wb-bidder:problem:${mapped.code.toLowerCase()}`,
  };
}

function mapDatabaseError(exception: unknown): {
  code: string;
  detail: string;
  status: number;
} {
  const message = exception instanceof Error ? exception.message : 'Unexpected internal error';
  const databaseCode =
    typeof exception === 'object' && exception !== null && 'code' in exception
      ? String(exception.code)
      : null;
  const status =
    typeof exception === 'object' && exception !== null && 'status' in exception
      ? Number(exception.status)
      : null;
  if (status === 413)
    return {
      code: 'PAYLOAD_TOO_LARGE',
      detail: 'Request payload exceeds 20 MiB.',
      status: 413,
    };
  if (status === 400)
    return {
      code: 'INVALID_JSON',
      detail: 'Request body is not valid JSON.',
      status: 400,
    };
  if (message.includes('IDEMPOTENCY_KEY_REUSED'))
    return { code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused.', status: 409 };
  if (message.includes('VERSION_MISMATCH') || message.includes('VERSION_CONFLICT'))
    return { code: 'VERSION_MISMATCH', detail: 'Conditional version does not match.', status: 412 };
  if (message.includes('RETRY_NOT_SAFE'))
    return {
      code: 'RETRY_NOT_SAFE',
      detail: 'The terminal write cannot be retried safely; reconcile or resync first.',
      status: 409,
    };
  if (message.includes('DUPLICATE_ROW_ID'))
    return { code: 'DUPLICATE_ROW_ID', detail: 'rowId values must be unique.', status: 400 };
  if (message.includes('DUPLICATE_NM_ID'))
    return { code: 'DUPLICATE_NM_ID', detail: 'nmId values must be unique.', status: 400 };
  if (message.includes('EMPTY_ITEMS'))
    return { code: 'EMPTY_ITEMS', detail: 'At least one import row is required.', status: 400 };
  if (message.includes('TOO_MANY_ITEMS'))
    return {
      code: 'TOO_MANY_ITEMS',
      detail: 'At most 10,000 import rows are allowed.',
      status: 422,
    };
  if (databaseCode === '23P01')
    return {
      code: 'EFFECTIVE_PERIOD_OVERLAP',
      detail: 'Product economics effective periods cannot overlap.',
      status: 409,
    };
  if (message.includes('INVALID_PRODUCT_ECONOMICS'))
    return {
      code: 'INVALID_PRODUCT_ECONOMICS',
      detail: 'Product economics input is invalid.',
      status: 422,
    };
  if (message.includes('NOT_FOUND'))
    return { code: 'NOT_FOUND', detail: 'Requested resource was not found.', status: 404 };
  return { code: 'INTERNAL_ERROR', detail: 'Internal request processing failed.', status: 500 };
}

function titleFor(status: number): string {
  return (
    {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      412: 'Precondition Failed',
      413: 'Payload Too Large',
      422: 'Unprocessable Entity',
      428: 'Precondition Required',
      500: 'Internal Server Error',
    }[status] ?? 'Request Failed'
  );
}
