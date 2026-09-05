// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mobile mockups',
  description: 'High-fidelity mobile screen system for Claire.',
};

export default function MobileMockupsPage() {
  return (
    <iframe
      className="mockup-frame"
      title="Claire mobile mockups"
      src="/mockups/app-mockups.html"
    />
  );
}
