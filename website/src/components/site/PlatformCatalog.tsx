// SPDX-License-Identifier: Apache-2.0
'use client';

import { platformCatalog, type PlatformDefinition } from '@claire/platform-catalog';
import { useMemo, useState } from 'react';
import { HeroIcon, type HeroIconName } from '@/components/site/HeroIcon';

const supportLabels = {
  available: 'AVAILABLE',
  beta: 'BETA',
  planned: 'PLANNED',
  unavailable: 'UNAVAILABLE',
} as const;

const deliveryLabels = {
  current: 'Current',
  wave_1: 'Wave 1',
  wave_2: 'Wave 2',
  wave_3: 'Wave 3',
  parallel_mac: 'Mac track',
} as const;

const setupIcons: Record<PlatformDefinition['setupSurface'], HeroIconName> = {
  phone: 'phone',
  desktop: 'desktop',
  mac: 'desktop',
};

type Filter = 'all' | 'available' | 'desktop' | 'device' | 'planned';

function matchesFilter(platform: PlatformDefinition, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'available') return platform.supportStatus === 'available';
  if (filter === 'planned') return platform.supportStatus === 'planned';
  if (filter === 'desktop') return platform.setupSurface === 'desktop';
  return ['always_on_mac', 'android_phone_online'].includes(platform.deviceDependency);
}

function PlatformMark({ platform }: { platform: PlatformDefinition }) {
  const [hasImage, setHasImage] = useState(false);

  return (
    <span
      className={`platform-mark ${platform.iconTreatment || 'knockout'}${hasImage ? ' has-image' : ''}`}
      style={{ ['--platform-accent' as string]: platform.accent }}
      aria-hidden="true"
    >
      {platform.mark}
      {platform.iconUrl ? (
        <img
          alt=""
          loading="lazy"
          decoding="async"
          src={platform.iconUrl}
          onLoad={() => setHasImage(true)}
          onError={(event) => event.currentTarget.remove()}
        />
      ) : null}
    </span>
  );
}

export function PlatformRail() {
  const platforms = [...platformCatalog, ...platformCatalog];
  return (
    <div className="platform-rail" id="platform-rail" aria-label="Claire connection catalog">
      {platforms.map((platform, index) => (
        <span
          className="rail-platform"
          key={`${platform.id}-${index}`}
          aria-hidden={index >= platformCatalog.length ? true : undefined}
        >
          <PlatformMark platform={platform} />
          {platform.name}
        </span>
      ))}
    </div>
  );
}

export function PlatformCatalog() {
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useMemo(
    () => platformCatalog.filter((platform) => matchesFilter(platform, filter)),
    [filter],
  );

  return (
    <>
      <div className="catalog-toolbar">
        <div className="catalog-filters" role="group" aria-label="Filter platform catalog">
          {(
            [
              ['all', 'All'],
              ['available', 'Available'],
              ['desktop', 'Desktop setup'],
              ['device', 'Device required'],
              ['planned', 'Planned'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'active' : undefined}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="catalog-count" aria-live="polite">
          Showing {visible.length} {visible.length === 1 ? 'network' : 'networks'}
        </p>
      </div>
      <div className="platform-grid">
        {visible.map((platform) => {
          const expanded = openId === platform.id;
          return (
            <article
              className={`platform-card${expanded ? ' is-expanded' : ''}`}
              key={platform.id}
            >
              <div className="platform-card-header">
                <PlatformMark platform={platform} />
                <span className={`status-pill ${platform.supportStatus}`}>
                  {supportLabels[platform.supportStatus]}
                </span>
              </div>
              <h3>{platform.name}</h3>
              <p className="platform-bridge">{platform.bridge}</p>
              <p className="platform-setup">
                <span className="platform-setup-icon" aria-hidden="true">
                  <HeroIcon name={setupIcons[platform.setupSurface]} className="size-4" />
                </span>
                {platform.setupLabel}
              </p>
              <div className="platform-card-footer">
                <span className="platform-runtime">
                  <span>●</span>
                  {platform.runtimeLabel}
                </span>
                <button
                  className="platform-detail-toggle"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? null : platform.id)}
                >
                  {expanded ? 'Hide −' : 'Details +'}
                </button>
              </div>
              {expanded ? (
                <div className="platform-details">
                  <p>{platform.detail}</p>
                  <dl>
                    <dt>Sign-in</dt>
                    <dd>{platform.authSummary}</dd>
                    <dt>Delivery</dt>
                    <dd>{deliveryLabels[platform.deliveryWave]}</dd>
                  </dl>
                  <a className="platform-doc-link" href={platform.docsUrl} target="_blank" rel="noreferrer">
                    Official bridge docs ↗
                  </a>
                  <a
                    className="platform-doc-link"
                    href={platform.iconSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {platform.iconTreatment === 'generic'
                      ? 'Protocol icon source ↗'
                      : 'Brand icon source ↗'}
                  </a>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
