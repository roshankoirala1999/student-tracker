import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['dist', 'server-dist']) rmSync(resolve(root, name), { recursive: true, force: true });
