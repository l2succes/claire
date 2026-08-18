// SPDX-License-Identifier: Apache-2.0
/*
 * `website/public/mockups/` is the canonical copy of the mockup galleries —
 * it is what the site serves and what documentation pages iframe.
 *
 * The legacy static pages in `landing/` carry a second copy that had already
 * drifted (different heroicon set, older tab-bar styles). This mirrors the
 * canonical files back into `landing/` so the two stop diverging.
 */
import { copyFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(websiteRoot, 'public', 'mockups');
const destination = join(websiteRoot, '..', '..', 'landing');

const entries = await readdir(source, { withFileTypes: true });
let copied = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;
  await copyFile(join(source, entry.name), join(destination, entry.name));
  copied += 1;
}

console.log(`Mirrored ${copied} mockup files into landing/`);
