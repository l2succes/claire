// SPDX-License-Identifier: Apache-2.0
/*
 * The Close your loops creative is authored as a dependency-free static page
 * in `landing/`. Mirror its small asset bundle into `public/campaigns/` so the
 * Next website can serve the exact same experience at `/campaigns/close-the-loop`.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const landingRoot = join(websiteRoot, '..', '..', 'landing');
const destination = join(websiteRoot, 'public', 'campaigns');
const files = [
  'close-the-loop.html',
  'close-the-loop.css',
  'close-the-loop.js',
  'heroicons.js',
  'tokens.css',
];

await mkdir(destination, { recursive: true });
await Promise.all(files.map((file) => copyFile(join(landingRoot, file), join(destination, file))));

console.log(`Synced ${files.length} campaign files into public/campaigns.`);
