import { evidenceChecksum } from './checksum.js';
import type {
  AccountBindingCandidate,
  AccountBindingTransition,
  ExistingAccountBinding,
} from './types.js';

const SETTINGS_SCHEMA_VERSION = 'account-settings-v1';

/**
 * Computes the immutable operator-settings binding checksum.
 *
 * @param currency - ISO 4217 scale-two currency.
 * @param timezone - IANA timezone.
 * @returns Stable checksum excluding all credentials.
 */
export function accountSettingsChecksum(currency: string, timezone: string): string {
  return evidenceChecksum({
    currency,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    timezone,
  });
}

/**
 * Validates first binding, same-account rotation, or the sole BASE-to-PERSONAL upgrade.
 *
 * @param existing - Existing singleton row, when present.
 * @param candidate - Identity confirmed by authorized WB API.
 * @param businessDataExists - Whether historical business data predates the binding.
 * @returns Allowed transition.
 * @throws {Error} When startup would reinterpret the database or token environment.
 */
export function validateAccountBindingTransition(
  existing: ExistingAccountBinding | null,
  candidate: AccountBindingCandidate,
  businessDataExists: boolean,
): AccountBindingTransition {
  const expectedSettings = accountSettingsChecksum(
    candidate.accountCurrency,
    candidate.accountTimezone,
  );
  if (existing === null) {
    if (businessDataExists) {
      throw new Error('Account binding cannot initialize over existing business data');
    }
    return 'CREATE';
  }
  if (
    existing.sellerSid !== candidate.sellerSid ||
    existing.environment !== candidate.environment ||
    existing.accountCurrency !== candidate.accountCurrency ||
    existing.accountTimezone !== candidate.accountTimezone ||
    existing.accountSettingsChecksum !== expectedSettings ||
    existing.tokenCategory !== candidate.tokenCategory
  ) {
    throw new Error('Account binding mismatch');
  }
  if (existing.tokenType !== candidate.tokenType) {
    if (
      existing.environment === 'PROD' &&
      existing.tokenType === 'BASE' &&
      candidate.tokenType === 'PERSONAL' &&
      candidate.tokenFor === 'SELF'
    ) {
      return 'UPGRADE';
    }
    throw new Error('Account binding token transition is forbidden');
  }
  if (existing.tokenFor !== candidate.tokenFor) {
    throw new Error('Account binding mismatch');
  }
  return existing.tokenFingerprint === candidate.tokenFingerprint ? 'VALIDATE' : 'ROTATE';
}
