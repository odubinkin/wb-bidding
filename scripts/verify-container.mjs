import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

for (const dockerfile of ['Dockerfile', 'Dockerfile.mock']) {
  const source = await readFile(path.join(repositoryRoot, dockerfile), 'utf8');
  const dependencies = dockerStage(source, 'dependencies');
  const runtime = dockerStage(source, 'runtime');
  if (runtime === null || !/^FROM node:24-bookworm-slim AS runtime\s*$/mu.test(runtime)) {
    failures.push(`${dockerfile}: runtime base не закреплён`);
  }
  if (runtime === null || !/^USER node\s*$/mu.test(runtime)) {
    failures.push(`${dockerfile}: runtime запускается не от node`);
  }
  if (dependencies === null || !/^RUN pnpm install --frozen-lockfile\s*$/mu.test(dependencies)) {
    failures.push(`${dockerfile}: install не использует frozen lockfile`);
  }
  if (/^COPY\s+[^\n]*\.env(?:\s|$)/mu.test(source))
    failures.push(`${dockerfile}: образ копирует .env`);
  if (
    runtime === null ||
    !/^RUN rm -rf \/usr\/local\/lib\/node_modules\/npm[\s\S]*\/usr\/local\/lib\/node_modules\/corepack/mu.test(
      runtime,
    )
  ) {
    failures.push(`${dockerfile}: runtime хранит неиспользуемые npm/corepack зависимости`);
  }
}

const productionCompose = await readFile(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
if (/^\s{2}wb-mock:\s*$/mu.test(productionCompose)) {
  failures.push('docker-compose.yml: production topology содержит wb-mock');
}
if (!productionCompose.includes('WB_API_WRITE_ENABLED: ${WB_API_WRITE_ENABLED:-false}')) {
  failures.push('docker-compose.yml: production write default не false');
}
for (const [compose, expectedHealthchecks] of [
  ['docker-compose.yml', 2],
  ['docker-compose.mock.yml', 3],
  ['docker-compose.mock-only.yml', 1],
]) {
  const source = await readFile(path.join(repositoryRoot, compose), 'utf8');
  const healthcheckCount = source.match(/^\s{4}healthcheck:\s*$/gmu)?.length ?? 0;
  if (healthcheckCount !== expectedHealthchecks) {
    failures.push(
      `${compose}: ожидалось healthcheck=${String(expectedHealthchecks)}, найдено ${String(healthcheckCount)}`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Container policy: non-root, locked install, healthchecks и write-disabled default проверены.\n',
  );
}

function dockerStage(source, stageName) {
  const stageStart = new RegExp(`^FROM\\s+[^\\n]+\\s+AS\\s+${stageName}\\s*$`, 'mu').exec(source);
  if (stageStart === null) return null;
  const remainder = source.slice(stageStart.index + stageStart[0].length);
  const nextStage = /^FROM\s+/mu.exec(remainder);
  return source.slice(
    stageStart.index,
    nextStage === null ? source.length : stageStart.index + stageStart[0].length + nextStage.index,
  );
}
