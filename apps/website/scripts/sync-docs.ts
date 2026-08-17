// SPDX-License-Identifier: Apache-2.0
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoDocs = join(websiteRoot, '..', '..', 'docs');
const destRoot = join(websiteRoot, 'content', 'docs');

const pages = [
  ['getting-started/repository-setup.md', 'Getting started'],
  ['architecture/overview.md', 'Architecture'],
  ['guides/mobile.md', 'Guides'],
  ['guides/desktop.md', 'Guides'],
  ['guides/plugins.md', 'Guides'],
  ['guides/testing.md', 'Guides'],
  ['guides/self-hosting.md', 'Guides'],
  ['reference/environment.md', 'Reference'],
  ['contributing/workflow.md', 'Contributing'],
  ['product/roadmap.md', 'Product'],
] as const;

const index = `---
title: Claire documentation
description: Set up the repository, understand the architecture, and contribute.
---

# Claire documentation

Claire is an AI-native multi-chat client. These pages are the public contributor docs.

## Start here

- [Repository setup](/docs/getting-started/repository-setup)
- [Architecture overview](/docs/architecture/overview)
- [Mobile](/docs/guides/mobile)
- [Desktop](/docs/guides/desktop)
- [Plugin development](/docs/guides/plugins)
- [Testing](/docs/guides/testing)
- [Self-hosting](/docs/guides/self-hosting)
- [Environment variables](/docs/reference/environment)
- [Contribution workflow](/docs/contributing/workflow)
- [Product roadmap](/docs/product/roadmap)

Canonical Markdown lives in the repository \`docs/\` folder. This website copies those files at build time.
`;

const rootMeta = {
  title: 'Claire Docs',
  pages: ['index', 'getting-started', 'architecture', 'guides', 'reference', 'contributing', 'product'],
};

async function main() {
  await mkdir(destRoot, { recursive: true });
  await writeFile(join(destRoot, 'index.mdx'), index);
  await writeFile(join(destRoot, 'meta.json'), `${JSON.stringify(rootMeta, null, 2)}\n`);

  for (const [relative] of pages) {
    const from = join(repoDocs, relative);
    const to = join(destRoot, relative);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }

  const folders = [
    ['getting-started', { title: 'Getting started', pages: ['repository-setup'] }],
    ['architecture', { title: 'Architecture', pages: ['overview'] }],
    ['guides', { title: 'Guides', pages: ['mobile', 'desktop', 'plugins', 'testing', 'self-hosting'] }],
    ['reference', { title: 'Reference', pages: ['environment'] }],
    ['contributing', { title: 'Contributing', pages: ['workflow'] }],
    ['product', { title: 'Product', pages: ['roadmap'] }],
  ] as const;

  for (const [folder, meta] of folders) {
    await writeFile(join(destRoot, folder, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  }

  await writeFile(
    join(repoDocs, 'meta.json'),
    `${JSON.stringify(
      {
        title: 'Claire Docs',
        source: 'canonical',
        website: 'apps/website/content/docs',
        pages: pages.map(([path]) => path),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Synced ${pages.length} docs pages into apps/website/content/docs`);
}

await main();
