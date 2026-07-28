import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { CURRENT_ENDPOINT_PROFILE } from '@wb-bidder/contracts';
import { APP_CONFIGURATION } from './application-config.js';
import type { AppConfiguration } from '@wb-bidder/config';

/**
 * Non-secret build and integration-profile information.
 */
export class ServiceInfoResponse {
  /** Application semantic version. */
  @ApiProperty({ example: '0.1.0', type: String })
  public readonly version = '0.1.0';

  /** Endpoint-profile identifier embedded into the artifact. */
  @ApiProperty({ example: 'wb-promotion-2026-07-28-v1', type: String })
  public readonly endpointProfileId = CURRENT_ENDPOINT_PROFILE.profileId;

  /** Effective integration mode. */
  @ApiProperty({ enum: ['mock', 'sandbox', 'prod'], type: String })
  public readonly wbMode: string;

  /** Effective write gate after startup validation. */
  @ApiProperty({ example: false, type: Boolean })
  public readonly writesEnabled: boolean;

  /**
   * Creates a response containing no token, URL credentials, or seller identifiers.
   *
   * @param configuration - Validated application configuration.
   */
  public constructor(configuration: AppConfiguration) {
    this.wbMode = configuration.wb.mode;
    this.writesEnabled = configuration.wb.writesEnabled;
  }
}

/**
 * Exposes build traceability without exposing secrets.
 */
@ApiTags('service')
@Controller('/api/v1')
export class ServiceInfoController {
  /**
   * Creates the service-information controller.
   *
   * @param configuration - Immutable validated configuration.
   */
  public constructor(@Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration) {}

  /**
   * Returns artifact and endpoint-profile identity.
   *
   * @returns Non-secret service metadata.
   */
  @ApiOperation({ summary: 'Service and contract profile information' })
  @ApiOkResponse({ type: ServiceInfoResponse })
  @Get('/service-info')
  public getServiceInfo(): ServiceInfoResponse {
    return new ServiceInfoResponse(this.configuration);
  }
}
