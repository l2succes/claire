// SPDX-License-Identifier: Apache-2.0
/*
 * Renders every documentation module to static markup and derives the text
 * artefacts that React components do not provide for free:
 *
 *   - a table of contents (headings, in document order)
 *   - a plain-text rendition for Ask Claire's retrieval
 *   - a Markdown rendition served at `/docs/<path>.md` and in `llms.txt`
 *   - a MiniSearch index for the ⌘K dialog
 *
 * This runs outside Next.js, so the doc components must render synchronously.
 * That is why `lib/shiki.ts` resolves its highlighter with a top-level await
 * instead of making `<Code>` an async server component.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MiniSearch from 'minisearch';
import { HTMLElement, parse, type Node, NodeType } from 'node-html-parser';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { docModules } from '../src/generated/docs-registry';
import { searchOptions, type SearchChunk } from '../src/lib/search-options';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export type Heading = { id: string; text: string; level: number };
export type DocText = { markdown: string; text: string; headings: Heading[] };

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'aside', 'figure', 'figcaption', 'header', 'footer',
  'nav', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'pre', 'blockquote', 'hr', 'main',
]);

function decode(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

/**
 * Chrome the reader sees but a machine reader should not: copy buttons, code
 * bar titles, heading permalinks, tab strips. Marked at the component level so
 * the extractor never has to know about individual class names.
 */
function isChrome(node: HTMLElement) {
  const tag = node.rawTagName?.toLowerCase() ?? '';
  return tag === 'script' || tag === 'style' || node.hasAttribute('data-noindex');
}

/** Verbatim text, used inside <pre> where whitespace is the content. */
function rawText(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return decode(node.rawText);
  if (!isElement(node)) return '';
  return node.childNodes.map(rawText).join('');
}

/** Visible text with block-level boundaries preserved as newlines. */
function toText(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return decode(node.rawText);
  if (!isElement(node)) return '';
  if (isChrome(node)) return '';
  const tag = node.rawTagName?.toLowerCase() ?? '';
  if (tag === 'pre') return `\n${rawText(node)}\n`;
  const inner = node.childNodes.map(toText).join('');
  // Cells and inline labels need a separator, or "Key" and "Meaning" index as
  // the single token "KeyMeaning".
  if (tag === 'td' || tag === 'th' || tag === 'b' || tag === 'strong' || tag === 'span') {
    return `${inner} `;
  }
  return BLOCK_TAGS.has(tag) ? `\n${inner}\n` : inner;
}

function inline(node: Node): string {
  return toText(node).replace(/\s+/g, ' ').trim();
}

function tidy(value: string) {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Markdown rendition of the rendered tree.
 *
 * It only needs to handle the markup the block library actually emits, and it
 * exists for machine readers (LLM endpoints, `.md` URLs) rather than as a
 * round-trippable source format.
 */
function toMarkdown(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return decode(node.rawText);
  if (!isElement(node)) return '';
  if (isChrome(node)) return '';

  const tag = node.rawTagName?.toLowerCase() ?? '';
  const children = () => node.childNodes.map(toMarkdown).join('');

  const tabLabel = node.getAttribute('data-tab-label');
  if (tabLabel) return `\n\n**${tabLabel}**\n${children()}\n`;

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag.slice(1));
      const text = inline(node).replace(/\s*#$/, '');
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    }
    case 'p':
      return `\n\n${children().replace(/\s+/g, ' ').trim()}\n\n`;
    case 'br':
      return '\n';
    case 'hr':
      return '\n\n---\n\n';
    case 'strong':
    case 'b':
      return `**${inline(node)}**`;
    case 'em':
    case 'i':
      return `*${inline(node)}*`;
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      const text = inline(node);
      if (!text || text === '#') return '';
      return href ? `[${text}](${href})` : text;
    }
    case 'code':
      // Code inside <pre> is handled by the <pre> branch.
      return node.closest('pre') ? children() : `\`${inline(node)}\``;
    case 'pre': {
      const figure = node.closest('figure');
      const language = figure?.getAttribute('data-lang') ?? (figure?.classList.contains('doc-terminal') ? 'bash' : '');
      const body = rawText(node).replace(/\n+$/, '');
      return `\n\n\`\`\`${language}\n${body}\n\`\`\`\n\n`;
    }
    case 'aside': {
      // Callouts read as blockquotes, which is how a Markdown consumer expects
      // an admonition to arrive.
      const body = tidy(children());
      return `\n\n${body.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')}\n\n`;
    }
    case 'ul':
    case 'ol': {
      const ordered = tag === 'ol';
      const items = node.childNodes
        .filter((child): child is HTMLElement => isElement(child) && child.rawTagName?.toLowerCase() === 'li')
        .map((child, index) => {
          const body = toMarkdown(child).trim().split('\n').join('\n  ');
          return `${ordered ? `${index + 1}.` : '-'} ${body}`;
        });
      return `\n\n${items.join('\n')}\n\n`;
    }
    case 'li':
      return children().replace(/\n{3,}/g, '\n\n').trim();
    case 'table': {
      const rows = node.querySelectorAll('tr').map((row) =>
        row.querySelectorAll('th, td').map((cell) => inline(cell).replace(/\|/g, '\\|')),
      );
      if (!rows.length) return '';
      const [head, ...body] = rows;
      const lines = [
        `| ${head.join(' | ')} |`,
        `| ${head.map(() => '---').join(' | ')} |`,
        ...body.map((row) => `| ${row.join(' | ')} |`),
      ];
      return `\n\n${lines.join('\n')}\n\n`;
    }
    case 'dt':
      return `\n\n**${inline(node)}**`;
    case 'dd':
      return `\n${inline(node)}\n`;
    case 'figcaption':
      return `\n\n_${inline(node)}_\n\n`;
    default:
      return BLOCK_TAGS.has(tag) ? `\n${children()}\n` : children();
  }
}

function extractHeadings(root: HTMLElement): Heading[] {
  return root
    .querySelectorAll('h2[id], h3[id], h4[id]')
    .map((heading) => ({
      id: heading.getAttribute('id') ?? '',
      text: inline(heading).replace(/\s*#$/, ''),
      level: Number(heading.rawTagName.slice(1)),
    }))
    .filter((heading) => heading.id && heading.text);
}

/** Split a document into heading-scoped chunks so search can deep-link. */
function chunk(root: HTMLElement, meta: { url: string; title: string; section: string; status: string }) {
  const chunks: SearchChunk[] = [];
  const sections = root.querySelectorAll('section.doc-section');

  const intro = tidy(
    root.childNodes
      .filter((node) => !(isElement(node) && node.classList?.contains('doc-section')))
      .map(toText)
      .join('\n'),
  );
  if (intro) {
    chunks.push({
      id: meta.url,
      url: meta.url,
      docTitle: meta.title,
      heading: 'Overview',
      section: meta.section,
      status: meta.status,
      excerpt: intro.replace(/\n+/g, ' ').slice(0, 240),
      text: intro,
    });
  }

  for (const node of sections) {
    const heading = node.querySelector('h2[id], h3[id], h4[id]');
    const id = heading?.getAttribute('id');
    const text = tidy(toText(node));
    if (!text) continue;
    chunks.push({
      id: id ? `${meta.url}#${id}` : `${meta.url}-${chunks.length}`,
      url: id ? `${meta.url}#${id}` : meta.url,
      docTitle: meta.title,
      heading: heading ? inline(heading).replace(/\s*#$/, '') : meta.title,
      section: meta.section,
      status: meta.status,
      excerpt: text.replace(/\n+/g, ' ').slice(0, 240),
      text,
    });
  }

  return chunks;
}

const output: Record<string, DocText> = {};
const allChunks: SearchChunk[] = [];
let emptyDocs = 0;

for (const [slug, module] of Object.entries(docModules)) {
  const url = `/docs/${slug}`;
  const html = renderToStaticMarkup(createElement(module.default));
  // `pre` must be parsed, not captured as raw text: Shiki emits markup inside
  // it, and the code we want is the text of those spans.
  const root = parse(html, { blockTextElements: { script: true, noscript: true, style: true } });

  const headings = extractHeadings(root);
  const text = module.meta.searchText ?? tidy(toText(root));
  const markdown = tidy(
    `# ${module.meta.title}\n\n_${module.meta.description}_\n\n${toMarkdown(root)}`,
  );

  if (!text) {
    console.warn(`  ! ${slug} rendered no text`);
    emptyDocs += 1;
  }

  output[slug] = { markdown, text, headings };
  allChunks.push(
    ...chunk(root, {
      url,
      title: module.meta.title,
      section: module.meta.section,
      status: module.meta.status,
    }),
  );
}

const index = new MiniSearch<SearchChunk>(searchOptions);
index.addAll(allChunks);

await mkdir(join(websiteRoot, 'src', 'generated'), { recursive: true });
await writeFile(join(websiteRoot, 'src', 'generated', 'docs-text.json'), JSON.stringify(output));
await writeFile(join(websiteRoot, 'public', 'docs-search-index.json'), JSON.stringify(index));

const words = Object.values(output).reduce((sum, doc) => sum + doc.text.split(/\s+/).length, 0);
console.log(
  `Extracted ${Object.keys(output).length} documents (${words.toLocaleString()} words, ${allChunks.length} search chunks).`,
);
if (emptyDocs) {
  console.error(`${emptyDocs} document(s) produced no text.`);
  process.exit(1);
}
