// SPDX-License-Identifier: Apache-2.0
import type { CSSProperties, ReactNode } from 'react';

export type VisualTone = 'neutral' | 'accent' | 'good' | 'warning' | 'danger' | 'info';

export function MetricGrid({
  items,
  columns = 4,
}: {
  items: Array<{
    value: ReactNode;
    label: string;
    detail?: ReactNode;
    tone?: VisualTone;
  }>;
  columns?: 2 | 3 | 4;
}) {
  return (
    <dl className="doc-metric-grid" data-columns={columns} aria-label="Key specification metrics">
      {items.map((item) => (
        <div key={item.label} data-tone={item.tone ?? 'neutral'}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
          {item.detail ? <p>{item.detail}</p> : null}
        </div>
      ))}
    </dl>
  );
}

export type CapabilityStatus = 'available' | 'partial' | 'missing';

const capabilityLabels: Record<CapabilityStatus, string> = {
  available: 'Works now',
  partial: 'Partial today',
  missing: 'Requires v2',
};

export function CapabilityGrid({
  items,
}: {
  items: Array<{
    title: string;
    question?: string;
    description: ReactNode;
    status: CapabilityStatus;
  }>;
}) {
  return (
    <div className="doc-capability-grid" aria-label="Current capability assessment">
      {items.map((item) => (
        <article key={item.title} data-status={item.status}>
          <header>
            <span className="doc-capability-grid__status">{capabilityLabels[item.status]}</span>
            <h3>{item.title}</h3>
          </header>
          {item.question ? <blockquote>{item.question}</blockquote> : null}
          <p>{item.description}</p>
        </article>
      ))}
    </div>
  );
}

export function PanelGrid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  return (
    <div className="doc-panel-grid" data-columns={columns}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  eyebrow,
  tone = 'neutral',
  children,
}: {
  title: string;
  eyebrow?: string;
  tone?: VisualTone;
  children: ReactNode;
}) {
  return (
    <article className="doc-panel" data-tone={tone}>
      {eyebrow ? <p className="doc-panel__eyebrow">{eyebrow}</p> : null}
      <h4>{title}</h4>
      <div className="doc-panel__body">{children}</div>
    </article>
  );
}

export function BarChart({
  title,
  caption,
  max,
  items,
}: {
  title: string;
  caption?: string;
  max: number;
  items: Array<{
    label: string;
    value: number;
    displayValue?: string;
    detail?: string;
    tone?: VisualTone;
  }>;
}) {
  return (
    <figure className="doc-bar-chart" aria-label={title}>
      <header>
        <h3>{title}</h3>
        {caption ? <p>{caption}</p> : null}
      </header>
      <ul>
        {items.map((item) => {
          const percent = max > 0 ? Math.max(0, Math.min(100, (item.value / max) * 100)) : 0;
          const style = { '--doc-bar-size': `${percent}%` } as CSSProperties;
          return (
            <li key={item.label} data-tone={item.tone ?? 'accent'}>
              <div className="doc-bar-chart__label">
                <span>{item.label}</span>
                <b>{item.displayValue ?? item.value}</b>
              </div>
              <div
                className="doc-bar-chart__track"
                role="meter"
                aria-label={item.label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={item.value}
              >
                <span style={style} />
              </div>
              {item.detail ? <p>{item.detail}</p> : null}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function Timeline({
  items,
  label = 'Delivery timeline',
}: {
  items: Array<{
    phase: string;
    title: string;
    description: ReactNode;
    status?: 'now' | 'next' | 'later';
  }>;
  label?: string;
}) {
  return (
    <ol className="doc-timeline" aria-label={label}>
      {items.map((item) => (
        <li key={`${item.phase}-${item.title}`} data-status={item.status ?? 'later'}>
          <span className="doc-timeline__marker" aria-hidden="true" />
          <div>
            <p className="doc-timeline__phase">{item.phase}</p>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
