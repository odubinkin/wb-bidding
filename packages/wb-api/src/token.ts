import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import { z } from 'zod';

/**
 * Integration environment used for token validation.
 */
export type TokenValidationMode = 'mock' | 'prod' | 'sandbox';

/**
 * Supported self-hosted token type.
 */
export type ValidatedTokenType = 'BASE' | 'MOCK' | 'PERSONAL' | 'TEST';

/**
 * Safe decoded WB identity and capability profile.
 */
export interface ValidatedTokenProfile {
  /** WB account identifier. */
  readonly sellerSid: string;
  /** JWT expiry in Unix seconds, or null for the synthetic mock token. */
  readonly expiresAtEpochSeconds: number | null;
  /** Irreversible fingerprint over stable identity claims, never the token. */
  readonly identityFingerprint: string;
  /** Whether the promotion category bit is present. */
  readonly promotionAccess: boolean;
  /** Whether the read-only restriction bit is present. */
  readonly readOnly: boolean;
  /** Validated token kind. */
  readonly tokenType: ValidatedTokenType;
  /** Whether this token can pass the token-only portion of the write gate. */
  readonly writeCapable: boolean;
}

/**
 * Raised for malformed, expired, or environment-incompatible WB token claims.
 */
export class WbTokenValidationError extends Error {
  /**
   * Creates a redacted token validation error.
   *
   * @param reason - Claim-level reason that never contains token bytes.
   */
  public constructor(reason: string) {
    super(`WB token validation failed: ${reason}`);
    this.name = 'WbTokenValidationError';
  }
}

const wbJwtClaimsSchema = z
  .object({
    acc: z.number().int().min(1).max(4),
    exp: z.number().int().positive(),
    for: z.string().optional(),
    id: z.uuid(),
    s: z.number().int().nonnegative(),
    sid: z.uuid(),
    t: z.boolean(),
  })
  .loose();

const PROMOTION_BIT_POSITION = 6;
const READ_ONLY_BIT_POSITION = 30;

/**
 * Validates the structural WB JWT profile without sending the secret anywhere.
 *
 * Signature verification is not possible from the documented self-contained token contract;
 * identity becomes trusted only after an authorized WB API call and account binding.
 *
 * @param token - Secret JWT or the exact synthetic mock token.
 * @param mode - Selected integration environment.
 * @param nowEpochSeconds - Current Unix time used for deterministic expiry checks.
 * @returns Safe immutable claims and capability flags.
 * @throws {WbTokenValidationError} When structure, expiry, type, or category is invalid.
 * @see https://dev.wildberries.ru/ru/openapi/api-information
 */
export function validateWbToken(
  token: string,
  mode: TokenValidationMode,
  nowEpochSeconds: number = Math.floor(Date.now() / 1_000),
): ValidatedTokenProfile {
  if (mode === 'mock') {
    if (token !== 'mock-test-token') {
      throw new WbTokenValidationError('mock mode accepts only the synthetic mock-test-token');
    }
    return Object.freeze({
      expiresAtEpochSeconds: null,
      identityFingerprint: fingerprint('mock-seller-00000000-0000-4000-8000-000000000001'),
      promotionAccess: true,
      readOnly: false,
      sellerSid: '00000000-0000-4000-8000-000000000001',
      tokenType: 'MOCK',
      writeCapable: true,
    });
  }

  let unknownClaims: unknown;
  try {
    unknownClaims = decodeJwt(token);
  } catch {
    throw new WbTokenValidationError('token is not a structurally valid JWT');
  }
  const parsed = wbJwtClaimsSchema.safeParse(unknownClaims);
  if (!parsed.success) {
    throw new WbTokenValidationError('required claims are absent or malformed');
  }

  const claims = parsed.data;
  if (claims.exp <= nowEpochSeconds) {
    throw new WbTokenValidationError('token is expired');
  }
  const promotionAccess = hasBit(claims.s, PROMOTION_BIT_POSITION);
  const readOnly = hasBit(claims.s, READ_ONLY_BIT_POSITION);
  if (!promotionAccess) {
    throw new WbTokenValidationError('promotion category is absent');
  }

  const tokenType = classifyToken(claims.acc, claims.for, claims.t);
  if (mode === 'sandbox' && tokenType !== 'TEST') {
    throw new WbTokenValidationError('sandbox requires Test token claims');
  }
  if (mode === 'prod' && tokenType !== 'BASE' && tokenType !== 'PERSONAL') {
    throw new WbTokenValidationError('production requires Base or Personal token claims');
  }

  return Object.freeze({
    expiresAtEpochSeconds: claims.exp,
    identityFingerprint: fingerprint(
      `${claims.sid}:${claims.id}:${String(claims.acc)}:${claims.for ?? ''}:${String(claims.t)}`,
    ),
    promotionAccess,
    readOnly,
    sellerSid: claims.sid,
    tokenType,
    writeCapable: (tokenType === 'PERSONAL' || tokenType === 'TEST') && !readOnly,
  });
}

/**
 * Classifies the documented acc/for/t matrix and rejects service or mixed profiles.
 *
 * @param acc - Numeric token type.
 * @param tokenFor - Optional ownership claim.
 * @param test - Test-contour flag.
 * @returns Supported self-hosted token type.
 * @throws {WbTokenValidationError} When claims do not match a supported row.
 */
function classifyToken(
  acc: number,
  tokenFor: string | undefined,
  test: boolean,
): ValidatedTokenType {
  if (acc === 1 && tokenFor === undefined && !test) {
    return 'BASE';
  }
  if (acc === 2 && tokenFor === undefined && test) {
    return 'TEST';
  }
  if (acc === 3 && tokenFor === 'self' && !test) {
    return 'PERSONAL';
  }
  if (acc === 4) {
    throw new WbTokenValidationError('Service token is not supported by self-hosted v1');
  }
  throw new WbTokenValidationError('acc/for/t claims are inconsistent');
}

/**
 * Tests a documented one-based bit position.
 *
 * @param bitmask - Safe integer WB bitmask.
 * @param position - One-based bit position in the official table.
 * @returns True when the property bit is present.
 */
function hasBit(bitmask: number, position: number): boolean {
  const divisor = 2 ** (position - 1);
  return Math.floor(bitmask / divisor) % 2 === 1;
}

/**
 * Produces a stable irreversible identity fingerprint.
 *
 * @param value - Non-secret stable identity material.
 * @returns Lowercase SHA-256 hex.
 */
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
