/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-conversion, @typescript-eslint/restrict-template-expressions */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AssignmentDto,
  AutomationResponseDto,
  AutomationDto,
  CursorPageDto,
  DecisionResponseDto,
  EconomicsImportResponseDto,
  EconomicsImportDto,
  EconomicsUpdateDto,
  GlobalKillDto,
  ManualJobResponseDto,
  PolicyResponseDto,
  PolicyCreateDto,
  ProblemDetailsDto,
  ProductEconomicsResponseDto,
  ReasonDto,
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
import {
  correlationId,
  positiveBigInt,
  dateOrNow,
  versionHeader,
} from './admin-controller.helpers.js';

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
export class AdminConfigurationController {
  public constructor(private readonly service: AdminService) {}

  @ApiTags('product-economics')
  @ApiOperation({ summary: 'Read the effective immutable product economics version.' })
  @ApiParam({ name: 'nmId', schema: { pattern: '^[1-9][0-9]*$', type: 'string' } })
  @ApiQuery({ name: 'at', required: false, schema: { format: 'date-time', type: 'string' } })
  @ApiOkResponse({
    description: 'Money and WB identifiers are decimal strings.',
    type: ProductEconomicsResponseDto,
  })
  @RequirePermission('product-economics:read')
  @Get('/product-economics/:nmId')
  public async getEconomics(
    @Param('nmId') nmId: string,
    @Query('at') at: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.getEconomics(positiveBigInt(nmId), dateOrNow(at));
    response.setHeader('ETag', result.etag);
    return result.body;
  }

  @ApiTags('product-economics')
  @ApiOperation({ summary: 'Create the next immutable product economics version.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: false })
  @ApiHeader({ name: 'If-None-Match', required: false })
  @ApiCreatedResponse({ type: ProductEconomicsResponseDto })
  @RequirePermission('product-economics:write')
  @Put('/product-economics/:nmId')
  public async updateEconomics(
    @Param('nmId') nmId: string,
    @Body() dto: EconomicsUpdateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsedNmId = positiveBigInt(nmId);
    const expectedVersion = parseExpectedVersion(ifMatch, 'product-economics', true, ifNoneMatch);
    const result = await this.service.updateEconomics({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      expectedVersion,
      idempotencyKey: requireIdempotency(idempotencyKey),
      nmId: parsedNmId,
    });
    response.status(HttpStatus.CREATED);
    response.setHeader('ETag', result.etag);
    response.setHeader(
      'Location',
      `/api/v1/product-economics/${nmId}?at=${encodeURIComponent(dto.effectiveFrom)}`,
    );
    return result.body;
  }

  @ApiTags('product-economics')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: EconomicsImportResponseDto })
  @RequirePermission('product-economics:import')
  @Post('/product-economics/imports')
  public async createImport(
    @Body() dto: EconomicsImportDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.createImport({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      idempotencyKey: requireIdempotency(idempotencyKey),
    });
    response.status(HttpStatus.ACCEPTED);
    response.setHeader('Location', `/api/v1/product-economics/imports/${result.importId}`);
    return result;
  }

  @ApiTags('product-economics')
  @ApiOkResponse({ type: EconomicsImportResponseDto })
  @RequirePermission('product-economics:read')
  @Get('/product-economics/imports/:importId')
  public getImport(@Param('importId', ParseUUIDPipe) importId: string) {
    return this.service.getImport(importId);
  }

  @ApiTags('product-economics')
  @ApiOkResponse({ description: 'Cursor-paginated per-row import results.', type: CursorPageDto })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, schema: { default: 100, maximum: 500, minimum: 1 } })
  @RequirePermission('product-economics:read')
  @Get('/product-economics/imports/:importId/items')
  public listImportItems(
    @Param('importId', ParseUUIDPipe) importId: string,
    @Query() query: ListQuery & { status?: string },
  ) {
    return this.service.listImportItems(importId, query);
  }

  @ApiTags('policies')
  @ApiOkResponse({
    description: 'Cursor-paginated immutable policy versions.',
    type: CursorPageDto,
  })
  @ApiQuery({ name: 'scope', required: false, enum: ['DEPLOYMENT', 'CAMPAIGN', 'TARGET'] })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, schema: { default: 100, maximum: 500, minimum: 1 } })
  @RequirePermission('policies:read')
  @Get('/policies')
  public listPolicies(@Query() query: ListQuery & { scope?: string }) {
    return this.service.listPolicies(query);
  }

  @ApiTags('policies')
  @ApiOkResponse({ type: PolicyResponseDto })
  @RequirePermission('policies:read')
  @Get('/policies/:policyId')
  public async getPolicy(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.getPolicy(policyId);
    response.setHeader('ETag', result.etag);
    return result.body;
  }

  @ApiTags('policies')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: PolicyResponseDto })
  @RequirePermission('policies:write')
  @Post('/policies')
  public async createPolicy(
    @Body() dto: PolicyCreateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.createPolicy(
      principal.actor,
      correlationId(request),
      requireIdempotency(idempotencyKey),
      dto,
    );
    const id = String((result.body as { id: string }).id);
    response.status(HttpStatus.CREATED);
    response.setHeader('ETag', result.etag);
    response.setHeader('Location', `/api/v1/policies/${id}`);
    return result.body;
  }

  @ApiTags('policies')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: VersionedMutationResponseDto })
  @RequirePermission('policies:activate')
  @Post('/policies/:policyId/activations')
  public async activatePolicy(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: ReasonDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.activatePolicy({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      expectedVersion: parseExpectedVersion(ifMatch, 'policy'),
      idempotencyKey: requireIdempotency(idempotencyKey),
      policyId,
      scope: `POST:/api/v1/policies/${policyId}/activations`,
    });
    response.setHeader('ETag', versionHeader('policy', result));
    return result;
  }

  @ApiTags('policies')
  @ApiOkResponse({ type: CursorPageDto })
  @ApiQuery({ name: 'campaignId', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, schema: { default: 100, maximum: 500, minimum: 1 } })
  @RequirePermission('policies:read')
  @Get('/policy-assignments')
  public listAssignments(@Query() query: ListQuery & { campaignId?: string; targetId?: string }) {
    return this.service.listAssignments(query);
  }

  @ApiTags('policies')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: PolicyResponseDto })
  @RequirePermission('policies:activate')
  @Put('/policy-assignments/:scopeType/:scopeId')
  public async assignPolicy(
    @Param('scopeType') scopeType: string,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
    @Body() dto: AssignmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.assignPolicy({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      expectedVersion: parseExpectedVersion(ifMatch, 'assignment'),
      idempotencyKey: requireIdempotency(idempotencyKey),
      policyId: dto.policyId,
      scope: `PUT:/api/v1/policy-assignments/${scopeType}/${scopeId}`,
      scopeId,
      scopeType,
    });
    response.setHeader('ETag', result.etag);
    return result.body;
  }

  @ApiTags('automation')
  @ApiOkResponse({ type: AutomationResponseDto })
  @RequirePermission('automation:read')
  @Get('/automation')
  public getAutomation() {
    return this.service.getAutomation();
  }

  @ApiTags('automation')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: VersionedMutationResponseDto })
  @RequirePermission('automation:write')
  @Put('/automation/campaigns/:campaignId')
  public async setCampaignAutomation(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: AutomationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.setAutomation({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      entityId: campaignId,
      entityType: 'campaign',
      expectedVersion: parseExpectedVersion(ifMatch, 'automation'),
      idempotencyKey: requireIdempotency(idempotencyKey),
      scope: `PUT:/api/v1/automation/campaigns/${campaignId}`,
    });
    response.setHeader('ETag', versionHeader('automation', result));
    return result;
  }

  @ApiTags('automation')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: VersionedMutationResponseDto })
  @RequirePermission('automation:write')
  @Put('/automation/targets/:targetId')
  public async setTargetAutomation(
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: AutomationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.setAutomation({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      entityId: targetId,
      entityType: 'target',
      expectedVersion: parseExpectedVersion(ifMatch, 'automation'),
      idempotencyKey: requireIdempotency(idempotencyKey),
      scope: `PUT:/api/v1/automation/targets/${targetId}`,
    });
    response.setHeader('ETag', versionHeader('automation', result));
    return result;
  }

  @ApiTags('automation')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: VersionedMutationResponseDto })
  @RequirePermission('automation:kill')
  @Post('/automation/global-kill')
  public async setGlobalKill(
    @Body() dto: GlobalKillDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Principal() principal: AdminPrincipal,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const mutationKey = requireIdempotency(idempotencyKey);
    const result = await this.service.setGlobalKill({
      actor: principal.actor,
      correlationId: correlationId(request),
      dto,
      expectedVersion: parseExpectedVersion(ifMatch, 'global-kill'),
      idempotencyKey: mutationKey,
    });
    response.setHeader('ETag', versionHeader('global-kill', result));
    return result;
  }
}
