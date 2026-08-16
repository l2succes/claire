import { notFound } from 'next/navigation';
import { MarketingPage } from '@/components/site/MarketingPage';
import { pages } from '@/content/site';

export function generateStaticParams() { return Object.keys(pages).map((slug) => ({ slug })); }

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug as keyof typeof pages];
  if (!page) notFound();
  return <MarketingPage page={page} />;
}
