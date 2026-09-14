import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/content.ts', 'src/background.ts', 'src/popup.ts'], outdir: 'dist', bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, loader: { '.css': 'text' }, define: { __BUILD_ID__: JSON.stringify(`0.1.0-${Date.now()}`) } });
await Promise.all(['manifest.json', 'popup.html', 'styles.css'].map(file => copyFile(file, `dist/${file}`)));
console.log('Built extension in dist/');
