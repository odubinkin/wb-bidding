import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['apps', 'packages'];
const compatibilityRegistry = 'packages/wb-api/src/endpoint-registry.ts';
const forbiddenPairs = [
  ['POST', '/adv/v1/promotion/adverts'],
  ['GET', '/adv/v0/auction/adverts'],
  ['PATCH', '/adv/v0/bids'],
  ['PATCH', '/adv/v0/auction/bids'],
  ['POST', '/adv/v2/fullstats'],
];

/**
 * Recursively collects TypeScript and JSON contract files.
 *
 * @param {string} directory - Repository-relative directory to inspect.
 * @returns {Promise<string[]>} Files whose contents can contain method/path pairs.
 */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['coverage', 'dist', 'generated', 'node_modules'].includes(entry.name)) continue;
      files.push(...(await collectFiles(path)));
    } else if (['.json', '.ts'].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

const files = (await Promise.all(roots.map(collectFiles))).flat();
const violations = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const [method, path] of forbiddenPairs) {
    if (file !== compatibilityRegistry && containsEndpointPair(content, method, path)) {
      violations.push(`${file}: ${method} ${path}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Deprecated WB endpoint pairs detected:\n${violations.join('\n')}`);
}

const registry = await readFile(compatibilityRegistry, 'utf8');
for (const [method, path] of forbiddenPairs) {
  if (!containsEndpointPair(registry, method, path)) {
    throw new Error(`Deprecated pair is missing from compatibility registry: ${method} ${path}`);
  }
}

process.stdout.write(`Checked ${files.length} implementation and contract files.\n`);

function containsEndpointPair(source, method, endpointPath) {
  const methodValue = `["']${escapeRegExp(method)}["']`;
  const pathValue = `["']${escapeRegExp(endpointPath)}["']`;
  const methodField = `["']?method["']?\\s*:\\s*${methodValue}`;
  const pathField = `["']?path["']?\\s*:\\s*${pathValue}`;
  return (
    new RegExp(`\\{[^{}]{0,500}${methodField}[^{}]{0,500}${pathField}[^{}]{0,500}\\}`, 'su').test(
      source,
    ) ||
    new RegExp(`\\{[^{}]{0,500}${pathField}[^{}]{0,500}${methodField}[^{}]{0,500}\\}`, 'su').test(
      source,
    )
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
