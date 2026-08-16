// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroIcon } from '@/components/site/HeroIcon';
import { PlatformCluster } from '@/components/site/PlatformMark';
import '@/styles/developer.css';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'Claire developer hub: product references, architecture, implementation specifications, and contribution paths.',
};

export default function DevelopersPage() {
  return (
    <>
      <header className="dev-header">
        <Link className="dev-brand" href="/developers">
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
          <span>Claire</span>
          <b>Developer</b>
        </Link>
        <nav>
          <a href="#references">References</a>
          <a href="#architecture">Architecture</a>
          <a href="#build">Build</a>
          <a href="#community">Community</a>
        </nav>
        <a className="github-link" href="https://github.com/l2succes/claire">
          View GitHub <HeroIcon name="external" />
        </a>
      </header>
      <main>
        <section className="dev-hero">
          <div className="dev-hero-copy">
            <div className="eyebrow">
              <span />
              OPEN PRODUCT REFERENCE
            </div>
            <h1>
              Build the place
              <br />
              where conversations <em>do things.</em>
            </h1>
            <p>
              Claire is an AI-native, multi-network messenger with open product references for mobile,
              desktop, connectors, and conversation plugins. Use this hub to understand the vision,
              run the stack, and make one part dramatically better.
            </p>
            <div className="dev-actions">
              <a className="primary" href="#build">
                Start building <HeroIcon name="arrow-right" />
              </a>
              <Link href="/docs">Read the docs</Link>
            </div>
            <div className="dev-network-row" aria-label="Networks contributors can extend">
              <PlatformCluster
                items={[
                  { id: 'whatsapp' },
                  { id: 'telegram' },
                  { id: 'instagram' },
                  { id: 'imessage' },
                  { id: 'discord' },
                ]}
              />
            </div>
          </div>
          <aside className="dev-terminal">
            <header>
              <i />
              <i />
              <i />
              <span>claire / quick start</span>
            </header>
            <pre>
              <span>$</span> git clone https://github.com/l2succes/claire.git{'\n'}
              <span>$</span> cd claire{'\n'}
              <span>$</span> bun run setup{'\n'}
              <span>$</span> bun run dev
            </pre>
            <footer>
              <span>Expo · Bun · Matrix · Supabase</span>
              <b>LOCAL STACK</b>
            </footer>
          </aside>
        </section>
        <section className="dev-vision">
          <div>
            <div className="kicker">THE VISION</div>
            <h2>
              An open client.
              <br />A sustainable service.
            </h2>
          </div>
          <div className="vision-copy">
            <p>
              People should be able to inspect Claire, run it themselves, build new connectors and
              plugins, and shape the product. They should also be able to pay Claire to operate the
              difficult parts: always-on bridges, sync, backups, upgrades, AI inference, and trusted
              integrations.
            </p>
            <div className="vision-model">
              <article>
                <HeroIcon name="desktop" size="xl" />
                <span>COMMUNITY</span>
                <b>Build and self-host</b>
                <p>Run the stack, bring your own model, create private plugins, and contribute upstream.</p>
              </article>
              <article>
                <HeroIcon name="cloud" size="xl" />
                <span>CLAIRE CLOUD</span>
                <b>Managed and always on</b>
                <p>Hosted infrastructure, monitored connections, included AI allowance, and automatic updates.</p>
              </article>
              <article>
                <HeroIcon name="sparkles" size="xl" />
                <span>ECOSYSTEM</span>
                <b>Extend conversations</b>
                <p>Verified plugins, community tools, connector adapters, and reusable automation templates.</p>
              </article>
            </div>
          </div>
        </section>
        <section className="reference-section" id="references">
          <header className="section-heading">
            <div>
              <div className="kicker">PRODUCT REFERENCES</div>
              <h2>See the whole system before touching a screen.</h2>
            </div>
            <p>
              These pages are living references, not frozen handoff files. Update the relevant
              reference alongside meaningful UI or behavior changes.
            </p>
          </header>
          <div className="reference-grid">
            <Link className="reference-card mobile-ref" href="/mockups/mobile">
              <div className="ref-meta">
                <span>01</span>
                <b>MOBILE</b>
              </div>
              <div className="mini-phone">
                <i />
                <div>
                  <small>9:41</small>
                  <h4>Good morning.</h4>
                  <p>Three conversations need you.</p>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <h3>Mobile app reference</h3>
              <p>
                Core loop, Ask Claire, inbox, promises, people, relationship memory, settings, and
                setup states.
              </p>
              <em>
                Open 14+ screens <HeroIcon name="arrow-right" />
              </em>
            </Link>
            <Link className="reference-card desktop-ref" href="/mockups/desktop">
              <div className="ref-meta">
                <span>02</span>
                <b>DESKTOP</b>
              </div>
              <div className="mini-desktop">
                <header>
                  <i />
                  <i />
                  <i />
                </header>
                <div>
                  <aside />
                  <nav />
                  <main />
                </div>
              </div>
              <h3>Desktop app reference</h3>
              <p>
                Unified workspace, companion behavior, connections, Ask Claire, contact detail, and
                component states.
              </p>
              <em>
                Open desktop system <HeroIcon name="arrow-right" />
              </em>
            </Link>
            <Link className="reference-card plugin-ref" href="/mockups/plugins">
              <div className="ref-meta">
                <span>03</span>
                <b>PLUGINS</b>
              </div>
              <div className="mini-flow">
                <article>
                  <HeroIcon name="chat" />
                  <span>Conversation</span>
                </article>
                <HeroIcon name="arrow-right" />
                <article className="accent">
                  <HeroIcon name="sparkles" />
                  <span>Approved action</span>
                </article>
              </div>
              <h3>Plugin library reference</h3>
              <p>
                Discovery, permissions, automation builder, contextual approvals, receipts, and
                developer trust.
              </p>
              <em>
                Open plugin system <HeroIcon name="arrow-right" />
              </em>
            </Link>
            <Link className="reference-card system-ref" href="/docs">
              <div className="ref-meta">
                <span>04</span>
                <b>DOCS</b>
              </div>
              <div className="token-preview">
                <i />
                <i />
                <i />
                <i />
                <div>
                  <b>Aa</b>
                  <span>24 / 16 / 12</span>
                </div>
              </div>
              <h3>Contributor documentation</h3>
              <p>Repository setup, architecture, plugins, contribution workflow, and roadmap.</p>
              <em>
                Open docs <HeroIcon name="arrow-right" />
              </em>
            </Link>
          </div>
        </section>
        <section className="architecture-section" id="architecture">
          <header className="section-heading inverse">
            <div>
              <div className="kicker">SYSTEM ARCHITECTURE</div>
              <h2>
                One message plane.
                <br />
                Many product surfaces.
              </h2>
            </div>
            <p>
              Claire normalizes network events through Matrix, stores user-owned product state, and
              exposes one authenticated API to mobile, desktop, automation, and AI systems.
            </p>
          </header>
          <div className="architecture-map">
            <article>
              <small>CLIENTS</small>
              <div>
                <span>Expo mobile</span>
                <span>RN macOS</span>
                <span>Web references</span>
              </div>
            </article>
            <HeroIcon name="arrow-right" />
            <article className="core">
              <small>CLAIRE CORE</small>
              <div>
                <span>Bun API</span>
                <span>Policy + queues</span>
                <span>AI layer</span>
              </div>
            </article>
            <HeroIcon name="arrow-right" />
            <article>
              <small>DATA PLANE</small>
              <div>
                <span>Synapse + mautrix</span>
                <span>Supabase</span>
                <span>Redis</span>
              </div>
            </article>
          </div>
          <div className="architecture-links">
            <Link href="/docs/architecture/overview">
              <b>Architecture overview</b>
              <span>Mobile, desktop, API, Matrix, and plugins.</span>
            </Link>
            <Link href="/docs/guides/plugins">
              <b>Plugin guide</b>
              <span>Create and test a local plugin with fixtures.</span>
            </Link>
            <Link href="/docs/getting-started/repository-setup">
              <b>Repository setup</b>
              <span>Mock mode without third-party accounts.</span>
            </Link>
            <Link href="/docs/contributing/workflow">
              <b>Contribution workflow</b>
              <span>DCO, tests, and review.</span>
            </Link>
          </div>
        </section>
        <section className="build-section" id="build">
          <header className="section-heading">
            <div>
              <div className="kicker">BUILD CLAIRE</div>
              <h2>Choose a contribution lane.</h2>
            </div>
            <p>
              The best first contribution is a narrow, testable improvement with a clear user
              outcome—not a new abstraction searching for a problem.
            </p>
          </header>
          <div className="build-grid">
            <article>
              <span>01</span>
              <HeroIcon name="phone" size="xl" />
              <h3>Mobile experience</h3>
              <p>Expo Router screens, conversation interaction, accessibility, and design-system primitives.</p>
              <a href="https://github.com/l2succes/claire/tree/main/mobile">Open mobile/</a>
            </article>
            <article>
              <span>02</span>
              <HeroIcon name="desktop" size="xl" />
              <h3>Desktop client</h3>
              <p>React Native macOS, keyboard-first workflows, local bridge health, and dense workspace patterns.</p>
              <a href="https://github.com/l2succes/claire/tree/main/desktop">Open desktop/</a>
            </article>
            <article>
              <span>03</span>
              <HeroIcon name="chat" size="xl" />
              <h3>Messaging connectors</h3>
              <p>Matrix event normalization, authentication, sync recovery, media, and network capability definitions.</p>
              <Link href="/docs/product/roadmap">Read the roadmap</Link>
            </article>
            <article>
              <span>04</span>
              <HeroIcon name="sparkles" size="xl" />
              <h3>AI and plugins</h3>
              <p>Provider-neutral inference, Ask Claire, typed tools, permissions, approvals, and auditable automation.</p>
              <Link href="/docs/guides/plugins">Read the plugin guide</Link>
            </article>
          </div>
          <div className="build-checklist">
            <div>
              <b>1</b>
              <span>
                <strong>Run locally</strong>Confirm existing behavior.
              </span>
            </div>
            <div>
              <b>2</b>
              <span>
                <strong>Find the reference</strong>Match product language.
              </span>
            </div>
            <div>
              <b>3</b>
              <span>
                <strong>Build the smallest slice</strong>Include edge states.
              </span>
            </div>
            <div>
              <b>4</b>
              <span>
                <strong>Prove it</strong>Test and update references.
              </span>
            </div>
          </div>
        </section>
        <section className="community-section" id="community">
          <div>
            <div className="kicker">DEVELOPER COMMUNITY</div>
            <h2>
              Build in public.
              <br />
              Operate with care.
            </h2>
            <p>
              The community can make Claire broader and more trustworthy: connectors for underserved
              networks, local-first deployments, plugins for real workflows, translations,
              accessibility, and deeper platform-native experiences.
            </p>
            <div className="community-actions">
              <a href="https://github.com/l2succes/claire/issues">Find an issue</a>
              <a href="https://github.com/l2succes/claire">Watch the repository</a>
            </div>
          </div>
          <aside>
            <small>COMMUNITY COMPACT</small>
            <ul>
              <li>
                <HeroIcon name="check-circle" />
                <span>User consent before automation</span>
              </li>
              <li>
                <HeroIcon name="check-circle" />
                <span>Honest availability and privacy claims</span>
              </li>
              <li>
                <HeroIcon name="check-circle" />
                <span>Typed interfaces and recoverable actions</span>
              </li>
              <li>
                <HeroIcon name="check-circle" />
                <span>Accessibility is product behavior</span>
              </li>
            </ul>
          </aside>
        </section>
      </main>
      <footer className="dev-footer">
        <Link className="dev-brand" href="/developers">
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
          <span>Claire</span>
          <b>Developer</b>
        </Link>
        <p>Open references for an AI-native multi-chat client.</p>
        <div>
          <Link href="/">Claire</Link>
          <Link href="/business">Business</Link>
          <Link href="/security">Security</Link>
          <a href="https://github.com/l2succes/claire">GitHub</a>
        </div>
      </footer>
    </>
  );
}
