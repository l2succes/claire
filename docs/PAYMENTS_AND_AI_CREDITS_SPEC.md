# Claire Payments and AI Credits Specification

**Status:** Proposed for implementation
**Audience:** Product, finance, design, backend, security, support, and operations
**Scope:** Claire Cloud contracts, payments, managed-AI credits, bring-your-own-key (BYOK),
entitlements, invoicing, and the user-facing billing experience.

## 1. Product decision

Claire Cloud is sold as a **$10,000 USD annual contract per workspace**. It pays for the managed
messaging product: API, database, Matrix homeserver, bridge operations, search, backups, upgrades,
and support. It is not a per-seat fee and it is not an uncapped AI plan.

AI is a separate, prepaid entitlement because it has variable upstream cost. A workspace chooses one
of three modes:

| Mode                      | Who operates Claire | Who pays the model provider      | Claire credit balance           |
| ------------------------- | ------------------- | -------------------------------- | ------------------------------- |
| Claire AI                 | Claire Cloud        | Claire                           | Deducted from prepaid allowance |
| Cloud BYOK                | Claire Cloud        | Customer's provider account      | Never deducted                  |
| Self-hosted / local model | Customer            | Customer or no external provider | Not used                        |

The initial order form includes a stated annual Claire AI balance. The recommended launch allowance
is **100,000 credits**—a $1,000 usage-value balance—but this value must be a contract field, not a
hard-coded plan assumption. No automatic top-up, overage, or card charge is permitted by default.

## 2. Customer-facing rules

### 2.1 Pricing and credits

- One Claire Cloud workspace costs $10,000 USD for a 12-month service term.
- One managed-AI credit represents **$0.01 of published Claire AI usage value**, not one token,
  message, or request.
- A request debits credits from the model-specific usage calculation in the active price book. The
  receipt identifies the product tier (`fast`, `balanced`, or `best`), feature, usage, and debit.
- Credits are shown as a wallet balance and an approximate dollar value. They do not expire before
  the end of the paid term unless the contract explicitly says otherwise.
- A top-up is a prepaid, administrator-approved purchase. Recommended packs are 25,000 and 100,000
  credits; exact sales price, tax treatment, and discounting belong in the Stripe price and order
  form, not application code.
- When the balance is exhausted, AI actions stop cleanly. Reading, search, sending, bridges, and
  data export remain available.

### 2.2 Clear disclosures

The billing UI must always tell a user:

1. Whether the request will use Claire AI, their provider key, or a local runtime.
2. Whether selected conversation content leaves Claire for an external AI provider.
3. The workspace credit balance before a managed request is sent.
4. That a BYOK request is billed by the selected provider, not Claire.
5. That changing providers does not retroactively change completed usage receipts.

Never label BYOK as “private” or “local” merely because the customer owns the API key. A Cloud BYOK
request still passes through Claire Cloud to construct the message context.

## 3. Commercial package and entitlement model

```text
Stripe customer / contract
          │
          ├── Claire workspace subscription ($10,000 annually)
          │       └── workspace entitlement: cloud_active
          │
          ├── contracted annual AI credit grant
          │       └── credit ledger balance
          │
          └── optional prepaid credit top-ups
                  └── credit ledger balance
```

The workspace, not an individual user, owns the subscription, credit balance, provider connections,
and billing permissions. At least one workspace member must have the `billing_admin` role. Normal
members can see the mode and remaining balance but cannot change provider secrets, buy credits, or
change payment methods.

### 3.1 Entitlement states

| State       | Messaging                            | Managed AI                | BYOK                         | Billing UI                      |
| ----------- | ------------------------------------ | ------------------------- | ---------------------------- | ------------------------------- |
| `trialing`  | Enabled until trial end              | Contract-defined          | Enabled                      | Countdown and conversion action |
| `active`    | Enabled                              | Allowed if credits remain | Enabled                      | Normal                          |
| `past_due`  | Grace window only                    | Paused by policy          | Enabled during grace         | Urgent admin banner             |
| `suspended` | Read/export only                     | Disabled                  | Disabled                     | Resolve invoice                 |
| `canceled`  | Read/export through retention window | Disabled                  | Disabled and secrets revoked | Export/delete choices           |

The first release may omit self-serve trials, but the state model must support them. A webhook, not a
browser redirect, is the authority that changes entitlement state.

## 4. Implementation choice

Use **Stripe Billing** for the initial managed-cloud implementation. Stripe handles the hosted
checkout session, invoices, tax collection where configured, payment methods, subscriptions, and
customer portal. Claire remains authoritative for product entitlements and credits.

Do not make a Stripe customer ID a substitute for authorization. The billing service maps verified
Stripe events to a Claire `workspace_id`, records the raw event ID, and performs an idempotent domain
transition. Stripe metadata may assist correlation, but the server verifies it against a stored
checkout intent.

## 5. Data model

All monetary values are integer minor units. Store model cost in integer `micro_usd` to preserve
precision; store credits as integer units.

```ts
type WorkspaceBillingAccount = {
  workspaceId: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  plan: 'cloud_annual' | 'self_hosted';
  state: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingEmail: string | null;
  updatedAt: string;
};

type CreditLedgerEntry = {
  id: string;
  workspaceId: string;
  kind:
    | 'contract_grant'
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
  workspaceId: string;
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

Required supporting tables:

- `workspace_members` with `billing_admin` role and audit fields.
- `stripe_webhook_events` with unique `stripe_event_id`, payload hash, processed timestamp, and
  failure reason.
- `billing_checkout_intents` binding workspace, authenticated initiator, expected Stripe price,
  and one-time nonce.
- `ai_price_books` and immutable `ai_price_book_items` for provider/model input, output, cache,
  and embedding rates plus Claire margin policy.
- `provider_credentials` storing only encrypted secret references, scope, mode, fingerprint, and
  health—not raw key values.

`CreditLedgerEntry` is append-only. Never update a previous debit to “fix” an error; append an
explicit compensating adjustment with actor, reason, and approval reference.

## 6. Managed-AI charging flow

1. The AI gateway resolves the workspace mode and checks an active cloud entitlement.
2. For Claire AI, it estimates the maximum credits using the active, versioned price book and the
   requested model tier.
3. In one transaction, it creates a negative reservation entry only if the available balance can
   cover the estimate. The returned usage event ID becomes the provider idempotency key.
4. The provider request runs with a bounded output budget and explicit timeout.
5. The gateway records reported token usage, calculates the actual debit, settles the reservation,
   and appends either a release or additional debit. It never allows a final balance below zero.
6. On timeout, cancellation, malformed provider response, or duplicate callback, the reservation is
   released exactly once.
7. A nightly reconciliation compares aggregate provider usage with settled Claire usage events and
   opens an operations alert for material variance.

At no point may a UI-provided credit value be trusted. All credit calculations happen on the server
using a pinned price-book version.

## 7. BYOK and local-model requirements

### Cloud BYOK

- The user enters a provider credential through a native or web secure form.
- The secret is encrypted into the cloud secret manager directly; it must not enter analytics,
  logs, React state, AsyncStorage, ordinary Postgres rows, or support exports.
- Claire stores a non-reversible fingerprint, provider, model configuration, health status, and
  secret reference.
- A test request uses a minimal synthetic prompt. It must not consume Claire credits.
- The billing screen reports provider-request counts and tokens when available, with wording that
  the provider bills the customer directly.

### Self-hosted and local runtime

- Self-hosted instances have no dependency on Stripe for message functionality.
- Their configured provider credentials and local endpoints never synchronize to Claire Cloud.
- The local runtime health UI shows availability and latency. It does not claim that the model is
  offline unless the configured endpoint and egress policy have been verified.

## 8. API surface

All endpoints require an authenticated workspace member. Write operations require `billing_admin`.

| Endpoint                                      | Role          | Purpose                                                             |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `GET /api/billing/summary`                    | member        | Entitlement state, renewal, balance, AI mode, masked provider state |
| `GET /api/billing/usage`                      | member        | Paginated feature/model usage and credit receipts                   |
| `POST /api/billing/checkout`                  | billing admin | Creates an annual-contract or prepaid-credit Checkout Session       |
| `POST /api/billing/portal`                    | billing admin | Creates a time-limited Stripe customer-portal session               |
| `POST /api/billing/credit-topups/:id/approve` | billing admin | Explicitly approves a prepared top-up before checkout               |
| `POST /api/ai/providers`                      | billing admin | Stores a BYOK connection through the secret boundary                |
| `DELETE /api/ai/providers/:id`                | billing admin | Revokes secret and disables dependent model profiles                |
| `POST /api/webhooks/stripe`                   | Stripe only   | Verifies signed events and queues idempotent processing             |

Checkout creation must attach the workspace ID, intent nonce, contract ID, and requested credit pack
to Stripe metadata. The webhook validates those values against `billing_checkout_intents`; it never
creates an arbitrary workspace from metadata alone.

## 9. Product experience

### Pricing page

The public site states the $10,000 annual workspace price and makes three points unambiguous:

- Claire Cloud is managed messaging infrastructure, not unlimited AI.
- Claire-managed AI is prepaid, visible, and capped.
- Customers may use their own provider key or run their own model where the host supports it.

Do not publish a fixed included-credit amount until sales, finance, and provider-cost modeling approve
it. The signed order form and post-purchase workspace show the exact grant.

### In-product billing

`Settings → Workspace → Billing & AI` has:

- Plan name, workspace status, renewal date, and billing administrator.
- AI mode switcher: Claire AI, provider key, or local runtime where permitted.
- Credit balance, reserved balance, monthly feature breakdown, and hard-cap state.
- “Add credits” only for billing admins; it always shows price, credits, tax, and confirmation.
- Provider connection cards with secret fingerprint, last check, deletion, and data-flow disclosure.
- An audit link showing contract grants, purchases, settlements, adjustments, and failed requests.

Warnings appear at 50%, 80%, and 95% of available credits. At zero, AI controls explain the three
available resolutions; they do not turn into a surprise checkout modal.

## 10. Security, finance, and operations controls

- Verify Stripe webhook signatures against the raw request body before parsing.
- Deduplicate each Stripe event ID and provider usage callback ID.
- Use database transactions and row locking for reservations; never calculate a balance client-side.
- Restrict billing reports to workspace membership and credential changes to billing admins.
- Keep raw payment data exclusively in Stripe. Claire stores Stripe IDs and safe invoice metadata.
- Redact API keys, authorization headers, provider prompt payloads, and payment data in logs.
- Record an immutable audit event for every plan change, provider-secret change, top-up, adjustment,
  and admin action.
- Reconcile Stripe payments, invoices, credit grants, and provider bills daily. Escalate any unpaid
  credit grant or reconciliation delta above the finance threshold.

## 11. Rollout plan

1. **Internal ledger:** append-only credits, price books, usage reservations, and a staff-only
   reconciliation dashboard; no checkout.
2. **Contracted Cloud:** manually provision $10,000 annual workspaces through Stripe invoice or
   Checkout; grant credits from a signed order form.
3. **In-product visibility:** expose balance, usage, mode, warnings, and audit history to customers.
4. **BYOK:** ship encrypted provider connections with test/revoke flows; ensure no managed credits
   are consumed.
5. **Prepaid top-ups:** add explicit billing-admin checkout and webhook grants after ledger and
   finance reconciliation have passed.
6. **Self-serve changes:** only after support, tax, cancellation, and abuse controls are proven.

## 12. Acceptance criteria

- A paid $10,000 annual contract activates exactly one intended workspace through a verified webhook.
- Duplicate or out-of-order Stripe events cannot duplicate a credit grant or change entitlement
  incorrectly.
- A managed request reserves and settles credits once; provider failure releases the reservation.
- Two concurrent requests cannot spend more credits than the workspace owns.
- A zero-credit workspace can still read, search, send, export, and manage connections.
- BYOK requests do not write a Claire credit debit and provider secrets are absent from application
  logs, analytics, responses, and normal database tables.
- Billing admins can revoke a provider key and the next request fails closed.
- Every public pricing claim matches the configured contract price and the in-product billing view.
- Invoice, ledger, and provider reconciliation reports surface mismatches with actionable IDs.

## 13. Open business decisions

- Confirm the included annual managed-AI grant, credit-pack prices, tax jurisdictions, and discount
  policy before publishing an order form.
- Decide whether self-hosted commercial support is a separate contract or bundled with Cloud.
- Define seat policy, SSO, data residency, SLA, and support response targets for the $10,000 plan.
- Obtain legal review for service terms, AI-provider disclosures, data processing, refunds, and
  credit expiry rules.
