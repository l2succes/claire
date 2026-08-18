// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Desktop mockups',
  description: 'High-fidelity desktop workspace reference for Claire.',
};

export default function DesktopMockupsPage() {
  return (
    <iframe
      className="mockup-frame"
      title="Claire desktop mockups"
      src="/mockups/desktop-mockups.html"
    />
  );
}
