import { loadConfiguration, type AppConfiguration } from '@wb-bidder/config';

/**
 * Nest injection token for immutable validated application configuration.
 */
export const APP_CONFIGURATION = Symbol('APP_CONFIGURATION');

/**
 * Builds the bidder configuration from its process environment.
 *
 * @returns Immutable validated configuration.
 * @throws {ConfigurationError} When startup would violate a safety invariant.
 */
export function createApplicationConfiguration(): AppConfiguration {
  return loadConfiguration(process.env);
}
