// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { LabFrame } from '@/components/site/LabFrame';

export const metadata: Metadata = {
  title: 'Type lab',
  description:
    'Try open-source typefaces across Claire’s marketing, mobile, and desktop surfaces before committing to one.',
};

export default function TypeLabPage() {
  return <LabFrame title="Claire type lab" src="/lab/type-lab.html" />;
}
