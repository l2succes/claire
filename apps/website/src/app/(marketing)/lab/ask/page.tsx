// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { LabFrame } from '@/components/site/LabFrame';

export const metadata: Metadata = {
  title: 'Ask Claire reference',
  description: 'Ask Claire product interaction and research concept reference.',
};

export default function AskClaireLabPage() {
  return <LabFrame title="Ask Claire concept reference" src="/lab/ask-claire-mockups.html" />;
}
