// SPDX-License-Identifier: Apache-2.0
import { platformCatalog, type PlatformSupportStatus } from '@claire/platform-catalog';
import { PlatformMark } from '@/components/site/PlatformMark';

const supportLabels: Record<PlatformSupportStatus, string> = {
  available: 'Available',
  beta: 'Beta',
  planned: 'Planned',
  unavailable: 'Not supported',
};

/**
 * Connector grid read straight from the shared product catalog, so the docs
 * cannot drift from what the product actually supports.
 */
export function Platforms({
  status,
  detail = false,
}: {
  status?: PlatformSupportStatus | PlatformSupportStatus[];
  detail?: boolean;
}) {
  const wanted = status ? (Array.isArray(status) ? status : [status]) : null;
  const items = wanted
    ? platformCatalog.filter((platform) => wanted.includes(platform.supportStatus))
    : platformCatalog;

  return (
    <ul className="doc-platforms" data-detail={detail ? 'true' : undefined}>
      {items.map((platform) => (
        <li key={platform.id} data-support={platform.supportStatus}>
          <PlatformMark platform={platform} size="lg" />
          <div>
            <b>{platform.name}</b>
            <span className="doc-platforms__status">{supportLabels[platform.supportStatus]}</span>
            {detail ? <p>{platform.authSummary}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
