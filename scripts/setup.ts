#!/usr/bin/env bun
/**
 * Fresh-clone contributor setup. Copies example env files and installs workspaces.
 * Does not require cloud credentials, messaging accounts, or paid AI keys.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const envCopies = [
  ['apps/server/.env.example', 'apps/server/.env'],
  ['apps/client/.env.example', 'apps/client/.env'],
] as const;

for (const [from, to] of envCopies) {
  if (!existsSync(to)) {
    copyFileSync(from, to);
    console.log(`created ${to} from ${from}`);
  } else {
    console.log(`kept existing ${to}`);
  }
}

const install = spawnSync('bun', ['install'], { stdio: 'inherit' });
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

console.log('\nClaire mock-mode setup is ready.');
console.log('Next: bun run dev');
console.log('Optional Matrix docs: git submodule update --init vendor/mautrix-docs');
