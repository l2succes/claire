// SPDX-License-Identifier: Apache-2.0
'use client';

import { platformCatalog, type PlatformDefinition } from '@claire/platform-catalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HeroIcon, type HeroIconName } from '@/components/site/HeroIcon';
import { PlatformMark } from '@/components/site/PlatformMark';

const supportLabels = {
  available: 'AVAILABLE',
  beta: 'BETA',
  planned: 'PLANNED',
  unavailable: 'UNAVAILABLE',
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
  const [votedIds, setVotedIds] = useState<Set<string>>(() => new Set());
  const [votingId, setVotingId] = useState<string | null>(null);
  const [voteErrorId, setVoteErrorId] = useState<string | null>(null);
  const [confirmedPlatform, setConfirmedPlatform] = useState<PlatformDefinition | null>(null);
  const confirmationDialogRef = useRef<HTMLDialogElement>(null);
  const visible = useMemo(
    () => platformCatalog.filter((platform) => matchesFilter(platform, filter)),
    [filter],
  );

  useEffect(() => {
    const dialog = confirmationDialogRef.current;
    if (!dialog) return;

    if (confirmedPlatform && !dialog.open) dialog.showModal();
    if (!confirmedPlatform && dialog.open) dialog.close();
  }, [confirmedPlatform]);

  async function voteFor(platform: PlatformDefinition) {
    setVotingId(platform.id);
    setVoteErrorId(null);
    try {
      const response = await fetch('/api/platform-votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformId: platform.id }),
      });
      if (!response.ok) throw new Error('vote_failed');
      setVotedIds((current) => new Set(current).add(platform.id));
      setConfirmedPlatform(platform);
    } catch {
      setVoteErrorId(platform.id);
    } finally {
      setVotingId(null);
    }
  }

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
        {visible.map((platform) => (
          <article className="platform-card" key={platform.id}>
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
            {platform.supportStatus === 'planned' ? (
              <div className="platform-card-footer">
                <button
                  className={`platform-vote-button${votedIds.has(platform.id) ? ' is-voted' : ''}`}
                  type="button"
                  disabled={votedIds.has(platform.id) || votingId === platform.id}
                  onClick={() => voteFor(platform)}
                >
                  {votedIds.has(platform.id)
                    ? 'Voted'
                    : votingId === platform.id
                      ? 'Voting…'
                      : 'Vote'}
                </button>
              </div>
            ) : null}
            {voteErrorId === platform.id ? (
              <p className="platform-vote-error" role="alert">
                Couldn’t save your vote. Try again.
              </p>
            ) : null}
          </article>
        ))}
      </div>
      <dialog
        className="vote-confirmation"
        ref={confirmationDialogRef}
        aria-labelledby="vote-confirmation-title"
        onCancel={() => setConfirmedPlatform(null)}
        onClick={(event) => {
          if (event.currentTarget === event.target) setConfirmedPlatform(null);
        }}
      >
        <div className="vote-confirmation-card">
          <span className="vote-confirmation-icon" aria-hidden="true">
            <HeroIcon name="check-circle" />
          </span>
          <p className="kicker">VOTE COUNTED</p>
          <h3 id="vote-confirmation-title">Your vote for {confirmedPlatform?.name} is in.</h3>
          <p>Thanks for helping us decide what Claire should support next.</p>
          <button type="button" onClick={() => setConfirmedPlatform(null)}>
            Done
          </button>
        </div>
      </dialog>
    </>
  );
}
