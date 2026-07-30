import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const DECIMAL = /^-?[0-9]+$/u;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/u;

/** Replaces one versioned product-economics value through the Admin API. */
export class EconomicsUpdateDto {
  @ApiProperty({ example: '137500', description: 'Signed ACCOUNT_CURRENCY minor units.' })
  @Matches(DECIMAL)
  public expectedContributionBeforeAdsMinor!: string;

  @ApiProperty({ format: 'date-time' })
  @IsString()
  public effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsString()
  public effectiveTo?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  public sourceUpdatedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public sourceReference?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  public changeReason!: string;
}

/** Describes one optimistic-concurrency row in a product-economics import. */
export class EconomicsImportItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  public rowId!: string;

  @ApiProperty({ example: '123456789' })
  @Matches(POSITIVE_DECIMAL)
  public nmId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public expectedCurrentVersion!: number;

  @ApiProperty({ example: '137500' })
  @Matches(DECIMAL)
  public expectedContributionBeforeAdsMinor!: string;

  @ApiProperty({ format: 'date-time' })
  @IsString()
  public effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsString()
  public effectiveTo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public sourceReference?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  public sourceUpdatedAt?: string;
}

/** Creates a validated batch import, optionally without persisting its rows. */
export class EconomicsImportDto {
  @ApiProperty()
  @IsBoolean()
  public dryRun!: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  public changeReason!: string;

  @ApiProperty({ type: [EconomicsImportItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EconomicsImportItemDto)
  public items!: EconomicsImportItemDto[];
}

/** Creates an immutable bidding-policy version for one permitted scope. */
export class PolicyCreateDto {
  @ApiProperty({ enum: ['DEPLOYMENT', 'CAMPAIGN', 'TARGET'] })
  @IsIn(['DEPLOYMENT', 'CAMPAIGN', 'TARGET'])
  public scope!: 'CAMPAIGN' | 'DEPLOYMENT' | 'TARGET';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public campaignId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public targetId?: string;

  @ApiProperty()
  @IsObject()
  public configuration!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  @IsString()
  public validFrom!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  public changeReason!: string;
}

/** Supplies the mandatory human-readable audit reason for a mutation. */
export class ReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  public changeReason!: string;
}

/** Assigns a policy version to its campaign or target scope. */
export class AssignmentDto extends ReasonDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public policyId!: string;
}

/** Changes the automation mode while preserving an audit reason. */
export class AutomationDto extends ReasonDto {
  @ApiProperty({ enum: ['DISABLED', 'OBSERVE_ONLY', 'APPLY'] })
  @IsIn(['DISABLED', 'OBSERVE_ONLY', 'APPLY'])
  public mode!: 'APPLY' | 'DISABLED' | 'OBSERVE_ONLY';
}

/** Enables or disables the deployment-wide automation kill switch. */
export class GlobalKillDto extends ReasonDto {
  @ApiProperty()
  @IsBoolean()
  public enabled!: boolean;
}

/** Selects the bounded data scope for an operator-triggered runtime job. */
export class ManualJobDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  public campaignIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  public targetIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(
    [
      'CAMPAIGN_DISCOVERY',
      'CAMPAIGN_DETAILS',
      'CURRENT_BID',
      'MINIMUM_BID',
      'CAMPAIGN_STATISTICS',
      'CLUSTER_LIST',
      'CLUSTER_STATISTICS',
      'BID_RECOMMENDATION',
      'BUDGET_DIAGNOSTIC',
      'SAME_DAY_SPEND',
    ],
    { each: true },
  )
  public dataKinds?: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  public changeReason!: string;
}

/** Confirms a safe queue retry with the required audit reason. */
export class RetryDto extends ReasonDto {}

/** RFC 9457-compatible error body returned by the Admin API. */
export class ProblemDetailsDto {
  @ApiProperty({ example: 'VERSION_MISMATCH' })
  public code!: string;

  @ApiProperty({ format: 'uuid' })
  public correlationId!: string;

  @ApiProperty()
  public detail!: string;

  @ApiProperty({ example: 412 })
  public status!: number;

  @ApiProperty()
  public title!: string;

  @ApiProperty({ format: 'uri', example: 'urn:wb-bidder:problem:version_mismatch' })
  public type!: string;
}

/** Generic cursor-pagination envelope returned by list endpoints. */
export class CursorPageDto {
  @ApiProperty({ type: [Object] })
  public items!: Record<string, unknown>[];

  @ApiPropertyOptional({ nullable: true, type: String })
  public nextCursor!: string | null;
}

/** Serializes one immutable product-economics version for HTTP clients. */
export class ProductEconomicsResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ pattern: '^[1-9][0-9]*$', description: 'WB article ID as a decimal string.' })
  public nmId!: string;

  @ApiProperty({
    pattern: '^-?[0-9]+$',
    description: 'Signed ACCOUNT_CURRENCY minor units as a decimal string.',
  })
  public expectedContributionBeforeAdsMinor!: string;

  @ApiProperty({ format: 'date-time' })
  public effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  public effectiveTo!: string | null;

  @ApiProperty({ enum: ['MANUAL', 'IMPORT'] })
  public source!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  public sourceUpdatedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  public sourceReference!: string | null;

  @ApiProperty({ pattern: '^[0-9]+$', description: 'BIGINT version as a decimal string.' })
  public version!: string;

  @ApiProperty({ format: 'date-time' })
  public createdAt!: string;

  @ApiProperty()
  public createdByActor!: string;
}

/** Reports aggregate progress and outcome counters for an economics import. */
export class EconomicsImportResponseDto {
  @ApiProperty({ format: 'uuid' })
  public importId!: string;

  @ApiProperty({
    enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'],
  })
  public status!: string;

  @ApiProperty()
  public dryRun!: boolean;

  @ApiProperty()
  public totalItems!: number;

  @ApiProperty()
  public processedItems!: number;

  @ApiProperty()
  public validatedItems!: number;

  @ApiProperty()
  public succeededItems!: number;

  @ApiProperty()
  public failedItems!: number;

  @ApiProperty({ format: 'date-time' })
  public createdAt!: string;
}

/** Serializes one persisted policy version without internal metadata. */
export class PolicyResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ enum: ['DEPLOYMENT', 'CAMPAIGN', 'TARGET'] })
  public scope!: string;

  @ApiProperty({ type: Object, additionalProperties: true })
  public configuration!: Record<string, unknown>;

  @ApiProperty()
  public enabled!: boolean;

  @ApiProperty({ pattern: '^[0-9]+$' })
  public version!: string;

  @ApiProperty({ format: 'date-time' })
  public validFrom!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  public validTo!: string | null;
}

/** Returns the new optimistic-concurrency version after a mutation. */
export class VersionedMutationResponseDto {
  @ApiProperty({ pattern: '^[0-9]+$', description: 'BIGINT version as a decimal string.' })
  public version!: string;
}

/** Identifies a manually scheduled job and its initial lifecycle status. */
export class ManualJobResponseDto {
  @ApiProperty({ format: 'uuid' })
  public jobId!: string;

  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] })
  public status!: string;
}

/** Serializes a decision together with its explanation and write attempts. */
export class DecisionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: Object, additionalProperties: true })
  public explanation!: Record<string, unknown>;

  @ApiProperty({ type: [Object] })
  public attempts!: Record<string, unknown>[];
}

/** Returns effective automation controls grouped by their administrative scope. */
export class AutomationResponseDto {
  @ApiProperty({ type: Object, additionalProperties: true })
  public deployment!: Record<string, unknown>;

  @ApiProperty({ type: [Object] })
  public campaigns!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  public targets!: Record<string, unknown>[];
}
