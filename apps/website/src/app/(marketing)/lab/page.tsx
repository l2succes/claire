// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { LabHome } from '@/components/site/LabHome';

export const metadata: Metadata = {
  title: 'Claire Lab',
  description: 'The living visual, product, and interaction reference for Claire.',
};

export default function LabPage() {
  return <LabHome />;
}
