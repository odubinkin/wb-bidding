import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = ['apps', 'packages', 'tests'];
const violations = [];

for (const sourceRoot of sourceRoots) {
  for (const file of await walk(join(root, sourceRoot))) {
    if (!['.ts', '.tsx'].includes(extname(file))) continue;
    const source = await readFile(file, 'utf8');
    const path = relative(root, file);
    if (/(?:from\s+|require\()['"]pg['"]/u.test(source)) {
      violations.push(`${path}: direct pg import`);
    }
    if (/\bPool(?:Client)?\b/u.test(source)) {
      violations.push(`${path}: direct driver pool type`);
    }
    if (
      /\b(?:createRawDatabaseClient|queryParameterizedRaw|RawDatabaseClient|RawTransactionClient)\b/u.test(
        source,
      )
    ) {
      violations.push(`${path}: removed generic raw SQL facade`);
    }
    if (
      !path.startsWith('packages/database/') &&
      /\.\$(?:queryRaw|executeRaw)(?:Unsafe)?\s*\(/u.test(source)
    ) {
      violations.push(`${path}: direct Prisma raw API outside @wb-bidder/database`);
    }
    if (
      (path.startsWith('apps/') || path.startsWith('packages/')) &&
      !path.startsWith('packages/database/') &&
      /[`'"]\s*(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/u.test(source)
    ) {
      violations.push(`${path}: SQL statement outside @wb-bidder/database`);
    }
  }
}

for (const file of await walk(root)) {
  if (!file.endsWith('package.json') || file.includes('/node_modules/')) continue;
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (manifest[section]?.pg !== undefined || manifest[section]?.['@types/pg'] !== undefined) {
      violations.push(`${relative(root, file)}: direct pg dependency in ${section}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Database architecture violations:\n${violations.join('\n')}`);
}

console.log('Database architecture verified: Prisma Client only; raw execution is centralized.');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'generated'
    ) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
