// SPDX-License-Identifier: Apache-2.0
import { Button } from '@/components/ui/Button';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import '@/styles/landing.css';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="not-found-page">
        <p className="eyebrow">404</p>
        <h1>This page is not in the inbox.</h1>
        <p>The route does not exist. Try the homepage, docs, or security details.</p>
        <Button href="/">Back to Claire</Button>
      </main>
      <SiteFooter />
    </>
  );
}
