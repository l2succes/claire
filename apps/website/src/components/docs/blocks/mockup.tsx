// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useRef, useState } from 'react';
import type { MockupSurface } from '@/lib/docs-types';

const surfaces: Record<MockupSurface, { file: string; gallery: string; label: string; height: number }> = {
  mobile: { file: 'app-mockups.html', gallery: '/mockups/mobile', label: 'Mobile', height: 780 },
  'mobile-app': { file: 'mobile-app-preview.html', gallery: '/mockups/mobile/app', label: 'Mobile app', height: 900 },
  desktop: { file: 'desktop-mockups.html', gallery: '/mockups/desktop', label: 'Desktop', height: 600 },
  plugins: { file: 'plugin-mockups.html', gallery: '/mockups/plugins', label: 'Plugins', height: 620 },
};

/**
 * Embeds one frame from the live HTML mockup galleries.
 *
 * These are real CSS mockups rather than screenshots, so they stay in sync
 * with the design system and never go stale. The gallery reports its measured
 * size (see `public/mockups/mockup-embed.js`); if the frame is wider than the
 * space available — a 1440px desktop window inside a docs column — it is
 * scaled down rather than clipped or scrolled.
 */
export function Mockup({
  surface,
  screen,
  caption,
  align = 'center',
}: {
  surface: MockupSurface;
  screen: string;
  caption?: string;
  align?: 'center' | 'start';
}) {
  const config = surfaces[surface];
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [content, setContent] = useState<{ width: number; height: number } | null>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; screen?: string; height?: number; width?: number };
      if (data?.type !== 'claire-mockup-size' || data.screen !== screen) return;
      if (data.height && data.width) setContent({ width: data.width, height: data.height });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [screen]);

  const scale = content && available ? Math.min(1, available / content.width) : 1;
  const boxHeight = content ? Math.round(content.height * scale) : config.height;

  return (
    <figure className="doc-mockup" data-surface={surface} data-align={align}>
      <div className="doc-mockup__stage" ref={stage}>
        <div className="doc-mockup__box" style={{ height: boxHeight, width: content ? content.width * scale : '100%' }}>
          <iframe
            ref={frame}
            className="doc-mockup__frame"
            title={caption ?? `${config.label} mockup: ${screen}`}
            src={`/mockups/${config.file}?screen=${encodeURIComponent(screen)}`}
            loading="lazy"
            style={
              content
                ? {
                    width: content.width,
                    height: content.height,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }
                : { width: '100%', height: config.height }
            }
          />
        </div>
      </div>
      <figcaption className="doc-mockup__caption">
        <span>{caption ?? `${config.label} · ${screen.replace(/-/g, ' ')}`}</span>
        <a href={config.gallery} data-noindex="">
          Open the {config.label.toLowerCase()} gallery →
        </a>
      </figcaption>
    </figure>
  );
}

/** A row of mockups, used on the docs home and section hubs. */
export function MockupStrip({
  items,
}: {
  items: Array<{ surface: MockupSurface; screen: string; caption?: string }>;
}) {
  return (
    <div className="doc-mockup-strip">
      {items.map((item) => (
        <Mockup key={`${item.surface}-${item.screen}`} {...item} align="start" />
      ))}
    </div>
  );
}
