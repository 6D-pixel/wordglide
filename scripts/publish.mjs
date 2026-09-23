/* =========================================================================
   Submit the packaged zip to the Chrome Web Store (API v2).

   CI runs this on every push to main, after the tests pass. Most merges do
   not change the version, and the store refuses an upload whose manifest
   version is not higher than the last one, so the script asks the store
   what it already has and only submits when manifest.json is ahead of it.
   Releasing is therefore: bump "version" in manifest.json, merge.

   Needs, from the environment:
     CWS_PUBLISHER_ID         Developer Dashboard → Account → Publisher ID
     CWS_EXTENSION_ID         the item's 32-letter ID
     CWS_SERVICE_ACCOUNT_KEY  the service account's JSON key (the whole file)

   `--dry-run` signs in and reports what it would do without uploading.

   Submitting is not publishing. Google reviews every version first, and the
   item goes live on its own once approved (publishType DEFAULT_PUBLISH).
   ========================================================================= */

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

/** Compares Chrome manifest versions: up to four dot-separated integers. */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** The highest version the store holds, published or waiting in review. */
export function storeVersion(status) {
  const versions = [status.publishedItemRevisionStatus, status.submittedItemRevisionStatus]
    .flatMap(revision => revision?.distributionChannels ?? [])
    .map(channel => channel.crxVersion)
    .filter(Boolean);
  return versions.reduce((max, v) => (max && compareVersions(max, v) >= 0 ? max : v), null);
}

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri,
    iat: now,
    exp: now + 600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const response = await fetch(key.token_uri, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function call(token, method, url, body, headers = {}) {
  const response = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { CWS_PUBLISHER_ID, CWS_EXTENSION_ID, CWS_SERVICE_ACCOUNT_KEY } = process.env;
  if (!CWS_PUBLISHER_ID || !CWS_EXTENSION_ID || !CWS_SERVICE_ACCOUNT_KEY) {
    throw new Error('set CWS_PUBLISHER_ID, CWS_EXTENSION_ID and CWS_SERVICE_ACCOUNT_KEY');
  }
  const item = `${API}/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}`;
  const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
  const token = await accessToken(JSON.parse(CWS_SERVICE_ACCOUNT_KEY));

  const status = await call(token, 'GET', `${item}:fetchStatus`);
  const current = storeVersion(status);
  if (current && compareVersions(version, current) <= 0) {
    console.log(`manifest.json is ${version} and the store already has ${current}. Nothing to submit.`);
    console.log('To release, raise "version" in manifest.json.');
    return;
  }
  console.log(`Submitting ${version} (store has ${current ?? 'no version'}).`);
  if (dryRun) return console.log('Dry run: stopping before the upload.');

  const zip = await readFile(`wordglide-${version}.zip`);
  let upload = await call(token, 'POST', `${API}/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:upload`,
    zip, { 'Content-Type': 'application/zip' });
  // Large packages are processed asynchronously; poll until the store has it.
  for (let tries = 0; upload.uploadState === 'IN_PROGRESS' && tries < 30; tries++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const polled = await call(token, 'GET', `${item}:fetchStatus`);
    upload = { ...upload, uploadState: polled.lastAsyncUploadState };
  }
  if (upload.uploadState !== 'SUCCEEDED') throw new Error(`upload did not succeed: ${JSON.stringify(upload)}`);
  console.log(`Uploaded ${upload.crxVersion ?? version}.`);

  const published = await call(token, 'POST', `${item}:publish`,
    JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }), { 'Content-Type': 'application/json' });
  console.log(`Submitted for review: ${published.state}`);
  if (published.warningInfo) console.log(`Warnings: ${JSON.stringify(published.warningInfo)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
