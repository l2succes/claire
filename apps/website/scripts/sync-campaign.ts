// SPDX-License-Identifier: Apache-2.0
/*
 * The Close your loops creative is website-owned. Keep the files in
 * `public/campaigns/` together so the Next route can serve the exact static
 * experience without a dependency on the retired landing directory.
 */
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const campaignRoot = join(websiteRoot, 'public', 'campaigns');
const files = [
  'close-the-loop.html',
  'close-the-loop.css',
  'close-the-loop.js',
  'heroicons.js',
  'tokens.css',
];

await Promise.all(files.map((file) => access(join(campaignRoot, file))));

console.log(`Verified ${files.length} website-owned campaign files.`);
