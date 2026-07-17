import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, 'dist');
const client = resolve(dist, 'client');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(client, { recursive: true });

for (const entry of ['index.html', 'style.css', 'main.js', 'assets', 'modules']) {
  await cp(resolve(root, entry), resolve(client, entry), { recursive: true });
}

await cp(resolve(root, 'worker.js'), resolve(dist, 'server', 'index.js'));

console.log('Memory Frequency production build is ready.');
