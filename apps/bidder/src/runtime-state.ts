import { Injectable } from '@nestjs/common';

/**
 * Process-local safety state derived only from authoritative startup and scheduler checks.
 *
 * It can close write eligibility but can never open the configuration-level write gate.
 */
@Injectable()
export class RuntimeSafetyState {
  private accountBindingConfirmed = false;
  private capacityAllowsWrites = false;
  private integrationAuthorized = false;
  private stopping = false;

  /**
   * Marks the singleton account binding as confirmed.
   *
   * @returns Nothing.
   */
  public confirmAccountBinding(): void {
    this.accountBindingConfirmed = true;
  }

  /**
   * Updates the startup/runtime capacity gate.
   *
   * @param allowed - Whether configured SLA is feasible for current scope.
   * @returns Nothing.
   */
  public setCapacityAllowsWrites(allowed: boolean): void {
    this.capacityAllowsWrites = allowed;
  }

  /**
   * Updates the cached authorized-integration gate.
   *
   * @param authorized - Whether the latest integration state permits writes.
   * @returns Nothing.
   */
  public setIntegrationAuthorized(authorized: boolean): void {
    this.integrationAuthorized = authorized;
  }

  /**
   * Permanently closes new claims during graceful shutdown.
   *
   * @returns Nothing.
   */
  public beginShutdown(): void {
    this.stopping = true;
  }

  /**
   * Returns the first process-level write blocker.
   *
   * @returns Stable blocker code or null when every process-level gate is open.
   */
  public writeBlocker(): string | null {
    if (this.stopping) return 'PROCESS_STOPPING';
    if (!this.accountBindingConfirmed) return 'ACCOUNT_BINDING_UNCONFIRMED';
    if (!this.integrationAuthorized) return 'INTEGRATION_NOT_AUTHORIZED';
    if (!this.capacityAllowsWrites) return 'CAPACITY_MODEL_UNSATISFIED';
    return null;
  }
}
