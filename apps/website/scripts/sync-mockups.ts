// SPDX-License-Identifier: Apache-2.0
/*
 * `website/public/mockups/` is the canonical copy of the mockup galleries —
 * it is what the site serves and what documentation pages iframe. This command
 * is deliberately a verification step: the website no longer writes to or
 * depends on the retired landing directory.
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(websiteRoot, 'public', 'mockups');

const entries = await readdir(source, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile());

console.log(`Verified ${files.length} website-owned mockup files.`);
