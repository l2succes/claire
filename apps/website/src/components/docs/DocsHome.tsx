// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { AskClaire } from '@/components/docs/ask-claire';

const featured = [
  {
    eyebrow: '01 / Start here',
    title: 'Run Claire locally',
    description: 'Clone the repository, prepare a safe local environment, and start in mock mode.',
    href: '/docs/getting-started/repository-setup',
    action: 'Read the setup guide',
  },
  {
    eyebrow: '02 / Understand',
    title: 'See the whole system',
    description: 'Follow a message from the mobile app through the Bun server, Matrix, and bridges.',
    href: '/docs/architecture/overview',
    action: 'Explore architecture',
  },
  {
    eyebrow: '03 / Contribute',
    title: 'Ship with confidence',
    description: 'Learn the workflow, checks, and conventions that keep Claire dependable.',
    href: '/docs/contributing/workflow',
    action: 'View contributor workflow',
  },
];

const tracks = [
  { title: 'Mobile', description: 'Expo, React Native, and the unified inbox.', href: '/docs/guides/mobile' },
  { title: 'Desktop', description: 'Native desktop apps and local development.', href: '/docs/guides/desktop' },
  { title: 'Plugins', description: 'Create extensions for Claire’s platform.', href: '/docs/guides/plugins' },
  { title: 'Self-hosting', description: 'Run the full Matrix-based local stack.', href: '/docs/guides/self-hosting' },
  { title: 'Environment', description: 'A reference for local configuration.', href: '/docs/reference/environment' },
  { title: 'Testing', description: 'Checks and fixtures for reliable changes.', href: '/docs/guides/testing' },
];

export function DocsHome() {
  return (
    <main className="docs-home">
      <section className="docs-home-hero" aria-labelledby="docs-home-title">
        <div className="docs-home-kicker">
          <span aria-hidden="true" className="docs-home-kicker-dot" />
          Developer documentation
        </div>
        <h1 id="docs-home-title">Build the connected inbox.</h1>
        <p>
          Everything you need to run, understand, and extend Claire—the AI-native messenger for all
          your conversations.
        </p>
        <div className="docs-home-actions">
          <Link className="docs-home-primary" href="/docs/getting-started/repository-setup">
            Get started <span aria-hidden="true">→</span>
          </Link>
          <Link className="docs-home-secondary" href="/docs/architecture/overview">
            Explore the architecture
          </Link>
        </div>
        <div className="docs-home-command" aria-label="Quick start command">
          <span aria-hidden="true" className="docs-home-command-prompt">$</span>
          <code>bun run dev</code>
          <span className="docs-home-command-note">Start Claire in mock mode</span>
        </div>
      </section>

      <section className="docs-home-section" aria-labelledby="featured-title">
        <div className="docs-home-section-heading">
          <p>Recommended path</p>
          <h2 id="featured-title">Make your first contribution.</h2>
        </div>
        <div className="docs-home-featured-grid">
          {featured.map((item) => (
            <Link className="docs-home-featured-card" href={item.href} key={item.href}>
              <p>{item.eyebrow}</p>
              <h3>{item.title}</h3>
              <span>{item.description}</span>
              <strong>{item.action} <b aria-hidden="true">→</b></strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-home-section docs-home-explore" aria-labelledby="explore-title">
        <div className="docs-home-section-heading">
          <p>Documentation by track</p>
          <h2 id="explore-title">Find the part you own.</h2>
        </div>
        <div className="docs-home-track-grid">
          {tracks.map((track) => (
            <Link className="docs-home-track" href={track.href} key={track.href}>
              <span aria-hidden="true">↗</span>
              <div>
                <h3>{track.title}</h3>
                <p>{track.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-home-help" aria-labelledby="ask-claire-title">
        <div>
          <p>Need a hand?</p>
          <h2 id="ask-claire-title">Ask Claire about the codebase.</h2>
          <span>Get a focused answer with links back to the relevant documentation.</span>
        </div>
        <AskClaire />
      </section>
    </main>
  );
}
