import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

for (const dockerfile of ['Dockerfile', 'Dockerfile.mock']) {
  const source = await readFile(path.join(repositoryRoot, dockerfile), 'utf8');
  if (!/FROM node:24-bookworm-slim AS runtime/u.test(source)) {
    failures.push(`${dockerfile}: runtime base не закреплён`);
  }
  if (!/USER node/u.test(source)) failures.push(`${dockerfile}: runtime запускается не от node`);
  if (!/pnpm install --frozen-lockfile/u.test(source)) {
    failures.push(`${dockerfile}: install не использует frozen lockfile`);
  }
  if (/COPY \.env/u.test(source)) failures.push(`${dockerfile}: образ копирует .env`);
}

const productionCompose = await readFile(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
if (productionCompose.includes('wb-mock')) {
  failures.push('docker-compose.yml: production topology содержит wb-mock');
}
if (!productionCompose.includes('WB_API_WRITE_ENABLED: ${WB_API_WRITE_ENABLED:-false}')) {
  failures.push('docker-compose.yml: production write default не false');
}
for (const compose of [
  'docker-compose.yml',
  'docker-compose.mock.yml',
  'docker-compose.mock-only.yml',
]) {
  const source = await readFile(path.join(repositoryRoot, compose), 'utf8');
  if (!source.includes('healthcheck:')) failures.push(`${compose}: отсутствует healthcheck`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Container policy: non-root, locked install, healthchecks и write-disabled default проверены.\n',
  );
}
