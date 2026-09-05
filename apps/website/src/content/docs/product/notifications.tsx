// SPDX-License-Identifier: Apache-2.0
import { Doc, P, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Notification reliability',
  description: 'Public delivery notes for reliable mobile and macOS notifications.',
  section: 'product',
  status: 'draft',
  lastReviewed: '2026-08-17',
  roadmap: {
    status: 'in_progress',
    summary: 'Deliver reliable mobile and macOS message notifications with production acceptance coverage.',
    issue: 'https://github.com/l2succes/claire/issues/110',
  },
  related: ['/docs/product/roadmap', '/docs/plans/conversation-notification-controls'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire is improving notification delivery across its mobile and macOS clients: reliable
        registration, reliable delivery, and acceptance verification — without exposing device tokens,
        provider credentials, or private operator detail.
      </P>

      <Section id="status" title="Status">
        <P>
          The public roadmap tracks this as in progress while production evidence is gathered. A
          notification path is only marked reliable once it has been measured in production, not once it
          works on a developer&rsquo;s device.
        </P>
        <P>
          See{' '}
          <a href="https://github.com/l2succes/claire/issues/110" rel="noreferrer" target="_blank">
            the notification reliability issue
          </a>{' '}
          for the current implementation discussion.
        </P>
      </Section>
    </Doc>
  );
}
