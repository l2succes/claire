// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @next/next/no-img-element */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getDoc, getDocs } from '@/lib/docs';
import { sectionLabels, statusLabels } from '@/lib/docs-types';

const size = { width: 1200, height: 630 };

// `ImageResponse` renders with Satori, which cannot use `next/font` — the font
// binaries are vendored under `src/app/og/fonts` with their OFL license.
const fontDir = join(process.cwd(), 'src', 'app', 'og', 'fonts');

export const revalidate = false;

export function generateStaticParams() {
  return [{ slug: [] as string[] }, ...getDocs().map((doc) => ({ slug: doc.slug.split('/') }))];
}

/**
 * Per-document social card.
 *
 * Implemented as a route handler rather than an `opengraph-image` convention
 * file because Next does not allow metadata files inside an optional
 * catch-all segment; `generateMetadata` points `openGraph.images` here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);

  const [regular, semibold] = await Promise.all([
    readFile(join(fontDir, 'PublicSans-Regular.ttf')),
    readFile(join(fontDir, 'PublicSans-SemiBold.ttf')),
  ]);

  const eyebrow = doc ? sectionLabels[doc.section] : 'Open documentation';
  const title = doc?.title ?? 'We build Claire in the open';
  const description =
    doc?.description ??
    'Architecture, product specifications, operational runbooks, and live implementation plans.';
  const footer = doc ? `${statusLabels[doc.status]} · reviewed ${doc.lastReviewed}` : 'claire.chat/docs';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#10120F',
          color: '#F4F1EA',
          padding: '72px 80px',
          fontFamily: 'Public Sans',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#DFFF64',
            }}
          />
          <span style={{ fontSize: 26, fontWeight: 600 }}>Claire</span>
          <span style={{ fontSize: 26, color: '#8E9787' }}>/ docs</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ fontSize: 24, letterSpacing: 3, color: '#DFFF64', textTransform: 'uppercase' }}>
            {eyebrow}
          </span>
          <span style={{ fontSize: title.length > 44 ? 62 : 76, fontWeight: 600, lineHeight: 1.06 }}>
            {title}
          </span>
          <span style={{ fontSize: 30, color: '#A8B0A0', lineHeight: 1.35, maxWidth: 940 }}>
            {description.length > 150 ? `${description.slice(0, 147)}…` : description}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', height: 6, width: 220, background: '#DFFF64', borderRadius: 3 }} />
          <span style={{ fontSize: 24, color: '#8E9787' }}>{footer}</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Public Sans', data: regular, weight: 400, style: 'normal' },
        { name: 'Public Sans', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
