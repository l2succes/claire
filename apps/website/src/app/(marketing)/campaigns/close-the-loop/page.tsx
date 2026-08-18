// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Close your loops',
  description: 'An interactive campaign concept for Claire’s Loops tab.',
};

export default function CloseTheLoopCampaignPage() {
  return (
    <iframe
      className="mockup-frame"
      title="Claire Close your loops campaign"
      src="/campaigns/close-the-loop.html"
    />
  );
}
