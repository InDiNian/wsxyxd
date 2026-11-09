import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const path of ['index.html', 'src', 'data', 'assets']) await cp(resolve(root, path), resolve(out, path), { recursive: true });
console.log('Built static app → dist/');
