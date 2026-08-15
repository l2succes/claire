# Claire Payments and AI Credits Specification

**Status:** Proposed for implementation
**Audience:** Product, design, backend, security, support, finance, and operations
**Scope:** The consumer launch of Claire Plus: subscription, managed-AI credits, bring-your-own-key
(BYOK), entitlements, usage ledger, payment controls, and cancellation.

## 1. Launch decision

Claire launches as a consumer product, not an enterprise plan.

- **Claire Plus costs $10 USD per person, per month.**
- The subscription pays for Claire Cloud: the account, synced message store, search, Matrix and
  bridge operations, updates, and the mobile and desktop clients.
- It includes a small, clearly disclosed monthly Claire AI credit allowance. AI is not unlimited.
- A subscriber can instead add their own provider key. Those requests do not consume Claire credits;
  the provider bills the subscriber directly.
- A self-hosted user can configure their own provider or local model and does not need Stripe for
  message functionality.

“Claire Business” is a possible later product for shared accounts, administration, SSO, policy, and
volume pricing. No Business pricing, seats, contracts, or workspace-admin surface should ship in the
consumer launch.

## 2. Consumer pricing and credit model

### 2.1 What the $10 plan includes

The public pricing page should say only what is true today:

| Included with Claire Plus                                         | Not included or not unlimited                           |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| One personal Claire account                                       | Unlimited AI inference                                  |
| Hosted clients, message sync, search, and supported cloud bridges | Automatic AI overage charges                            |
| A monthly managed-AI allowance                                    | Third-party provider charges when the user selects BYOK |
| Usage view, warnings, and a hard cap                              | Future Business collaboration features                  |

The exact allowance must be configuration, not marketing copy embedded in the application. The
recommended first experiment is **500 credits per month**. A credit is $0.01 of Claire AI usage
value, so this gives a $5 visible monthly balance while leaving room to tune model choices, abuse
controls, and infrastructure margin. Finance may lower or raise the grant only by publishing a new
plan configuration and price-book version.

### 2.2 Credits are measured usage, not “requests”

One request can cost far more than another. Claire must not sell a fictional “one credit equals one
message” economy.

- One credit represents $0.01 of published Claire AI usage value.
- The active, immutable price book calculates a debit from provider, model, input tokens, output
  tokens, cache usage, and task tier (`fast`, `balanced`, or `best`).
- The receipt shows the feature, tier, model family, credits used, and remaining balance. It need
  not expose Claire’s wholesale provider contract.
- Credits renew monthly with the active Plus subscription. Unused monthly credits do not roll over
  in v1 unless a later product decision explicitly changes that rule.
- If the balance is zero, AI actions pause; sending, reading, search, connections, and export remain
  usable.

### 2.3 Top-ups and caps

The launch should use a **hard stop**, not surprise overage. A subscriber resolves a depleted balance
by waiting for the next renewal, switching to BYOK, or buying an explicit prepaid top-up.

Recommended initial packs are 500 and 2,000 credits. Their price and tax are Stripe Price
configuration, not a literal in the client. Before charging, Claire shows credits received, amount,
tax, payment method, and that the purchase is one-time. There is no “auto refill” or background card
charge in v1.

## 3. AI modes and data-flow disclosure

| Mode                      | Who runs Claire | Who pays model usage                                      | Credit balance |
| ------------------------- | --------------- | --------------------------------------------------------- | -------------- |
| Claire AI                 | Claire Cloud    | Claire, from the Plus allowance or a prepaid top-up       | Debited        |
| BYOK                      | Claire Cloud    | The subscriber’s OpenAI, Anthropic, or compatible account | Not debited    |
| Self-hosted / local model | Subscriber      | Subscriber or no external provider                        | Not used       |

Before an AI request, the product identifies the active mode. Cloud BYOK is not “local”: Claire Cloud
still builds the selected conversation context before it sends that context to the user’s provider.
The provider key is never displayed after saving, and it must not enter analytics, logs, React state,
AsyncStorage, ordinary database rows, or support exports.

## 4. Consumer entitlement model

The existing system is user-centric. Keep `user_id` as the commercial owner in v1. A future Business
layer can add `workspace_id` without migrating consumer pricing behavior.

```text
Stripe customer
      │
      ├── Claire Plus subscription ($10/month)
      │       └── personal account entitlement: plus_active
      │
      ├── monthly credit grant
      │       └── append-only personal credit ledger
      │
      └── optional one-time top-up
              └── same credit ledger
```

| State       | Core messaging                       | Claire AI                    | BYOK                        | What the person sees           |
| ----------- | ------------------------------------ | ---------------------------- | --------------------------- | ------------------------------ |
| `trialing`  | Enabled through trial end            | Configured grant only        | Enabled                     | Trial countdown and upgrade    |
| `active`    | Enabled                              | Allowed while credits remain | Enabled                     | Normal usage                   |
| `past_due`  | Grace window                         | Paused by policy             | Enabled in grace            | Payment reminder               |
| `suspended` | Read/export only                     | Disabled                     | Disabled                    | Resolve payment                |
| `canceled`  | Read/export through retention window | Disabled                     | Disabled and secret revoked | Resubscribe, export, or delete |

A verified webhook is the authority that changes these states. The browser return URL is never an
entitlement signal.

## 5. Payment provider and checkout

Use **Stripe Billing** for the first release. Stripe owns card collection, Checkout, invoices, tax
where configured, subscriptions, payment methods, and the customer portal. Claire owns entitlements,
credits, and product authorization.

### Purchase flow

1. A signed-in person selects Claire Plus in the app or public acquisition flow.
2. `POST /api/billing/checkout` creates a one-time Checkout Session for the $10/month Stripe Price.
3. The person completes Stripe Checkout and returns to Claire’s success screen, which says
   “Confirming your subscription” until the webhook arrives.
4. `checkout.session.completed` and subscription events are signature-verified and deduplicated.
5. The billing worker creates or activates the personal entitlement and appends that month’s credit
   grant exactly once.
6. Renewal grants credits only after the relevant invoice is paid. Failed payment transitions the
   account through the configured grace period.

Use the Stripe customer portal for cancellation, card updates, receipts, and invoices. The product
must show the next renewal date and “cancel at period end” state in Settings.

## 6. Data model

Money uses integer minor units; model costs use integer `micro_usd`; credits use integer units.

```ts
type PersonalBillingAccount = {
  userId: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  plan: 'plus_monthly' | 'self_hosted';
  state: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingEmail: string | null;
  updatedAt: string;
};

type CreditLedgerEntry = {
  id: string;
  userId: string;
  kind:
    | 'monthly_grant'
    | 'top_up'
    | 'reservation'
    | 'settlement'
    | 'release'
    | 'adjustment'
    | 'expiration';
  credits: number; // positive grant or negative debit
  balanceAfter: number;
  usageEventId: string | null;
  stripePaymentId: string | null;
  idempotencyKey: string;
  createdAt: string;
};

type ManagedAiUsage = {
  id: string;
  userId: string;
  feature: 'reply' | 'assistant' | 'summary' | 'analysis' | 'classification' | 'embedding';
  modelTier: 'fast' | 'balanced' | 'best';
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  providerCostMicroUsd: number | null;
  chargedCredits: number;
  priceBookVersion: string;
  status: 'reserved' | 'settled' | 'released' | 'failed';
  createdAt: string;
};
```

Supporting tables:

- `stripe_webhook_events`: unique `stripe_event_id`, payload hash, processed time, and failure
  reason.
- `billing_checkout_intents`: user, expected Price ID, purpose (`subscription` or `top_up`),
  one-time nonce, and expiry.
- `ai_price_books` and immutable `ai_price_book_items`: provider/model rates and charge policy.
- `provider_credentials`: encrypted secret reference, fingerprint, provider, mode, model profile,
  health, and timestamps—never the raw secret.

The ledger is append-only. A refund, correction, or support adjustment creates a compensating entry
with the actor, reason, and related payment/usage ID.

## 7. Managed-AI charging flow

1. The AI gateway resolves the person’s active mode and entitlement.
2. For Claire AI, it estimates a bounded maximum debit from the active price book.
3. A transaction creates a negative reservation only if available credits cover it. The usage event
   ID is the provider idempotency key.
4. The provider request runs with explicit output and timeout bounds.
5. The gateway stores reported usage and settles the reservation from actual measured usage. It
   releases the difference, or performs a bounded additional debit; a balance may never go below
   zero.
6. Timeout, cancellation, duplicate callback, or provider failure releases the reservation exactly
   once.
7. A daily job reconciles provider usage, settled entries, Stripe grants, and top-ups. Any material
   mismatch is an operations alert.

The client never calculates or submits a credit amount. It receives a summary and receipt only.

## 8. API surface

All endpoints require the authenticated owner of the personal account.

| Endpoint                       | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `GET /api/billing/summary`     | Plan, renewal, balance, AI mode, and masked provider state      |
| `GET /api/billing/usage`       | Paginated credit receipts and feature/model usage               |
| `POST /api/billing/checkout`   | Creates a Plus subscription or one-time top-up Checkout Session |
| `POST /api/billing/portal`     | Creates a short-lived Stripe customer-portal session            |
| `POST /api/ai/providers`       | Saves a BYOK connection through the secret boundary             |
| `DELETE /api/ai/providers/:id` | Revokes the secret and disables its model profile               |
| `POST /api/webhooks/stripe`    | Signature-verified, idempotent Stripe event intake              |

Checkout metadata includes the user ID, intent nonce, price purpose, and optional top-up pack ID. The
webhook verifies that metadata against `billing_checkout_intents`; it never trusts client-supplied
account identity or creates a random paid account from metadata alone.

## 9. Product experience

Add **Settings → Claire Plus & AI**:

- Plan state, next renewal, cancel/manage link, and receipt history.
- A simple selector: **Claire AI (recommended)**, **Use my provider key**, or **Run a local model**
  when a self-hosted/local host is available.
- Credits available, credits reserved by in-flight requests, current monthly grant, and feature-level
  usage.
- 50%, 80%, 95%, and 100% warnings. At zero, show “wait for renewal,” “add credits,” and “use your
  own key”—never an unavoidable upsell modal.
- A one-time top-up confirmation showing price, credits, tax, and payment method before Checkout.
- Provider cards with a safe fingerprint, last successful test, revoke action, and data-flow copy.

The public pricing page says $10/month and makes it clear that Claire AI is capped, BYOK bypasses the
credit balance, and Claire Business is not part of the initial consumer release.

## 10. Security, support, and finance controls

- Verify Stripe signatures using the raw webhook body before parsing.
- Deduplicate Stripe event IDs and provider callback IDs.
- Use a database transaction and row-level locking for reservations.
- Store payment data only in Stripe; Claire stores Stripe IDs and safe receipt metadata.
- Redact API keys, authorization headers, prompt payloads, and payment data from logs and analytics.
- Record audit events for subscription state, credit grant, top-up, refund, provider-secret change,
  and manual adjustment.
- Provide support tooling to view an account’s entitlement and ledger without exposing provider
  secrets or message content.

## 11. Rollout and acceptance criteria

1. Implement the append-only ledger, price books, reservations, and staff reconciliation dashboard.
2. Configure one $10/month Stripe Price and manually test Stripe Checkout, renewal, cancellation,
   failure, and customer portal flows.
3. Ship the consumer billing/AI settings and monthly grant webhook processing.
4. Ship BYOK secret storage and revocation. Verify no BYOK request consumes Claire credits.
5. Add explicit one-time top-ups only after ledger, refund, tax, and reconciliation paths pass.

Before release, prove that:

- A paid monthly subscription activates only its intended user account and creates one monthly grant.
- Duplicate or out-of-order webhooks cannot duplicate a grant or entitlement change.
- Concurrent AI requests cannot spend more credits than the person owns.
- A depleted account can still read, search, send, export, and manage connections.
- Provider secrets never appear in logs, analytics, normal tables, or API responses.
- Cancellation, failed renewal, refund, and account deletion all follow documented state transitions.
- Every public price and credit claim matches the configured Stripe Price and active plan config.

## 12. Deferred Business product

Only after consumer billing and support are stable should Claire consider a separate Business plan.
That project may introduce multiple users, shared billing, pooled credits, SSO, data residency, SLA,
and administrative controls. It must not silently change the $10/month individual plan.
