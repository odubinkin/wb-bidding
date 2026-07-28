import { validateWbToken, type ValidatedTokenProfile } from '@wb-bidder/wb-api';
import type { AppConfiguration } from '@wb-bidder/config';

/**
 * Nest injection token for the safe decoded WB identity/capability profile.
 */
export const WB_TOKEN_PROFILE = Symbol('WB_TOKEN_PROFILE');

/**
 * Validates JWT/mock token structure before scheduler or integration startup.
 *
 * Identity is not considered account-bound until an authorized WB call and binding transaction
 * succeed in the data-sync stage.
 *
 * @param configuration - Fully validated application configuration.
 * @returns Safe token profile without secret bytes.
 * @throws {WbTokenValidationError} When token claims and environment are incompatible.
 */
export function createWbTokenProfile(configuration: AppConfiguration): ValidatedTokenProfile {
  return validateWbToken(configuration.wb.token, configuration.wb.mode);
}
