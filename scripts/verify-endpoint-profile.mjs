import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const profileUrl = new URL(
  '../packages/contracts/src/profiles/wb-promotion-2026-07-28-v1.json',
  import.meta.url,
);
const buildProfileUrl = new URL(
  '../packages/contracts/src/profiles/build-profile.json',
  import.meta.url,
);

const [profileBytes, buildProfileBytes] = await Promise.all([
  readFile(profileUrl),
  readFile(buildProfileUrl, 'utf8'),
]);
const actualChecksum = createHash('sha256').update(profileBytes).digest('hex');
const buildProfile = JSON.parse(buildProfileBytes);

if (
  typeof buildProfile !== 'object' ||
  buildProfile === null ||
  buildProfile.endpointProfileSha256 !== actualChecksum
) {
  throw new Error(
    `Endpoint profile checksum mismatch: expected ${String(buildProfile?.endpointProfileSha256)}, actual ${actualChecksum}`,
  );
}

process.stdout.write(`${actualChecksum}\n`);
