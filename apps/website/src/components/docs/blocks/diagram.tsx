// SPDX-License-Identifier: Apache-2.0
import { Mermaid } from '@/components/docs/blocks/mermaid';

function dedent(source: string) {
  const lines = source.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = lines
    .filter((line) => line.trim())
    .reduce((min, line) => Math.min(min, line.length - line.trimStart().length), Number.POSITIVE_INFINITY);
  const shift = Number.isFinite(indent) ? indent : 0;
  return lines.map((line) => line.slice(shift)).join('\n');
}

/**
 * A Mermaid diagram themed from Claire's design tokens.
 *
 * Rendering happens on the client, so the summary is emitted as static text
 * too: it is what search, `llms.txt`, and Ask Claire see in place of the SVG,
 * and it is the accessible description of the diagram.
 */
export function Diagram({
  children,
  caption,
  summary,
}: {
  children: string;
  caption?: string;
  summary?: string;
}) {
  return (
    <figure className="doc-diagram">
      <div className="doc-diagram__canvas">
        <Mermaid chart={dedent(children)} />
      </div>
      {caption || summary ? (
        <figcaption>
          {caption ? <b>{caption}</b> : null}
          {caption && summary ? ' — ' : null}
          {summary ? <span>{summary}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
