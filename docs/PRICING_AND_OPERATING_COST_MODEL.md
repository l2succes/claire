# Claire Pricing and Operating Cost Model

**Status:** Planning baseline
**Last updated:** August 15, 2026
**Related documents:** [Payments and AI Credits](./PAYMENTS_AND_AI_CREDITS_SPEC.md), [AI Platform and Self-Hosting](./AI_PLATFORM_AND_SELF_HOSTING_SPEC.md), [Matrix Bridge Reference](./MATRIX_BRIDGE_REFERENCE.md)

## Purpose

This document models what it may cost to operate Claire as a $10/month consumer product. It is intended to support pricing, infrastructure, retention, AI-routing, and capacity decisions. It is not a vendor quote or a substitute for production telemetry.

The central conclusion is that Matrix and mautrix do not inherently make a $10 plan uneconomic. The material risks are:

1. Running AI work for every incoming message.
2. Embedding every individual message indefinitely.
3. Retaining bridged media on expensive block volumes.
4. Duplicating events and media across Matrix and Claire storage without a retention policy.
5. Offering permanently active bridge sessions to non-paying users.

With shared bridge infrastructure, gated AI usage, chunked search indexes, object storage, and explicit limits, a mature direct cloud cost of approximately **$0.80–$2.50 per active paid subscriber per month** is a reasonable planning target. Early pilots will cost more per subscriber because the always-on stack has a fixed baseline.

## Scope and exclusions

The estimates include:

- Claire API and background workers
- Redis and queues
- Synapse and its PostgreSQL database
- Shared mautrix bridge processes
- Claire's application database and search indexes
- Media storage and ordinary network transfer
- Managed AI inference
- A modest allowance for backups, logging, and monitoring

They exclude:

- Engineering and operations salaries
- Customer support labor
- Taxes, refunds, chargebacks, and fraud losses
- Legal, compliance, security-review, and insurance expenses
- Apple and Google developer program membership fees
- Large incident-driven expenses
- Enterprise-grade contractual SLAs or multi-region active-active operation

All figures are in USD and should be reviewed quarterly because infrastructure and model prices change frequently.

## Current service topology

Claire's Matrix deployment currently includes:

- The Bun API server
- Redis
- Synapse
- A PostgreSQL database for Synapse
- Shared WhatsApp, Telegram, and Instagram bridge processes
- Supabase/Postgres for normalized Claire data
- Synapse media storage
- Background jobs for suggestions, promise detection, and contact inference
- Embedding and semantic-search storage

The current compose definition is in [`docker/matrix/docker-compose.matrix.yml`](../docker/matrix/docker-compose.matrix.yml). The bridge processes are multi-user services; Claire does **not** need one bridge container per customer. Each connected account still adds long-lived upstream sessions, backfill, event traffic, media, database writes, and reconnect work.

Synapse can initially run as a monolith. At higher throughput, Synapse supports splitting functions into workers that share PostgreSQL and Redis. This allows gradual scaling without replacing Matrix. See the official [Synapse worker documentation](https://element-hq.github.io/synapse/develop/workers.html).

## Base planning assumptions

Unless a scenario states otherwise, the model assumes one active paid subscriber has:

| Driver | Baseline assumption |
|---|---:|
| Connected networks | 2 |
| Synchronized messages | 5,000/month |
| Newly retained media | 0.5 GB/month |
| Ask Claire actions | 100/month |
| Retention | 12 months |
| AI input per interactive action | 3,000 tokens |
| AI output per interactive action | 250 tokens |
| Deployment | One region with shared bridge pools |

These assumptions are deliberately visible because message volume, media volume, connection count, and AI context size matter more than registered-user count.

## Scale estimates

The following ranges represent direct monthly cloud cost, not total company expense.

| Paying users | Platform, databases, and media | Managed AI | Estimated total | Cost per active paid user |
|---:|---:|---:|---:|---:|
| 100 | $180–$350 | $50–$130 | $230–$480 | $2.30–$4.80 |
| 1,000 | $700–$1,600 | $500–$1,300 | $1,200–$2,900 | $1.20–$2.90 |
| 10,000 | $4,000–$10,000 | $5,000–$13,000 | $9,000–$23,000 | $0.90–$2.30 |
| 100,000 | $30,000–$75,000 | $50,000–$130,000 | $80,000–$205,000 | $0.80–$2.05 |

The ranges are intentionally broad. They should not be used as a promise of future margin until Claire has at least 25–50 active accounts running for a full month.

### Why the unit cost falls

The API, Redis, Synapse, bridge processes, databases, monitoring, and minimum redundancy remain online even for a small pilot. As the user base grows, these fixed costs are spread across more subscribers. Variable AI, media, database, and network costs then become more important.

### Why the unit cost may rise again

The model can become more expensive when Claire adds:

- Additional always-on connectors
- Large historical imports or frequent re-backfills
- Long media retention
- Larger AI contexts or premium models
- Active-active regions
- High-frequency proactive suggestions
- Rich notification bodies and media previews
- High availability for every bridge shard

## AI inference economics

As of this document's update date, official list pricing includes:

- OpenAI GPT-5.6 Luna: $1.00 per million input tokens and $6.00 per million output tokens.
- OpenAI GPT-5.6 Terra: $2.50 per million input tokens and $15.00 per million output tokens.
- Anthropic Claude Sonnet 5: $2.00 per million input tokens and $10.00 per million output tokens.

Sources: [OpenAI model pricing](https://developers.openai.com/api/docs/models/compare) and [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

At 100 actions per month, with 3,000 input tokens and 250 output tokens per action, the approximate monthly inference cost per subscriber is:

| Model | Calculation | Approximate cost/user/month |
|---|---|---:|
| GPT-5.6 Luna | 300K input + 25K output | $0.45 |
| Claude Sonnet 5 | 300K input + 25K output | $0.85 |
| GPT-5.6 Terra | 300K input + 25K output | $1.13 |

These figures exclude embeddings, retries, tool calls, moderation, and unusually long outputs. Context that grows from 3,000 to 10,000 tokens roughly triples the input portion of the cost.

### Per-message generation is not viable at $10

The current queue implementation in [`server/src/services/message-queue.ts`](../server/src/services/message-queue.ts) schedules an AI reply suggestion, promise detection, and contact inference for eligible incoming messages. If every one of 5,000 monthly messages caused even a $0.0045 workflow, inference alone would cost approximately **$22.50 per subscriber per month**.

Production policy should therefore be:

- Do not generate a full reply for every incoming message.
- Generate drafts when requested, when the conversation is opened, or for a tightly qualified notification.
- Use deterministic rules or the least-expensive suitable model for classification.
- Batch promise and relationship analysis where latency is unimportant.
- Cache relationship and rolling conversation summaries.
- Route normal work to a cost-efficient model and reserve premium models for explicit actions.
- Give managed accounts a hard provider-cost allowance.
- Offer paid top-ups and bring-your-own-key for heavy users.
- Record exact provider cost in micro-dollars for every request.

A sensible initial allowance is **$1.50–$2.00 of raw managed-model spend per paid subscriber per month**. User-facing credits can abstract across providers, but the ledger should retain actual provider, model, tokens, and cost.

## Search and embedding economics

The current semantic-search migration stores one `vector(1536)` value per message in [`supabase/migrations/20260813000001_add_conversation_assistant.sql`](../supabase/migrations/20260813000001_add_conversation_assistant.sql).

A 1,536-dimensional float32 vector has a raw lower bound of:

```text
1,536 dimensions × 4 bytes = 6,144 bytes per message
```

At the baseline of 5,000 messages per month:

| Scale | Raw vector data before row/index overhead |
|---|---:|
| One user, one month | 30.7 MB |
| One user, one year | 368.6 MB |
| 10,000 users, one year | 3.69 TB |
| 100,000 users, one year | 36.9 TB |

HNSW index, row, metadata, WAL, replication, and backup overhead increase these totals. More importantly, hundreds of millions of vector rows create memory, index-build, IOPS, vacuuming, and query-latency problems. Supabase's production guidance notes that vector indexes require sufficient RAM and intentional scaling. See [Supabase vector production guidance](https://supabase.com/docs/guides/ai/going-to-prod).

### Recommended search design

- Use ordinary full-text search for exact message matches.
- Embed rolling conversation chunks or summaries rather than every message.
- Target approximately one embedding per 20–50 messages.
- Re-embed only the chunk affected by new or edited messages.
- Store source message IDs with every chunk so AI answers can cite originals.
- Evaluate smaller embeddings or `halfvec` after retrieval-quality testing.
- Apply retention and deletion to embeddings when source messages expire.
- Keep a recent-message hot index and rebuild older data on demand if necessary.

Chunking at 20–50 messages per vector can reduce vector count and index size by roughly the same factor while preserving source-level retrieval through metadata.

## Media storage economics

Synapse stores local uploads, thumbnails, avatars, and cached remote media. This behavior is documented in the official [Synapse media repository guide](https://element-hq.github.io/synapse/latest/media_repository.html). Bridged messaging networks can therefore create substantial media storage even when Claire does not originate the content.

At 0.5 GB of new retained media per subscriber per month with twelve-month retention:

| Scale | Retained media after one year |
|---|---:|
| One user | 6 GB |
| 1,000 users | 6 TB |
| 10,000 users | 60 TB |
| 100,000 users | 600 TB |

Current published storage prices illustrate why the storage backend matters:

- Railway volume storage: $0.15/GB/month.
- Cloudflare R2 standard storage: $0.015/GB/month with no internet egress charge.
- Supabase file storage: 100 GB included on Pro, then $0.0213/GB.

Sources: [Railway pricing](https://docs.railway.com/pricing), [Cloudflare R2 pricing](https://www.cloudflare.com/products/r2/), and [Supabase pricing](https://supabase.com/pricing).

At 60 TB, the storage component alone is approximately:

| Storage class | Approximate monthly storage cost |
|---|---:|
| Railway volume | $9,000 |
| Cloudflare R2 | $900 |
| Supabase file storage overage | Approximately $1,275 |

Request, transfer, replication, and backup charges may be additional. Media should therefore move to an S3-compatible object store before Claire reaches substantial usage.

### Recommended media policy

- Keep a single authoritative blob instead of duplicating media in Matrix and Claire storage.
- Configure Synapse to use object storage or an appropriate media-provider module.
- Deduplicate identical files and generated thumbnails.
- Separate metadata retention from binary retention.
- Define clear retention tiers for managed cloud accounts.
- Permit users to remove old cached media without deleting message text where appropriate.
- Track stored bytes, downloaded bytes, uploaded bytes, and cache-hit rates per account.
- Treat large backfills as quota-bearing operations.

## Compute and database pricing references

Railway currently publishes the following usage rates:

- RAM: $10/GB/month
- CPU: $20/vCPU/month
- Egress: $0.05/GB
- Volume storage: $0.15/GB/month

See [Railway resource pricing](https://docs.railway.com/pricing).

Supabase Pro currently starts at $25/month, includes 8 GB of database disk and 100 GB of file storage, and offers compute sizes from a 1 GB Micro through larger dedicated instances. Database disk beyond the included amount is currently $0.125/GB for general-purpose storage. See [Supabase pricing](https://supabase.com/pricing).

At scale, database compute, memory, IOPS, replication, backups, and operational isolation are likely to matter more than the raw cost of message text.

## Recommended production evolution

### Stage 1: Pilot, up to approximately 100 paid users

- One region
- One Synapse instance
- One shared bridge process per supported network
- Separate logical databases for Synapse and Claire
- Redis-backed asynchronous jobs
- Object storage for media
- Managed database backups
- Strict AI and import limits
- No permanently active free tier

Reliability is more important than maximizing utilization. A pilot should carry enough headroom to observe reconnect storms and backfill behavior.

### Stage 2: Early scale, approximately 100–5,000 paid users

- Multiple Claire API and job-worker replicas
- Dedicated queues by workload type
- Independently scalable Synapse and Claire databases
- Per-connector health, lag, and reconnect metrics
- Read replicas only when query evidence justifies them
- Chunked semantic indexes
- Account-level cost and quota enforcement
- At least one warm recovery path for critical bridge services

### Stage 3: Connector sharding, approximately 5,000–50,000 paid users

Assign accounts to bounded Matrix/bridge shards:

```text
Account directory
      |
      +-- Shard A: Synapse + Postgres + bridge pool
      +-- Shard B: Synapse + Postgres + bridge pool
      +-- Shard C: Synapse + Postgres + bridge pool
```

The account limit per shard must be chosen from measured sessions, events, memory, reconnect behavior, and backfill throughput—not from a theoretical user count. Sharding limits blast radius and allows independent bridge restarts and migrations.

### Stage 4: Large scale, above approximately 50,000 paid users

- Split Synapse into workload-specific workers where profiling supports it
- Automate shard placement and evacuation
- Separate real-time and backfill capacity
- Introduce database partitioning and lifecycle-managed cold data
- Negotiate volume pricing with AI and infrastructure providers
- Use regional deployments only when latency, residency, or reliability requirements justify their cost
- Maintain connector-specific incident and upstream-rate-limit playbooks

## Revenue and contribution margin

At a $10 subscription price:

- Stripe's standard US online-card fee of 2.9% plus $0.30 leaves approximately **$9.41** before tax, refunds, and disputes. See [Stripe pricing](https://stripe.com/pricing).
- Apple's Small Business Program has a 15% commission for eligible developers, leaving approximately **$8.50**. Eligibility changes after its annual proceeds threshold. See [Apple's Small Business Program](https://developer.apple.com/app-store/small-business-program/).
- Google Play subscription fees vary by market and program. See the current [Google Play service-fee schedule](https://support.google.com/googleplay/android-developer/answer/112622).

At a direct cloud cost of $2.50 per subscriber:

| Billing route | Net receipts before tax | Contribution after cloud cost | Infrastructure contribution margin |
|---|---:|---:|---:|
| Stripe web purchase | $9.41 | $6.91 | 73% |
| Apple at 15% | $8.50 | $6.00 | 71% |

This is not company gross margin because it excludes support, payroll, compliance, and other cost of service. It does show that payment-channel fees may exceed the cost of operating Matrix.

## Packaging implications

### Recommended consumer cloud plan

- $10/month
- Two or three managed connections initially
- Explicit message and media retention policy
- A managed AI allowance backed by a $1.50–$2.00 provider-cost ceiling
- Additional AI credit packs
- Bring-your-own-model-key support
- Usage alerts before blocking or charging for overage
- Graceful degradation to ordinary search and messaging when AI allowance is exhausted

### Bring your own key

BYOK removes most model-inference cost but does not remove Claire's costs for bridges, Matrix, storage, search, security, and support. It should therefore be a capability of the paid plan, not a substitute for the subscription.

### Self-hosting

Self-hosting transfers compute, databases, media, and most network costs to the user. Claire may still charge for managed updates, remote access, managed AI credits, backups, or support. Self-hosting also creates documentation and support costs that must be measured separately.

### Free access

A free account with continuously connected bridges is not truly free to operate. Safer options are:

- A time-limited full trial
- A local-only free edition
- A free viewer without managed always-on synchronization
- Automatic suspension of cloud connectors after the trial

## Operational risks beyond the bill

Connector reliability may become a larger operational burden than raw compute. Major risks include:

- Upstream authentication changes
- Account challenges, logouts, and bans
- Reconnect storms after bridge or network outages
- Duplicate events after recovery
- Large backfills competing with real-time traffic
- Platform-specific media formats and expiry behavior
- iMessage host availability and macOS permission changes
- Credential revocation and secure session migration

Each connector should have feature flags, staged rollout, a health score, queue lag, authentication state, and a documented recovery process.

## Required telemetry

Record the following per account per day:

### Connections and events

- Connected bridge sessions by platform
- Successful and failed synchronizations
- Messages received and sent
- Backfilled events
- Reconnect count and duration
- Bridge queue depth and lag

### Storage and databases

- Synapse database bytes
- Claire database bytes
- Media bytes retained
- Media bytes transferred
- Embedding count and total index size
- Backup and WAL growth

### AI

- Provider and model
- Input, cached-input, reasoning, and output tokens
- Retries and failed requests
- Exact raw provider cost in micro-dollars
- Feature that initiated the request
- AI cost per active account and per successful action

### Performance and reliability

- API and sync latency
- CPU and resident memory by service
- Database connections and slow queries
- Worker throughput and failure rate
- Connector uptime
- Recovery time after restart

### Business metrics

- Paid and active accounts
- Connected networks per paid account
- Payment-channel fee
- Refund and chargeback rate
- Cloud cost per active paid account
- Contribution margin by plan and acquisition channel

## Review gates

### Before public beta

- Move retained media off general-purpose Railway volumes.
- Add exact AI-cost metering and account-level budgets.
- Prevent automatic full-response generation for every incoming message.
- Define retention and connector suspension behavior.
- Build basic connector health and queue dashboards.

### Before 1,000 paid users

- Replace per-message embeddings with chunked retrieval.
- Load-test onboarding backfills and reconnect storms.
- Measure the true storage multiplier between upstream, Matrix, and Claire.
- Establish per-platform connection and import quotas.
- Verify backup restoration for both Matrix and Claire data.

### Before 10,000 paid users

- Establish a tested connector-sharding strategy.
- Separate backfill from real-time worker capacity.
- Automate cost anomaly alerts and spend caps.
- Conduct bridge outage and shard recovery exercises.
- Negotiate material AI, database, and object-storage volume discounts.

## Formula reference

The operating model should eventually be generated from telemetry using these basic formulas:

```text
monthly compute cost
  = sum(service average RAM × RAM rate)
  + sum(service average vCPU × CPU rate)

monthly AI cost
  = sum(input tokens × input rate
      + cached tokens × cached rate
      + output tokens × output rate
      + tool and retry charges)

retained media
  = new media per month × retention months × active accounts

monthly media storage cost
  = retained media GB × object-storage rate

contribution per subscriber
  = subscription receipts
  - payment fee
  - allocated platform cost
  - managed AI cost
  - allocated support cost

break-even paid subscribers
  = monthly fixed operating cost
  / contribution per subscriber before fixed cost
```

## Decision summary

The $10 consumer price is viable if Claire enforces the following constraints:

1. Managed AI spend is budgeted and observable.
2. Full AI generation is user-driven or selectively triggered, not message-driven.
3. Semantic search uses chunks and summaries rather than permanent per-message embeddings.
4. Media lives in inexpensive object storage with retention controls.
5. Bridge processes remain shared and are later divided into bounded shards.
6. Free users cannot consume indefinite always-on cloud bridge capacity.
7. Pricing and limits are reviewed against production telemetry, not registration counts.

The next meaningful step is not a more detailed theoretical forecast. It is a one-month beta cohort with per-account cost telemetry, followed by an updated model using p50, p90, and p99 usage for messages, media, connections, and AI.
