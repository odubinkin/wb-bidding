/* eslint-disable jsdoc/require-jsdoc */
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AutomationResponseDto,
  CursorPageDto,
  DecisionResponseDto,
  EconomicsImportResponseDto,
  ManualJobResponseDto,
  ManualJobDto,
  PolicyResponseDto,
  ProblemDetailsDto,
  ProductEconomicsResponseDto,
  RetryDto,
  VersionedMutationResponseDto,
} from '../admin-dto.js';
import {
  AdminAuthGuard,
  type AdminPrincipal,
  type AdminRequest,
  Principal,
  RequirePermission,
} from '../admin-security.js';
import { AdminService } from './admin.service.js';
import { parseExpectedVersion, requireIdempotency, type ListQuery } from './admin.helpers.js';
import { correlationId, versionHeader } from './admin-controller.helpers.js';

@ApiBearerAuth('admin-service-token')
@ApiProduces('application/json', 'application/problem+json')
@ApiExtraModels(
  AutomationResponseDto,
  CursorPageDto,
  DecisionResponseDto,
  EconomicsImportResponseDto,
  ManualJobResponseDto,
  PolicyResponseDto,
  ProblemDetailsDto,
  ProductEconomicsResponseDto,
  VersionedMutationResponseDto,
)
@ApiResponse({
  status: 400,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Malformed request',
})
@ApiResponse({
  status: 401,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'UNAUTHENTICATED',
})
@ApiResponse({
  status: 404,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Resource not found',
})
@ApiResponse({
  status: 403,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'FORBIDDEN',
})
@ApiResponse({
  status: 409,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Conflict or unsafe retry',
})
@ApiResponse({
  status: 412,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Conditional version mismatch',
})
@ApiResponse({
  status: 413,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Payload exceeds the documented limit',
})
@ApiResponse({
  status: 422,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Semantically invalid request',
})
@ApiResponse({
  status: 428,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Required idempotency or conditional header is missing',
})
@ApiResponse({
  status: 500,
  content: {
    'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
  },
  description: 'Fail-closed internal error',
})
@UseGuards(AdminAuthGuard)
@Controller('/api/v1')
export class AdminOperationsController {
  public constructor(private readonly service: AdminService) {}

  @ApiTags('jobs')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: ManualJobResponseDto })
  @RequirePermission('jobs:trigger')
  @Post('/jobs/resync')
  public createResyncJob(
    @Body() dto: ManualJobDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
  ) {
    return this.service.createJob({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      expectedVersion: 0n,
      idempotencyKey: requireIdempotency(idempotencyKey),
      scope: 'POST:/api/v1/jobs/resync',
      type: 'RESYNC',
    });
  }

  @ApiTags('jobs')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: ManualJobResponseDto })
  @RequirePermission('jobs:trigger')
  @Post('/jobs/recalculate')
  public createRecalculateJob(
    @Body() dto: ManualJobDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
  ) {
    return this.service.createJob({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      expectedVersion: 0n,
      idempotencyKey: requireIdempotency(idempotencyKey),
      scope: 'POST:/api/v1/jobs/recalculate',
      type: 'RECALCULATE',
    });
  }

  @ApiTags('jobs')
  @ApiOkResponse({ type: ManualJobResponseDto })
  @RequirePermission('jobs:read')
  @Get('/jobs/:jobId')
  public getJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.getJob(jobId);
  }

  @ApiTags('decisions')
  @ApiOkResponse({ type: CursorPageDto })
  @ApiQuery({ name: 'campaignId', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: ['NO_CHANGE', 'INCREASE', 'DECREASE', 'RESTORE_ABSENT_OVERRIDE', 'BLOCKED'],
  })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, schema: { default: 100, maximum: 500, minimum: 1 } })
  @RequirePermission('decisions:read')
  @Get('/decisions')
  public listDecisions(
    @Query()
    query: ListQuery & { action?: string; campaignId?: string; targetId?: string },
  ) {
    return this.service.listDecisions(query);
  }

  @ApiTags('decisions')
  @ApiOkResponse({ type: DecisionResponseDto })
  @RequirePermission('decisions:read')
  @Get('/decisions/:decisionId')
  public getDecision(@Param('decisionId', ParseUUIDPipe) decisionId: string) {
    return this.service.getDecision(decisionId);
  }

  @ApiTags('queue')
  @ApiOkResponse({ type: CursorPageDto })
  @ApiQuery({ name: 'classification', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, schema: { default: 100, maximum: 500, minimum: 1 } })
  @RequirePermission('queue:read')
  @Get('/queue/failures')
  public listFailures(@Query() query: ListQuery & { classification?: string }) {
    return this.service.listFailures(query);
  }

  @ApiTags('queue')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: VersionedMutationResponseDto })
  @RequirePermission('queue:retry')
  @Post('/queue/failures/:decisionId/retry')
  public async retryFailure(
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
    @Body() dto: RetryDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const mutationKey = requireIdempotency(idempotencyKey);
    const result = await this.service.retryFailure({
      actor: principal.actor,
      correlationId: correlationId(request),
      decisionId,
      expectedVersion: parseExpectedVersion(ifMatch, 'queue'),
      idempotencyKey: mutationKey,
      reason: dto.changeReason,
    });
    response.setHeader('ETag', versionHeader('queue', result));
    return result;
  }

  @ApiTags('audit')
  @ApiOkResponse({ type: CursorPageDto })
  @ApiQuery({ name: 'campaignId', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'correlationId', required: false, type: String })
  @ApiQuery({ name: 'actor', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, schema: { default: 100, maximum: 500, minimum: 1 } })
  @RequirePermission('audit:read')
  @Get('/audit-events')
  public listAudit(
    @Query()
    query: ListQuery & {
      action?: string;
      actor?: string;
      campaignId?: string;
      correlationId?: string;
      createdFrom?: string;
      createdTo?: string;
      entityId?: string;
      entityType?: string;
      targetId?: string;
    },
  ) {
    return this.service.listAudit(query);
  }
}
