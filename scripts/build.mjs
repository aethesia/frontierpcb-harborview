import '../validate.mjs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public');
if (relative(root, output) !== 'public') throw new Error('Invalid website output directory');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'favicon.ico', 'assets', 'fonts', 'data', 'HARBOR-LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await cp(resolve(root, name), resolve(output, name), { recursive: true });
}
console.log('Built Harbor Viewer website files.');
