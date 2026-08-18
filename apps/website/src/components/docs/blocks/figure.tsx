// SPDX-License-Identifier: Apache-2.0

/**
 * An image presented in a frame that matches the surface it was captured from,
 * so screenshots read as product rather than as loose bitmaps.
 */
export function Figure({
  src,
  alt,
  caption,
  frame = 'plain',
  width,
  height,
}: {
  src: string;
  alt: string;
  caption?: string;
  frame?: 'plain' | 'browser' | 'phone' | 'desktop';
  width?: number;
  height?: number;
}) {
  return (
    <figure className="doc-figure" data-frame={frame}>
      <div className="doc-figure__stage">
        {frame === 'browser' || frame === 'desktop' ? (
          <div className="doc-figure__chrome" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- docs images are
            static assets sized by CSS; next/image adds no value here. */}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
