// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroIcon } from '@/components/site/HeroIcon';
import { PlatformIcon } from '@/components/site/PlatformMark';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import '@/styles/developer.css';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'Claire developer hub: run the stack locally, read the architecture, build a plugin, and pick a contribution lane.',
};

const subnav = [
  { href: '#start', label: 'Start' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#plugins', label: 'Plugins' },
  { href: '#references', label: 'References' },
  { href: '#contribute', label: 'Contribute' },
] as const;

const facts = [
  ['LICENSE', 'AGPL-3.0 server · Apache-2.0 clients'],
  ['RUNTIME', 'Bun · Expo · React Native macOS'],
  ['MESSAGE PLANE', 'Synapse + mautrix bridges'],
  ['FIRST RUN', 'Mock mode · no cloud accounts'],
] as const;

const lifecycle = [
  ['Network event', 'WhatsApp, Telegram, or Instagram emits a message.'],
  ['mautrix bridge', 'The bridge translates it into a Matrix room event.'],
  ['Event converter', 'Claire normalizes it into a UnifiedMessage.'],
  ['Postgres + realtime', 'Upserted on the platform message id, then broadcast.'],
  ['Every client', 'Mobile, desktop, and the AI layer read the same record.'],
] as const;

const risks = [
  {
    id: 'read',
    approval: 'approval: never',
    body: 'Reads context only. No side effects to undo.',
  },
  {
    id: 'low_write',
    approval: 'approval: configurable',
    body: 'Writes inside Claire. Reversible and idempotent.',
  },
  {
    id: 'external_write',
    approval: 'approval: always',
    body: 'Touches a third-party system a person can see.',
  },
  {
    id: 'destructive',
    approval: 'approval: always',
    body: 'Cannot be undone. Needs an explicit human yes.',
  },
] as const;

const lanes = [
  {
    tint: 'lane-lime',
    number: '01',
    icon: 'phone',
    title: 'Mobile experience',
    body: 'Expo Router screens, conversation interaction, accessibility, and design-system primitives.',
    tags: ['Expo SDK 55', 'React 19', 'Bridgeless'],
    href: 'https://github.com/l2succes/claire/tree/main/mobile',
    cta: 'Open mobile/',
    external: true,
  },
  {
    tint: 'lane-sky',
    number: '02',
    icon: 'desktop',
    title: 'Desktop client',
    body: 'React Native macOS, keyboard-first workflows, local bridge health, and dense workspace patterns.',
    tags: ['RN macOS', 'Bridge health', 'Shortcuts'],
    href: 'https://github.com/l2succes/claire/tree/main/desktop',
    cta: 'Open desktop/',
    external: true,
  },
  {
    tint: 'lane-blush',
    number: '03',
    icon: 'chat',
    title: 'Messaging connectors',
    body: 'Matrix event normalization, authentication, sync recovery, media, and network capability definitions.',
    tags: ['Matrix', 'mautrix', 'Recovery'],
    href: '/docs/product/roadmap',
    cta: 'Read the roadmap',
    external: false,
  },
  {
    tint: 'lane-lavender',
    number: '04',
    icon: 'sparkles',
    title: 'AI and plugins',
    body: 'Provider-neutral inference, Ask Claire, typed tools, permissions, approvals, and auditable automation.',
    tags: ['Typed tools', 'Receipts', 'BYO model'],
    href: '/docs/guides/plugins',
    cta: 'Read the plugin guide',
    external: false,
  },
] as const;

const compact = [
  ['User consent before automation', 'A person approves anything a contact can see.'],
  ['Honest availability claims', 'If a connector can drop, the UI says so.'],
  ['Typed interfaces, recoverable actions', 'Every action carries a receipt and an undo path.'],
  ['Accessibility is product behavior', 'Not a follow-up ticket.'],
] as const;

export default function DevelopersPage() {
  return (
    <div className="dev-page">
      <SiteHeader active="Developers" />
      <nav className="dev-subnav" aria-label="Developer hub sections">
        <div className="dev-subnav-inner shell">
          <span className="dev-subnav-label">
            <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
            Developer hub
          </span>
          <div className="dev-subnav-links">
            {subnav.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </div>
          <a className="dev-subnav-repo" href="https://github.com/l2succes/claire">
            l2succes/claire <HeroIcon name="external" />
          </a>
        </div>
      </nav>
      <main>
        <section className="dev-hero shell">
          <div className="dev-hero-copy">
            <div className="eyebrow">
              <span className="status-dot" />
              Open product reference
            </div>
            <h1 className="marketing-title">
              Build the place
              <br />
              where conversations
              <br />
              <span className="claire-underline">do things.</span>
            </h1>
            <p>
              Claire is an AI-native, multi-network messenger with open references for mobile,
              desktop, connectors, and conversation plugins. Clone it, run the whole stack in mock
              mode, and make one part dramatically better.
            </p>
            <div className="dev-hero-actions">
              <a className="button button-dark" href="#start">
                Start building <HeroIcon name="arrow-right" />
              </a>
              <Link className="text-link" href="/docs">
                Read the docs <HeroIcon name="arrow-right" />
              </Link>
            </div>
            <ul className="dev-networks" aria-label="Networks contributors can extend">
              {['whatsapp', 'telegram', 'instagram', 'imessage', 'discord', 'slack'].map((id) => (
                <li key={id}>
                  <PlatformIcon id={id} size="md" />
                </li>
              ))}
              <li className="dev-networks-more">+10 in the catalog</li>
            </ul>
          </div>
          <div className="dev-hero-art">
            <span className="dev-blob" aria-hidden="true" />
            <span className="dev-orbit" aria-hidden="true" />
            <article className="dev-console">
              <header>
                <i />
                <i />
                <i />
                <div className="dev-console-tabs">
                  <b>terminal</b>
                  <span>plugin.ts</span>
                </div>
              </header>
              <pre>
                <code>
                  <span className="tok-prompt">$</span> git clone
                  https://github.com/l2succes/claire.git{'\n'}
                  <span className="tok-prompt">$</span> cd claire && bun run setup{'\n'}
                  <span className="tok-dim">✓ wrote .env · PLATFORM_MODE=mock</span>
                  {'\n'}
                  <span className="tok-prompt">$</span> bun run dev{'\n'}
                  <span className="tok-ok">✓ server</span>
                  <span className="tok-dim"> http://localhost:3001</span>
                  {'\n'}
                  <span className="tok-ok">✓ mobile</span>
                  <span className="tok-dim"> expo · press i for iOS</span>
                  {'\n'}
                  <span className="tok-prompt">$</span> <span className="tok-caret">▍</span>
                </code>
              </pre>
              <footer>
                <span>4 commands · no cloud account</span>
                <b>LOCAL STACK</b>
              </footer>
            </article>
            <div className="dev-float dev-float-one">
              <span className="dev-float-mark">
                <HeroIcon name="check-circle" />
              </span>
              <div>
                <b>bun test examples/plugins</b>
                <small>12 pass · 0 fail</small>
              </div>
            </div>
            <div className="dev-float dev-float-two">
              <span className="dev-float-mark is-lime">
                <HeroIcon name="sparkles" />
              </span>
              <div>
                <b>Plugin approved</b>
                <small>calendar.events.create · receipt written</small>
              </div>
            </div>
          </div>
        </section>

        <section className="dev-facts" aria-label="Repository facts">
          <div className="shell">
            {facts.map(([label, value]) => (
              <article key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </article>
            ))}
          </div>
        </section>

        <section className="dev-start shell" id="start">
          <header className="section-heading">
            <div>
              <div className="kicker">RUN IT LOCALLY</div>
              <h2>
                The whole stack,
                <br />
                in four commands.
              </h2>
            </div>
            <p>
              Setup writes local environment files and starts in mock mode, so the first run needs no
              WhatsApp session, no Supabase project, and no API keys.
            </p>
          </header>
          <div className="dev-start-grid">
            <ol className="dev-steps">
              <li>
                <span>1</span>
                <div>
                  <b>Clone and install</b>
                  <code>git clone https://github.com/l2succes/claire.git</code>
                  <p>Bun workspaces cover mobile, desktop, server, website, packages, and examples.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <b>Generate local config</b>
                  <code>bun run setup</code>
                  <p>Writes <em>.env</em> files and selects mock mode for the messaging platform.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <b>Run server and mobile</b>
                  <code>bun run dev</code>
                  <p>Bun API on port 3001 plus the Expo client, watching in parallel.</p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <b>Prove it works</b>
                  <code>bun run test:plugins</code>
                  <p>Fixture-backed plugin tests run without a network call.</p>
                </div>
              </li>
            </ol>
            <aside className="dev-start-aside">
              <article className="dev-note dev-note-lime">
                <HeroIcon name="server" size="lg" />
                <h3>When you want real bridges</h3>
                <p>
                  <code>bun run docker:up</code> brings up Supabase, Synapse, Redis, and the mautrix
                  bridges. Switch <code>PLATFORM_MODE</code> to <code>matrix</code> and pair a
                  network.
                </p>
              </article>
              <article className="dev-note dev-note-sky">
                <HeroIcon name="desktop" size="lg" />
                <h3>Other surfaces</h3>
                <ul>
                  <li>
                    <code>bun run dev:desktop</code>
                    <span>React Native macOS</span>
                  </li>
                  <li>
                    <code>bun run dev:website</code>
                    <span>This site and the docs</span>
                  </li>
                  <li>
                    <code>bun run storybook</code>
                    <span>Design-system primitives</span>
                  </li>
                </ul>
              </article>
              <Link className="dev-note-link" href="/docs/getting-started/repository-setup">
                Full repository setup <HeroIcon name="arrow-right" />
              </Link>
            </aside>
          </div>
        </section>

        <section className="dev-arch" id="architecture">
          <div className="shell">
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
                exposes one authenticated API to mobile, desktop, automation, and AI.
              </p>
            </header>
            <div className="dev-map">
              <article className="dev-map-lane">
                <div className="dev-map-head">
                  <HeroIcon name="phone" />
                  <small>CLIENTS</small>
                </div>
                <span>Expo mobile</span>
                <span>React Native macOS</span>
                <span>Web references</span>
              </article>
              <div className="dev-map-rail" aria-hidden="true">
                <em>authenticated API</em>
                <i />
              </div>
              <article className="dev-map-lane is-core">
                <div className="dev-map-head">
                  <HeroIcon name="server" />
                  <small>CLAIRE CORE</small>
                </div>
                <span>Bun API · :3001</span>
                <span>Policy, queues, receipts</span>
                <span>Provider-neutral AI layer</span>
                <span>Plugin runtime</span>
              </article>
              <div className="dev-map-rail" aria-hidden="true">
                <em>normalized events</em>
                <i />
              </div>
              <article className="dev-map-lane">
                <div className="dev-map-head">
                  <HeroIcon name="cloud" />
                  <small>DATA PLANE</small>
                </div>
                <span>Synapse + mautrix</span>
                <span>Supabase · Postgres</span>
                <span>Redis sessions</span>
              </article>
            </div>
            <div className="dev-lifecycle">
              <div className="dev-lifecycle-label">
                <span className="kicker">ONE MESSAGE, END TO END</span>
                <p>The path every inbound message takes before a client renders it.</p>
              </div>
              <ol>
                {lifecycle.map(([title, body], index) => (
                  <li key={title}>
                    <b>{String(index + 1).padStart(2, '0')}</b>
                    <div>
                      <strong>{title}</strong>
                      <span>{body}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="dev-arch-links">
              <Link href="/docs/architecture/overview">
                <b>Architecture overview</b>
                <span>Mobile, desktop, API, Matrix, and plugins.</span>
                <HeroIcon name="arrow-right" />
              </Link>
              <Link href="/docs/guides/self-hosting">
                <b>Self-hosting guide</b>
                <span>Run the Docker stack on your own host.</span>
                <HeroIcon name="arrow-right" />
              </Link>
              <Link href="/docs/reference/environment">
                <b>Environment reference</b>
                <span>Every variable the stack reads.</span>
                <HeroIcon name="arrow-right" />
              </Link>
              <Link href="/docs/contributing/workflow">
                <b>Contribution workflow</b>
                <span>DCO, tests, and review.</span>
                <HeroIcon name="arrow-right" />
              </Link>
            </div>
          </div>
        </section>

        <section className="dev-plugins shell" id="plugins">
          <header className="section-heading">
            <div>
              <div className="kicker">PLUGIN SDK</div>
              <h2>
                Typed actions.
                <br />
                Visible permissions.
              </h2>
            </div>
            <p>
              A plugin declares what it can do, how risky each action is, and whether a person has to
              approve it. Claire refuses to load an action without a handler.
            </p>
          </header>
          <div className="dev-plugin-grid">
            <article className="dev-code">
              <header>
                <div className="dev-code-tabs">
                  <b>calendar/src/index.ts</b>
                  <span>@claire/plugin-sdk</span>
                </div>
                <small>TYPESCRIPT</small>
              </header>
              <pre>
                <code>
                  <span className="tok-key">import</span> {'{ definePlugin }'}{' '}
                  <span className="tok-key">from</span>{' '}
                  <span className="tok-str">&apos;@claire/plugin-sdk&apos;</span>;{'\n\n'}
                  <span className="tok-key">export const</span>{' '}
                  <span className="tok-var">calendarPlugin</span> ={' '}
                  <span className="tok-fn">definePlugin</span>({'{'}
                  {'\n'}
                  {'  '}manifest: {'{'}
                  {'\n'}
                  {'    '}id: <span className="tok-str">&apos;com.claire.example.calendar&apos;</span>
                  ,{'\n'}
                  {'    '}capabilities: [{'{'}
                  {'\n'}
                  {'      '}id: <span className="tok-str">&apos;calendar.events.create&apos;</span>,
                  {'\n'}
                  {'      '}kind: <span className="tok-str">&apos;action&apos;</span>,{'\n'}
                  {'      '}risk: <span className="tok-str">&apos;low_write&apos;</span>,{'\n'}
                  {'      '}approval: <span className="tok-str">&apos;always&apos;</span>,{'\n'}
                  {'      '}reversible: <span className="tok-key">true</span>,{'\n'}
                  {'    '}
                  {'}'}],{'\n'}
                  {'    '}triggers: [{'{'} event:{' '}
                  <span className="tok-str">&apos;schedule.detected&apos;</span> {'}'}],{'\n'}
                  {'  '}
                  {'}'},{'\n'}
                  {'  '}handlers: {'{'}
                  {'\n'}
                  {'    '}
                  <span className="tok-key">async</span>{' '}
                  <span className="tok-str">&apos;calendar.events.create&apos;</span>(request) {'{'}
                  {'\n'}
                  {'      '}
                  <span className="tok-key">return</span> {'{'} ok:{' '}
                  <span className="tok-key">true</span>, receiptId:{' '}
                  <span className="tok-fn">createReceiptId</span>() {'}'};{'\n'}
                  {'    '}
                  {'}'},{'\n'}
                  {'  '}
                  {'}'},{'\n'}
                  {'}'});
                </code>
              </pre>
              <footer>
                <code>bun run plugin:create</code>
                <span>scaffolds this with fixtures and a test</span>
              </footer>
            </article>
            <div className="dev-plugin-side">
              <div className="dev-ladder">
                <small>THE RISK LADDER</small>
                <p>Every capability declares one of four levels. The level sets the default approval.</p>
                <ul>
                  {risks.map((risk, index) => (
                    <li className={`rung rung-${index}`} key={risk.id}>
                      <code>{risk.id}</code>
                      <b>{risk.approval}</b>
                      <span>{risk.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <article className="dev-approval">
                <header>
                  <span className="dev-approval-mark">
                    <HeroIcon name="sparkles" />
                  </span>
                  <div>
                    <small>CLAIRE WANTS TO RUN AN ACTION</small>
                    <b>Create “Design review” · Thu 11:00</b>
                  </div>
                </header>
                <dl>
                  <div>
                    <dt>Plugin</dt>
                    <dd>Example Calendar · community</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>low_write · reversible</dd>
                  </div>
                  <div>
                    <dt>Reads</dt>
                    <dd>This thread only</dd>
                  </div>
                </dl>
                <div className="dev-approval-actions">
                  <button type="button">Approve once</button>
                  <span>Always allow</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="dev-refs shell" id="references">
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
          <div className="dev-ref-grid">
            <Link className="dev-ref dev-ref-mobile" href="/mockups/mobile">
              <div className="dev-ref-meta">
                <span>01</span>
                <b>MOBILE</b>
              </div>
              <div className="dev-ref-art">
                <div className="mini-phone">
                  <i />
                  <small>9:41</small>
                  <h4>Good morning.</h4>
                  <p>Three conversations need you.</p>
                  <span className="row" />
                  <span className="row is-short" />
                  <span className="row is-lime" />
                </div>
              </div>
              <h3>Mobile app reference</h3>
              <p>Core loop, Ask Claire, inbox, promises, people, memory, settings, and setup states.</p>
              <em>
                Open 14+ screens <HeroIcon name="arrow-right" />
              </em>
            </Link>
            <Link className="dev-ref dev-ref-desktop" href="/mockups/desktop">
              <div className="dev-ref-meta">
                <span>02</span>
                <b>DESKTOP</b>
              </div>
              <div className="dev-ref-art">
                <div className="mini-desktop">
                  <header>
                    <i />
                    <i />
                    <i />
                  </header>
                  <div>
                    <aside />
                    <nav>
                      <span />
                      <span />
                      <span />
                    </nav>
                    <main>
                      <span />
                      <span className="is-lime" />
                    </main>
                  </div>
                </div>
              </div>
              <h3>Desktop app reference</h3>
              <p>Unified workspace, companion behavior, connections, Ask Claire, and component states.</p>
              <em>
                Open desktop system <HeroIcon name="arrow-right" />
              </em>
            </Link>
            <Link className="dev-ref dev-ref-plugins" href="/mockups/plugins">
              <div className="dev-ref-meta">
                <span>03</span>
                <b>PLUGINS</b>
              </div>
              <div className="dev-ref-art">
                <div className="mini-flow">
                  <article>
                    <HeroIcon name="chat" />
                    <span>Conversation</span>
                  </article>
                  <i aria-hidden="true" />
                  <article className="accent">
                    <HeroIcon name="sparkles" />
                    <span>Approved action</span>
                  </article>
                </div>
              </div>
              <h3>Plugin library reference</h3>
              <p>Discovery, permissions, automation builder, approvals, receipts, and developer trust.</p>
              <em>
                Open plugin system <HeroIcon name="arrow-right" />
              </em>
            </Link>
            <Link className="dev-ref dev-ref-docs" href="/docs">
              <div className="dev-ref-meta">
                <span>04</span>
                <b>DOCS</b>
              </div>
              <div className="dev-ref-art">
                <div className="mini-docs">
                  <span className="swatch swatch-lime" />
                  <span className="swatch swatch-sky" />
                  <span className="swatch swatch-blush" />
                  <span className="swatch swatch-ink" />
                  <div>
                    <b>Aa</b>
                    <small>Inter · DM Mono</small>
                  </div>
                </div>
              </div>
              <h3>Contributor documentation</h3>
              <p>Repository setup, architecture, plugins, testing, contribution workflow, and roadmap.</p>
              <em>
                Open docs <HeroIcon name="arrow-right" />
              </em>
            </Link>
          </div>
        </section>

        <section className="dev-lanes shell" id="contribute">
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
          <div className="dev-lane-grid">
            {lanes.map((lane) => (
              <article className={`dev-lane ${lane.tint}`} key={lane.title}>
                <div className="dev-lane-top">
                  <span className="dev-lane-number">{lane.number}</span>
                  <HeroIcon name={lane.icon} size="lg" />
                </div>
                <h3>{lane.title}</h3>
                <p>{lane.body}</p>
                <div className="dev-lane-tags">
                  {lane.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                {lane.external ? (
                  <a href={lane.href}>
                    {lane.cta} <HeroIcon name="arrow-right" />
                  </a>
                ) : (
                  <Link href={lane.href}>
                    {lane.cta} <HeroIcon name="arrow-right" />
                  </Link>
                )}
              </article>
            ))}
          </div>
          <ol className="dev-checklist">
            <li>
              <b>1</b>
              <strong>Run locally</strong>
              <span>Confirm the existing behavior first.</span>
            </li>
            <li>
              <b>2</b>
              <strong>Find the reference</strong>
              <span>Match the product language already in use.</span>
            </li>
            <li>
              <b>3</b>
              <strong>Build the smallest slice</strong>
              <span>Include the empty, error, and offline states.</span>
            </li>
            <li>
              <b>4</b>
              <strong>Prove it</strong>
              <span>Add a test and update the reference you changed.</span>
            </li>
          </ol>
        </section>

        <section className="dev-community shell">
          <div className="dev-community-copy">
            <div className="kicker">DEVELOPER COMMUNITY</div>
            <h2>
              Build in public.
              <br />
              <span className="claire-underline">Operate with care.</span>
            </h2>
            <p>
              The community can make Claire broader and more trustworthy: connectors for underserved
              networks, local-first deployments, plugins for real workflows, translations,
              accessibility, and deeper platform-native experiences.
            </p>
            <div className="dev-community-actions">
              <a className="button button-dark" href="https://github.com/l2succes/claire/issues">
                Find an issue <HeroIcon name="arrow-right" />
              </a>
              <a className="text-link" href="https://github.com/l2succes/claire">
                Watch the repository <HeroIcon name="external" />
              </a>
            </div>
          </div>
          <aside className="dev-compact">
            <small>COMMUNITY COMPACT</small>
            <ul>
              {compact.map(([title, body]) => (
                <li key={title}>
                  <HeroIcon name="check-circle" />
                  <div>
                    <b>{title}</b>
                    <span>{body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </main>
      <SiteFooter note="Open references for an AI-native multi-chat client." />
    </div>
  );
}
