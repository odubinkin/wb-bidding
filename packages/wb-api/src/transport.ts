import http, { type IncomingMessage, type RequestOptions } from 'node:http';
import https from 'node:https';

import type { WbFetch } from './client/index.js';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Transport error retaining whether a TCP/TLS connection was established.
 */
export class WbTransportError extends Error {
  /**
   * Creates a sanitized transport failure.
   *
   * @param message - Non-secret diagnostic.
   * @param beforeBytes - True only when no network connection was established.
   * @param cause - Original Node transport error.
   */
  public constructor(
    message: string,
    public readonly beforeBytes: boolean,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'WbTransportError';
  }
}

/**
 * Creates a redirect-free HTTP transport with an explicit TCP/TLS connect timeout.
 *
 * The WB client independently supplies the whole-attempt deadline through AbortSignal.
 *
 * @param connectTimeoutMs - Maximum time to establish TCP/TLS.
 * @returns Fetch-compatible transport for the WB adapter.
 */
export function createNodeWbFetch(connectTimeoutMs: number): WbFetch {
  if (!Number.isInteger(connectTimeoutMs) || connectTimeoutMs < 1) {
    throw new Error('WB connect timeout must be a positive integer');
  }
  return async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new WbTransportError('WB transport supports only HTTP(S)', true);
    }
    const body = normalizeBody(init.body);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    if (body !== undefined && headers['content-length'] === undefined) {
      headers['content-length'] = String(body.byteLength);
    }
    return new Promise<Response>((resolve, reject) => {
      let connected = false;
      let settled = false;
      const requestOptions: RequestOptions = {
        headers,
        method: init.method ?? 'GET',
        signal: init.signal ?? undefined,
      };
      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.request(url, requestOptions, (response) => {
        collectResponse(response, resolveOnce, rejectOnce);
      });
      /**
       * Resolves the transport promise at most once.
       *
       * @param response - Completed standard response.
       */
      const resolveOnce = (response: Response): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(response);
      };
      /**
       * Rejects the transport promise at most once with a classified error.
       *
       * @param error - Node or classified transport failure.
       */
      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(
          error instanceof WbTransportError
            ? error
            : new WbTransportError('WB HTTP transport failed', !connected, error),
        );
      };
      request.once('socket', (socket) => {
        if (!socket.connecting) {
          connected = true;
          return;
        }
        const timer = setTimeout(() => {
          request.destroy(new WbTransportError('WB TCP/TLS connect timeout', true));
        }, connectTimeoutMs);
        /** Marks the TCP/TLS connection boundary and clears its timer. */
        const markConnected = (): void => {
          connected = true;
          clearTimeout(timer);
        };
        socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', markConnected);
        socket.once('close', () => {
          clearTimeout(timer);
        });
        socket.once('error', () => {
          clearTimeout(timer);
        });
      });
      request.once('error', rejectOnce);
      if (body !== undefined) {
        request.write(body);
      }
      request.end();
    });
  };
}

/**
 * Converts the request bodies used by the adapter into immutable bytes.
 *
 * @param body - Fetch body supplied by the adapter.
 * @returns Body bytes or undefined.
 */
function normalizeBody(body: RequestInit['body']): Uint8Array | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  throw new WbTransportError('WB transport received an unsupported request body', true);
}

/**
 * Buffers one bounded WB response into the standard Response contract.
 *
 * @param response - Node response stream.
 * @param resolve - Promise resolver.
 * @param reject - Promise rejecter.
 * @returns Nothing.
 */
function collectResponse(
  response: IncomingMessage,
  resolve: (value: Response) => void,
  reject: (reason: unknown) => void,
): void {
  const chunks: Buffer[] = [];
  let size = 0;
  response.on('data', (chunk: Buffer | string) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      response.destroy(new WbTransportError('WB response exceeds safety limit', false));
      return;
    }
    chunks.push(bytes);
  });
  response.once('error', reject);
  response.once('end', () => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item);
        }
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }
    resolve(
      new Response(Buffer.concat(chunks), {
        headers,
        status: response.statusCode ?? 500,
        ...(response.statusMessage === undefined ? {} : { statusText: response.statusMessage }),
      }),
    );
  });
}
