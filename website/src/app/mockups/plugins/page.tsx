// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plugin mockups',
  description: 'Plugin library, permissions, and approval flows for Claire.',
};

export default function PluginMockupsPage() {
  return (
    <iframe
      className="mockup-frame"
      title="Claire plugin mockups"
      src="/mockups/plugin-mockups.html"
    />
  );
}
