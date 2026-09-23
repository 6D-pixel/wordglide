import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error: a plain .mjs script with no type declarations.
import { compareVersions, storeVersion } from '../scripts/publish.mjs';

test('compares manifest versions numerically, part by part', () => {
  assert.equal(compareVersions('0.5.0', '0.5.0'), 0);
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.5', '0.5.0.0'), 0);
  assert.equal(compareVersions('0.5.0', '0.5.0.1'), -1);
});
test('store version is the higher of published and in review', () => {
  const channel = (crxVersion: string) => ({ distributionChannels: [{ crxVersion }] });
  assert.equal(storeVersion({}), null);
  assert.equal(storeVersion({ publishedItemRevisionStatus: channel('0.5.0') }), '0.5.0');
  assert.equal(storeVersion({ publishedItemRevisionStatus: channel('0.5.0'), submittedItemRevisionStatus: channel('0.6.0') }), '0.6.0');
  assert.equal(storeVersion({ publishedItemRevisionStatus: channel('0.10.0'), submittedItemRevisionStatus: channel('0.9.0') }), '0.10.0');
});
