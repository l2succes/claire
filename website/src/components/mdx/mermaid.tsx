// SPDX-License-Identifier: Apache-2.0
'use client';

import { use, useId, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function Mermaid({ chart }: { chart: string }) {
  const mounted = useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;
  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId().replaceAll(':', '');
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  const styles = getComputedStyle(document.documentElement);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    theme: 'neutral',
    themeVariables: {
      primaryColor: styles.getPropertyValue('--claire-lime').trim(),
      primaryTextColor: styles.getPropertyValue('--claire-ink').trim(),
      primaryBorderColor: styles.getPropertyValue('--claire-ink').trim(),
      lineColor: styles.getPropertyValue('--neutral-600').trim(),
      secondaryColor: styles.getPropertyValue('--claire-cream').trim(),
      tertiaryColor: styles.getPropertyValue('--claire-paper').trim(),
    },
  });

  const { svg, bindFunctions } = use(
    cachePromise(chart, () => mermaid.render(`mermaid-${id}`, chart.replaceAll('\\n', '\n'))),
  );

  return (
    <div
      className="my-6 overflow-x-auto"
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
