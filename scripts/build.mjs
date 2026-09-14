import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/content.ts', 'src/background.ts', 'src/popup.ts'], outdir: 'dist', bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, loader: { '.css': 'text' }, define: { __BUILD_ID__: JSON.stringify(`${version}-${Date.now()}`) } });
await Promise.all(['manifest.json', 'popup.html', 'styles.css'].map(file => copyFile(file, `dist/${file}`)));
console.log('Built extension in dist/');
