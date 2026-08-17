// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { HeroIcon } from '@/components/site/HeroIcon';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import '@/styles/pricing.css';

const subnav = [
  { href: '#loop', label: 'The Loop' },
  { href: '#plans', label: 'Plans' },
  { href: '#ai', label: 'AI credits' },
  { href: '#ultimate', label: 'Ultimate' },
  { href: '#compare', label: 'Compare' },
  { href: '#questions', label: 'Questions' },
] as const;

const loopSteps = [
  {
    tone: 'pr-step-sweep',
    number: '01',
    label: 'SWEEP',
    title: 'Read every connected chat.',
    body: 'One pass across every network on the account—not one conversation at a time, and not only the threads you happened to open.',
    chips: ['WhatsApp', 'Telegram', 'Instagram'],
  },
  {
    tone: 'pr-step-surface',
    number: '02',
    label: 'SURFACE',
    title: 'Find what is still open.',
    body: 'Promises you made, questions nobody answered, and plans that were agreed but never scheduled.',
    chips: ['Promises', 'Unanswered', 'Pending plans'],
  },
  {
    tone: 'pr-step-propose',
    number: '03',
    label: 'PROPOSE',
    title: 'Suggest the next move.',
    body: 'Each open loop arrives with a concrete next action—reply, remind, schedule, or close it out. You decide what happens.',
    chips: ['Draft reply', 'Set reminder', 'Dismiss'],
  },
] as const;

const tiers = [
  {
    id: 'free',
    name: 'FREE',
    title: 'Get your chats in one place.',
    price: '$0',
    unit: 'forever',
    body: 'Every network in one inbox, with a weekly Loop so nothing important quietly disappears.',
    loop: '1 Loop run per week',
    features: [
      'Up to 5 connected networks',
      'One account per network',
      'Unified inbox and cross-network search',
      'Promises and deadline reminders',
    ],
    cta: { href: '/#start', label: 'Get the app' },
    note: 'No card required · Loop runs reset every Monday',
    featured: false,
    flag: null,
  },
  {
    id: 'plus',
    name: 'PLUS',
    title: 'The full AI, on demand.',
    price: '$10',
    unit: 'USD / month',
    body: 'Everything Claire’s AI can do, with Loop runs you can fire whenever the inbox gets loud.',
    loop: 'Up to 3 Loop runs per day',
    features: [
      'Every supported network, 3 accounts each',
      'Ask Claire across your whole inbox',
      'Drafts, summaries, and smart cards',
      'Monthly Claire AI credit allowance',
      'Bring your own provider key',
    ],
    cta: { href: 'mailto:hello@claire.app?subject=Claire%20Plus', label: 'Get Claire Plus' },
    note: 'Monthly billing · hard credit cap · no automatic overage',
    featured: true,
    flag: 'MOST POPULAR',
  },
  {
    id: 'pro',
    name: 'PRO',
    title: 'Claire runs the Loop for you.',
    price: '$20',
    unit: 'USD / month',
    body: 'A Loop lands every morning without you asking, plus on-demand runs whenever you want another pass.',
    loop: 'Automatic daily Loop + on-demand runs',
    features: [
      'Everything in Plus',
      'Unlimited accounts per network',
      'Scheduled Loop with morning delivery',
      'Larger AI credit allowance, best model tier',
      'Early access to plugin actions',
    ],
    cta: { href: 'mailto:hello@claire.app?subject=Claire%20Pro', label: 'Get Claire Pro' },
    note: 'Monthly billing · personal account · cancel anytime',
    featured: false,
    flag: null,
  },
] as const;

const cadenceFacts = [
  ['LOOP RUNS / WEEK', 'Free 1 · Plus 21 · Pro 30+'],
  ['NETWORKS', 'Free 5 · Plus all · Pro all'],
  ['ACCOUNTS PER NETWORK', 'Free 1 · Plus 3 · Pro unlimited'],
  ['SPEND CAP', 'Hard cap on every plan'],
] as const;

const agentFlow = [
  {
    tone: 'pr-agent-when',
    label: 'WHEN',
    number: '01',
    title: '“I’d love to book a meeting.”',
    body: 'A customer says it in an Instagram DM at 11pm. No form, no link, no ticket—just a sentence in a chat.',
    chips: ['Instagram DM', 'After hours'],
  },
  {
    tone: 'pr-agent-claire',
    label: 'CLAIRE',
    number: '02',
    title: 'Detects a real agreement.',
    body: '“How about Tuesday?” is a proposal. “Tuesday at 10 works—see you then” is a commitment. Only the second one moves.',
    chips: ['Intent: booking', 'Confidence gate'],
  },
  {
    tone: 'pr-agent-then',
    label: 'THEN',
    number: '03',
    title: 'The agent drafts the action.',
    body: 'The calendar plugin prepares a typed event with the right time, attendees, and source thread. Anything a customer can see waits for a human yes.',
    chips: ['Calendar plugin', 'Awaiting approval'],
  },
] as const;

const ultimatePlugins = [
  {
    icon: 'promises',
    title: 'Calendar & booking',
    connects: 'Google Calendar · Outlook · CalDAV',
    body: 'Turn confirmed plans into clean events, reschedules, and holds.',
    status: 'builder',
    statusLabel: 'IN PREVIEW',
  },
  {
    icon: 'people',
    title: 'CRM',
    connects: 'HubSpot · Salesforce',
    body: 'Log the conversation, create the follow-up, update the deal note.',
    status: 'planned',
    statusLabel: 'PLANNED',
  },
  {
    icon: 'send',
    title: 'Payments',
    connects: 'Stripe',
    body: 'Send a payment or deposit link, then mark the thread paid when it clears.',
    status: 'planned',
    statusLabel: 'PLANNED',
  },
  {
    icon: 'search',
    title: 'Knowledge',
    connects: 'Google Drive · Notion · Dropbox',
    body: 'Retrieve an approved document and share the right link, with a citation.',
    status: 'planned',
    statusLabel: 'PLANNED',
  },
  {
    icon: 'chat',
    title: 'Team relay',
    connects: 'Slack · Teams',
    body: 'Prepare a handoff or summary for the team. Sending always needs approval.',
    status: 'planned',
    statusLabel: 'PLANNED',
  },
  {
    icon: 'server',
    title: 'Developer',
    connects: 'GitHub · Linear',
    body: 'Create issues from technical threads and link them back to the source.',
    status: 'planned',
    statusLabel: 'PLANNED',
  },
  {
    icon: 'settings',
    title: 'Custom',
    connects: 'Signed webhooks · private MCP',
    body: 'Connect an internal system or any data source you already run.',
    status: 'planned',
    statusLabel: 'PLANNED',
  },
] as const;

const riskLadder = [
  { level: 'read', approval: 'Never asks', body: 'Reads context only. Nothing to undo.' },
  {
    level: 'low_write',
    approval: 'You configure',
    body: 'Writes inside Claire. Reversible and idempotent.',
  },
  {
    level: 'external_write',
    approval: 'Always asks',
    body: 'Touches a third-party system a customer can see.',
  },
  { level: 'destructive', approval: 'Always asks', body: 'Cannot be undone. Needs an explicit yes.' },
] as const;

const planColumns = ['Free', 'Plus', 'Pro', 'Ultimate'] as const;

const matrixGroups = [
  {
    group: 'The Loop',
    rows: [
      ['Loop runs', '1 / week', '3 / day', 'Daily, automatic', 'Continuous, per workspace'],
      ['Open loops surfaced across every chat', 'yes', 'yes', 'yes', 'yes'],
      ['Proposed next action on each loop', 'yes', 'yes', 'yes', 'yes'],
      ['Scheduled delivery', '—', '—', 'yes', 'yes'],
      ['Loop history', '—', '30 days', '12 months', 'Custom retention'],
    ],
  },
  {
    group: 'Networks & accounts',
    rows: [
      ['Connected networks', 'Up to 5', 'All supported', 'All supported', 'All supported'],
      ['Accounts per network', '1', '3', 'Unlimited', 'Unlimited'],
      ['Unified inbox and cross-network search', 'yes', 'yes', 'yes', 'yes'],
      ['Mobile, desktop, and web', 'yes', 'yes', 'yes', 'yes'],
    ],
  },
  {
    group: 'AI',
    rows: [
      ['Ask Claire across the inbox', '—', 'yes', 'yes', 'yes'],
      ['Drafts, summaries, and smart cards', '—', 'yes', 'yes', 'yes'],
      ['Claire AI credits', 'Loop runs only', 'Monthly allowance', 'Larger allowance', 'Pooled workspace allowance'],
      ['Model tier', 'Fast', 'Balanced', 'Best available', 'Best available + policy'],
      ['Bring your own provider key', '—', 'yes', 'yes', 'yes'],
      ['Hard cap, no surprise overage', 'yes', 'yes', 'yes', 'yes'],
    ],
  },
  {
    group: 'Automation & plugins',
    rows: [
      ['Promises and deadline reminders', 'yes', 'yes', 'yes', 'yes'],
      ['Plugin actions from a conversation', '—', '—', 'Early access', 'Full catalog'],
      ['Agents that act on detected intent', '—', '—', '—', 'yes'],
      ['Signed webhooks and private MCP', '—', '—', '—', 'yes'],
    ],
  },
  {
    group: 'Team & governance',
    rows: [
      ['Shared inbox, assignment, routing', '—', '—', '—', 'yes'],
      ['Approval inbox and action receipts', '—', '—', '—', 'yes'],
      ['SSO, roles, and audit log', '—', '—', '—', 'yes'],
      ['Knowledge boundaries and citations', '—', '—', '—', 'yes'],
    ],
  },
  {
    group: 'Hosting & support',
    rows: [
      ['Claire Cloud', 'yes', 'yes', 'yes', 'yes'],
      ['Self-host the whole stack', 'yes', 'yes', 'yes', 'yes'],
      ['Support', 'Community', 'Email', 'Priority email', 'Dedicated contact'],
    ],
  },
] as const;

const questions = [
  [
    'What exactly is a Loop run?',
    'One sweep across every connected conversation that surfaces open loops—promises you made, questions nobody answered, plans agreed but never scheduled—and proposes a next action for each. It is a whole-inbox pass, not a per-chat summary.',
  ],
  [
    'What happens when I use up my Loop runs?',
    'Messaging, search, connections, promises, and reminders all keep working. The next Loop waits for your allowance to reset, or you move up a plan. Claire never silently bills you for another run.',
  ],
  [
    'Can I bring my own OpenAI or Anthropic key?',
    'Yes, on Plus and above. Your provider credential stays behind an encrypted secret boundary and is used only for your account. You pay that provider directly and your Claire AI credits are not deducted.',
  ],
  [
    'Do unused Claire AI credits roll over?',
    'No. The allowance resets each month. Credits settle against real model usage rather than a made-up “one request” unit, and you can always see the balance, the warnings, and the cap.',
  ],
  [
    'Is Pro priced per person?',
    'Free, Plus, and Pro are personal plans—one price for one Claire account. Ultimate is the workspace plan and is priced on seats plus usage.',
  ],
  [
    'Can I self-host and skip billing entirely?',
    'Yes. The server is open source. Clone the repository, run bun run setup, and bring up the stack on hardware you operate. Claire Cloud is a convenience, not a requirement.',
  ],
] as const;

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Claire pricing: Free, Plus at $10/month, and Pro at $20/month for personal accounts, plus Ultimate for businesses that want agents and plugins acting on their conversations.',
};

export default function PricingPage() {
  return (
    <div className="pricing-page">
      <SiteHeader active="Pricing" />
      <nav className="pr-subnav" aria-label="Pricing sections">
        <div className="pr-subnav-inner shell">
          <span className="pr-subnav-label">Pricing</span>
          <div className="pr-subnav-links">
            {subnav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </div>
          <a className="pr-subnav-cta" href="#plans">
            Compare plans <HeroIcon name="arrow-right" />
          </a>
        </div>
      </nav>
      <main>
        <section className="hero shell pr-hero">
          <div className="eyebrow">
            <span className="status-dot" />
            Pricing · Claire Cloud
          </div>
          <h1>
            Every chat in one place.
            <br />
            <span>Priced by how often Claire looks.</span>
          </h1>
          <p className="hero-copy">
            Claire’s Loop reads every connected conversation and tells you what is still open. Free
            gets a Loop each week. Plus runs it on demand. Pro runs it for you every morning.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#plans">
              See the plans <HeroIcon name="arrow-right" />
            </a>
            <a className="text-link" href="#ultimate">
              Claire for business <HeroIcon name="arrow-right" />
            </a>
          </div>
          <div className="pr-dial" aria-label="Loop cadence by plan">
            {tiers.map((tier) => (
              <article key={tier.id} className={tier.featured ? 'is-featured' : undefined}>
                <small>{tier.name}</small>
                <b>{tier.loop}</b>
              </article>
            ))}
            <article className="pr-dial-business">
              <small>ULTIMATE</small>
              <b>Continuous, with agents</b>
            </article>
          </div>
        </section>

        <section className="pr-loop shell" id="loop">
          <header className="section-heading">
            <div>
              <div className="kicker">THE UNIT WE CHARGE FOR</div>
              <h2>
                One Loop run.
                <br />
                <span className="claire-underline">Your whole inbox.</span>
              </h2>
            </div>
            <p>
              Every plan is measured in Loop runs, so it is worth being precise about what one
              actually does.
            </p>
          </header>
          <div className="pr-flow">
            {loopSteps.map((step, index) => (
              <Fragment key={step.number}>
                {index > 0 && (
                  <div className="pr-rail" aria-hidden="true">
                    <i />
                  </div>
                )}
                <article className={`pr-step ${step.tone}`}>
                  <div className="pr-step-top">
                    <span>{step.number}</span>
                    <small>{step.label}</small>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <div className="pr-chips">
                    {step.chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                </article>
              </Fragment>
            ))}
          </div>
          <div className="pr-loop-note">
            <HeroIcon name="info" />
            <p>
              Running out of Loop runs never breaks the messenger. Sending, reading, search,
              connections, promises, and reminders keep working on every plan—including Free.
            </p>
          </div>
        </section>

        <section className="pr-tiers shell" id="plans">
          <header className="section-heading">
            <div>
              <div className="kicker">PERSONAL PLANS</div>
              <h2>
                Three plans.
                <br />
                One question: how often?
              </h2>
            </div>
            <p>
              The product is the same on every plan. What changes is how much of the AI you get and
              how often the Loop runs.
            </p>
          </header>
          <div className="pr-tier-grid">
            {tiers.map((tier) => (
              <article
                key={tier.id}
                className={`pr-tier${tier.featured ? ' is-featured' : ''}`}
              >
                {tier.flag ? <div className="pr-tier-flag">{tier.flag}</div> : null}
                <small>{tier.name}</small>
                <div className="pr-tier-price">
                  <strong>{tier.price}</strong>
                  <span>{tier.unit}</span>
                </div>
                <h3>{tier.title}</h3>
                <p>{tier.body}</p>
                <div className="pr-tier-loop">
                  <HeroIcon name="sparkles" />
                  <b>{tier.loop}</b>
                </div>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <HeroIcon name="check-circle" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.cta.href.startsWith('/') ? (
                  <Link className="button button-dark" href={tier.cta.href}>
                    {tier.cta.label} <HeroIcon name="arrow-right" />
                  </Link>
                ) : (
                  <a className="button button-dark" href={tier.cta.href}>
                    {tier.cta.label} <HeroIcon name="arrow-right" />
                  </a>
                )}
                <span className="pr-tier-note">{tier.note}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="pr-cadence" aria-label="Plan limits at a glance">
          <div className="shell">
            {cadenceFacts.map(([label, value]) => (
              <article key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </article>
            ))}
          </div>
        </section>

        <section className="pr-usage shell" id="ai">
          <header className="section-heading">
            <div>
              <div className="kicker">HOW AI IS BILLED</div>
              <h2>
                Choose who pays
                <br />
                <span className="claire-underline">for the model.</span>
              </h2>
            </div>
            <p>
              Loop runs and AI credits are metered separately from the subscription, so model costs
              never become a surprise line on a card statement.
            </p>
          </header>
          <div className="usage-grid">
            <article className="usage-card usage-managed">
              <span className="usage-icon">
                <HeroIcon name="sparkles" />
              </span>
              <h4>Claire AI credits</h4>
              <p>
                Use Claire-managed models for Loop runs, replies, Ask Claire, summaries, and search.
                Every account gets a visible balance, warnings, and a hard cap.
              </p>
              <div className="credit-meter" aria-hidden="true">
                <div className="credit-bar">
                  <span style={{ width: '62%' }} />
                </div>
                <div className="credit-legend">
                  <b>62% used</b>
                  <span>hard cap · no overage</span>
                </div>
              </div>
              <small>Credits settle against actual model usage—not a made-up “one request” unit.</small>
            </article>
            <article className="usage-card">
              <span className="usage-icon">
                <HeroIcon name="server" />
              </span>
              <h4>Bring your own key</h4>
              <p>
                Add an OpenAI, Anthropic, or compatible provider key on Plus and above. Claire Cloud
                still runs the product; your provider bills model usage directly.
              </p>
              <small>Your Claire AI credit balance is not used.</small>
            </article>
            <article className="usage-card">
              <span className="usage-icon">
                <HeroIcon name="desktop" />
              </span>
              <h4>Run models yourself</h4>
              <p>
                Self-hosted accounts can point Claire at Ollama, LM Studio, or another compatible
                endpoint on infrastructure they control.
              </p>
              <small>Available only when the model host stays reachable.</small>
            </article>
          </div>
        </section>

        <section className="pr-ultimate" id="ultimate">
          <div className="shell">
            <header className="section-heading inverse">
              <div>
                <div className="kicker">ULTIMATE · FOR BUSINESSES</div>
                <h2>
                  Put an agent
                  <br />
                  inside the Loop.
                </h2>
              </div>
              <p>
                Same Loop, running continuously across the whole workspace—except now it can act.
                Connect your systems and let Claire turn what customers say into work that is done.
              </p>
            </header>

            <div className="pr-agent-flow">
              {agentFlow.map((step, index) => (
                <Fragment key={step.number}>
                  {index > 0 && (
                    <div className="pr-rail is-inverse" aria-hidden="true">
                      <i />
                    </div>
                  )}
                  <article className={`pr-agent-step ${step.tone}`}>
                    <div className="pr-step-top">
                      <span>{step.number}</span>
                      <small>{step.label}</small>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                    <div className="pr-chips">
                      {step.chips.map((chip) => (
                        <span key={chip}>{chip}</span>
                      ))}
                    </div>
                  </article>
                </Fragment>
              ))}
            </div>

            <div className="pr-plugin-head">
              <small>PLUGIN CATALOG</small>
              <h3>Connect the systems the work actually lives in.</h3>
              <p>
                A plugin declares what it can do, how risky each action is, and whether a person has
                to approve it. Availability is listed honestly—nothing here pretends to be finished.
              </p>
            </div>
            <div className="pr-plugin-grid">
              {ultimatePlugins.map((plugin) => (
                <article key={plugin.title}>
                  <div className="pr-plugin-top">
                    <span className="pr-plugin-mark">
                      <HeroIcon name={plugin.icon} />
                    </span>
                    <span className={`status-pill ${plugin.status}`}>{plugin.statusLabel}</span>
                  </div>
                  <h4>{plugin.title}</h4>
                  <p>{plugin.body}</p>
                  <small>{plugin.connects}</small>
                </article>
              ))}
            </div>

            <div className="pr-governance">
              <div className="pr-governance-copy">
                <small>DETECTION IS NOT PERMISSION</small>
                <h3>Every action declares its risk before it runs.</h3>
                <p>
                  Nothing a customer can see happens without a human yes. Each run leaves a receipt:
                  what fired, which inputs were used, who approved it, and how to undo it.
                </p>
                <a className="button button-dark pr-governance-link" href="/developers#plugins">
                  Read the plugin model <HeroIcon name="arrow-right" />
                </a>
              </div>
              <ul className="pr-ladder">
                {riskLadder.map((step) => (
                  <li key={step.level}>
                    <code>{step.level}</code>
                    <b>{step.approval}</b>
                    <span>{step.body}</span>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="pr-ultimate-card">
              <div>
                <small>ULTIMATE · WORKSPACE PLAN</small>
                <h3>Everything in Pro, for the whole team.</h3>
                <ul>
                  <li>
                    <HeroIcon name="check-circle" />
                    Continuous Loop across the shared inbox
                  </li>
                  <li>
                    <HeroIcon name="check-circle" />
                    Agents, the full plugin catalog, custom webhooks and private MCP
                  </li>
                  <li>
                    <HeroIcon name="check-circle" />
                    Approval inbox, receipts, SSO, roles, and audit
                  </li>
                  <li>
                    <HeroIcon name="check-circle" />
                    Dedicated environments or self-hosting
                  </li>
                </ul>
              </div>
              <div className="pr-ultimate-cta">
                <b>Seats + usage · annual</b>
                <a
                  className="button button-dark"
                  href="mailto:hello@claire.app?subject=Claire%20Ultimate"
                >
                  Talk to us <HeroIcon name="arrow-right" />
                </a>
                <span>We scope the plugins you need before quoting anything.</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="pr-matrix shell" id="compare">
          <header className="section-heading">
            <div>
              <div className="kicker">EVERY LINE, SIDE BY SIDE</div>
              <h2>
                What each plan
                <br />
                actually includes.
              </h2>
            </div>
            <p>
              Free, Plus, and Pro are personal accounts. Ultimate is the workspace plan for teams
              running customer conversations.
            </p>
          </header>
          <div className="pr-matrix-scroll">
            <table>
              <caption className="sr-only">Claire plan comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {planColumns.map((column) => (
                    <th key={column} scope="col" className={column === 'Plus' ? 'is-featured' : undefined}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              {matrixGroups.map((group) => (
                <tbody key={group.group}>
                  <tr className="pr-matrix-group">
                    <th scope="colgroup" colSpan={5}>
                      {group.group}
                    </th>
                  </tr>
                  {group.rows.map(([label, ...values]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {values.map((value, index) => (
                        <td
                          key={planColumns[index]}
                          data-label={planColumns[index]}
                          className={planColumns[index] === 'Plus' ? 'is-featured' : undefined}
                        >
                          {value === 'yes' ? (
                            <>
                              <HeroIcon name="check-circle" />
                              <span className="sr-only">Included</span>
                            </>
                          ) : (
                            value
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        <section className="pr-questions shell" id="questions">
          <header className="section-heading">
            <div>
              <div className="kicker">BEFORE YOU PAY US ANYTHING</div>
              <h2>Straight answers.</h2>
            </div>
            <p>Claire is alpha software. These answers describe how the plans are meant to work.</p>
          </header>
          <div className="pricing-faq">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question} <HeroIcon name="plus" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta shell">
          <div>
            <span className="asterisk">
              <HeroIcon name="sparkles" />
            </span>
            <h2>
              Close the loops
              <br />
              you forgot you opened.
            </h2>
            <p>Start free, run the Loop weekly, and move up only when you want it more often.</p>
            <Link className="button button-dark" href="#plans">
              Choose a plan <HeroIcon name="arrow-right" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter note="Every chat in one place. One Loop to close them." />
    </div>
  );
}
