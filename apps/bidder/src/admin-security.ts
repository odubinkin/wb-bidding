/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unnecessary-condition */
import {
  applyDecorators,
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiExtension } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { APP_CONFIGURATION } from './application-config.js';
import type { AppConfiguration } from '@wb-bidder/config';

const PERMISSION_METADATA = 'admin-permission';

export interface AdminPrincipal {
  readonly actor: string;
  readonly permissions: ReadonlySet<string>;
}

export type AdminRequest = Request & {
  adminPrincipal?: AdminPrincipal;
  correlationId?: string;
};

export const RequirePermission = (permission: string): MethodDecorator =>
  applyDecorators(
    SetMetadata(PERMISSION_METADATA, permission),
    ApiExtension('x-required-permission', permission),
  );

export const Principal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal => {
    const principal = context.switchToHttp().getRequest<AdminRequest>().adminPrincipal;
    if (principal === undefined) throw new UnauthorizedException('UNAUTHENTICATED');
    return principal;
  },
);

/**
 * Constant-time bearer authentication and fail-closed permission enforcement.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  public constructor(
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    private readonly reflector: Reflector,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.header('authorization');
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!safeEqual(supplied, this.configuration.adminApiServiceToken)) {
      throw new UnauthorizedException('UNAUTHENTICATED');
    }
    const permissions = ALL_ADMIN_PERMISSIONS;
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined || !permissions.has(required)) {
      throw new ForbiddenException('FORBIDDEN');
    }
    request.adminPrincipal = Object.freeze({
      actor: 'service-account:admin',
      permissions,
    });
    return true;
  }
}

const ALL_ADMIN_PERMISSIONS: ReadonlySet<string> = new Set([
  'product-economics:read',
  'product-economics:write',
  'product-economics:import',
  'policies:read',
  'policies:write',
  'policies:activate',
  'automation:read',
  'automation:write',
  'automation:kill',
  'jobs:read',
  'jobs:trigger',
  'decisions:read',
  'queue:read',
  'queue:retry',
  'audit:read',
]);

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(left).digest(),
    createHash('sha256').update(right).digest(),
  );
}
