/**
 * Minimal fair FIFO semaphore bounding in-flight WB requests.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  /**
   * Creates a semaphore.
   *
   * @param maximum - Positive concurrency ceiling.
   */
  public constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error('WB max in-flight must be a positive integer');
    }
  }

  /**
   * Acquires one slot.
   *
   * @returns Idempotent release callback.
   */
  public async acquire(): Promise<() => void> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

/**
 * Validates a configured origin.
 *
 * @param url - Base URL.
 * @param common - Whether common-api is required for production HTTPS.
 * @returns Nothing when safe.
 */
export function assertSafeOrigin(url: URL, common: boolean): void {
  if (url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new Error('WB base URL must not contain credentials or fragment');
  }
  if (url.protocol === 'https:') {
    const expected = common ? 'common-api.wildberries.ru' : 'advert-api.wildberries.ru';
    const sandbox = !common && url.hostname === 'advert-api-sandbox.wildberries.ru';
    if (url.hostname !== expected && !sandbox) {
      throw new Error('WB HTTPS base URL host is not allowed');
    }
  } else if (url.protocol !== 'http:') {
    throw new Error('WB base URL protocol is not allowed');
  }
}

/**
 * Restricts synthetic verified semantics to a local plain-HTTP mock boundary.
 *
 * @param url - Configured promotion origin.
 * @returns Whether the host is an allowed deterministic mock target.
 */
export function isVerifiedMockOrigin(url: URL): boolean {
  if (url.protocol !== 'http:') return false;
  return (
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1' ||
    url.hostname === 'localhost' ||
    url.hostname === 'wb-mock'
  );
}

/**
 * Enforces same-origin transport and exact base path.
 *
 * @param requestUrl - Constructed request.
 * @param baseUrl - Approved origin.
 * @returns Nothing when the URL cannot exfiltrate Authorization.
 */
export function assertRequestDestination(requestUrl: URL, baseUrl: URL): void {
  if (requestUrl.origin !== baseUrl.origin) {
    throw new Error('WB request destination escaped approved origin');
  }
}
