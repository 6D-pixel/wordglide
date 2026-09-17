/* =========================================================================
   The store upload: dist/ as a zip the Chrome Web Store will accept.

   Two things go wrong when this is done by hand, and both are silent:

     1. Zipping the FOLDER instead of its contents. The store reads
        manifest.json at the archive root; `zip -r wordglide.zip dist` puts it
        at dist/manifest.json and the upload is rejected with a message that
        does not say which of the two mistakes you made. This runs from inside
        dist/, so the root is right by construction.
     2. Shipping source maps. They were 166 KB of a 277 KB package, for no
        reader. `npm run package` builds with --release first, which turns
        them off; the check below fails the package if one appears anyway.

   -X drops the extra attributes macOS attaches, which otherwise arrive as
   __MACOSX entries in the archive.

   Publishing to Brave is not a separate step and there is no second artefact:
   Brave installs from the Chrome Web Store listing.
   ========================================================================= */

import { execFileSync } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';

const { name, version } = JSON.parse(await readFile('manifest.json', 'utf8'));
const out = `wordglide-${version}.zip`;

await rm(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', `../${out}`, '.', '-x', '.DS_Store', '-x', '__MACOSX/*'], {
  cwd: 'dist',
  stdio: 'inherit',
});

const listing = execFileSync('unzip', ['-Z1', out], { encoding: 'utf8' })
  .split('\n').map(line => line.trim()).filter(Boolean);

const problems = [];
if (!listing.includes('manifest.json')) {
  problems.push('manifest.json is not at the archive root');
}
const maps = listing.filter(f => f.endsWith('.map'));
if (maps.length) problems.push(`source maps in the package: ${maps.join(', ')}`);

// Declared but missing icons are not a build error in Chrome — you get a grey
// puzzle piece, and the store rejects the listing for the 128 specifically.
const declared = Object.values(JSON.parse(await readFile('manifest.json', 'utf8')).icons ?? {});
if (!declared.length) problems.push('manifest.json declares no icons');
for (const icon of declared) {
  if (!listing.includes(icon)) problems.push(`declared icon missing from the package: ${icon}`);
}

if (problems.length) {
  console.error(`\n${out} is not fit to upload:`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

const { size } = await stat(out);
console.log(`${out}  ${(size / 1024).toFixed(1)} KB  ${listing.length} files`);
console.log(`${name} ${version} — ready for the Chrome Web Store dashboard.`);
