import { loadMockConfiguration, type MockConfiguration } from '@wb-bidder/config';

/**
 * Nest injection token for deterministic mock configuration.
 */
export const MOCK_CONFIGURATION = Symbol('MOCK_CONFIGURATION');

/**
 * Builds standalone mock configuration from the current process environment.
 *
 * @returns Frozen virtual-clock configuration.
 */
export function createMockConfiguration(): MockConfiguration {
  return loadMockConfiguration(process.env);
}
