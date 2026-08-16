// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroIcon } from '@/components/site/HeroIcon';
import '@/styles/business.css';

export const metadata: Metadata = {
  title: 'Claire for Business',
  description:
    'Claire for Business: one AI-powered workspace for customer conversations across Instagram, WhatsApp, LinkedIn, SMS, and more.',
};

export default function BusinessPage() {
  return (
    <>
      <header className="biz-header">
        <Link className="biz-brand" href="/">
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
          <span>claire</span>
          <b>Business</b>
        </Link>
        <nav>
          <a href="#workspace">Workspace</a>
          <a href="#automation">Automation</a>
          <a href="#channels">Channels</a>
          <a href="#plans">Plans</a>
        </nav>
        <a className="header-cta" href="#contact">
          Join the pilot
        </a>
      </header>
      <main>
        <section className="biz-hero">
          <div className="biz-hero-copy">
            <div className="eyebrow">CLAIRE FOR BUSINESS · PRODUCT VISION</div>
            <h1>
              Every customer
              <br />
              conversation.
              <br />
              <em>One smart team.</em>
            </h1>
            <p>
              Manage Instagram, WhatsApp, LinkedIn, SMS, Messenger, and more from one shared
              inbox—with AI that qualifies leads, prepares replies, routes work, and follows through.
            </p>
            <div className="hero-actions">
              <a className="primary" href="#contact">
                Join the design pilot <HeroIcon name="arrow-right" />
              </a>
              <a href="#workspace">See the workspace</a>
            </div>
            <div className="channel-line">
              <span>INSTAGRAM</span>
              <span>WHATSAPP</span>
              <span>LINKEDIN</span>
              <span>SMS</span>
              <span>MESSENGER</span>
            </div>
          </div>
          <aside className="inbox-preview">
            <header>
              <div>
                <i />
                <i />
                <i />
              </div>
              <span>Acme Studio · Team Inbox</span>
              <button>
                <HeroIcon name="search" />
              </button>
            </header>
            <div className="preview-shell">
              <nav>
                <b>AC</b>
                <HeroIcon name="home" />
                <HeroIcon name="inbox" />
                <HeroIcon name="sparkles" />
                <HeroIcon name="people" />
              </nav>
              <aside>
                <small>TEAM INBOX · 18 OPEN</small>
                <h3>Conversations</h3>
                <div className="preview-filter">
                  <b>All</b>
                  <span>Mine</span>
                  <span>Unassigned</span>
                </div>
                <article className="active">
                  <i>AR</i>
                  <div>
                    <b>Ana Reyes</b>
                    <p>Do you have the blue one in medium?</p>
                    <small>Instagram · 1m</small>
                  </div>
                  <em>HOT</em>
                </article>
                <article>
                  <i>JM</i>
                  <div>
                    <b>Jordan Miles</b>
                    <p>Can we move the demo to Friday?</p>
                    <small>WhatsApp · 8m</small>
                  </div>
                </article>
                <article>
                  <i>SK</i>
                  <div>
                    <b>Sam Kim</b>
                    <p>Interested in your team plan.</p>
                    <small>LinkedIn · 14m</small>
                  </div>
                </article>
              </aside>
              <main>
                <header>
                  <div>
                    <b>Ana Reyes</b>
                    <small>Instagram · Product inquiry</small>
                  </div>
                  <button>Assign to Maya</button>
                </header>
                <div className="preview-chat">
                  <p className="customer">Do you have the blue one in medium?</p>
                  <div className="ai-card">
                    <small>
                      <HeroIcon name="sparkles" /> CLAIRE FOUND THE ANSWER
                    </small>
                    <b>Blue / Medium is in stock. 4 units remain.</b>
                    <p>Source: Shopify inventory · updated 2m ago</p>
                    <button>Use in reply</button>
                  </div>
                  <p className="draft">
                    Yes—we have four left in blue, size medium. Want me to reserve one for you?
                  </p>
                </div>
              </main>
              <section className="context">
                <small>CONVERSATION CONTEXT</small>
                <div>
                  <b>Lead score</b>
                  <span className="hot">High intent</span>
                </div>
                <div>
                  <b>Owner</b>
                  <span>Maya</span>
                </div>
                <div>
                  <b>Customer</b>
                  <span>Returning</span>
                </div>
                <hr />
                <small>NEXT BEST ACTION</small>
                <p>Offer a 30-minute reservation and create a follow-up if Ana does not reply.</p>
                <button>Prepare automation</button>
              </section>
            </div>
          </aside>
        </section>
        <section className="outcomes">
          <div className="kicker">BUILT FOR REVENUE AND SERVICE TEAMS</div>
          <div className="outcome-grid">
            <article>
              <b>01</b>
              <h3>Respond while intent is high.</h3>
              <p>Prioritize buying signals and route conversations before they go cold.</p>
            </article>
            <article>
              <b>02</b>
              <h3>Automate the repeatable.</h3>
              <p>Qualify leads, answer common questions, collect details, and trigger follow-ups.</p>
            </article>
            <article>
              <b>03</b>
              <h3>Keep humans in important moments.</h3>
              <p>Escalate ambiguity, emotion, and high-value opportunities instead of faking confidence.</p>
            </article>
            <article>
              <b>04</b>
              <h3>Know what conversation creates.</h3>
              <p>Measure response, qualification, bookings, resolution, and attributed revenue.</p>
            </article>
          </div>
        </section>
        <section className="workspace" id="workspace">
          <header className="section-heading">
            <div>
              <div className="kicker">ONE OPERATING WORKSPACE</div>
              <h2>
                Closer to customers.
                <br />
                Clearer for your team.
              </h2>
            </div>
            <p>
              Claire Business combines a shared inbox, customer context, AI assistance, assignments,
              and automation without turning every conversation into a ticket.
            </p>
          </header>
          <div className="workspace-grid">
            <article className="wide">
              <HeroIcon name="inbox" />
              <span>SHARED INBOX</span>
              <h3>Every channel, owner, and status in one queue.</h3>
              <p>
                Views for unassigned, mine, priority, waiting, and saved segments. Collision detection
                prevents duplicate replies.
              </p>
            </article>
            <article>
              <HeroIcon name="people" />
              <span>TEAM ROUTING</span>
              <h3>Assign with context.</h3>
              <p>Route by channel, language, topic, customer value, territory, or availability.</p>
            </article>
            <article>
              <HeroIcon name="sparkles" />
              <span>AI COPILOT</span>
              <h3>Answers grounded in your business.</h3>
              <p>Draft replies from approved knowledge, inventory, policies, CRM context, and history.</p>
            </article>
            <article>
              <HeroIcon name="check-circle" />
              <span>FOLLOW-THROUGH</span>
              <h3>Promises become work.</h3>
              <p>Turn commitments into reminders, tasks, bookings, and pipeline updates.</p>
            </article>
          </div>
        </section>
        <section className="automation" id="automation">
          <header className="section-heading inverse">
            <div>
              <div className="kicker">CONVERSATION AUTOMATION</div>
              <h2>
                Automate the path.
                <br />
                Not the relationship.
              </h2>
            </div>
            <p>
              Start with deterministic workflows and controlled AI steps. Every automation shows its
              trigger, data access, action, approval policy, owner, and performance.
            </p>
          </header>
          <div className="automation-flow">
            <article>
              <small>WHEN</small>
              <HeroIcon name="chat" />
              <h3>A new Instagram DM asks about pricing</h3>
              <span>Channel · intent · business hours</span>
            </article>
            <HeroIcon name="arrow-right" />
            <article>
              <small>CLAIRE</small>
              <HeroIcon name="sparkles" />
              <h3>Qualifies the request and finds the right plan</h3>
              <span>Approved knowledge only</span>
            </article>
            <HeroIcon name="arrow-right" />
            <article>
              <small>THEN</small>
              <HeroIcon name="send" />
              <h3>Prepares a reply and assigns Sales</h3>
              <span>Auto-send or require approval</span>
            </article>
          </div>
          <div className="automation-types">
            <article>
              <b>Lead capture</b>
              <p>Collect need, timing, and budget without making the customer repeat themselves.</p>
            </article>
            <article>
              <b>Commerce</b>
              <p>Answer inventory and order questions, recover carts, and hand off exceptions.</p>
            </article>
            <article>
              <b>Bookings</b>
              <p>Find availability, confirm appointments, and create calendar or CRM records.</p>
            </article>
            <article>
              <b>Support triage</b>
              <p>Classify urgency, retrieve policy-backed answers, and escalate with a summary.</p>
            </article>
          </div>
        </section>
        <section className="channels" id="channels">
          <header className="section-heading">
            <div>
              <div className="kicker">CHANNEL ROADMAP</div>
              <h2>Meet customers where they talk.</h2>
            </div>
            <p>
              Availability is gated by connector reliability, platform policy, and complete recovery
              testing. Planned does not mean currently supported.
            </p>
          </header>
          <div className="channel-matrix">
            <article className="available">
              <b>WhatsApp</b>
              <span>AVAILABLE</span>
              <p>Cloud or self-hosted bridge</p>
            </article>
            <article className="available">
              <b>Instagram</b>
              <span>AVAILABLE</span>
              <p>Desktop-assisted setup</p>
            </article>
            <article>
              <b>LinkedIn</b>
              <span>PLANNED</span>
              <p>Business messaging track</p>
            </article>
            <article>
              <b>SMS / RCS</b>
              <span>PLANNED</span>
              <p>Provider adapter track</p>
            </article>
            <article>
              <b>Messenger</b>
              <span>PLANNED</span>
              <p>Meta bridge track</p>
            </article>
            <article>
              <b>Google Messages</b>
              <span>PLANNED</span>
              <p>Paired Android device</p>
            </article>
            <article>
              <b>Telegram</b>
              <span>CORE AVAILABLE</span>
              <p>Business routing planned</p>
            </article>
            <article>
              <b>Slack & Teams</b>
              <span>PLANNED</span>
              <p>Internal collaboration</p>
            </article>
          </div>
        </section>
        <section className="governance">
          <div>
            <div className="kicker">BUSINESS CONTROLS</div>
            <h2>Automation your team can govern.</h2>
          </div>
          <div className="governance-grid">
            <article>
              <b>Roles & approvals</b>
              <p>Workspace admin, manager, agent, analyst, and capability grants.</p>
            </article>
            <article>
              <b>Knowledge boundaries</b>
              <p>Approved sources, versioned answers, citations, and data scopes.</p>
            </article>
            <article>
              <b>Audit trail</b>
              <p>Who or what replied, inputs used, edits, actions, and undo state.</p>
            </article>
            <article>
              <b>AI controls</b>
              <p>Managed credits, BYOK, model policy, budget caps, and disable controls.</p>
            </article>
            <article>
              <b>Customer controls</b>
              <p>Consent markers, quiet hours, suppression lists, export, and deletion.</p>
            </article>
            <article>
              <b>Operational health</b>
              <p>Connector uptime, auth expiry, backlog, SLAs, and recovery states.</p>
            </article>
          </div>
        </section>
        <section className="plans" id="plans">
          <header className="section-heading">
            <div>
              <div className="kicker">PROPOSED PACKAGING</div>
              <h2>
                Start with the team.
                <br />
                Scale with automation.
              </h2>
            </div>
            <p>
              Pricing remains a hypothesis until connector costs, AI usage, compliance, and support
              load are validated with pilot customers.
            </p>
          </header>
          <div className="plan-grid">
            <article>
              <small>TEAM</small>
              <h3>Shared conversations</h3>
              <p>For small teams centralizing customer messaging.</p>
              <ul>
                <li>Shared inbox and assignments</li>
                <li>Core channels</li>
                <li>AI reply assistance</li>
                <li>Basic routing and analytics</li>
              </ul>
              <b>Per seat + workspace base</b>
            </article>
            <article className="featured">
              <small>GROWTH</small>
              <h3>Automated acquisition</h3>
              <p>For teams using conversations to qualify, sell, and book.</p>
              <ul>
                <li>Everything in Team</li>
                <li>Automation builder</li>
                <li>CRM, calendar, commerce plugins</li>
                <li>Advanced segments and attribution</li>
              </ul>
              <b>Usage + seats</b>
            </article>
            <article>
              <small>BUSINESS</small>
              <h3>Governed operations</h3>
              <p>For larger teams with security requirements.</p>
              <ul>
                <li>Everything in Growth</li>
                <li>SSO and advanced roles</li>
                <li>Audit and retention controls</li>
                <li>Dedicated environments / self-hosting</li>
              </ul>
              <b>Annual contract</b>
            </article>
          </div>
        </section>
        <section className="pilot" id="contact">
          <div>
            <div className="kicker">DESIGN PARTNER PROGRAM</div>
            <h2>Help shape Claire Business.</h2>
            <p>
              We’re looking for teams managing real customer conversations across two or more channels
              and willing to co-design routing, automation, governance, and measurement.
            </p>
          </div>
          <aside>
            <h3>A good pilot partner has:</h3>
            <ul>
              <li>3–30 people touching customer conversations</li>
              <li>Instagram or WhatsApp as an important channel</li>
              <li>A repeatable sales, booking, or support workflow</li>
              <li>Someone responsible for automation quality</li>
            </ul>
            <a href="mailto:hello@claire.app?subject=Claire%20Business%20pilot">
              Contact the team <HeroIcon name="arrow-right" />
            </a>
          </aside>
        </section>
      </main>
      <footer className="biz-footer">
        <Link className="biz-brand" href="/">
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" />
          <span>claire</span>
          <b>Business</b>
        </Link>
        <p>Every customer conversation. One smart team.</p>
        <div>
          <Link href="/">Personal</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/security">Security</Link>
          <a href="https://github.com/l2succes/claire">GitHub</a>
        </div>
      </footer>
    </>
  );
}
