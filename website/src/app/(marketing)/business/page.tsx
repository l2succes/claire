// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { HeroIcon } from '@/components/site/HeroIcon';
import { PlatformChip, PlatformIcon } from '@/components/site/PlatformMark';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { getPlatform } from '@/lib/platforms';
import '@/styles/business.css';

const heroChannels = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'google-messages', label: 'SMS' },
  { id: 'messenger', label: 'Messenger' },
] as const;

const readyChannels = [
  { id: 'whatsapp', note: 'Pair once. The bridge can stay online in Claire Cloud or on your host.', status: 'available' },
  { id: 'instagram', note: 'Authorize in Claire Desktop, then keep the conversation in the shared inbox.', status: 'available' },
  { id: 'telegram', note: 'Available for the product today. Business routing comes later.', status: 'core' },
] as const;

const plannedChannels = [
  { id: 'linkedin', note: 'Business messaging and lead conversations.' },
  { id: 'google-messages', note: 'SMS and RCS through a provider adapter.', label: 'SMS / RCS' },
  { id: 'messenger', note: 'A separate Meta session from Instagram.' },
  { id: 'slack', note: 'Internal handoff alongside customer channels.', label: 'Slack & Teams' },
] as const;

const controls = [
  ['Roles & approvals', 'Workspace admin, manager, agent, and capability grants—not a single shared login.'],
  ['Knowledge boundaries', 'Approved sources, versioned answers, citations, and a clear data scope for AI.'],
  ['Audit trail', 'Who or what replied, which inputs were used, what was edited, and how to undo it.'],
  ['AI controls', 'Managed credits, bring-your-own-key, model policy, budget caps, and a disable switch.'],
  ['Customer controls', 'Consent markers, quiet hours, suppression lists, export, and deletion.'],
  ['Operational health', 'Connector uptime, auth expiry, backlog, SLAs, and recoverable failure states.'],
] as const;

export const metadata: Metadata = {
  title: 'Claire for Business',
  description:
    'Claire for Business: one AI-powered workspace for customer conversations across Instagram, WhatsApp, LinkedIn, SMS, and more.',
};

export default function BusinessPage() {
  return (
    <div className="business-page">
      <SiteHeader />
      <main>
        <section className="hero shell">
          <div className="eyebrow">
            <span className="status-dot" />
            Claire for Business
          </div>
          <h1>
            Every customer conversation.
            <br />
            <span>One smart team.</span>
          </h1>
          <p className="hero-copy">
            Manage Instagram, WhatsApp, LinkedIn, SMS, Messenger, and more from one shared
            inbox—with AI that qualifies leads, prepares replies, routes work, and follows through.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#contact">
              Join the design pilot
            </a>
          </div>
          <div className="channel-line" aria-label="Customer channels">
            {heroChannels.map((channel) => (
              <PlatformChip key={channel.id} id={channel.id} label={channel.label} size="sm" />
            ))}
          </div>
          <div className="hero-art" aria-label="Claire Business team inbox">
            <aside className="inbox-preview">
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
                <section className="preview-thread">
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
                </section>
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
          </div>
        </section>

        <section className="outcomes shell">
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

        <section className="features shell" id="workspace">
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
              <HeroIcon name="inbox" size="xl" />
              <span>SHARED INBOX</span>
              <h3>Every channel, owner, and status in one queue.</h3>
              <p>
                Views for unassigned, mine, priority, waiting, and saved segments. Collision detection
                prevents duplicate replies.
              </p>
            </article>
            <article>
              <HeroIcon name="people" size="xl" />
              <span>TEAM ROUTING</span>
              <h3>Assign with context.</h3>
              <p>Route by channel, language, topic, customer value, territory, or availability.</p>
            </article>
            <article>
              <HeroIcon name="sparkles" size="xl" />
              <span>AI COPILOT</span>
              <h3>Answers grounded in your business.</h3>
              <p>Draft replies from approved knowledge, inventory, policies, CRM context, and history.</p>
            </article>
            <article>
              <HeroIcon name="check-circle" size="xl" />
              <span>FOLLOW-THROUGH</span>
              <h3>Promises become work.</h3>
              <p>Turn commitments into reminders, tasks, bookings, and pipeline updates.</p>
            </article>
          </div>
        </section>

        <section className="biz-automation shell" id="automation">
          <header className="section-heading">
            <div>
              <div className="kicker">CONVERSATION AUTOMATION</div>
              <h2>
                Automate the path.
                <br />
                <span className="claire-underline">Not the relationship.</span>
              </h2>
            </div>
            <p>
              Start with a visible workflow: what triggered it, what Claire is allowed to use, and
              whether a person has to approve the send.
            </p>
          </header>
          <ol className="auto-story">
            <li className="auto-step-when">
              <span>01</span>
              <small>When</small>
              <h3>A new Instagram DM asks about pricing</h3>
              <p>Channel, intent, and business hours decide if the workflow starts at all.</p>
            </li>
            <li className="auto-step-claire">
              <span>02</span>
              <small>Claire</small>
              <h3>Qualifies the request and finds the right plan</h3>
              <p>Only approved knowledge, inventory, and policy—never a guess dressed as certainty.</p>
            </li>
            <li className="auto-step-then">
              <span>03</span>
              <small>Then</small>
              <h3>Prepares a reply and assigns Sales</h3>
              <p>Auto-send when the rule is clear. Ask a person when the moment is expensive.</p>
            </li>
          </ol>
          <div className="auto-uses">
            <article>
              <b>Lead capture</b>
              <p>Collect need, timing, and budget without making someone repeat themselves.</p>
            </article>
            <article>
              <b>Commerce</b>
              <p>Answer inventory and order questions, then hand off the exceptions.</p>
            </article>
            <article>
              <b>Bookings</b>
              <p>Find a time, confirm it, and write the calendar or CRM record.</p>
            </article>
            <article>
              <b>Support triage</b>
              <p>Classify urgency, retrieve a policy-backed answer, and escalate with a summary.</p>
            </article>
          </div>
        </section>

        <section className="biz-channels shell" id="channels">
          <header className="section-heading">
            <div>
              <div className="kicker">CHANNEL ROADMAP</div>
              <h2>
                Meet customers
                <br />
                <span className="claire-underline">where they already talk.</span>
              </h2>
            </div>
            <p>
              A channel is listed as available only after the connector, policy, and recovery path
              are real. Planned means it is on the map—not in the product.
            </p>
          </header>
          <div className="channel-board">
            <div>
              <div className="channel-board-label">Ready now</div>
              {readyChannels.map((channel) => {
                const platform = getPlatform(channel.id);
                if (!platform) return null;
                return (
                  <article key={channel.id}>
                    <PlatformIcon id={channel.id} size="sm" />
                    <div>
                      <b>{platform.name}</b>
                      <p>{channel.note}</p>
                    </div>
                    <span className={`status-pill ${channel.status === 'core' ? 'builder' : 'available'}`}>
                      {channel.status === 'core' ? 'Core' : 'Available'}
                    </span>
                  </article>
                );
              })}
            </div>
            <div>
              <div className="channel-board-label">On the roadmap</div>
              {plannedChannels.map((channel) => {
                const platform = getPlatform(channel.id);
                if (!platform) return null;
                return (
                  <article key={channel.id}>
                    <PlatformIcon id={channel.id} size="sm" />
                    <div>
                      <b>{'label' in channel ? channel.label : platform.name}</b>
                      <p>{channel.note}</p>
                    </div>
                    <span className="status-pill planned">Planned</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="biz-controls shell" id="controls">
          <div className="biz-controls-copy">
            <div className="kicker">BUSINESS CONTROLS</div>
            <h2>
              Automation your
              <br />
              <span className="claire-underline">team can govern.</span>
            </h2>
            <p>
              Claire Business should make the rules visible: who can send, what the model may read,
              and how a conversation can be unwound.
            </p>
          </div>
          <dl className="control-list">
            {controls.map(([title, body]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="plans shell" id="plans">
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

        <section className="pilot shell" id="contact">
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
            <a className="button button-dark" href="mailto:hello@claire.app?subject=Claire%20Business%20pilot">
              Contact the team
            </a>
          </aside>
        </section>
      </main>
      <SiteFooter note="Every customer conversation. One smart team." />
    </div>
  );
}
