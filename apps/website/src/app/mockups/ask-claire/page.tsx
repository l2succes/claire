// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { AskClaireDemo } from './ask-claire-demo';

export const metadata: Metadata = {
  title: 'Ask Claire interactive demo',
  description:
    'A cinematic, interactive product demo showing how Ask Claire finds plans, people, and context across conversations.',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AskClaireMockupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <AskClaireDemo
      initialAutoplay={first(params.autoplay) !== '0'}
      initialChrome={first(params.chrome) !== '0' && first(params.embed) !== '1'}
      initialDepth={first(params.depth)}
      initialFormat={first(params.format)}
      initialLoop={first(params.loop) === '1'}
      initialScene={first(params.scene)}
    />
  );
}
