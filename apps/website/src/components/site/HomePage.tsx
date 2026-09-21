// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { HeroIcon } from '@/components/site/HeroIcon';
import { HeroMobilePreview, MobileStatusBar } from '@/components/site/HeroMobilePreview';
import { PlatformCatalog, PlatformRail } from '@/components/site/PlatformCatalog';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { WaitlistForm } from '@/components/site/WaitlistForm';

export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <section className="hero shell">
          <div className="eyebrow">
            <span className="status-dot" />
            Building Claire in public
          </div>
          <h1 className="marketing-title">
            All your chats.
            <br />
            <span className="claire-underline">One AI.</span>
          </h1>
          <p className="hero-copy">
            Bring WhatsApp, Telegram, Instagram, and more into one client. Search your conversations,
            get help that understands the relationship, and keep track of what you promised.
          </p>
          <div className="hero-actions" id="waitlist">
            <WaitlistForm source="homepage_hero" />
          </div>
          <div className="hero-art" aria-label="Claire application preview">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <article className="app-window">
              <aside className="app-sidebar">
                <div className="mini-brand is-logo">
                  <img src="/assets/brand/claire-kept-thread-flipped-paper-dot.svg" alt="Claire" />
                </div>
                <button className="nav-icon active" aria-label="Home">
                  <HeroIcon name="home" />
                </button>
                <button className="nav-icon" aria-label="Inbox">
                  <HeroIcon name="inbox" />
                </button>
                <button className="nav-icon" aria-label="Ask Claire">
                  <img src="/assets/brand/claire-kept-thread-flipped-reverse.svg" alt="" width={24} height={24} style={{ display: 'block', margin: 'auto' }} />
                </button>
                <button className="nav-icon" aria-label="Promises">
                  <HeroIcon name="promises" />
                </button>
                <div className="sidebar-spacer" />
                <div className="avatar">LM</div>
              </aside>
              <section className="conversation-list">
                <div className="app-heading">
                  <span>Inbox</span>
                  <button aria-label="New message">
                    <HeroIcon name="compose" />
                  </button>
                </div>
                <label className="search">
                  <HeroIcon name="search" />
                  <input aria-label="Search conversations" placeholder="Search everything" />
                </label>
                <div className="filter-row">
                  <button className="selected">All</button>
                  <button>Unread</button>
                  <button>Promises</button>
                </div>
                <div className="conversation selected">
                  <div className="avatar avatar-maya">MK</div>
                  <div>
                    <b>Maya Kim</b>
                    <p>Can you send that deck?</p>
                  </div>
                  <time>2m</time>
                </div>
                <div className="conversation">
                  <div className="avatar avatar-noah">NO</div>
                  <div>
                    <b>Noah Oliver</b>
                    <p>Voice message · 0:24</p>
                  </div>
                  <time>18m</time>
                </div>
                <div className="conversation">
                  <div className="avatar avatar-studio">ST</div>
                  <div>
                    <b>Studio team</b>
                    <p>Lea: latest screens are in</p>
                  </div>
                  <time>1h</time>
                </div>
              </section>
              <section className="message-panel">
                <div className="message-header">
                  <div className="avatar avatar-maya">MK</div>
                  <div>
                    <b>Maya Kim</b>
                    <small>
                      <span className="online" />
                      WhatsApp · active now
                    </small>
                  </div>
                  <button aria-label="More">
                    <HeroIcon name="more" />
                  </button>
                </div>
                <div className="messages">
                  <div className="date-chip">Today</div>
                  <div className="bubble incoming">
                    Hey! Are we still good for the product review tomorrow?
                  </div>
                  <div className="bubble outgoing">Absolutely. I’ll send the updated deck before 10.</div>
                  <div className="promise-card">
                    <span>
                      <HeroIcon name="chat" />
                    </span>
                    <div>
                      <small>CLAIRE CAUGHT A PROMISE</small>
                      <b>Send Maya the updated deck</b>
                      <p>Tomorrow · before 10:00 AM</p>
                    </div>
                    <button>Track</button>
                  </div>
                  <div className="composer">
                    <button aria-label="Add attachment">
                      <HeroIcon name="plus" />
                    </button>
                    <span>Write a message…</span>
                    <button className="send" aria-label="Send">
                      <HeroIcon name="send" />
                    </button>
                  </div>
                </div>
              </section>
              <aside className="context-panel">
                <small>CLAIRE AI · CROSS-CHAT CONTEXT</small>
                <h3>Ask across every conversation.</h3>
                <div className="brief">
                  <span className="spark">
                    <HeroIcon name="chat" />
                  </span>
                  <p>
                    <b>AI brief</b>
                    <br />
                    Maya is waiting on the Q3 deck. Your review is tomorrow at 11, and you promised
                    to send it by 10.
                  </p>
                </div>
                <div className="context-label">OPEN PROMISE</div>
                <div className="task">
                  <span>○</span>
                  <p>
                    <b>Send updated deck</b>
                    <br />
                    <small>Due tomorrow, 10:00</small>
                  </p>
                </div>
                <button className="outline-button">View contact memory</button>
              </aside>
            </article>
            <HeroMobilePreview />
          </div>
        </section>

        <section className="platform-rail-section" aria-labelledby="platform-rail-title">
          <div className="platform-rail-heading shell">
            <span className="kicker" id="platform-rail-title">
              AVAILABLE NOW + ROADMAP
            </span>
            <span>16 networks. One client. One AI layer.</span>
          </div>
          <div className="platform-rail-window">
            <PlatformRail />
          </div>
        </section>

        <section className="features shell" id="product">
          <div className="section-heading">
            <div>
              <div className="kicker">ONE CLIENT. A USEFUL AI.</div>
              <h2>
                Your chats become one
                <br />
                intelligent system.
              </h2>
            </div>
            <p>
              Claire brings your chat networks together and gives its AI the context to help you find,
              understand, reply, and follow through.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature-card card-lime">
              <span className="card-number">01</span>
              <div className="inbox-stack">
                <div />
                <div />
                <div />
                <span>12</span>
              </div>
              <div>
                <h3>Every network, one client.</h3>
                <p>Read and reply across connected platforms from one consistent inbox.</p>
              </div>
            </article>
            <article className="feature-card card-sky">
              <span className="card-number">02</span>
              <div className="ai-demo">
                <span>
                  <HeroIcon name="chat" />
                </span>
                <p>“Tell Maya the deck is ready and ask if 11 still works.”</p>
                <button>Use reply</button>
              </div>
              <div>
                <h3>An AI that knows the thread.</h3>
                <p>Search across chats and get contextual replies shaped by the conversation.</p>
              </div>
            </article>
            <article className="feature-card card-blush">
              <span className="card-number">03</span>
              <div className="promise-demo">
                <span>
                  <HeroIcon name="check-circle" />
                </span>
                <div>
                  <small>UP NEXT</small>
                  <b>Send Q3 deck</b>
                  <p>Maya · tomorrow, 10:00</p>
                </div>
              </div>
              <div>
                <h3>Keep promises moving.</h3>
                <p>
                  Claire notices commitments in your chats and turns them into gentle follow-through.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="connections shell" id="connections">
          <div className="connections-heading">
            <div>
              <div className="kicker">EVERYONE IS SOMEWHERE DIFFERENT</div>
              <h2>
                Your people aren’t all in one app.
                {' '}
                <span>Claire can be.</span>
              </h2>
            </div>
            <div className="connections-intro">
              <p>
                Start today with WhatsApp, Telegram, and Instagram. See exactly what needs a desktop,
                what keeps running in the cloud, and what is still on our roadmap.
              </p>
              <div className="status-key" aria-label="Platform availability legend">
                <span>
                  <i className="status-dot status-dot-available" />
                  Available
                </span>
                <span>
                  <i className="status-dot status-dot-planned" />
                  Planned
                </span>
              </div>
            </div>
          </div>
          <PlatformCatalog />
          <p className="icon-source-note">
            Network marks come from{' '}
            <a href="https://simpleicons.org/" target="_blank" rel="noreferrer">
              Simple Icons
            </a>{' '}
            and{' '}
            <a href="https://iconify.design/" target="_blank" rel="noreferrer">
              Iconify
            </a>
            . IRC uses a generic protocol symbol because it has no single vendor mark. Trademarks
            belong to their respective owners; usage must be verified before release.
          </p>

          <div className="connection-guide" aria-labelledby="connection-guide-title">
            <div className="guide-heading">
              <div className="kicker">THREE WAYS TO CONNECT</div>
              <h2 id="connection-guide-title">
                A clear setup path,
                <br />
                before you hand over access.
              </h2>
              <p>
                Claire Desktop authorizes a connection when a network needs a browser or a local
                device. The Matrix bridge—not the interface—does the ongoing syncing.
              </p>
            </div>
            <div className="connection-flow-grid">
              <article className="connection-flow flow-phone">
                <div className="flow-topline">
                  <span>01</span>
                  <b>No desktop required</b>
                </div>
                <div className="flow-icon" aria-hidden="true">
                  <HeroIcon name="phone" />
                </div>
                <h3>Pair from your phone.</h3>
                <p>
                  Scan a code or approve a linked device. Claire keeps the selected bridge online
                  afterward.
                </p>
                <ol>
                  <li>
                    <span>1</span>Choose your network in Claire.
                  </li>
                  <li>
                    <span>2</span>Scan or approve from its mobile app.
                  </li>
                  <li>
                    <span>3</span>Watch recent conversations arrive.
                  </li>
                </ol>
                <div className="flow-platforms">
                  <span>WhatsApp</span>
                  <span>Telegram</span>
                  <span>Signal</span>
                  <span>Discord</span>
                </div>
              </article>
              <article className="connection-flow flow-desktop">
                <div className="flow-topline">
                  <span>02</span>
                  <b>Desktop setup once</b>
                </div>
                <div className="flow-icon" aria-hidden="true">
                  <HeroIcon name="desktop" />
                </div>
                <h3>Sign in with Claire Desktop.</h3>
                <p>
                  Use a contained sign-in window. Session material goes directly to your selected
                  bridge host.
                </p>
                <ol>
                  <li>
                    <span>1</span>Open the network inside Claire Desktop.
                  </li>
                  <li>
                    <span>2</span>Complete sign-in and any verification.
                  </li>
                  <li>
                    <span>3</span>Close the desktop after cloud handoff.
                  </li>
                </ol>
                <div className="flow-platforms">
                  <span>Instagram</span>
                  <span>Messenger</span>
                  <span>Slack</span>
                  <span>Google</span>
                  <span>LinkedIn</span>
                  <span>X</span>
                </div>
              </article>
              <article className="connection-flow flow-device">
                <div className="flow-topline">
                  <span>03</span>
                  <b>Device stays available</b>
                </div>
                <div className="flow-icon" aria-hidden="true">
                  <HeroIcon name="desktop" />
                </div>
                <h3>Keep the source device connected.</h3>
                <p>
                  Some networks depend on hardware you own. Claire makes its health and last sync
                  visible.
                </p>
                <ol>
                  <li>
                    <span>1</span>Grant only the requested local permissions.
                  </li>
                  <li>
                    <span>2</span>Let the companion run in the background.
                  </li>
                  <li>
                    <span>3</span>Get a clear warning when it goes offline.
                  </li>
                </ol>
                <div className="flow-platforms">
                  <span>iMessage · Mac</span>
                  <span>Google Messages · Android</span>
                </div>
              </article>
            </div>
          </div>

        </section>

        <section className="preview-section shell">
          <div className="preview-copy">
            <div className="kicker">AI ACROSS EVERY CHAT</div>
            <h2>Ask once. Search every conversation.</h2>
            <p>
              Claire searches connected networks as one conversation history, then answers with the
              people, messages, and context behind the result.
            </p>
            <ul>
              <li>
                <span className="preview-icon">
                  <HeroIcon name="check-circle" />
                </span>
                Cross-network AI search
              </li>
              <li>
                <span className="preview-icon">
                  <HeroIcon name="check-circle" />
                </span>
                Replies shaped by each relationship
              </li>
              <li>
                <span className="preview-icon">
                  <HeroIcon name="check-circle" />
                </span>
                Promises and follow-ups surfaced automatically
              </li>
            </ul>
          </div>
          <div className="phone-wrap">
            <div className="phone">
              <MobileStatusBar className="phone-top" />
              <div className="phone-greeting">
                <small>CLAIRE AI · ALL CHATS</small>
                <h3>What did I promise Maya?</h3>
                <p>Searching WhatsApp, Telegram, and Instagram…</p>
              </div>
              <div className="phone-card urgent">
                <span className="ai-mark">
                  <HeroIcon name="chat" />
                </span>
                <div>
                  <small>ANSWER WITH SOURCES</small>
                  <b>Send the Q3 deck before 10 tomorrow.</b>
                </div>
                <em>Open</em>
              </div>
              <div className="phone-section">
                <span>Found in your chats</span>
                <small>2 SOURCES</small>
              </div>
              <div className="phone-item">
                <i className="platform whatsapp">
                  <img src="https://cdn.simpleicons.org/whatsapp/ffffff" alt="" />
                </i>
                <p>
                  <b>WhatsApp · Maya Kim</b>
                  <br />
                  <small>Can you send that deck?</small>
                </p>
                <time>2m</time>
              </div>
              <div className="phone-item">
                <i className="check">
                  <HeroIcon name="check-circle" />
                </i>
                <p>
                  <b>Your reply</b>
                  <br />
                  <small>“I’ll send it before 10 tomorrow.”</small>
                </p>
                <time>now</time>
              </div>
              <div className="phone-card recap">
                <span className="ai-mark">
                  <HeroIcon name="chat" />
                </span>
                <div>
                  <small>NEXT STEP</small>
                  <b>Track this promise and draft the reply?</b>
                </div>
              </div>
              <div className="phone-tabs">
                <span>
                  <HeroIcon name="home" />
                </span>
                <span>
                  <HeroIcon name="inbox" />
                </span>
                <span className="phone-tab-ask">
                  <img src="/assets/brand/claire-mark-ink.svg" alt="Ask Claire" className="ask-claire-mark" />
                </span>
                <span>
                  <HeroIcon name="promises" />
                </span>
                <span>
                  <HeroIcon name="search" />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="pricing shell" id="pricing">
          <div className="pricing-heading">
            <div>
              <div className="kicker">ONE ACCOUNT. CLEAR COSTS.</div>
              <h2>
                Three plans.
                <br />
                <span className="claire-underline">One Loop.</span>
              </h2>
            </div>
            <p>
              Claire’s Loop reads every connected conversation and tells you what is still open. Your
              plan decides how often it runs.
            </p>
          </div>
          <div className="pricing-teaser-grid">
            <article className="pricing-teaser-card">
              <small>FREE</small>
              <strong>$0</strong>
              <b>
                <HeroIcon name="check-circle" />1 Loop run per week
              </b>
              <p>Up to five networks in one inbox, with search and reminders.</p>
              <Link className="button pricing-teaser-action" href="/#waitlist">
                Join free <HeroIcon name="arrow-right" />
              </Link>
            </article>
            <article className="pricing-teaser-card is-featured">
              <div className="pricing-teaser-flag">MOST POPULAR</div>
              <small>PLUS</small>
              <strong>
                $10<em>/mo</em>
              </strong>
              <b>
                <HeroIcon name="check-circle" />
                Up to 3 Loop runs per day
              </b>
              <p>Every network, the full AI, and a monthly Claire AI credit allowance.</p>
              <a
                className="button pricing-teaser-action"
                href="mailto:hello@claire.app?subject=Claire%20Plus"
              >
                Get Plus <HeroIcon name="arrow-right" />
              </a>
            </article>
            <article className="pricing-teaser-card">
              <small>PRO</small>
              <strong>
                $20<em>/mo</em>
              </strong>
              <b>
                <HeroIcon name="check-circle" />A Loop every morning
              </b>
              <p>Claire runs the Loop for you, on the best model tier, without being asked.</p>
              <a
                className="button pricing-teaser-action"
                href="mailto:hello@claire.app?subject=Claire%20Pro"
              >
                Get Pro <HeroIcon name="arrow-right" />
              </a>
            </article>
            <article className="pricing-teaser-card is-business">
              <small>ULTIMATE</small>
              <strong>Business</strong>
              <b>
                <HeroIcon name="check-circle" />
                Continuous Loop, with agents
              </b>
              <p>Plugins that act on what customers say—calendar, CRM, payments, and more.</p>
              <Link className="button pricing-teaser-action" href="/pricing#ultimate">
                Talk to us <HeroIcon name="arrow-right" />
              </Link>
            </article>
          </div>
          <div className="pricing-teaser-foot">
            <p>
              AI use is metered separately from the subscription, with a visible balance and a hard
              cap, so model costs stay predictable.
            </p>
            <Link className="button button-dark" href="/pricing">
              Compare all plans <HeroIcon name="arrow-right" />
            </Link>
          </div>
        </section>

        <section className="stories" id="stories">
          <div className="shell">
            <div className="kicker">PEOPLE HAVE ENOUGH TO JUGGLE</div>
            <h2>Keep the people who matter in view.</h2>
            <div className="quotes">
              <blockquote>
                <p>
                  “I stopped opening three apps just to remember who I owed a reply. Claire gives me
                  the shape of my day in about ten seconds.”
                </p>
                <footer>
                  <span className="avatar">AK</span>
                  <span>
                    <b>Amina K.</b>
                    <small>Creative director, Mexico City</small>
                  </span>
                </footer>
              </blockquote>
              <blockquote>
                <p>
                  “The promise tracking is the first AI feature that feels genuinely considerate. It
                  helps me be the person I said I would be.”
                </p>
                <footer>
                  <span className="avatar avatar-noah">JR</span>
                  <span>
                    <b>Jon R.</b>
                    <small>Founder, London</small>
                  </span>
                </footer>
              </blockquote>
            </div>
          </div>
        </section>

        <section className="open-source shell" id="open-source" aria-labelledby="open-source-title">
          <div className="open-source-copy">
            <div className="kicker">OPEN SOURCE FIRST</div>
            <h2 id="open-source-title">
              Inspect it.
              <br />
              <span>Run it yourself.</span>
            </h2>
            <p>
              Claire is an open-source product, not a closed messaging service. You can read the
              code, contribute, and operate the stack on servers you control—or use Claire Cloud when
              you want the bridges kept online for you.
            </p>
            <div className="open-source-actions">
              <a className="button button-dark" href="https://github.com/l2succes/claire">
                View the GitHub repository
              </a>
              <Link className="text-link" href="/docs/getting-started/repository-setup">
                Self-hosting guide
              </Link>
            </div>
          </div>
          <div className="open-source-panel">
            <article>
              <small>APACHE-2.0</small>
              <h3>Clients and packages</h3>
              <p>
                Mobile, desktop, the website, design system, and plugin SDK are Apache-2.0, so you
                can build on the product surfaces with a permissive license.
              </p>
            </article>
            <article>
              <small>AGPL-3.0</small>
              <h3>Server and infrastructure</h3>
              <p>
                The API, Docker stack, and database configuration are AGPL-3.0. If you run a modified
                network service, the corresponding source stays available to the people who use it.
              </p>
            </article>
            <article className="open-source-panel-wide">
              <small>YOUR SERVERS</small>
              <h3>Self-host the same stack.</h3>
              <p>
                Clone the repository, run <code>bun run setup</code>, then bring up Supabase, Matrix,
                Redis, and the bridges on hardware you operate. Claire Cloud is optional—not a
                requirement to use the product.
              </p>
            </article>
          </div>
        </section>

        <section className="security-teaser shell" id="security" aria-labelledby="security-title">
          <div className="security-teaser-copy">
            <div className="kicker">SECURITY WITH CLEAR BOUNDARIES</div>
            <h2 id="security-title">
              Privacy starts with
              <br />
              <span>telling you the truth.</span>
            </h2>
            <p>
              Claire brings messages into one searchable place. That means it is not a zero-knowledge,
              end-to-end-encrypted messenger today—and we will not pretend otherwise.
            </p>
            <Link className="button button-dark" href="/security">
              Read our security details <HeroIcon name="arrow-right" />
            </Link>
          </div>
          <div className="security-visual" aria-label="Claire security boundaries">
            <div className="security-visual-head">
              <span className="security-visual-icon">
                <HeroIcon name="info" />
              </span>
              <span>CURRENT DATA BOUNDARY</span>
            </div>
            <div className="security-flow">
              <article>
                <HeroIcon name="phone" />
                <small>YOUR APPS</small>
                <b>Messages arrive from connected networks.</b>
              </article>
              <span className="security-flow-line" aria-hidden="true" />
              <article className="security-flow-center">
                <HeroIcon name="server" />
                <small>CLAIRE CLOUD</small>
                <b>Sync, inbox, search, and selected AI context.</b>
              </article>
              <span className="security-flow-line" aria-hidden="true" />
              <article>
                <HeroIcon name="chat" />
                <small>AI, WHEN USED</small>
                <b>Only selected context goes to the active AI mode.</b>
              </article>
            </div>
            <div className="security-visual-note">
              <HeroIcon name="check-circle" />
              <p>
                <b>What is live now:</b> authenticated APIs, production origin controls, security
                headers, and separate login and AI rate limits.
              </p>
            </div>
          </div>
        </section>

        <section className="final-cta shell" aria-labelledby="final-cta-title">
          <div>
            <h2 id="final-cta-title">
              Follow the build
              <br />
              from here.
            </h2>
            <p>
              I’m documenting the road to launch—the decisions, rough edges, releases, and lessons.
              Join early and help shape Claire as it becomes real.
            </p>
            <WaitlistForm source="homepage_footer" tone="transparent" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
