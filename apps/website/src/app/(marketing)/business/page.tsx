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

const scatterApps = [
  { id: 'instagram', unread: 7 },
  { id: 'whatsapp', unread: 12 },
  { id: 'linkedin', unread: 3 },
  { id: 'google-messages', unread: 5 },
  { id: 'messenger', unread: 9 },
] as const;

const queueRows = [
  { id: 'instagram', name: 'Ana Reyes', line: 'Blue / medium in stock?', owner: 'MA', tag: 'High intent' },
  { id: 'whatsapp', name: 'Jordan Miles', line: 'Move the demo to Friday?', owner: 'DK', tag: 'Booking' },
  { id: 'linkedin', name: 'Sam Kim', line: 'Interested in the team plan.', owner: '—', tag: 'Unassigned' },
] as const;

const outcomes = [
  {
    tint: 'outcome-lime',
    number: '01',
    title: 'Respond while intent is high.',
    body: 'Prioritize buying signals and route conversations before they go cold.',
    metric: 'First response',
    detail: 'Queue ordered by intent, not arrival time.',
  },
  {
    tint: 'outcome-sky',
    number: '02',
    title: 'Automate the repeatable.',
    body: 'Qualify leads, answer common questions, collect details, and trigger follow-ups.',
    metric: 'Repeat questions',
    detail: 'Answered from approved sources, with citations.',
  },
  {
    tint: 'outcome-blush',
    number: '03',
    title: 'Keep humans in important moments.',
    body: 'Escalate ambiguity, emotion, and high-value opportunities instead of faking confidence.',
    metric: 'Escalation',
    detail: 'A person owns the expensive conversations.',
  },
  {
    tint: 'outcome-lavender',
    number: '04',
    title: 'Know what conversation creates.',
    body: 'Measure response, qualification, bookings, resolution, and attributed revenue.',
    metric: 'Attribution',
    detail: 'From first message to the closed outcome.',
  },
] as const;

const readyChannels = [
  {
    id: 'whatsapp',
    note: 'Pair once. The bridge can stay online in Claire Cloud or on your host.',
    status: 'available',
  },
  {
    id: 'instagram',
    note: 'Authorize in Claire Desktop, then keep the conversation in the shared inbox.',
    status: 'available',
  },
  {
    id: 'telegram',
    note: 'Available for the product today. Business routing comes later.',
    status: 'core',
  },
] as const;

const plannedChannels = [
  { id: 'linkedin', note: 'Business messaging and lead conversations.' },
  { id: 'google-messages', note: 'SMS and RCS through a provider adapter.', label: 'SMS / RCS' },
  { id: 'messenger', note: 'A separate Meta session from Instagram.' },
  { id: 'slack', note: 'Internal handoff alongside customer channels.', label: 'Slack & Teams' },
] as const;

const controls = [
  {
    icon: 'people',
    title: 'Roles & approvals',
    body: 'Workspace admin, manager, agent, and capability grants—not a single shared login.',
  },
  {
    icon: 'info',
    title: 'Knowledge boundaries',
    body: 'Approved sources, versioned answers, citations, and a clear data scope for AI.',
  },
  {
    icon: 'check-circle',
    title: 'Audit trail',
    body: 'Who or what replied, which inputs were used, what was edited, and how to undo it.',
  },
  {
    icon: 'sparkles',
    title: 'AI controls',
    body: 'Managed credits, bring-your-own-key, model policy, budget caps, and a disable switch.',
  },
  {
    icon: 'lock',
    title: 'Customer controls',
    body: 'Consent markers, quiet hours, suppression lists, export, and deletion.',
  },
  {
    icon: 'server',
    title: 'Operational health',
    body: 'Connector uptime, auth expiry, backlog, SLAs, and recoverable failure states.',
  },
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
        <section className="hero shell biz-hero">
          <div className="eyebrow">
            <span className="status-dot" />
            Claire for Business
          </div>
          <h1 className="marketing-title">
            Every customer conversation.
            <br />
            <span className="claire-underline">One smart team.</span>
          </h1>
          <p className="hero-copy">
            Manage Instagram, WhatsApp, LinkedIn, SMS, Messenger, and more from one shared
            inbox. AI can qualify leads, prepare replies, route work, and handle follow-ups.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#contact">
              Join the design pilot <HeroIcon name="arrow-right" />
            </a>
            <a className="text-link" href="#workspace">
              See the workspace <HeroIcon name="arrow-right" />
            </a>
          </div>
          <div className="channel-line" aria-label="Customer channels">
            {heroChannels.map((channel) => (
              <PlatformChip key={channel.id} id={channel.id} label={channel.label} size="sm" />
            ))}
          </div>
          <div className="hero-art biz-hero-art" aria-label="Claire Business team inbox">
            <span className="biz-blob" aria-hidden="true" />
            <span className="biz-orbit" aria-hidden="true" />
            <div className="biz-float biz-float-one">
              <span className="biz-float-mark">
                <HeroIcon name="people" />
              </span>
              <div>
                <b>Maya is typing</b>
                <small>Collision detection · no duplicate reply</small>
              </div>
            </div>
            <div className="biz-float biz-float-two">
              <span className="biz-float-mark is-lime">
                <HeroIcon name="check-circle" />
              </span>
              <div>
                <b>Follow-up created</b>
                <small>Reserve blue / medium · 30 min hold</small>
              </div>
            </div>
            <article className="preview-shell">
              <nav>
                <b>AC</b>
                <span className="active">
                  <HeroIcon name="inbox" />
                </span>
                <span>
                  <HeroIcon name="people" />
                </span>
                <span>
                  <HeroIcon name="sparkles" />
                </span>
                <span>
                  <HeroIcon name="settings" />
                </span>
              </nav>
              <aside className="preview-queue">
                <small>TEAM INBOX · 18 OPEN</small>
                <h3>Conversations</h3>
                <div className="preview-filter">
                  <b>All</b>
                  <span>Mine</span>
                  <span>Unassigned</span>
                </div>
                <article className="active">
                  <PlatformIcon id="instagram" size="sm" />
                  <div>
                    <b>Ana Reyes</b>
                    <p>Do you have the blue one in medium?</p>
                    <small>Instagram · 1m</small>
                  </div>
                  <em>HOT</em>
                </article>
                <article>
                  <PlatformIcon id="whatsapp" size="sm" />
                  <div>
                    <b>Jordan Miles</b>
                    <p>Can we move the demo to Friday?</p>
                    <small>WhatsApp · 8m</small>
                  </div>
                  <i>DK</i>
                </article>
                <article>
                  <PlatformIcon id="linkedin" size="sm" />
                  <div>
                    <b>Sam Kim</b>
                    <p>Interested in your team plan.</p>
                    <small>LinkedIn · 14m</small>
                  </div>
                </article>
                <article>
                  <PlatformIcon id="google-messages" size="sm" />
                  <div>
                    <b>Priya N.</b>
                    <p>Order #4482 — where is it?</p>
                    <small>SMS · 22m</small>
                  </div>
                </article>
              </aside>
              <section className="preview-thread">
                <header>
                  <div>
                    <b>Ana Reyes</b>
                    <small>Instagram · Product inquiry</small>
                  </div>
                  <span className="preview-assign">Assign to Maya</span>
                </header>
                <div className="preview-chat">
                  <p className="customer">Do you have the blue one in medium?</p>
                  <div className="ai-card">
                    <small>
                      <HeroIcon name="sparkles" /> CLAIRE FOUND THE ANSWER
                    </small>
                    <b>Blue / Medium is in stock. 4 units remain.</b>
                    <p>Source: inventory sync · updated 2m ago</p>
                    <span className="ai-card-cta">Use in reply</span>
                  </div>
                  <p className="draft">
                    Yes—we have four left in blue, size medium. Want me to reserve one for you?
                  </p>
                  <div className="preview-composer">
                    <span>Edit before sending…</span>
                    <i>
                      <HeroIcon name="send" />
                    </i>
                  </div>
                </div>
              </section>
              <section className="preview-context">
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
                <span className="preview-action">Prepare automation</span>
              </section>
            </article>
          </div>
        </section>

        <section className="biz-shift shell" aria-labelledby="shift-title">
          <header className="section-heading">
            <div>
              <div className="kicker">THE PROBLEM WITH FIVE INBOXES</div>
              <h2 id="shift-title">
                Same customers.
                <br />
                <span className="claire-underline">One place to answer.</span>
              </h2>
            </div>
            <p>
              Customer messaging is already spread across personal apps, shared logins, and a phone
              on someone’s desk. Claire brings it into one queue with a clear owner.
            </p>
          </header>
          <div className="shift-grid">
            <article className="shift-before">
              <div className="shift-label">
                <small>TODAY</small>
                <b>Five apps, no owner</b>
              </div>
              <div className="shift-apps">
                {scatterApps.map((app) => (
                  <span key={app.id}>
                    <PlatformIcon id={app.id} size="lg" />
                    <i>{app.unread}</i>
                  </span>
                ))}
              </div>
              <div className="shift-chatter">
                <p>“Did anyone reply to Ana?”</p>
                <p className="is-reply">“I thought you had it.”</p>
              </div>
              <ul>
                <li>Nobody knows which message is answered.</li>
                <li>Context lives in one person’s phone.</li>
                <li>Follow-ups depend on memory.</li>
              </ul>
            </article>
            <div className="shift-arrow" aria-hidden="true">
              <HeroIcon name="arrow-right" />
            </div>
            <article className="shift-after">
              <div className="shift-label">
                <small>WITH CLAIRE</small>
                <b>One queue, one owner each</b>
              </div>
              <div className="shift-queue">
                {queueRows.map((row) => (
                  <div key={row.name}>
                    <PlatformIcon id={row.id} size="sm" />
                    <div>
                      <b>{row.name}</b>
                      <small>{row.line}</small>
                    </div>
                    <em>{row.tag}</em>
                    <i className={row.owner === '—' ? 'is-open' : undefined}>{row.owner}</i>
                  </div>
                ))}
              </div>
              <ul>
                <li>Assignment, status, and history are shared.</li>
                <li>AI drafts from approved knowledge only.</li>
                <li>Commitments become tracked work.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="biz-outcomes shell">
          <div className="kicker">BUILT FOR REVENUE AND SERVICE TEAMS</div>
          <div className="outcome-grid">
            {outcomes.map((outcome) => (
              <article className={`outcome-card ${outcome.tint}`} key={outcome.number}>
                <b>{outcome.number}</b>
                <h3>{outcome.title}</h3>
                <p>{outcome.body}</p>
                <div className="outcome-metric">
                  <small>{outcome.metric}</small>
                  <span>{outcome.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="biz-workspace shell" id="workspace">
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
              Claire Business brings together a shared inbox, customer context, AI assistance,
              assignments, and automation without treating every conversation like a ticket.
            </p>
          </header>
          <div className="workspace-grid">
            <article className="workspace-card is-wide">
              <div className="workspace-copy">
                <span>SHARED INBOX</span>
                <h3>Every channel, owner, and status in one queue.</h3>
                <p>
                  Views for unassigned, mine, priority, waiting, and saved segments. Collision
                  detection prevents two people replying to the same customer.
                </p>
              </div>
              <div className="workspace-vignette vignette-views">
                <div className="vignette-tabs">
                  <b>Unassigned · 6</b>
                  <span>Mine · 4</span>
                  <span>Waiting · 8</span>
                </div>
                <div className="vignette-rows">
                  <span>
                    <PlatformIcon id="instagram" size="sm" />
                    <i />
                    <em>MA</em>
                  </span>
                  <span className="is-active">
                    <PlatformIcon id="whatsapp" size="sm" />
                    <i />
                    <em>DK</em>
                  </span>
                  <span>
                    <PlatformIcon id="linkedin" size="sm" />
                    <i />
                    <em className="is-open">+</em>
                  </span>
                </div>
              </div>
            </article>
            <article className="workspace-card">
              <div className="workspace-vignette vignette-routing">
                <div className="routing-node">Instagram · ES</div>
                <div className="routing-fan" aria-hidden="true">
                  <i />
                  <i />
                </div>
                <div className="routing-people">
                  <span>Maya</span>
                  <span className="is-muted">Dev</span>
                </div>
              </div>
              <div className="workspace-copy">
                <span>TEAM ROUTING</span>
                <h3>Assign with context.</h3>
                <p>Route by channel, language, topic, customer value, territory, or availability.</p>
              </div>
            </article>
            <article className="workspace-card">
              <div className="workspace-vignette vignette-copilot">
                <div className="copilot-source">
                  <HeroIcon name="info" />
                  <span>Policy · Returns within 30 days</span>
                </div>
                <div className="copilot-draft">
                  <HeroIcon name="sparkles" />
                  <span>“You’re inside the 30-day window—want a prepaid label?”</span>
                </div>
              </div>
              <div className="workspace-copy">
                <span>AI COPILOT</span>
                <h3>Answers based on your business.</h3>
                <p>Draft replies from approved knowledge, inventory, policies, and history.</p>
              </div>
            </article>
            <article className="workspace-card">
              <div className="workspace-vignette vignette-promise">
                <div className="promise-quote">“I’ll send the quote Monday.”</div>
                <div className="promise-task">
                  <HeroIcon name="check-circle" />
                  <div>
                    <b>Send quote to Jordan</b>
                    <small>Monday · 9:00</small>
                  </div>
                </div>
              </div>
              <div className="workspace-copy">
                <span>FOLLOW-THROUGH</span>
                <h3>Promises become work.</h3>
                <p>Turn commitments into reminders, tasks, bookings, and pipeline updates.</p>
              </div>
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
          <div className="auto-flow">
            <article className="auto-step auto-step-when">
              <div className="auto-step-top">
                <span>01</span>
                <small>WHEN</small>
              </div>
              <h3>A new Instagram DM asks about pricing</h3>
              <p>Channel, intent, and business hours decide if the workflow starts at all.</p>
              <div className="auto-chips">
                <span>intent: pricing</span>
                <span>hours: open</span>
              </div>
            </article>
            <div className="auto-rail" aria-hidden="true">
              <i />
            </div>
            <article className="auto-step auto-step-claire">
              <div className="auto-step-top">
                <span>02</span>
                <small>CLAIRE</small>
              </div>
              <h3>Qualifies the request and finds the right plan</h3>
              <p>Only approved knowledge, inventory, and policy—never a guess dressed as certainty.</p>
              <div className="auto-chips">
                <span>sources: 2</span>
                <span>confidence shown</span>
              </div>
            </article>
            <div className="auto-rail" aria-hidden="true">
              <i />
            </div>
            <article className="auto-step auto-step-then">
              <div className="auto-step-top">
                <span>03</span>
                <small>THEN</small>
              </div>
              <h3>Prepares a reply and assigns Sales</h3>
              <p>Auto-send when the rule is clear. Ask a person when the moment is expensive.</p>
              <div className="auto-chips">
                <span>assign: Sales</span>
                <span>SLA: 15m</span>
              </div>
            </article>
          </div>
          <div className="auto-gate">
            <span className="auto-gate-mark">
              <HeroIcon name="check-circle" />
            </span>
            <div>
              <b>Every step has a gate.</b>
              <p>
                Each workflow declares whether Claire may send on its own, must draft for review, or
                must stop and ask. The setting is per workflow, per channel, and visible in the audit
                trail.
              </p>
            </div>
            <div className="auto-gate-modes">
              <span className="is-on">Auto-send</span>
              <span>Draft for review</span>
              <span>Ask a person</span>
            </div>
          </div>
          <div className="auto-uses">
            <article>
              <HeroIcon name="people" size="lg" />
              <b>Lead capture</b>
              <p>Collect need, timing, and budget without making someone repeat themselves.</p>
            </article>
            <article>
              <HeroIcon name="inbox" size="lg" />
              <b>Commerce</b>
              <p>Answer inventory and order questions, then hand off the exceptions.</p>
            </article>
            <article>
              <HeroIcon name="promises" size="lg" />
              <b>Bookings</b>
              <p>Find a time, confirm it, and write the calendar or CRM record.</p>
            </article>
            <article>
              <HeroIcon name="chat" size="lg" />
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
            <div className="channel-column is-ready">
              <div className="channel-board-label">
                <b>Ready now</b>
                <span>Working connectors</span>
              </div>
              {readyChannels.map((channel) => {
                const platform = getPlatform(channel.id);
                if (!platform) return null;
                return (
                  <article key={channel.id}>
                    <PlatformIcon id={channel.id} size="lg" />
                    <div>
                      <b>{platform.name}</b>
                      <p>{channel.note}</p>
                    </div>
                    <span
                      className={`status-pill ${channel.status === 'core' ? 'builder' : 'available'}`}
                    >
                      {channel.status === 'core' ? 'Core' : 'Available'}
                    </span>
                  </article>
                );
              })}
              <p className="channel-footnote">
                Business routing, roles, and analytics are still in design for every channel listed
                here.
              </p>
            </div>
            <div className="channel-column is-planned">
              <div className="channel-board-label">
                <b>On the roadmap</b>
                <span>Not in the product yet</span>
              </div>
              {plannedChannels.map((channel) => {
                const platform = getPlatform(channel.id);
                if (!platform) return null;
                return (
                  <article key={channel.id}>
                    <PlatformIcon id={channel.id} size="lg" />
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

        <section className="biz-controls" id="controls">
          <div className="shell">
            <header className="section-heading inverse">
              <div>
                <div className="kicker">BUSINESS CONTROLS</div>
                <h2>
                  Automation your
                  <br />
                  team can govern.
                </h2>
              </div>
              <p>
                Claire Business should make the rules visible: who can send, what the model may read,
                and how a conversation can be unwound.
              </p>
            </header>
            <div className="control-grid">
              {controls.map((control) => (
                <article key={control.title}>
                  <span className="control-mark">
                    <HeroIcon name={control.icon} />
                  </span>
                  <h3>{control.title}</h3>
                  <p>{control.body}</p>
                </article>
              ))}
            </div>
            <p className="control-note">
              <HeroIcon name="info" />
              <span>
                Claire Business is in design. These controls describe the product we are building
                with pilot teams—not a shipped compliance certification.
              </span>
            </p>
          </div>
        </section>

        <section className="biz-plans shell" id="plans">
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
            <article className="plan-card">
              <small>TEAM</small>
              <h3>Shared conversations</h3>
              <p>For small teams centralizing customer messaging.</p>
              <ul>
                <li>
                  <HeroIcon name="check-circle" />
                  Shared inbox and assignments
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  Core channels
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  AI reply assistance
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  Basic routing and analytics
                </li>
              </ul>
              <b>Per seat + workspace base</b>
            </article>
            <article className="plan-card is-featured">
              <div className="plan-flag">MOST LIKELY FIT</div>
              <small>GROWTH</small>
              <h3>Automated acquisition</h3>
              <p>For teams using conversations to qualify, sell, and book.</p>
              <ul>
                <li>
                  <HeroIcon name="check-circle" />
                  Everything in Team
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  Automation builder
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  CRM, calendar, commerce plugins
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  Advanced segments and attribution
                </li>
              </ul>
              <b>Usage + seats</b>
            </article>
            <article className="plan-card">
              <small>BUSINESS</small>
              <h3>Governed operations</h3>
              <p>For larger teams with security requirements.</p>
              <ul>
                <li>
                  <HeroIcon name="check-circle" />
                  Everything in Growth
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  SSO and advanced roles
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  Audit and retention controls
                </li>
                <li>
                  <HeroIcon name="check-circle" />
                  Dedicated environments / self-hosting
                </li>
              </ul>
              <b>Annual contract</b>
            </article>
          </div>
        </section>

        <section className="biz-pilot shell" id="contact">
          <div className="pilot-copy">
            <div className="kicker">DESIGN PARTNER PROGRAM</div>
            <h2>Help shape Claire Business.</h2>
            <p>
              We’re looking for teams managing real customer conversations across two or more
              channels and willing to co-design routing, automation, governance, and measurement.
            </p>
            <a
              className="button button-dark"
              href="mailto:hello@claire.app?subject=Claire%20Business%20pilot"
            >
              Contact the team <HeroIcon name="arrow-right" />
            </a>
          </div>
          <aside className="pilot-card">
            <h3>A good pilot partner has:</h3>
            <ul>
              <li>
                <b>01</b>
                <span>3–30 people touching customer conversations</span>
              </li>
              <li>
                <b>02</b>
                <span>Instagram or WhatsApp as an important channel</span>
              </li>
              <li>
                <b>03</b>
                <span>A repeatable sales, booking, or support workflow</span>
              </li>
              <li>
                <b>04</b>
                <span>Someone responsible for automation quality</span>
              </li>
            </ul>
          </aside>
        </section>
      </main>
      <SiteFooter note="Every customer conversation. One smart team." />
    </div>
  );
}
