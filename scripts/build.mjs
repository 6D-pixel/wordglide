import { build } from 'esbuild';
import { mkdir, copyFile, readFile, cp, rm } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));

// A release build drops the source maps. They are 166 KB of a 277 KB package
// and nothing in the store reads them; a development build keeps them, because
// that is the build you are actually debugging. `npm run package` sets this.
const release = process.argv.includes('--release');

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/content.ts', 'src/background.ts', 'src/popup.ts'], outdir: 'dist', bundle: true, format: 'iife', target: 'chrome120', sourcemap: !release, loader: { '.css': 'text' }, define: { __BUILD_ID__: JSON.stringify(`${version}-${Date.now()}`) } });
await Promise.all(['manifest.json', 'popup.html', 'styles.css'].map(file => copyFile(file, `dist/${file}`)));
// The toolbar mark, at the paths manifest.json names. Missing icons are not a
// build error in Chrome — you get a grey puzzle piece and a store rejection —
// so the copy is checked here rather than discovered on upload.
await cp('icons', 'dist/icons', { recursive: true });
console.log(`Built extension in dist/${release ? ' (release: no source maps)' : ''}`);
