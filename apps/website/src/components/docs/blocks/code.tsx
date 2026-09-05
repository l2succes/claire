// SPDX-License-Identifier: Apache-2.0
import { CopyButton } from '@/components/docs/blocks/copy-button';
import { highlight } from '@/lib/shiki';

function dedent(source: string) {
  const lines = source.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = lines
    .filter((line) => line.trim())
    .reduce((min, line) => Math.min(min, line.length - line.trimStart().length), Number.POSITIVE_INFINITY);
  const shift = Number.isFinite(indent) ? indent : 0;
  return lines.map((line) => line.slice(shift)).join('\n');
}

/**
 * A highlighted code panel. Highlighting is synchronous (see `lib/shiki.ts`)
 * so that documentation pages can also be rendered outside Next.js during text
 * extraction.
 */
export function Code({
  children,
  lang = 'text',
  title,
  copy = true,
}: {
  children: string;
  lang?: string;
  title?: string;
  copy?: boolean;
}) {
  const code = dedent(children);
  const html = highlight(code, lang);

  return (
    <figure className="doc-code" data-lang={lang}>
      <div className="doc-code__bar" data-noindex="">
        <span className="doc-code__title">{title ?? lang}</span>
        {copy ? <CopyButton value={code} /> : null}
      </div>
      <div className="doc-code__body" dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}

/**
 * A shell transcript. Lines are shown with a prompt marker, but only the
 * commands themselves are copied, so pasting into a terminal works.
 */
export function Terminal({
  children,
  title = 'Terminal',
  cwd,
}: {
  children: string;
  title?: string;
  cwd?: string;
}) {
  const commands = dedent(children);
  const html = highlight(commands, 'bash');

  return (
    <figure className="doc-terminal">
      <div className="doc-terminal__bar" data-noindex="">
        <span className="doc-terminal__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="doc-terminal__title">{cwd ? `${title} — ${cwd}` : title}</span>
        <CopyButton value={commands} />
      </div>
      <div className="doc-terminal__body" dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}

/** Inline code with the docs' compact treatment. */
export function C({ children }: { children: string }) {
  return <code className="doc-inline-code">{children}</code>;
}
