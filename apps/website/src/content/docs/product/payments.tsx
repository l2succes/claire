// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Payments and AI credits specification",
  description: "Subscription, credit, billing, entitlement, and provider-key design for Claire AI.",
  section: 'product',
  status: 'draft',
  lastReviewed: '2026-08-17',
  order: 5,
  roadmap: {
    status: 'planned',
    summary: "Offer transparent managed-AI credits alongside bring-your-own provider access.",
  },
  related: ['/docs/product/ai-platform', '/docs/product/roadmap'],
};

export default function Page() {
  return (
    <Doc>
      <P lede><b>Status:</b> Proposed for implementation <b>Audience:</b> Product, design, backend, security, support, finance, and operations <b>Scope:</b> The consumer launch of Claire Plus: subscription, managed-AI credits, bring-your-own-key (BYOK), entitlements, usage ledger, payment controls, and cancellation.</P>
      <Section id="launch-decision" title="Launch decision">
      <P>Claire launches as a consumer product, not an enterprise plan.</P>
      <ul>
              <li><b>Claire Plus costs $10 USD per person, per month.</b></li>
              <li>The subscription pays for Claire Cloud: the account, synced message store, search, Matrix and bridge operations, updates, and the mobile and desktop clients.</li>
              <li>It includes a small, clearly disclosed monthly Claire AI credit allowance. AI is not unlimited.</li>
              <li>A subscriber can instead add their own provider key. Those requests do not consume Claire credits; the provider bills the subscriber directly.</li>
              <li>A self-hosted user can configure their own provider or local model and does not need Stripe for message functionality.</li>
            </ul>
      <P>“Claire Business” is a possible later product for shared accounts, administration, SSO, policy, and volume pricing. No Business pricing, seats, contracts, or workspace-admin surface should ship in the consumer launch.</P>
      </Section>
      <Section id="consumer-pricing-and-credit-model" title="Consumer pricing and credit model">
      <Section id="what-the-10-plan-includes" title="What the $10 plan includes" level={3}>
      <P>The public pricing page should say only what is true today:</P>
      <Table
              head={[<>Included with Claire Plus</>, <>Not included or not unlimited</>]}
              rows={[
                [<>One personal Claire account</>, <>Unlimited AI inference</>],
                [<>Hosted clients, message sync, search, and supported cloud bridges</>, <>Automatic AI overage charges</>],
                [<>A monthly managed-AI allowance</>, <>Third-party provider charges when the user selects BYOK</>],
                [<>Usage view, warnings, and a hard cap</>, <>Future Business collaboration features</>],
              ]}
            />
      <P>The exact allowance must be configuration, not marketing copy embedded in the application. The recommended first experiment is <b>500 credits per month</b>. A credit is $0.01 of Claire AI usage value, so this gives a $5 visible monthly balance while leaving room to tune model choices, abuse controls, and infrastructure margin. Finance may lower or raise the grant only by publishing a new plan configuration and price-book version.</P>
      </Section>
      <Section id="credits-are-measured-usage-not-requests" title="Credits are measured usage, not “requests”" level={3}>
      <P>One request can cost far more than another. Claire must not sell a fictional “one credit equals one message” economy.</P>
      <ul>
              <li>One credit represents $0.01 of published Claire AI usage value.</li>
              <li>The active, immutable price book calculates a debit from provider, model, input tokens, output tokens, cache usage, and task tier (<C>fast</C>, <C>balanced</C>, or <C>best</C>).</li>
              <li>The receipt shows the feature, tier, model family, credits used, and remaining balance. It need not expose Claire’s wholesale provider contract.</li>
              <li>Credits renew monthly with the active Plus subscription. Unused monthly credits do not roll over in v1 unless a later product decision explicitly changes that rule.</li>
              <li>If the balance is zero, AI actions pause; sending, reading, search, connections, and export remain usable.</li>
            </ul>
      </Section>
      <Section id="top-ups-and-caps" title="Top-ups and caps" level={3}>
      <P>The launch should use a <b>hard stop</b>, not surprise overage. A subscriber resolves a depleted balance by waiting for the next renewal, switching to BYOK, or buying an explicit prepaid top-up.</P>
      <P>Recommended initial packs are 500 and 2,000 credits. Their price and tax are Stripe Price configuration, not a literal in the client. Before charging, Claire shows credits received, amount, tax, payment method, and that the purchase is one-time. There is no “auto refill” or background card charge in v1.</P>
      </Section>
      </Section>
      <Section id="ai-modes-and-data-flow-disclosure" title="AI modes and data-flow disclosure">
      <Table
              head={[<>Mode</>, <>Who runs Claire</>, <>Who pays model usage</>, <>Credit balance</>]}
              rows={[
                [<>Claire AI</>, <>Claire Cloud</>, <>Claire, from the Plus allowance or a prepaid top-up</>, <>Debited</>],
                [<>BYOK</>, <>Claire Cloud</>, <>The subscriber’s OpenAI, Anthropic, or compatible account</>, <>Not debited</>],
                [<>Self-hosted / local model</>, <>Subscriber</>, <>Subscriber or no external provider</>, <>Not used</>],
              ]}
            />
      <P>Before an AI request, the product identifies the active mode. Cloud BYOK is not “local”: Claire Cloud still builds the selected conversation context before it sends that context to the user’s provider. The provider key is never displayed after saving, and it must not enter analytics, logs, React state, AsyncStorage, ordinary database rows, or support exports.</P>
      </Section>
      <Section id="consumer-entitlement-model" title="Consumer entitlement model">
      <P>The existing system is user-centric. Keep <C>user_id</C> as the commercial owner in v1. A future Business layer can add <C>workspace_id</C> without migrating consumer pricing behavior.</P>
      <Code lang="text">{"Stripe customer\n      │\n      ├── Claire Plus subscription ($10/month)\n      │       └── personal account entitlement: plus_active\n      │\n      ├── monthly credit grant\n      │       └── append-only personal credit ledger\n      │\n      └── optional one-time top-up\n              └── same credit ledger"}</Code>
      <Table
              head={[<>State</>, <>Core messaging</>, <>Claire AI</>, <>BYOK</>, <>What the person sees</>]}
              rows={[
                [<><C>trialing</C></>, <>Enabled through trial end</>, <>Configured grant only</>, <>Enabled</>, <>Trial countdown and upgrade</>],
                [<><C>active</C></>, <>Enabled</>, <>Allowed while credits remain</>, <>Enabled</>, <>Normal usage</>],
                [<><C>past_due</C></>, <>Grace window</>, <>Paused by policy</>, <>Enabled in grace</>, <>Payment reminder</>],
                [<><C>suspended</C></>, <>Read/export only</>, <>Disabled</>, <>Disabled</>, <>Resolve payment</>],
                [<><C>canceled</C></>, <>Read/export through retention window</>, <>Disabled</>, <>Disabled and secret revoked</>, <>Resubscribe, export, or delete</>],
              ]}
            />
      <P>A verified webhook is the authority that changes these states. The browser return URL is never an entitlement signal.</P>
      </Section>
      <Section id="payment-provider-and-checkout" title="Payment provider and checkout">
      <P>Use <b>Stripe Billing</b> for the first release. Stripe owns card collection, Checkout, invoices, tax where configured, subscriptions, payment methods, and the customer portal. Claire owns entitlements, credits, and product authorization.</P>
      <Section id="purchase-flow" title="Purchase flow" level={3}>
      <ol>
              <li>A signed-in person selects Claire Plus in the app or public acquisition flow.</li>
              <li><C>POST /api/billing/checkout</C> creates a one-time Checkout Session for the $10/month Stripe Price.</li>
              <li>The person completes Stripe Checkout and returns to Claire’s success screen, which says “Confirming your subscription” until the webhook arrives.</li>
              <li><C>checkout.session.completed</C> and subscription events are signature-verified and deduplicated.</li>
              <li>The billing worker creates or activates the personal entitlement and appends that month’s credit grant exactly once.</li>
              <li>Renewal grants credits only after the relevant invoice is paid. Failed payment transitions the account through the configured grace period.</li>
            </ol>
      <P>Use the Stripe customer portal for cancellation, card updates, receipts, and invoices. The product must show the next renewal date and “cancel at period end” state in Settings.</P>
      </Section>
      </Section>
      <Section id="data-model" title="Data model">
      <P>Money uses integer minor units; model costs use integer <C>micro_usd</C>; credits use integer units.</P>
      <Code lang="ts">{"type PersonalBillingAccount = {\n  userId: string;\n  stripeCustomerId: string | null;\n  subscriptionId: string | null;\n  plan: 'plus_monthly' | 'self_hosted';\n  state: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';\n  currentPeriodStart: string | null;\n  currentPeriodEnd: string | null;\n  billingEmail: string | null;\n  updatedAt: string;\n};\n\ntype CreditLedgerEntry = {\n  id: string;\n  userId: string;\n  kind:\n    | 'monthly_grant'\n    | 'top_up'\n    | 'reservation'\n    | 'settlement'\n    | 'release'\n    | 'adjustment'\n    | 'expiration';\n  credits: number; // positive grant or negative debit\n  balanceAfter: number;\n  usageEventId: string | null;\n  stripePaymentId: string | null;\n  idempotencyKey: string;\n  createdAt: string;\n};\n\ntype ManagedAiUsage = {\n  id: string;\n  userId: string;\n  feature: 'reply' | 'assistant' | 'summary' | 'analysis' | 'classification' | 'embedding';\n  modelTier: 'fast' | 'balanced' | 'best';\n  provider: string;\n  model: string;\n  inputTokens: number | null;\n  outputTokens: number | null;\n  providerCostMicroUsd: number | null;\n  chargedCredits: number;\n  priceBookVersion: string;\n  status: 'reserved' | 'settled' | 'released' | 'failed';\n  createdAt: string;\n};"}</Code>
      <P>Supporting tables:</P>
      <ul>
              <li><C>stripe_webhook_events</C>: unique <C>stripe_event_id</C>, payload hash, processed time, and failure reason.</li>
              <li><C>billing_checkout_intents</C>: user, expected Price ID, purpose (<C>subscription</C> or <C>top_up</C>), one-time nonce, and expiry.</li>
              <li><C>ai_price_books</C> and immutable <C>ai_price_book_items</C>: provider/model rates and charge policy.</li>
              <li><C>provider_credentials</C>: encrypted secret reference, fingerprint, provider, mode, model profile, health, and timestamps—never the raw secret.</li>
            </ul>
      <P>The ledger is append-only. A refund, correction, or support adjustment creates a compensating entry with the actor, reason, and related payment/usage ID.</P>
      </Section>
      <Section id="managed-ai-charging-flow" title="Managed-AI charging flow">
      <ol>
              <li>The AI gateway resolves the person’s active mode and entitlement.</li>
              <li>For Claire AI, it estimates a bounded maximum debit from the active price book.</li>
              <li>A transaction creates a negative reservation only if available credits cover it. The usage event ID is the provider idempotency key.</li>
              <li>The provider request runs with explicit output and timeout bounds.</li>
              <li>The gateway stores reported usage and settles the reservation from actual measured usage. It releases the difference, or performs a bounded additional debit; a balance may never go below zero.</li>
              <li>Timeout, cancellation, duplicate callback, or provider failure releases the reservation exactly once.</li>
              <li>A daily job reconciles provider usage, settled entries, Stripe grants, and top-ups. Any material mismatch is an operations alert.</li>
            </ol>
      <P>The client never calculates or submits a credit amount. It receives a summary and receipt only.</P>
      </Section>
      <Section id="api-surface" title="API surface">
      <P>All endpoints require the authenticated owner of the personal account.</P>
      <Table
              head={[<>Endpoint</>, <>Purpose</>]}
              rows={[
                [<><C>GET /api/billing/summary</C></>, <>Plan, renewal, balance, AI mode, and masked provider state</>],
                [<><C>GET /api/billing/usage</C></>, <>Paginated credit receipts and feature/model usage</>],
                [<><C>POST /api/billing/checkout</C></>, <>Creates a Plus subscription or one-time top-up Checkout Session</>],
                [<><C>POST /api/billing/portal</C></>, <>Creates a short-lived Stripe customer-portal session</>],
                [<><C>POST /api/ai/providers</C></>, <>Saves a BYOK connection through the secret boundary</>],
                [<><C>DELETE /api/ai/providers/:id</C></>, <>Revokes the secret and disables its model profile</>],
                [<><C>POST /api/webhooks/stripe</C></>, <>Signature-verified, idempotent Stripe event intake</>],
              ]}
            />
      <P>Checkout metadata includes the user ID, intent nonce, price purpose, and optional top-up pack ID. The webhook verifies that metadata against <C>billing_checkout_intents</C>; it never trusts client-supplied account identity or creates a random paid account from metadata alone.</P>
      </Section>
      <Section id="product-experience" title="Product experience">
      <P>Add <b>{"Settings → Claire Plus & AI"}</b>:</P>
      <ul>
              <li>Plan state, next renewal, cancel/manage link, and receipt history.</li>
              <li>A simple selector: <b>Claire AI (recommended)</b>, <b>Use my provider key</b>, or <b>Run a local model</b> when a self-hosted/local host is available.</li>
              <li>Credits available, credits reserved by in-flight requests, current monthly grant, and feature-level usage.</li>
              <li>50%, 80%, 95%, and 100% warnings. At zero, show “wait for renewal,” “add credits,” and “use your own key”—never an unavoidable upsell modal.</li>
              <li>A one-time top-up confirmation showing price, credits, tax, and payment method before Checkout.</li>
              <li>Provider cards with a safe fingerprint, last successful test, revoke action, and data-flow copy.</li>
            </ul>
      <P>The public pricing page says $10/month and makes it clear that Claire AI is capped, BYOK bypasses the credit balance, and Claire Business is not part of the initial consumer release.</P>
      </Section>
      <Section id="security-support-and-finance-controls" title="Security, support, and finance controls">
      <ul>
              <li>Verify Stripe signatures using the raw webhook body before parsing.</li>
              <li>Deduplicate Stripe event IDs and provider callback IDs.</li>
              <li>Use a database transaction and row-level locking for reservations.</li>
              <li>Store payment data only in Stripe; Claire stores Stripe IDs and safe receipt metadata.</li>
              <li>Redact API keys, authorization headers, prompt payloads, and payment data from logs and analytics.</li>
              <li>Record audit events for subscription state, credit grant, top-up, refund, provider-secret change, and manual adjustment.</li>
              <li>Provide support tooling to view an account’s entitlement and ledger without exposing provider secrets or message content.</li>
            </ul>
      </Section>
      <Section id="rollout-and-acceptance-criteria" title="Rollout and acceptance criteria">
      <ol>
              <li>Implement the append-only ledger, price books, reservations, and staff reconciliation dashboard.</li>
              <li>Configure one $10/month Stripe Price and manually test Stripe Checkout, renewal, cancellation, failure, and customer portal flows.</li>
              <li>Ship the consumer billing/AI settings and monthly grant webhook processing.</li>
              <li>Ship BYOK secret storage and revocation. Verify no BYOK request consumes Claire credits.</li>
              <li>Add explicit one-time top-ups only after ledger, refund, tax, and reconciliation paths pass.</li>
            </ol>
      <P>Before release, prove that:</P>
      <ul>
              <li>A paid monthly subscription activates only its intended user account and creates one monthly grant.</li>
              <li>Duplicate or out-of-order webhooks cannot duplicate a grant or entitlement change.</li>
              <li>Concurrent AI requests cannot spend more credits than the person owns.</li>
              <li>A depleted account can still read, search, send, export, and manage connections.</li>
              <li>Provider secrets never appear in logs, analytics, normal tables, or API responses.</li>
              <li>Cancellation, failed renewal, refund, and account deletion all follow documented state transitions.</li>
              <li>Every public price and credit claim matches the configured Stripe Price and active plan config.</li>
            </ul>
      </Section>
      <Section id="deferred-business-product" title="Deferred Business product">
      <P>Only after consumer billing and support are stable should Claire consider a separate Business plan. That project may introduce multiple users, shared billing, pooled credits, SSO, data residency, SLA, and administrative controls. It must not silently change the $10/month individual plan.</P>
      </Section>
    </Doc>
  );
}
