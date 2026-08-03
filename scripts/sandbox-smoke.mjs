import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CircuitBreakerRegistry,
  InMemoryRateLimitStore,
  WbApiClient,
  WbRateLimiter,
  selectRateLimitProfile,
  validateWbToken,
} from '../packages/wb-api/dist/index.js';

const manifestPath = process.env.SANDBOX_FIXTURE_MANIFEST;
const token = process.env.WB_API_TOKEN;
if (manifestPath === undefined || manifestPath === '') {
  throw new Error('SKIPPED_EXTERNAL_PROVISIONING: SANDBOX_FIXTURE_MANIFEST is required');
}
if (token === undefined || token === '') {
  throw new Error('SKIPPED_EXTERNAL_PROVISIONING: WB_API_TOKEN is required');
}

const manifest = parseManifest(JSON.parse(await readFile(path.resolve(manifestPath), 'utf8')));
const tokenProfile = validateWbToken(token, 'sandbox');
const writesRequested = manifest.writeCanary !== null;
const writesApproved = process.env.SANDBOX_WRITE_CONFIRMATION === 'I_UNDERSTAND_SANDBOX_WRITES';
if (writesRequested && !writesApproved) {
  throw new Error(
    'SANDBOX_WRITE_CONFIRMATION=I_UNDERSTAND_SANDBOX_WRITES is required for the reversible canary',
  );
}

const observations = [];
const client = new WbApiClient({
  baseUrl: new URL('https://advert-api-sandbox.wildberries.ru'),
  breakers: new CircuitBreakerRegistry(),
  commonBaseUrl: new URL('https://common-api.wildberries.ru'),
  fetch,
  maxInFlight: 1,
  observeRequest: (observation) => {
    observations.push({
      endpointKey: observation.endpointKey,
      latencyMs: Math.round(observation.latencyMs),
      limiterWaitMs: Math.round(observation.limiterWaitMs),
      outcome: observation.outcome,
      status: observation.status,
    });
  },
  rateLimiter: new WbRateLimiter(
    `sandbox-smoke:${tokenProfile.sellerSid}`,
    selectRateLimitProfile('TEST+SANDBOX'),
    { burst: 1, intervalMs: 1_000, requests: 1 },
    new InMemoryRateLimitStore(),
  ),
  readRetryPolicy: {
    baseMs: 1_000,
    capMs: 10_000,
    deadlineMs: 60_000,
    maxAttempts: 3,
  },
  timeoutMs: 15_000,
  token,
  writesEnabled: writesRequested && writesApproved,
});

const startedAt = new Date();
const manifestChecksum = await sha256(JSON.stringify(manifest));
const outputPath = path.resolve(
  process.env.SANDBOX_EVIDENCE_OUTPUT ?? 'artifacts/sandbox-smoke-evidence.json',
);
let canaryResult = 'NOT_REQUESTED';
let stage = 'campaign-count';

try {
  const campaignCount = await client.getCampaignCount();
  const advertisedIds = new Set(
    campaignCount.adverts.flatMap((group) =>
      group.advert_list.map((campaign) => campaign.advertId),
    ),
  );
  for (const campaign of manifest.campaigns) {
    if (!advertisedIds.has(campaign.advertId)) {
      throw new Error(
        `Sandbox campaign ${String(campaign.advertId)} is absent from authorized scope`,
      );
    }
  }

  stage = 'campaign-details';
  const details = await client.getCampaignDetails(
    manifest.campaigns.map((campaign) => campaign.advertId),
  );
  for (const campaign of manifest.campaigns) {
    const actual = details.adverts.find((item) => item.id === campaign.advertId);
    if (actual === undefined) {
      throw new Error(`Sandbox campaign ${String(campaign.advertId)} details are absent`);
    }
    for (const nmId of campaign.nmIds) {
      if (!actual.nm_settings.some((item) => item.nm_id === nmId)) {
        throw new Error(
          `Sandbox article ${String(nmId)} is absent from campaign ${String(campaign.advertId)}`,
        );
      }
    }
    stage = 'minimum-bids';
    await client.getMinimumBids({
      advert_id: campaign.advertId,
      nm_ids: campaign.nmIds,
      payment_type: campaign.paymentType,
      placement_types: campaign.placements,
    });
  }

  stage = 'campaign-statistics';
  const end = startedAt.toISOString().slice(0, 10);
  const begin = new Date(startedAt.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  await client.getCampaignStatistics(
    manifest.campaigns.map((campaign) => campaign.advertId),
    begin,
    end,
  );

  if (manifest.writeCanary !== null) {
    const canary = manifest.writeCanary;
    stage = 'canary-baseline';
    const current = readCardBid(details, canary.advertId, canary.nmId, canary.placement);
    if (current !== canary.originalBidKopecks) {
      throw new Error('Sandbox canary baseline differs from externally provisioned manifest');
    }
    let canaryAttempted = false;
    try {
      canaryAttempted = true;
      stage = 'canary-write';
      await client.writeCardBids(cardWrite(canary, canary.canaryBidKopecks));
      stage = 'canary-visibility';
      await waitForBid(client, canary, canary.canaryBidKopecks);
      canaryResult = 'CANARY_VERIFIED';
    } finally {
      if (canaryAttempted) {
        stage = 'canary-reconciliation';
        const observed = await reconcileCanaryAttempt(client, canary);
        if (observed === canary.canaryBidKopecks) {
          stage = 'canary-rollback';
          await client.writeCardBids(cardWrite(canary, canary.originalBidKopecks));
          await waitForBid(client, canary, canary.originalBidKopecks);
          canaryResult = `${canaryResult}_ROLLBACK_VERIFIED`;
        } else {
          canaryResult = `${canaryResult}_ORIGINAL_STATE_CONFIRMED`;
        }
      }
    }
  }

  stage = 'evidence-write';
  await writeEvidence({ status: 'PASSED' });
  process.stdout.write(`Sandbox smoke PASSED; redacted evidence: ${outputPath}\n`);
} catch (error) {
  try {
    await writeEvidence({
      failureKind: error instanceof Error ? error.name : 'UnknownError',
      failureStage: stage,
      status: 'FAILED',
    });
  } catch (evidenceError) {
    process.stderr.write(`Unable to write sandbox failure evidence: ${String(evidenceError)}\n`);
  }
  throw error;
}

async function writeEvidence(result) {
  const evidence = {
    campaignCount: manifest.campaigns.length,
    canaryResult,
    completedAt: new Date().toISOString(),
    endpointProfileId: 'wb-promotion-2026-07-28-v1',
    manifestChecksum,
    manifestVersion: manifest.version,
    observations,
    profile: 'sandbox-smoke',
    sellerFingerprint: tokenProfile.identityFingerprint,
    startedAt: startedAt.toISOString(),
    ...result,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function parseManifest(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Sandbox fixture manifest must be an object');
  }
  const campaigns = value.campaigns;
  if (!Array.isArray(campaigns) || campaigns.length < 1 || campaigns.length > 50) {
    throw new Error('Sandbox fixture manifest must contain 1..50 campaigns');
  }
  const parsedCampaigns = campaigns.map((campaign) => {
    if (typeof campaign !== 'object' || campaign === null || Array.isArray(campaign)) {
      throw new Error('Sandbox campaign entry must be an object');
    }
    return {
      advertId: positiveInteger(campaign.advertId, 'advertId'),
      nmIds: integerArray(campaign.nmIds, 'nmIds', 100),
      paymentType: enumValue(campaign.paymentType, ['cpc', 'cpm'], 'paymentType'),
      placements: enumArray(campaign.placements, ['recommendations', 'search'], 'placements'),
    };
  });
  return {
    campaigns: parsedCampaigns,
    owner: nonEmptyString(value.owner, 'owner'),
    version: positiveInteger(value.version, 'version'),
    writeCanary:
      value.writeCanary === undefined || value.writeCanary === null
        ? null
        : {
            advertId: positiveInteger(value.writeCanary.advertId, 'writeCanary.advertId'),
            canaryBidKopecks: positiveInteger(
              value.writeCanary.canaryBidKopecks,
              'writeCanary.canaryBidKopecks',
            ),
            nmId: positiveInteger(value.writeCanary.nmId, 'writeCanary.nmId'),
            originalBidKopecks: positiveInteger(
              value.writeCanary.originalBidKopecks,
              'writeCanary.originalBidKopecks',
            ),
            propagationWindowMs:
              value.writeCanary.propagationWindowMs === undefined
                ? 180_000
                : boundedInteger(
                    value.writeCanary.propagationWindowMs,
                    'writeCanary.propagationWindowMs',
                    30_000,
                    300_000,
                  ),
            placement: enumValue(
              value.writeCanary.placement,
              ['recommendations', 'search'],
              'writeCanary.placement',
            ),
          },
  };
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${field} must be positive integer`);
  return value;
}

function boundedInteger(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be an integer in ${String(minimum)}..${String(maximum)}`);
  }
  return value;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`);
  return value.trim();
}

function integerArray(value, field, maximum) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new Error(`${field} must contain 1..${String(maximum)} values`);
  }
  return [...new Set(value.map((item) => positiveInteger(item, field)))];
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`${field} has an unsupported value`);
  return value;
}

function enumArray(value, allowed, field) {
  if (!Array.isArray(value) || value.length < 1) throw new Error(`${field} must not be empty`);
  return [...new Set(value.map((item) => enumValue(item, allowed, field)))];
}

function readCardBid(details, advertId, nmId, placement) {
  const campaign = details.adverts.find((item) => item.id === advertId);
  const article = campaign?.nm_settings.find((item) => item.nm_id === nmId);
  const value = article?.bids_kopecks[placement];
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Sandbox canary current bid is absent');
  }
  return value;
}

function cardWrite(canary, bid) {
  return {
    bids: [
      {
        advert_id: canary.advertId,
        nm_bids: [
          {
            bid_kopecks: bid,
            nm_id: canary.nmId,
            placement: canary.placement,
          },
        ],
      },
    ],
  };
}

async function waitForBid(client, canary, expected) {
  await waitForBidSet(client, canary, [expected]);
}

async function reconcileCanaryAttempt(client, canary) {
  const deadline = Date.now() + canary.propagationWindowMs;
  let stableOriginalReads = 0;
  while (Date.now() < deadline) {
    const details = await client.getCampaignDetails([canary.advertId]);
    const observed = readCardBid(details, canary.advertId, canary.nmId, canary.placement);
    if (observed === canary.canaryBidKopecks) return observed;
    if (observed !== canary.originalBidKopecks) {
      throw new Error('Sandbox canary reconciliation observed an unexpected third state');
    }
    stableOriginalReads += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, 5_000);
    });
  }
  if (stableOriginalReads >= 2) return canary.originalBidKopecks;
  throw new Error('Sandbox canary reconciliation did not obtain stable original-state evidence');
}

async function waitForBidSet(client, canary, expected) {
  const deadline = Date.now() + canary.propagationWindowMs;
  while (Date.now() < deadline) {
    const details = await client.getCampaignDetails([canary.advertId]);
    const observed = readCardBid(details, canary.advertId, canary.nmId, canary.placement);
    if (expected.includes(observed)) return observed;
    await new Promise((resolve) => {
      setTimeout(resolve, 5_000);
    });
  }
  throw new Error(`Sandbox canary visibility timeout for expected bid set ${expected.join(',')}`);
}

async function sha256(value) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}
