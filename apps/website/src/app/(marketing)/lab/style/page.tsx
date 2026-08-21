// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { LabFrame } from '@/components/site/LabFrame';

export const metadata: Metadata = {
  title: 'Style guide',
  description: 'Claire’s visual and verbal design system reference.',
};

export default function StyleGuidePage() {
  return <LabFrame title="Claire style guide" src="/lab/style-guide.html" />;
}
