import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hooksDirectory = resolve(root, '.git', 'hooks');
const hookPath = resolve(hooksDirectory, 'pre-commit');
const hook = '#!/bin/sh\nexec node "$(git rev-parse --show-toplevel)/scripts/pre-commit.mjs"\n';

await mkdir(hooksDirectory, { recursive: true });
await writeFile(hookPath, hook, 'utf8');
await chmod(hookPath, 0o755);
console.log(`Installed ${hookPath}`);
