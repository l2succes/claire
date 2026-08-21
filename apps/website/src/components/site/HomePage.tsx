// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { HeroIcon } from '@/components/site/HeroIcon';
import { PlatformCatalog, PlatformRail } from '@/components/site/PlatformCatalog';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <section className="hero shell">
          <div className="eyebrow">
            <span className="status-dot" />
            The AI-native multi-chat client
          </div>
          <h1>
            All your chats.
            <br />
            <span>One AI.</span>
          </h1>
          <p className="hero-copy">
            Bring WhatsApp, Telegram, Instagram, and more into one intelligent client. Search every
            conversation, get relationship-aware help, and never lose track of what you promised.
          </p>
          <div className="hero-actions">
            <Link className="button button-dark" href="#start">
              Download
            </Link>
          </div>
          <div className="hero-art" aria-label="Claire application preview">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="float-note note-one">
              <span className="platform whatsapp">
                <img src="https://cdn.simpleicons.org/whatsapp/ffffff" alt="" />
              </span>
              <span>
                <strong>Maya</strong>
                <small>Can you send that deck?</small>
              </span>
            </div>
            <div className="float-note note-two">
              <span className="platform claire-ai">
                <HeroIcon name="sparkles" />
              </span>
              <span>
                <strong>AI found a promise</strong>
                <small>“I&apos;ll send it tomorrow.”</small>
              </span>
            </div>
            <article className="app-window">
              <aside className="app-sidebar">
                <div className="mini-brand is-logo">
                  <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
                </div>
                <button className="nav-icon active" aria-label="Home">
                  <HeroIcon name="home" />
                </button>
                <button className="nav-icon" aria-label="Inbox">
                  <HeroIcon name="inbox" />
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
                      <HeroIcon name="sparkles" />
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
                    <HeroIcon name="sparkles" />
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

        <section className="connections shell" id="connections">
          <div className="connections-heading">
            <div>
              <div className="kicker">EVERYONE IS SOMEWHERE DIFFERENT</div>
              <h2>
                Your people aren’t all in one app.
                <br />
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

          <div className="hosting-modes" aria-labelledby="hosting-title">
            <div className="hosting-heading">
              <div>
                <div className="kicker">CHOOSE WHERE CLAIRE RUNS</div>
                <h2 id="hosting-title">Choose how Claire stays online.</h2>
              </div>
              <p>
                Hosting location and device requirements are separate. A desktop may only authorize a
                cloud connection, or it may be the machine that keeps a local bridge alive.
              </p>
            </div>
            <div className="hosting-grid">
              <article className="hosting-card hosting-cloud">
                <div className="hosting-card-top">
                  <span className="hosting-symbol">
                    <HeroIcon name="cloud" />
                  </span>
                  <span className="status-pill available">AVAILABLE WHERE SUPPORTED</span>
                </div>
                <h3>Claire Cloud</h3>
                <p>
                  Managed bridges, storage, search, and optional AI stay online when your computer
                  closes.
                </p>
                <ul>
                  <li>Fastest setup</li>
                  <li>Automatic bridge updates</li>
                  <li>Computer can close after setup*</li>
                </ul>
              </article>
              <article className="hosting-card hosting-self">
                <div className="hosting-card-top">
                  <span className="hosting-symbol">
                    <HeroIcon name="server" />
                  </span>
                  <span className="status-pill builder">FOR BUILDERS</span>
                </div>
                <h3>Self-hosted</h3>
                <p>
                  Run Claire’s Bun server, Matrix bridges, Supabase, and Redis on infrastructure you
                  control.
                </p>
                <ul>
                  <li>Existing Docker workflow</li>
                  <li>Your host controls availability</li>
                  <li>Your AI provider remains your choice</li>
                </ul>
              </article>
              <article className="hosting-card hosting-local">
                <div className="hosting-card-top">
                  <span className="hosting-symbol">
                    <HeroIcon name="desktop" />
                  </span>
                  <span className="status-pill planned">IN DEVELOPMENT</span>
                </div>
                <h3>Private desktop-only</h3>
                <p>
                  A future verified mode for local storage, search, and AI with external processing
                  disabled.
                </p>
                <ul>
                  <li>No guarantee is claimed yet</li>
                  <li>Offline recovery must pass</li>
                  <li>Egress will be independently verified</li>
                </ul>
              </article>
            </div>
            <div className="data-disclosure">
              <span className="disclosure-icon" aria-hidden="true">
                <HeroIcon name="info" />
              </span>
              <div>
                <h3>What “local” means today</h3>
                <p>
                  Self-hosting keeps Claire’s message store on infrastructure you control. The
                  original messaging networks still process their messages, and configured external AI
                  providers may receive selected conversation content. We will not claim “never stored
                  in the cloud” until desktop-only mode has passed its security and network-egress
                  review.
                </p>
              </div>
            </div>
            <p className="hosting-footnote">
              * iMessage needs its Mac host available. Google Messages depends on the paired Android
              phone.
            </p>
          </div>

          <div className="setup-paths" id="start" aria-labelledby="setup-paths-title">
            <div className="setup-paths-heading">
              <div>
                <div className="kicker">START WITH THE RIGHT HOST</div>
                <h2 id="setup-paths-title">Cloud convenience or your own stack.</h2>
              </div>
              <p>
                Choose once for your Claire account. Device-dependent connections still state what
                must remain available, whichever host you use.
              </p>
            </div>
            <div className="setup-path-grid">
              <article className="setup-path setup-path-cloud">
                <span className="setup-path-icon">
                  <HeroIcon name="cloud" />
                </span>
                <span className="status-pill available">MANAGED</span>
                <h3>Start in Claire Cloud</h3>
                <p>
                  Best when you want bridges, storage, search, and your selected AI option to stay
                  online without operating a host.
                </p>
                <ol>
                  <li>
                    <b>1</b>
                    <span>Create your Claire account and choose its AI provider.</span>
                  </li>
                  <li>
                    <b>2</b>
                    <span>Pair phone networks or sign in once with Claire Desktop.</span>
                  </li>
                  <li>
                    <b>3</b>
                    <span>Keep only device-dependent networks, such as iMessage, awake.</span>
                  </li>
                </ol>
              </article>
              <article className="setup-path setup-path-local">
                <span className="setup-path-icon">
                  <HeroIcon name="server" />
                </span>
                <span className="status-pill builder">SELF-HOSTED</span>
                <h3>Run Claire yourself</h3>
                <p>
                  Best when you want to operate the existing Docker stack on hardware or
                  infrastructure you control.
                </p>
                <ol>
                  <li>
                    <b>1</b>
                    <span>Clone Claire and configure Supabase, Matrix, Redis, and bridges.</span>
                  </li>
                  <li>
                    <b>2</b>
                    <span>Choose your model provider and keep its credentials in your host environment.</span>
                  </li>
                  <li>
                    <b>3</b>
                    <span>Run the Docker stack and keep that host available for connected bridges.</span>
                  </li>
                </ol>
              </article>
            </div>
            <p className="setup-path-note">
              <HeroIcon name="info" />
              <span>
                You can use Claire Desktop for setup in either mode. It authorizes a connection; it
                is not automatically the machine that runs the bridge.
              </span>
            </p>
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
              Claire connects your chat networks, then gives its AI the context to help you find,
              understand, reply, and follow through—without losing the human thread.
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
                  <HeroIcon name="sparkles" />
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
                <h3>Conversation becomes follow-through.</h3>
                <p>
                  Claire notices commitments in your chats and turns them into gentle follow-through.
                </p>
              </div>
            </article>
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
              <div className="phone-top">
                <span>9:41</span>
                <i />
                <span>● ◒</span>
              </div>
              <div className="phone-greeting">
                <small>CLAIRE AI · ALL CHATS</small>
                <h3>What did I promise Maya?</h3>
                <p>Searching WhatsApp, Telegram, and Instagram…</p>
              </div>
              <div className="phone-card urgent">
                <span className="ai-mark">
                  <HeroIcon name="sparkles" />
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
                  <HeroIcon name="sparkles" />
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
                  <HeroIcon name="sparkles" />
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

        <section className="stories" id="stories">
          <div className="shell">
            <div className="kicker">PEOPLE HAVE ENOUGH TO JUGGLE</div>
            <h2>Claire keeps the human things close.</h2>
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
                <HeroIcon name="sparkles" />1 Loop run per week
              </b>
              <p>Up to five networks in one inbox, with search and reminders.</p>
            </article>
            <article className="pricing-teaser-card is-featured">
              <div className="pricing-teaser-flag">MOST POPULAR</div>
              <small>PLUS</small>
              <strong>
                $10<em>/mo</em>
              </strong>
              <b>
                <HeroIcon name="sparkles" />
                Up to 3 Loop runs per day
              </b>
              <p>Every network, the full AI, and a monthly Claire AI credit allowance.</p>
            </article>
            <article className="pricing-teaser-card">
              <small>PRO</small>
              <strong>
                $20<em>/mo</em>
              </strong>
              <b>
                <HeroIcon name="sparkles" />A Loop every morning
              </b>
              <p>Claire runs the Loop for you, on the best model tier, without being asked.</p>
            </article>
            <article className="pricing-teaser-card is-business">
              <small>ULTIMATE</small>
              <strong>Business</strong>
              <b>
                <HeroIcon name="sparkles" />
                Continuous Loop, with agents
              </b>
              <p>Plugins that act on what customers say—calendar, CRM, payments, and more.</p>
            </article>
          </div>
          <div className="pricing-teaser-foot">
            <p>
              AI use is metered separately from the subscription, with a visible balance and a hard
              cap. Model costs never become a surprise.
            </p>
            <Link className="button button-dark" href="/pricing">
              Compare all plans <HeroIcon name="arrow-right" />
            </Link>
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
                <HeroIcon name="sparkles" />
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

        <section className="final-cta shell">
          <div>
            <span className="asterisk">
              <HeroIcon name="sparkles" />
            </span>
            <h2>
              Give every chat
              <br />
              one intelligent home.
            </h2>
            <p>A multi-chat client with an AI that helps you remember, reply, and follow through.</p>
            <Link className="button button-dark" href="/pricing">
              See the plans <HeroIcon name="arrow-right" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
