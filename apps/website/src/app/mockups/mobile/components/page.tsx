// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mobile component kit',
  description: 'Reusable mobile components for the Claire product system.',
};

export default function MobileComponentKitPage() {
  return <iframe className="mockup-frame" title="Claire mobile component kit" src="/mockups/mobile-components.html" />;
}
