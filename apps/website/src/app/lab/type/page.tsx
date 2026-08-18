// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Type lab',
  description:
    'Try open-source typefaces across Claire’s marketing, mobile, and desktop surfaces before committing to one.',
};

export default function TypeLabPage() {
  return (
    <iframe className="mockup-frame" title="Claire type lab" src="/lab/type-lab.html" />
  );
}
