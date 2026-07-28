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
  [
    'WB token literal',
    /WB_API_TOKEN\s*:\s*["'](?!replace-|missing-token|mock-test-token|header\.payload\.signature|test-)[^"']{16,}["']/u,
  ],
  [
    'WB token env assignment',
    /^WB_API_TOKEN=(?!\$\{|replace-|missing-token|mock-test-token|header\.payload\.signature|test-)[^\s#]{16,}$/mu,
  ],
  [
    'Admin token literal',
    /ADMIN_API_SERVICE_TOKEN\s*:\s*["'](?!replace-|mock-admin-service-token|test-|runtime-test-)[^"']{32,}["']/u,
  ],
  [
    'Admin token env assignment',
    /^ADMIN_API_SERVICE_TOKEN=(?!\$\{|replace-|mock-admin-service-token|test-|runtime-test-)[^\s#]{32,}$/mu,
  ],
];
const findings = [];

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
    if (pattern.test(source)) findings.push(`${relativePath}: ${name}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan: проверено ${String(listed.length)} файлов, совпадений нет.\n`);
}
