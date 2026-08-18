// SPDX-License-Identifier: Apache-2.0
/*
 * One-shot, idempotent maintenance script.
 *
 * Gives every mockup frame a stable `data-screen` slug derived from its own
 * printed label, and wires `mockup-embed.js` into each gallery so docs pages
 * can iframe a single frame with `?screen=<slug>`.
 *
 * Run it again after adding frames to the galleries:
 *   bun run scripts/prepare-mockups.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mockupsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mockups');

/** Case wrappers, and the label element each one prints its name into. */
const caseSelectors: Array<{ className: string; labelClass: string }> = [
  { className: 'screen-case', labelClass: 'screen-meta' },
  { className: 'frame-case', labelClass: 'frame-label' },
  { className: 'mock-case', labelClass: 'mock-label' },
  { className: 'phone-case', labelClass: 'mock-label' },
];

/** Hand-tuned slugs; anything unlisted falls back to a kebab-cased label. */
const slugOverrides: Record<string, string> = {
  'desktop-home-handoff': 'desktop-home',
  'imessage-on-device-setup': 'imessage-setup',
  'activity-trust': 'activity',
  'ai-privacy': 'ai-privacy',
};

function slugify(label: string) {
  const withoutIndex = label.replace(/^\s*\d+\s*\/\s*/, '');
  const slug = withoutIndex
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slugOverrides[slug] ?? slug;
}

async function prepare(file: string) {
  const path = join(mockupsDir, file);
  let html = await readFile(path, 'utf8');
  const found: string[] = [];

  for (const { className, labelClass } of caseSelectors) {
    // Match an <article class="… <className> …" …> opening tag followed
    // (eventually) by its label element's <b>NN / NAME</b>.
    const pattern = new RegExp(
      `(<article class="[^"]*\\b${className}\\b[^"]*"[^>]*?)(>)([\\s\\S]{0,400}?class="${labelClass}"[^>]*>\\s*<b>([^<]+)<\\/b>)`,
      'g',
    );
    html = html.replace(pattern, (match, open: string, close: string, tail: string, label: string) => {
      const slug = slugify(label);
      found.push(slug);
      if (/\sdata-screen="/.test(open)) {
        return match.replace(/\sdata-screen="[^"]*"/, ` data-screen="${slug}"`);
      }
      return `${open} data-screen="${slug}"${close}${tail}`;
    });
  }

  if (!html.includes('mockup-embed.js')) {
    html = html.replace('</head>', '    <script src="./mockup-embed.js"></script>\n  </head>');
  }

  await writeFile(path, html);
  return found;
}

const galleries = ['app-mockups.html', 'desktop-mockups.html', 'plugin-mockups.html'];
const manifest: Record<string, string[]> = {};

for (const gallery of galleries) {
  manifest[gallery] = await prepare(gallery);
  console.log(`${gallery}: ${manifest[gallery].length} frames`);
  for (const slug of manifest[gallery]) console.log(`  - ${slug}`);
}
