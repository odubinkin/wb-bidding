import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const requiredDocuments = [
  'README.md',
  'docs/project-guide.md',
  'docs/architecture.md',
  'docs/modules.md',
  'docs/implementation-reference.md',
  'docs/configuration.md',
  'docs/data-synchronization.md',
  'docs/decision-engine.md',
  'docs/wb-api-integration.md',
  'docs/wb-api-evidence/wb-promotion-2026-07-28-v1.md',
  'docs/bidding-algorithm.md',
  'docs/data-model.md',
  'docs/mock-server.md',
  'docs/testing.md',
  'docs/observability.md',
  'docs/security.md',
  'docs/runbook.md',
  'docs/technical-specification.md',
  'docs/write-pipeline.md',
  'docs/implementation-deviations.md',
  'docs/acceptance-evidence.md',
  'docs/e2e-scenario-evidence.md',
  'docs/adr/0001-fail-closed-wb-contracts.md',
];
const failures = [];

/**
 * Lists TypeScript source files below one documentation-covered directory.
 *
 * @param {string} directory - Absolute directory to traverse.
 * @returns {Promise<string[]>} Repository-relative TypeScript paths.
 */
async function listTypeScriptSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'dist' || entry.name === 'node_modules'
          ? []
          : listTypeScriptSources(absolute);
      }
      return entry.isFile() && entry.name.endsWith('.ts')
        ? [path.relative(repositoryRoot, absolute)]
        : [];
    }),
  );
  return nested.flat();
}

for (const relativePath of requiredDocuments) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  let source;
  try {
    source = await readFile(absolutePath, 'utf8');
  } catch {
    failures.push(`${relativePath}: файл отсутствует`);
    continue;
  }
  if (!/[А-Яа-яЁё]/u.test(source)) {
    failures.push(`${relativePath}: нет русскоязычного содержимого`);
  }
  if (!source.startsWith('# ')) {
    failures.push(`${relativePath}: отсутствует заголовок первого уровня`);
  }
  for (const match of source.matchAll(/!?\[[^\n]*?\]\(([^)\n]+)\)/g)) {
    const rawTarget = match[1]?.trim() ?? '';
    const target =
      rawTarget.startsWith('<') && rawTarget.endsWith('>')
        ? rawTarget.slice(1, -1)
        : (rawTarget.split(/\s+/u)[0] ?? '');
    if (target === '' || target.startsWith('#') || /^(?:https?:|mailto:)/u.test(target)) {
      continue;
    }
    const withoutFragment = decodeURIComponent(target.split('#')[0] ?? '');
    const linkedPath = path.resolve(path.dirname(absolutePath), withoutFragment);
    try {
      await access(linkedPath);
    } catch {
      failures.push(`${relativePath}: битая локальная ссылка ${target}`);
    }
  }
}

const architecture = await readFile(path.join(repositoryRoot, 'docs/architecture.md'), 'utf8');
const modules = await readFile(path.join(repositoryRoot, 'docs/modules.md'), 'utf8');
const dataModel = await readFile(path.join(repositoryRoot, 'docs/data-model.md'), 'utf8');
const projectGuide = await readFile(path.join(repositoryRoot, 'docs/project-guide.md'), 'utf8');
for (const requiredHeading of [
  '## Какую задачу решает система',
  '## Главные понятия',
  '## Сквозной пример',
  '## В каком порядке читать документацию',
]) {
  if (!projectGuide.includes(requiredHeading)) {
    failures.push(`docs/project-guide.md: отсутствует вводный раздел ${requiredHeading}`);
  }
}
const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
if (!readme.includes('[путеводитель по проекту](docs/project-guide.md)')) {
  failures.push('README.md: нет ссылки на вводный путеводитель');
}
for (const sourceDirectory of ['apps', 'packages']) {
  for (const relativePath of await listTypeScriptSources(
    path.join(repositoryRoot, sourceDirectory),
  )) {
    if (!modules.includes(`\`${path.basename(relativePath)}\``)) {
      failures.push(`docs/modules.md: отсутствует описание ${relativePath}`);
    }
  }
}
const mermaidCount = (architecture.match(/```mermaid/gu) ?? []).length;
if (mermaidCount < 4) {
  failures.push(
    'docs/architecture.md: нужны component, sync, decision/execution и queue диаграммы',
  );
}
if (!dataModel.includes('```mermaid')) {
  failures.push('docs/data-model.md: отсутствует Mermaid ER-модель');
}
if (!dataModel.includes('## Построчный справочник таблиц и столбцов')) {
  failures.push('docs/data-model.md: отсутствует подробный справочник таблиц и столбцов');
}
for (const modelName of [
  'DeploymentAccountBinding',
  'Campaign',
  'CampaignTarget',
  'CampaignStatDaily',
  'BidPerformanceDay',
  'ProductEconomics',
  'ProductEconomicsImport',
  'ProductEconomicsImportItem',
  'BiddingPolicy',
  'MetricSnapshot',
  'BidDecision',
  'BidExperiment',
  'DecisionQueueItem',
  'WbWriteAttempt',
  'WbWriteAttemptItem',
  'DeploymentControl',
  'CampaignAutomation',
  'TargetAutomation',
  'ManualJob',
  'ReconciliationRead',
  'AuditEvent',
  'SchedulerRun',
  'SyncCheckpoint',
  'BidStateObservation',
  'SyncSourceSnapshot',
  'TargetDataSnapshot',
  'IdempotencyRecord',
  'WbRateLimitBucket',
]) {
  if (!dataModel.includes(`\`${modelName}\``)) {
    failures.push(`docs/data-model.md: нет назначения модели ${modelName}`);
  }
}

const evidence = await readFile(path.join(repositoryRoot, 'docs/acceptance-evidence.md'), 'utf8');
for (let index = 1; index <= 30; index += 1) {
  const ac = `AC-${String(index).padStart(2, '0')}`;
  if (!evidence.includes(ac)) failures.push(`docs/acceptance-evidence.md: отсутствует ${ac}`);
}
for (let index = 1; index <= 11; index += 1) {
  if (!evidence.includes(`DoD-31.${String(index)}`)) {
    failures.push(`docs/acceptance-evidence.md: отсутствует DoD-31.${String(index)}`);
  }
}
const scenarioEvidence = await readFile(
  path.join(repositoryRoot, 'docs/e2e-scenario-evidence.md'),
  'utf8',
);
for (let index = 1; index <= 51; index += 1) {
  const scenario = `E2E-${String(index).padStart(2, '0')}`;
  if (!scenarioEvidence.includes(scenario)) {
    failures.push(`docs/e2e-scenario-evidence.md: отсутствует ${scenario}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Документация: ${String(requiredDocuments.length)} обязательных файлов, ссылки, Mermaid и трассировка проверены.\n`,
  );
}
