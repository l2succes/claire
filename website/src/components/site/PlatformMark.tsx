// SPDX-License-Identifier: Apache-2.0
'use client';

import type { PlatformDefinition } from '@claire/platform-catalog';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { getPlatform } from '@/lib/platforms';

const sizeClass = {
  sm: 'platform-mark--sm',
  md: 'platform-mark--md',
  lg: 'platform-mark--lg',
  xl: 'platform-mark--xl',
  hero: 'platform-mark--hero',
} as const;

const localIconUrl: Record<string, string> = {
  whatsapp: '/assets/platforms/whatsapp.svg',
  telegram: '/assets/platforms/telegram.svg',
  instagram: '/assets/platforms/instagram.svg',
  messenger: '/assets/platforms/messenger.svg',
  linkedin: '/assets/platforms/linkedin.svg',
  discord: '/assets/platforms/discord.svg',
  slack: '/assets/platforms/slack.svg',
  signal: '/assets/platforms/signal.svg',
  imessage: '/assets/platforms/imessage.svg',
  'google-messages': '/assets/platforms/sms.svg',
};

export { getPlatform };

export function PlatformMark({
  platform,
  size = 'md',
  className,
}: {
  platform: PlatformDefinition;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconUrl = localIconUrl[platform.id] ?? platform.iconUrl;
  const showIcon = Boolean(iconUrl) && !imageFailed;
  const treatment = localIconUrl[platform.id] ? 'knockout' : platform.iconTreatment || 'knockout';

  return (
    <span
      className={cn(
        'platform-mark',
        treatment,
        sizeClass[size],
        showIcon && 'has-image',
        className,
      )}
      style={{ ['--platform-accent' as string]: platform.accent }}
      aria-hidden="true"
    >
      {showIcon ? null : platform.mark}
      {showIcon ? (
        <img
          alt=""
          decoding="async"
          src={iconUrl}
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </span>
  );
}

export function PlatformIcon({
  id,
  size = 'md',
  className,
}: {
  id: string;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const platform = getPlatform(id);
  if (!platform) return null;
  return <PlatformMark platform={platform} size={size} className={className} />;
}

export function PlatformChip({
  id,
  label,
  size = 'lg',
}: {
  id: string;
  label?: string;
  size?: keyof typeof sizeClass;
}) {
  const platform = getPlatform(id);
  if (!platform) return null;

  return (
    <span className="platform-chip">
      <PlatformMark platform={platform} size={size} />
      <b>{label ?? platform.name}</b>
    </span>
  );
}

export function PlatformCluster({
  items,
  size = 'hero',
}: {
  items: Array<{ id: string; label?: string }>;
  size?: keyof typeof sizeClass;
}) {
  return (
    <ul className="platform-cluster">
      {items.map((item) => {
        const platform = getPlatform(item.id);
        if (!platform) return null;
        return (
          <li key={item.id}>
            <PlatformMark platform={platform} size={size} />
            <b>{item.label ?? platform.name}</b>
          </li>
        );
      })}
    </ul>
  );
}
