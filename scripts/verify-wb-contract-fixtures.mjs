import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL(
  '../fixtures/wb-contracts/wb-promotion-runtime-v1.json',
  import.meta.url,
);
const profileUrl = new URL(
  '../packages/contracts/src/profiles/wb-promotion-2026-07-28-v1.json',
  import.meta.url,
);
const fixture = await readFile(fixtureUrl);
const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
const checksum = createHash('sha256').update(fixture).digest('hex');

if (profile.contractFixtureChecksumSha256 !== checksum) {
  throw new Error(
    `WB contract fixture checksum mismatch: expected ${String(profile.contractFixtureChecksumSha256)}, got ${checksum}`,
  );
}

const parsed = JSON.parse(fixture.toString('utf8'));
const required = [
  'campaignCount',
  'campaignDetails',
  'cardMinimumBids',
  'cardWriteBids',
  'clusterCurrentBids',
  'clusterList',
  'clusterWriteBids',
  'clusterDeleteBids',
  'campaignStatistics',
  'clusterStatistics',
  'bidRecommendations',
  'campaignBudget',
  'sellerInfo',
  'ping',
];
for (const key of required) {
  if (!(key in parsed.contracts)) {
    throw new Error(`Missing WB contract fixture: ${key}`);
  }
}

console.log(`WB contract fixtures verified: ${checksum}`);
