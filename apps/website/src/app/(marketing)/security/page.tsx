// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { SecurityPage } from '@/components/site/SecurityPage';
import '@/styles/security.css';

export const metadata: Metadata = {
  title: 'Security',
  description: 'Claire’s current security boundaries, data flows, and encryption roadmap.',
};

export default function Page() {
  return <SecurityPage />;
}
