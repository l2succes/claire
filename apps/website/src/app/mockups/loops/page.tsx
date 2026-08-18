// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How Loops work',
  description:
    'How Claire decides what you need to follow up on: threads of intent, what it deliberately ignores, and how loops become real actions through plugins.',
};

export default function LoopMockupsPage() {
  return (
    <iframe className="mockup-frame" title="How Claire loops work" src="/mockups/loop-mockups.html" />
  );
}
