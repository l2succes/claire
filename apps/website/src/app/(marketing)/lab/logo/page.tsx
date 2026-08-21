// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { LabFrame } from '@/components/site/LabFrame';

export const metadata: Metadata = {
  title: 'Logo directions',
  description: 'Editable logo directions and app icon exploration for Claire.',
};

export default function LogoLabPage() {
  return <LabFrame title="Claire logo exploration" src="/lab/logo-explorations.html" />;
}
