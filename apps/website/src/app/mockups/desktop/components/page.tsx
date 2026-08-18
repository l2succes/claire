// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Desktop component kit',
  description: 'Reusable desktop components for the Claire product system.',
};

export default function DesktopComponentKitPage() {
  return <iframe className="mockup-frame" title="Claire desktop component kit" src="/mockups/desktop-components.html" />;
}
