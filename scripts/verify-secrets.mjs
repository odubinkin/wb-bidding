import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const listed = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: repositoryRoot, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const ignoredPrefixes = [
  '.agentplane/cache/',
  '.agentplane/tmp/',
  '.tmp-stage5-',
  'coverage/',
  'dist/',
  'node_modules/',
];
const patterns = [
  ['private key', /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u],
];
const tokenPatterns = [
  {
    allowed: (value) =>
      [
        'header.payload.signature',
        'injected-by-secret-manager',
        'missing-token',
        'mock-test-token',
      ].includes(value) ||
      value.startsWith('replace-') ||
      value.startsWith('test-'),
    name: 'WB token assignment',
    pattern: /\bWB_API_TOKEN\s*(?::|=)\s*["']([^"']{16,})["']/gu,
  },
  {
    allowed: (value) =>
      value === 'runtime-e2e-admin-token-with-32-chars' ||
      value.startsWith('mock-admin-service-token') ||
      value.startsWith('replace-') ||
      value.startsWith('runtime-test-') ||
      value.startsWith('test-'),
    name: 'Admin token assignment',
    pattern: /\bADMIN_API_SERVICE_TOKEN\s*(?::|=)\s*["']([^"']{32,})["']/gu,
  },
  {
    allowed: (value) =>
      ['header.payload.signature', 'missing-token', 'mock-test-token'].includes(value) ||
      value.startsWith('replace-') ||
      value.startsWith('test-'),
    name: 'WB token env assignment',
    pattern: /^WB_API_TOKEN\s*=\s*([^\s#"']{16,})\s*$/gmu,
  },
  {
    allowed: (value) =>
      value.startsWith('mock-admin-service-token') ||
      value.startsWith('replace-') ||
      value.startsWith('runtime-test-') ||
      value.startsWith('test-'),
    name: 'Admin token env assignment',
    pattern: /^ADMIN_API_SERVICE_TOKEN\s*=\s*([^\s#"']{32,})\s*$/gmu,
  },
];
const findings = new Set();

for (const relativePath of listed) {
  if (ignoredPrefixes.some((prefix) => relativePath.startsWith(prefix))) continue;
  let source;
  try {
    source = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
  } catch {
    continue;
  }
  if (source.includes('\0')) continue;
  for (const [name, pattern] of patterns) {
    if (pattern.test(source)) findings.add(`${relativePath}: ${name}`);
  }
  for (const { allowed, name, pattern } of tokenPatterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1] ?? '';
      if (!allowed(value)) findings.add(`${relativePath}: ${name}`);
    }
  }
}

if (findings.size > 0) {
  process.stderr.write(`${[...findings].join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan: проверено ${String(listed.length)} файлов, совпадений нет.\n`);
}
