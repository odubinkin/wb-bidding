import { execFileSync } from 'node:child_process';

const projectPrefix = `wb-bidder-smoke-${String(process.pid)}`;
const adminToken = 'mock-admin-service-token-at-least-32-chars';

await smokeTopology({
  checks: [
    { url: 'http://127.0.0.1:3001/health/live' },
    { url: 'http://127.0.0.1:3001/docs-json' },
    {
      headers: { Authorization: 'Bearer mock-test-token' },
      url: 'http://127.0.0.1:3001/adv/v1/promotion/count',
    },
  ],
  composeFile: 'docker-compose.mock-only.yml',
  projectName: `${projectPrefix}-mock-only`,
});

await smokeTopology({
  checks: [
    { url: 'http://127.0.0.1:3001/health/live' },
    { url: 'http://127.0.0.1:3000/health/live' },
    { url: 'http://127.0.0.1:3000/health/ready' },
    {
      headers: { Authorization: `Bearer ${adminToken}` },
      url: 'http://127.0.0.1:3000/docs-json',
    },
  ],
  composeFile: 'docker-compose.mock.yml',
  projectName: `${projectPrefix}-full-mock`,
});

process.stdout.write('Compose mock-only and full-mock smoke PASSED\n');

async function smokeTopology(input) {
  const composeArguments = ['compose', '-p', input.projectName, '-f', input.composeFile];
  try {
    runDocker([...composeArguments, 'config', '--quiet']);
    runDocker([
      ...composeArguments,
      'up',
      '--detach',
      '--build',
      '--wait',
      '--wait-timeout',
      '240',
    ]);
    for (const check of input.checks) {
      await waitForHttp(check);
    }
  } finally {
    runDocker([...composeArguments, 'down', '--volumes', '--remove-orphans'], true);
  }
}

async function waitForHttp(input) {
  const deadline = Date.now() + 60_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(input.url, {
        headers: input.headers,
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
      lastError = `HTTP ${String(response.status)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
  throw new Error(`Compose smoke timeout for ${input.url}: ${lastError}`);
}

function runDocker(arguments_, cleanup = false) {
  try {
    execFileSync('docker', arguments_, {
      env: process.env,
      stdio: 'inherit',
      timeout: 10 * 60_000,
    });
  } catch (error) {
    if (cleanup) return;
    throw error;
  }
}
