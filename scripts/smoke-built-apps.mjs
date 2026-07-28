import { spawn } from 'node:child_process';

const repositoryRoot = new URL('../', import.meta.url);
const bidderPort = 31_90;
const mockPort = 31_91;

const mock = spawn('node', ['apps/wb-mock/dist/main.js'], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    MOCK_CLOCK_MODE: 'virtual',
    MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
    MOCK_SEED: 'foundation',
    PORT: String(mockPort),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const bidder = spawn('node', ['apps/bidder/dist/main.js'], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    ACCOUNT_CURRENCY: 'RUB',
    ACCOUNT_TIMEZONE: 'Europe/Moscow',
    ADMIN_API_SERVICE_TOKEN: 'test-admin-token-with-32-characters',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
    METRICS_ENABLED: 'true',
    PORT: String(bidderPort),
    SCHEDULER_ENABLED: 'false',
    WB_API_MOCK_BASE_URL: `http://127.0.0.1:${mockPort}`,
    WB_API_MODE: 'mock',
    WB_API_TOKEN: 'synthetic-test-token',
    WB_API_WRITE_ENABLED: 'false',
    WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
    WB_EXPECTED_TOKEN_TYPE: 'TEST',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
for (const child of [mock, bidder]) {
  child.stdout?.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    output += String(chunk);
  });
}

/**
 * Polls one local endpoint until it succeeds or its bounded deadline expires.
 *
 * @param {string} url - Synthetic local endpoint.
 * @returns {Promise<Response>} Successful HTTP response.
 */
async function waitForResponse(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Startup connection failures are expected until the bounded deadline.
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(`Timed out waiting for ${url}`);
}

try {
  const [bidderReady, bidderInfo, bidderDocs, mockLive, mockState, mockDocs] = await Promise.all([
    waitForResponse(`http://127.0.0.1:${bidderPort}/health/ready`),
    waitForResponse(`http://127.0.0.1:${bidderPort}/api/v1/service-info`),
    waitForResponse(`http://127.0.0.1:${bidderPort}/docs-json`),
    waitForResponse(`http://127.0.0.1:${mockPort}/health/live`),
    waitForResponse(`http://127.0.0.1:${mockPort}/__mock/state`),
    waitForResponse(`http://127.0.0.1:${mockPort}/docs-json`),
  ]);
  const [info, state, bidderOpenApi, mockOpenApi] = await Promise.all([
    bidderInfo.json(),
    mockState.json(),
    bidderDocs.json(),
    mockDocs.json(),
  ]);

  if (
    bidderReady.status !== 200 ||
    mockLive.status !== 200 ||
    info.writesEnabled !== false ||
    info.endpointProfileId !== 'wb-promotion-2026-07-28-v1' ||
    state.virtualTime !== '2026-07-28T00:00:00.000Z' ||
    bidderOpenApi.openapi !== '3.0.0' ||
    mockOpenApi.openapi !== '3.0.0'
  ) {
    throw new Error('Built application smoke response did not satisfy safety invariants');
  }

  process.stdout.write('Built bidder and mock smoke passed.\n');
} catch (error) {
  process.stderr.write(`${String(error)}\n${output.slice(-4_000)}\n`);
  process.exitCode = 1;
} finally {
  bidder.kill('SIGTERM');
  mock.kill('SIGTERM');
}
