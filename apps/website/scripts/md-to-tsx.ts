// SPDX-License-Identifier: Apache-2.0
/*
 * One-shot migration tool: Markdown document → documentation module.
 *
 * Used to move the long reference specifications and archived plans onto the
 * TSX block library without paraphrasing them. Short, high-traffic guides were
 * rewritten by hand instead, because they benefit from mockups, steps, and
 * callouts that a mechanical conversion cannot infer.
 *
 *   bun run scripts/md-to-tsx.ts <source.md> <section> <out.tsx> [order]
 *
 * It is deliberately not wired into the build: documentation is TSX now, and
 * this exists only for the migration.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [source, section, out, order] = process.argv.slice(2);
if (!source || !section || !out) {
  console.error('usage: md-to-tsx <source.md> <section> <out.tsx> [order]');
  process.exit(1);
}

const raw = await readFile(source, 'utf8');
const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
const frontmatter = new Map<string, string>();
for (const line of (frontmatterMatch?.[1] ?? '').split(/\r?\n/)) {
  const field = line.match(/^([a-z-]+):\s*(.*?)\s*$/);
  if (field) frontmatter.set(field[1], field[2].replace(/^['"]|['"]$/g, ''));
}
const body = raw.slice(frontmatterMatch?.[0].length ?? 0);

const used = new Set<string>(['Doc', 'P', 'Section']);
const need = (name: string) => {
  used.add(name);
  return name;
};

/** JSX-safe text: raw when it is unambiguous, an expression when it is not. */
function text(value: string, insideJsx = true) {
  const trimmed = value.replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (insideJsx && !/[{}<>&]/.test(trimmed) && !trimmed.includes("'") && !trimmed.includes('"')) {
    return trimmed;
  }
  return `{${JSON.stringify(trimmed)}}`;
}

const slugCounts = new Map<string, number>();
function slug(heading: string) {
  const base =
    heading
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  const seen = slugCounts.get(base) ?? 0;
  slugCounts.set(base, seen + 1);
  return seen ? `${base}-${seen + 1}` : base;
}

/** Inline Markdown → JSX children. */
function inline(value: string): string {
  const parts: string[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(_[^_]+_)/g;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(text(value.slice(cursor, start)));
    const token = match[0];

    if (token.startsWith('`')) {
      // Code spans routinely contain `<`, `{`, and quotes, so they go through
      // the same raw-or-expression treatment as prose text.
      parts.push(`<${need('C')}>${text(token.slice(1, -1))}</C>`);
    } else if (token.startsWith('**')) {
      parts.push(`<b>${text(token.slice(2, -2))}</b>`);
    } else if (token.startsWith('[')) {
      const link = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (link) {
        const [, label, href] = link;
        parts.push(
          /^https?:/.test(href)
            ? `<a href=${JSON.stringify(href)} rel="noreferrer" target="_blank">${text(label)}</a>`
            : `<a href=${JSON.stringify(href)}>${text(label)}</a>`,
        );
      }
    } else if (token.startsWith('_')) {
      parts.push(`<em>${text(token.slice(1, -1))}</em>`);
    }
    cursor = start + token.length;
  }
  if (cursor < value.length) parts.push(text(value.slice(cursor)));
  // Joined with no separator: `text()` already preserves the single space that
  // sat either side of an inline token.
  return parts.filter(Boolean).join('');
}

const lines = body.split('\n');
const chunks: string[] = [];
const openSections: number[] = [];
let cursor = 0;

function closeTo(level: number) {
  while (openSections.length && openSections[openSections.length - 1] >= level) {
    openSections.pop();
    chunks.push('</Section>');
  }
}

function tableCell(cell: string) {
  const rendered = inline(cell.trim());
  return rendered || "''";
}

while (cursor < lines.length) {
  const line = lines[cursor];

  // Headings ----------------------------------------------------------------
  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = heading[1].length;
    // Strip the numeric outline prefix ("2.", "4.1") — the sidebar and TOC
    // provide the ordering.
    const title = heading[2].replace(/`/g, '').replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim();
    // The H1 duplicates the page title rendered by the shell.
    if (level === 1) {
      cursor += 1;
      continue;
    }
    const depth = Math.min(Math.max(level, 2), 4);
    closeTo(depth);
    openSections.push(depth);
    chunks.push(
      `<Section id=${JSON.stringify(slug(title))} title=${JSON.stringify(title)}${depth > 2 ? ` level={${depth}}` : ''}>`,
    );
    cursor += 1;
    continue;
  }

  // Fenced code -------------------------------------------------------------
  const fence = line.match(/^```(\w*)/);
  if (fence) {
    const lang = fence[1] || 'text';
    const collected: string[] = [];
    cursor += 1;
    while (cursor < lines.length && !lines[cursor].startsWith('```')) {
      collected.push(lines[cursor]);
      cursor += 1;
    }
    cursor += 1;
    const code = collected.join('\n');
    if (lang === 'mermaid') {
      chunks.push(`<${need('Diagram')}>{${JSON.stringify(code)}}</Diagram>`);
    } else {
      chunks.push(`<${need('Code')} lang=${JSON.stringify(lang)}>{${JSON.stringify(code)}}</Code>`);
    }
    continue;
  }

  // Tables ------------------------------------------------------------------
  if (line.trim().startsWith('|') && lines[cursor + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
    const split = (row: string) =>
      row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|');
    const head = split(line);
    cursor += 2;
    const rows: string[][] = [];
    while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
      rows.push(split(lines[cursor]));
      cursor += 1;
    }
    const headJsx = head.map((cell) => `<>${tableCell(cell)}</>`).join(', ');
    const rowsJsx = rows
      .map((row) => `[${row.map((cell) => `<>${tableCell(cell)}</>`).join(', ')}]`)
      .join(',\n          ');
    chunks.push(`<${need('Table')}\n        head={[${headJsx}]}\n        rows={[\n          ${rowsJsx},\n        ]}\n      />`);
    continue;
  }

  // Blockquotes → callouts --------------------------------------------------
  if (line.startsWith('>')) {
    const collected: string[] = [];
    while (cursor < lines.length && lines[cursor].startsWith('>')) {
      collected.push(lines[cursor].replace(/^>\s?/, ''));
      cursor += 1;
    }
    const joined = collected.join(' ').trim();
    const titled = joined.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
    const kind = /warn|caution|careful|do not|never/i.test(joined) ? 'warning' : 'note';
    chunks.push(
      titled
        ? `<${need('Callout')} kind=${JSON.stringify(kind)} title=${JSON.stringify(titled[1])}>${inline(titled[2])}</Callout>`
        : `<${need('Callout')} kind=${JSON.stringify(kind)}>${inline(joined)}</Callout>`,
    );
    continue;
  }

  // Lists -------------------------------------------------------------------
  const bullet = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (bullet) {
    const ordered = /\d/.test(bullet[2]);
    const items: string[] = [];
    while (cursor < lines.length) {
      const item = lines[cursor].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (!item) {
        // A wrapped continuation line belongs to the previous item.
        if (lines[cursor].match(/^\s+\S/) && items.length) {
          items[items.length - 1] += ` ${lines[cursor].trim()}`;
          cursor += 1;
          continue;
        }
        break;
      }
      items.push(item[3]);
      cursor += 1;
    }
    const tag = ordered ? 'ol' : 'ul';
    chunks.push(
      `<${tag}>\n${items.map((item) => `        <li>${inline(item)}</li>`).join('\n')}\n      </${tag}>`,
    );
    continue;
  }

  // Horizontal rule ---------------------------------------------------------
  if (/^---+$/.test(line.trim())) {
    cursor += 1;
    continue;
  }

  // Paragraph ---------------------------------------------------------------
  if (line.trim()) {
    const collected: string[] = [];
    while (
      cursor < lines.length &&
      lines[cursor].trim() &&
      !lines[cursor].startsWith('#') &&
      !lines[cursor].startsWith('```') &&
      !lines[cursor].startsWith('>') &&
      !lines[cursor].trim().startsWith('|') &&
      !lines[cursor].match(/^(\s*)([-*]|\d+\.)\s+/)
    ) {
      collected.push(lines[cursor].trim());
      cursor += 1;
    }
    const paragraph = collected.join(' ');
    const isLede = chunks.length === 0;
    chunks.push(`<P${isLede ? ' lede' : ''}>${inline(paragraph)}</P>`);
    continue;
  }

  cursor += 1;
}

closeTo(2);

const roadmapStatus = frontmatter.get('roadmap-status');
const roadmap = roadmapStatus
  ? `  roadmap: {
    status: '${roadmapStatus}',
    summary: ${JSON.stringify(frontmatter.get('roadmap-summary') ?? '')},${
      frontmatter.get('roadmap-issue') ? `\n    issue: ${JSON.stringify(frontmatter.get('roadmap-issue'))},` : ''
    }
  },
`
  : '';

const imports = [...used].sort().join(', ');
const indented = chunks.map((chunk) => chunk.split('\n').map((l) => `      ${l}`).join('\n')).join('\n');

const output = `// SPDX-License-Identifier: Apache-2.0
import { ${imports} } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: ${JSON.stringify(frontmatter.get('title') ?? '')},
  description: ${JSON.stringify(frontmatter.get('description') ?? '')},
  section: '${section}',
  status: '${frontmatter.get('status') ?? 'draft'}',
  lastReviewed: '${frontmatter.get('last-reviewed') ?? '2026-08-17'}',
${order ? `  order: ${order},\n` : ''}${roadmap}};

export default function Page() {
  return (
    <Doc>
${indented}
    </Doc>
  );
}
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, output);
console.log(`${source} → ${out} (${chunks.length} blocks)`);
