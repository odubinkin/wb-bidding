import { spawn } from 'node:child_process';

const repositoryRoot = new URL('../', import.meta.url);
const bidderPort = 31_90;
const mockPort = 31_91;
const adminServiceToken = 'test-admin-token-with-32-characters';
const databaseUrl = process.env.DATABASE_URL;
const maximumCapturedOutput = 8_000;

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for the built bidder smoke');
}

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

let output = '';
let bidder;
let childFailure;
let shuttingDown = false;

/**
 * Captures bounded child output for failure diagnostics.
 *
 * @param {import('node:child_process').ChildProcess} child - Local smoke process.
 */
function capture(child) {
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      childFailure = `Child process exited before smoke completion: code=${String(code)}, signal=${String(signal)}`;
    }
  });
  child.stdout?.on('data', (chunk) => {
    appendOutput(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    appendOutput(chunk);
  });
}

function appendOutput(chunk) {
  output = `${output}${String(chunk)}`.slice(-maximumCapturedOutput);
}
capture(mock);

/**
 * Polls one local endpoint until it succeeds or its bounded deadline expires.
 *
 * @param {string} url - Synthetic local endpoint.
 * @param {RequestInit} [init] - Optional local request options.
 * @returns {Promise<Response>} Successful HTTP response.
 */
async function waitForResponse(url, init) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (childFailure !== undefined) {
      throw new Error(childFailure);
    }
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(1_000),
      });
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
  await waitForResponse(`http://127.0.0.1:${mockPort}/health/live`);
  bidder = spawn('node', ['apps/bidder/dist/main.js'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: adminServiceToken,
      DATABASE_URL: databaseUrl,
      METRICS_ENABLED: 'true',
      PORT: String(bidderPort),
      SCHEDULER_ENABLED: 'true',
      WB_API_MOCK_BASE_URL: `http://127.0.0.1:${mockPort}`,
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  capture(bidder);
  const [bidderReady, bidderInfo, bidderDocs, mockLive, mockState, mockDocs] = await Promise.all([
    waitForResponse(`http://127.0.0.1:${bidderPort}/health/ready`),
    waitForResponse(`http://127.0.0.1:${bidderPort}/api/v1/service-info`),
    waitForResponse(`http://127.0.0.1:${bidderPort}/docs-json`, {
      headers: { Authorization: `Bearer ${adminServiceToken}` },
    }),
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
    info.endpointProfileId !== 'wb-deterministic-mock-verified-v1' ||
    state.virtualTime !== '2026-07-28T00:00:00.000Z' ||
    bidderOpenApi.openapi !== '3.0.0' ||
    mockOpenApi.openapi !== '3.0.0'
  ) {
    throw new Error('Built application smoke response did not satisfy safety invariants');
  }
  if (childFailure !== undefined) {
    throw new Error(childFailure);
  }

  process.stdout.write('Built bidder and mock smoke passed.\n');
} catch (error) {
  process.stderr.write(`${String(error)}\n${output.slice(-4_000)}\n`);
  process.exitCode = 1;
} finally {
  shuttingDown = true;
  await Promise.all([stopChild(bidder), stopChild(mock)]);
}

async function stopChild(child) {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const closed = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5_000);
    child.once('close', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
  if (!closed && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}
