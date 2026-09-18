// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { ConversationLoopDemo } from './conversation-loop-demo';

export const metadata: Metadata = {
  title: 'Conversation to loop interactive demo',
  description:
    'An animated Claire product demo showing a normal conversation becoming an actionable loop.',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConversationLoopMockupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <ConversationLoopDemo
      initialAutoplay={first(params.autoplay) !== '0'}
      initialChrome={first(params.chrome) !== '0' && first(params.embed) !== '1'}
      initialLoop={first(params.loop) === '1'}
    />
  );
}
