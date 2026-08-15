# Claire AI Platform, Self-Hosting, and Managed Cloud Specification

**Status:** Proposed
**Audience:** Product, design, backend, desktop, infrastructure, security, and billing
**Scope:** Product packaging and the provider-neutral AI platform that powers reply assistance,
Ask Claire, conversation memory, promise detection, summaries, and semantic search.

## 1. Executive decision

Claire should ship as one product with two operating editions and three AI execution modes:

1. **Claire Community** — users download and run the full Claire stack on infrastructure they
   control. They can disable AI, provide their own API key, or use a local model runtime.
2. **Claire Cloud** — Claire operates the server, database, Matrix infrastructure, bridges, backups,
   upgrades, and monitoring for a subscription. The plan includes a managed AI allowance, while
   still allowing bring-your-own-key (BYOK).
3. **Private desktop-only** — a later, verified execution mode in which messages, indexes, model
   inference, and credentials remain on a user-controlled computer. This is not part of the initial
   commercial launch and must not be marketed as available until egress tests pass.

Use **Vercel AI SDK Core** as a provider abstraction inside the Bun server. Use dedicated provider
packages for OpenAI, Anthropic, Amazon Bedrock, and other first-class providers, plus the
OpenAI-compatible provider for runtimes such as Ollama, LM Studio, vLLM, and compatible hosted
services. Do **not** require Vercel AI Gateway. Gateway can be an optional managed-cloud route later,
but making it mandatory would add another data processor and weaken the clarity of BYOK and
self-hosted data flows.

The key product promise is:

> Download Claire and run it yourself for free, or pay Claire to keep your messaging infrastructure
> online and include the AI capacity. In either edition, you choose who runs the model.

## 2. Why this product model works

Messaging infrastructure and AI inference are different costs and different trust decisions. Claire
should expose them separately.

- A user may want managed bridges but prefer to pay OpenAI or Anthropic directly.
- A user may want managed bridges and the simplest possible managed-AI experience.
- A technical user may self-host Claire while calling a commercial model provider.
- A privacy-sensitive user may self-host both Claire and an open-weight model.
- A local model may be adequate for classification and embeddings but not for the highest-quality
  relationship-aware reply generation.

This separation avoids an artificial choice between “fully hosted” and “fully local” and gives
Claire a durable business: customers pay for uptime, bridge maintenance, backups, and convenience,
not for access to source code alone.

## 3. Editions and responsibilities

| Capability                                   | Claire Community        | Claire Cloud                                  |
| -------------------------------------------- | ----------------------- | --------------------------------------------- |
| Mobile and desktop clients                   | Included                | Included                                      |
| Bun server, Supabase, Redis, Matrix, bridges | User operates           | Claire operates                               |
| Upgrades and bridge recovery                 | User operates           | Managed by Claire                             |
| Backups and monitoring                       | User operates           | Managed by Claire                             |
| Managed Claire AI allowance                  | No                      | Included by plan                              |
| Bring your own provider key                  | Yes                     | Yes                                           |
| Local models                                 | Yes                     | Only through a user-controlled execution host |
| Support                                      | Community documentation | Product support and service status            |
| Data location                                | User-selected host      | Claire-managed region, disclosed in product   |

### Licensing prerequisite

The repository currently has no explicit `LICENSE` file. Claire must not describe the downloadable
edition as “open source” until a license is selected and added. Until then, use “self-hostable” or
“source available.” License selection is a business decision outside this technical specification.

## 4. AI execution modes

### 4.1 Claire-managed AI

Claire owns the provider account and pays the upstream bill. A plan includes a monthly AI allowance.

Data flow:

```text
Client → Claire API → Claire context builder → Claire-selected model provider
                                      ↘ usage ledger + redacted operational telemetry
```

Properties:

- No API-key setup for the customer.
- Claire selects task-appropriate models behind stable product tiers such as `fast`, `balanced`,
  and `best`.
- Claire can change the underlying model without changing user-visible settings, but only after
  evals show equal or better quality.
- Usage, rate limits, fallbacks, and provider outages are Claire’s responsibility.
- The UI identifies that selected conversation content is sent to Claire’s configured AI provider.

### 4.2 Cloud BYOK

Claire hosts the product, but the customer supplies a provider key and pays that provider directly.

Data flow:

```text
Client → Claire API → Claire context builder → provider using customer credential
                          ↘ metadata-only usage record
```

Properties:

- Message content still passes through Claire Cloud because the cloud server builds the context.
- The provider credential is stored in an encrypted secret store, never an ordinary application
  table.
- Claire does not add model usage to the customer’s managed-AI allowance.
- Claire still charges for managed infrastructure.
- Provider usage and retention terms belong to the customer’s provider account.
- Disconnecting a provider deletes its secret and disables dependent task profiles.

“Use my own key” must never be described as “local” or “Claire cannot see the content.”

### 4.3 Self-hosted BYOK

The user’s Claire server calls the selected provider directly using environment-backed or
secret-store credentials on the user’s host.

Properties:

- Claire Cloud receives no AI request or credential.
- The external model provider still receives the prompt and selected message context.
- Product telemetry is off by default in Community deployments.
- The setup wizard validates the provider without transmitting the key to Claire.

### 4.4 Local model

The Claire server calls a model runtime on the same host or trusted LAN, normally through an
OpenAI-compatible endpoint.

Initial supported runtimes:

- Ollama
- LM Studio
- Any explicitly configured OpenAI-compatible endpoint in a self-hosted deployment

Later supported runtimes may include vLLM, llama.cpp servers, and managed private endpoints.

Important constraints:

- A Claire Cloud process cannot call `localhost` on a customer’s computer.
- Cloud accounts that want a desktop-resident model require a supervised desktop execution broker.
  That broker is a separate project and is not needed for Community self-hosting.
- Local model quality and feature support vary. Claire must capability-test structured output,
  context length, embeddings, tool calling, and streaming instead of assuming compatibility.
- The desktop or self-hosted machine must remain online for AI features to work.

## 5. Product experience

### 5.1 Settings structure

Add **Settings → AI & models** with three primary choices:

1. **Claire AI — recommended**
   - “Included with your Claire Cloud plan.”
   - Shows allowance remaining, renewal date, and current quality tier.
2. **Use my provider account**
   - OpenAI, Anthropic, Amazon Bedrock, Google, xAI, Groq, Mistral, and advanced
     OpenAI-compatible setup.
   - Shows who bills the usage and where the key is stored.
3. **Run models locally**
   - Ollama, LM Studio, or custom compatible endpoint.
   - Shows which device executes AI and whether that device is currently reachable.

Each provider setup screen contains:

- Provider name and link to create a key.
- Secret field that can be submitted but never read back.
- Optional organization, project, region, and base URL fields when applicable.
- “Test connection” action.
- Models discovered from the provider when supported, plus an advanced manual model-ID field.
- A plain-language data-flow disclosure specific to the selected mode.
- Key fingerprint, creation time, last successful check, last error category, and revoke action.

### 5.2 Simple and advanced model selection

Most users should not configure five model dropdowns. The default UI offers:

- **Fast** — prioritizes latency and low usage.
- **Balanced** — default for reply suggestions and Ask Claire.
- **Best quality** — higher cost and latency, with an explicit allowance impact.

An advanced panel maps individual AI jobs:

| Task role        | Product use                                | Required capability                                  |
| ---------------- | ------------------------------------------ | ---------------------------------------------------- |
| `reply`          | Suggested replies and rewrites             | Structured output                                    |
| `assistant`      | Ask Claire answers                         | Structured output, long context, streaming preferred |
| `analysis`       | Explanations, summaries, memory extraction | Structured output                                    |
| `classification` | Promise and intent detection               | Low latency, structured output                       |
| `embedding`      | Cross-chat semantic search                 | Embedding model with fixed dimensions                |

A provider connection can be valid for some roles and invalid for others. For example, an
Anthropic connection can generate text but does not by itself provide an embedding model; the user
must choose a separate embedding provider or use local lexical search.

### 5.3 Usage UI

Managed AI displays:

- Allowance used and remaining.
- Usage grouped by feature, not just raw tokens.
- Optional daily warning and monthly hard cap.
- Whether a request used `fast`, `balanced`, or `best`.

BYOK displays:

- Request and token counts reported by the provider.
- A clear statement that charges appear in the provider account.
- Cost estimates only when Claire has a current price entry; otherwise show usage without invented
  currency estimates.

Local mode displays:

- Requests, latency, and model runtime health.
- No dollar estimate unless the user adds an optional local-cost profile.

## 6. Billing and AI allowance design

Do not create an arbitrary “one credit equals one request” economy. Different models and tasks have
orders-of-magnitude cost differences.

Internally, managed AI uses a dollar-denominated ledger:

- Store amounts as integer `micro_usd` values.
- Version the provider price book used to calculate each event.
- Reserve an estimated maximum before a managed request.
- Settle the reservation from actual provider-reported usage after completion.
- Release the reservation on provider failure.
- Reconcile aggregate provider invoices against the ledger.

The user-facing plan may call the allowance “AI credits,” but the UI must also show a familiar value
such as “$8 of managed AI included” or a feature-level estimate. Exact plan prices and markup remain
a go-to-market decision.

Recommended packaging:

- **Community:** free self-hosted software; BYOK or local models; no managed allowance.
- **Claire Cloud:** managed infrastructure subscription with an included monthly AI allowance.
- **Cloud + BYOK:** same infrastructure subscription; provider usage bypasses the Claire allowance.
- **Top-ups or overage:** opt-in only, with a user-set hard cap. Never silently run an unlimited
  bill.

Infrastructure entitlement and AI allowance must be separate ledger concepts even if sold together.
Users who exhaust AI remain able to read and send messages.

## 7. Provider architecture

### 7.1 Boundary

Only files under `server/src/services/ai/` may import Vercel AI SDK or provider packages. Product
services depend on a Claire-owned interface so a future SDK change does not touch every feature.

```text
Reply / Ask Claire / Voice profile / Memory / Promise detector
                              │
                       ClaireAIService
                              │
             ┌────────────────┼────────────────┐
             │                │                │
       Task router      Policy middleware   Usage meter
             │                │                │
             └──────── Provider registry ─────┘
                              │
     OpenAI | Anthropic | Bedrock | Google | OpenAI-compatible | Local
```

Proposed interface:

```ts
type AITaskRole = 'reply' | 'assistant' | 'analysis' | 'classification' | 'embedding';

interface AIExecutionContext {
  userId: string;
  task: AITaskRole;
  hostingMode: 'claire_cloud' | 'self_hosted' | 'desktop_local';
  providerConnectionId?: string;
  modelProfileId: string;
  requestId: string;
  abortSignal?: AbortSignal;
}

interface ClaireAIService {
  generateObject<T>(context: AIExecutionContext, input: StructuredAIInput<T>): Promise<AIResult<T>>;
  streamText(context: AIExecutionContext, input: TextAIInput): Promise<AITextStream>;
  embedMany(context: AIExecutionContext, values: string[]): Promise<AIEmbeddingResult>;
}
```

Every result normalizes:

- Provider and resolved model ID.
- Provider request ID when available.
- Input, cached-input, and output token usage.
- Finish reason and warnings.
- Latency and retry count.
- Whether a fallback was used.
- Estimated managed cost and price-book version.

Prompt text, message content, and model output are not included in operational logs or usage events.

### 7.2 Provider registry

Use AI SDK `createProviderRegistry` with stable Claire connection IDs rather than global singleton
providers. Provider instances are created per encrypted credential reference and cached briefly in
memory.

Initial provider packages:

- `ai`
- `@ai-sdk/openai`
- `@ai-sdk/anthropic`
- `@ai-sdk/amazon-bedrock`
- `@ai-sdk/openai-compatible`

Add Google and other dedicated provider packages only when a product setup screen and contract tests
exist. Kimi can initially use the OpenAI-compatible provider. Prefer Anthropic’s dedicated provider
over Anthropic’s OpenAI compatibility endpoint because Anthropic documents that compatibility as a
testing path with feature limitations.

### 7.3 Provider-neutral structured output

Reply suggestions and analysis features currently depend on hand-parsed JSON. Migrate them to a
schema-backed structured-output call and validate the result again at the Claire boundary.

Rules:

- Every structured task owns a Zod schema.
- A model must pass a setup-time structured-output smoke test before being selectable for that role.
- No provider-specific `response_format` appears in product services.
- Invalid output receives at most one repair attempt; repeated invalid output marks the model-role
  pair unhealthy.
- Fallbacks are allowed only between explicitly enabled model profiles with equivalent privacy and
  billing modes.

Never fall back from BYOK or local execution to Claire-managed AI without explicit user consent.

### 7.4 Middleware

Wrap every language model with Claire middleware for:

1. Policy and task-role validation.
2. Context-size and output-token budgets.
3. Secret and PII-safe error normalization.
4. Retry and provider circuit breaking.
5. Usage measurement and allowance settlement.
6. Content-free tracing.

If AI SDK OpenTelemetry is enabled, set `recordInputs: false` and `recordOutputs: false`. Message
content, embeddings, tool arguments, and outputs must not be copied into traces.

## 8. Embeddings and search

Embeddings are not interchangeable merely because each provider returns an array of numbers.
Dimensions, vector spaces, tokenization, and similarity characteristics differ.

Create an immutable embedding profile:

```ts
interface EmbeddingProfile {
  id: string;
  providerConnectionId: string;
  modelId: string;
  dimensions: number;
  distanceMetric: 'cosine';
  normalization: 'provider' | 'claire';
  version: number;
  status: 'building' | 'active' | 'retiring' | 'failed';
}
```

Every stored vector references `embedding_profile_id`. Search queries use only vectors from the same
profile. Changing the embedding model creates a new profile and a resumable parallel reindex. The
old index remains active until the new index is complete, then can be deleted after a rollback
window.

For local-only users who decline embeddings, Claire should provide keyword and metadata search with
an explicit “semantic search is off” state rather than failing the entire global search surface.

## 9. Persistent data model

Use `user_id` for the first release while keeping a nullable `workspace_id` migration path.

### `ai_provider_connections`

- `id`
- `user_id`
- `workspace_id` nullable
- `provider_type`
- `execution_mode`: `managed | cloud_byok | self_hosted | desktop_local`
- `display_name`
- `secret_reference` nullable
- `base_url` nullable
- `provider_account_metadata` JSONB containing non-secret organization/project/region fields
- `credential_fingerprint` nullable
- `status`: `pending | active | invalid | rate_limited | revoked | unreachable`
- `capability_snapshot` JSONB
- `last_checked_at`, `last_error_code`
- timestamps

### `ai_model_profiles`

- `id`, `user_id`, `workspace_id`
- `provider_connection_id`
- `task_role`
- `model_id`
- `quality_tier`
- `capabilities` JSONB
- `context_window` nullable
- `max_output_tokens` nullable
- `embedding_dimensions` nullable
- `is_default`, `status`
- timestamps

### `ai_usage_events`

- `id`, `request_id`, `user_id`, `workspace_id`
- `provider_connection_id`, `model_profile_id`
- `task_role`, `feature`
- `billing_source`: `managed_allowance | managed_overage | byok | local`
- `input_tokens`, `cached_input_tokens`, `output_tokens`
- `provider_cost_micro_usd` nullable
- `billable_cost_micro_usd` nullable
- `price_book_version` nullable
- `latency_ms`, `retry_count`, `status`, `error_code`
- `provider_request_id` nullable
- timestamp

No prompt, response, message excerpt, embedding, API key, or raw provider error body belongs in this
table.

### `ai_allowance_accounts` and `ai_allowance_entries`

Use an append-only credit ledger with reservations, settlements, top-ups, refunds, and expirations.
Do not maintain a mutable balance without the ledger that explains it.

### `embedding_profiles`

Store the immutable profile described above and add `embedding_profile_id` to each message embedding.

## 10. Secrets and endpoint security

### Cloud

- Put provider keys in a managed secret store with envelope encryption and KMS-backed rotation.
- Ordinary database rows store only an opaque secret reference and fingerprint.
- Decrypt immediately before provider-client construction; do not persist plaintext in caches.
- Never return a stored key through an API.
- Redact authorization headers and known secret patterns before logging.
- Revoke deletes the secret first, then marks the connection revoked.
- Admin tooling may report that a key exists but may never reveal it.

### Desktop and self-hosted

- Desktop-held keys use macOS Keychain or Windows Credential Manager.
- Self-hosted server keys use environment variables, Docker secrets, or a user-configured secret
  store.
- Keys never enter React state, AsyncStorage, analytics, crash reports, or ordinary Supabase tables.

### Custom endpoint rules

Arbitrary base URLs create server-side request forgery risk.

- Claire Cloud v1 supports only curated provider endpoints.
- Advanced custom URLs are permitted in self-hosted mode because the operator controls the network.
- A later Cloud enterprise feature must require HTTPS, resolve and validate DNS on every connection,
  block loopback/private/link-local/metadata ranges, use an egress proxy, cap response sizes, and
  prevent redirect-based bypasses.

## 11. API contract

Suggested endpoints:

```text
GET    /api/ai/definitions
GET    /api/ai/connections
POST   /api/ai/connections
POST   /api/ai/connections/:id/test
POST   /api/ai/connections/:id/rotate-secret
DELETE /api/ai/connections/:id

GET    /api/ai/model-profiles
PUT    /api/ai/model-profiles/:taskRole
POST   /api/ai/model-profiles/:id/test

GET    /api/ai/usage?period=current
GET    /api/ai/allowance
PUT    /api/ai/budget

GET    /api/ai/index/profiles
POST   /api/ai/index/migrations
GET    /api/ai/index/migrations/:id
```

`GET /api/ai/definitions` returns provider setup fields, supported execution modes, and task
capabilities. Clients render setup flows from this registry rather than hard-coding provider
switches.

Connection creation accepts a write-only `secret` field. Responses replace it with:

```json
{
  "credential": {
    "configured": true,
    "fingerprint": "…9A2F",
    "updatedAt": "2026-08-14T20:00:00Z"
  }
}
```

## 12. Privacy language

Claire can make these initial claims:

- “Claire does not use your conversations to train Claire-owned models.”
- “With BYOK, model usage is billed by your provider account.”
- “With self-hosting, Claire’s application database and bridge infrastructure run on the host you
  control.”
- “You can disable AI without losing messaging.”

Claire must not make these broad claims:

- “Your messages never reach the cloud” for Claire Cloud or cloud BYOK.
- “Zero retention” unless the exact provider account and endpoint are verified for it.
- “Local” when a cloud server builds context and calls a provider.
- “Private AI” solely because the customer supplied the API key.
- “Open source” until a repository license exists.

The disclosure shown before enabling a provider should name each processor in the selected path.
Provider retention and training claims should link to current provider terms rather than being copied
into static Claire marketing text.

## 13. Current-code audit and migration

Claire already has the beginning of a provider abstraction, but provider choice is inconsistent:

- `ai-processor.ts` switches between Amazon Bedrock, Kimi, and OpenAI for replies and explanations.
- `conversation-assistant.ts` is OpenAI-only for both answers and embeddings.
- `voice-profile-service.ts` is OpenAI-only.
- `smart-card-generator.ts` is OpenAI-only.
- `routes/conversations.ts` creates an OpenAI client directly and hard-codes
  `gpt-4-turbo-preview` for contact insight extraction.
- Provider configuration is process-wide environment state, not per-user or per-workspace.
- There is no provider credential store, model capability registry, allowance ledger, or unified usage
  record.

### Migration rule

No product service may construct a provider SDK client after the migration. All provider calls go
through `ClaireAIService`.

### Proposed file structure

```text
server/src/services/ai/
  index.ts
  types.ts
  definitions.ts
  registry.ts
  execution-service.ts
  task-router.ts
  policy-middleware.ts
  usage-meter.ts
  price-book.ts
  secret-store.ts
  errors.ts
  providers/
    openai.ts
    anthropic.ts
    bedrock.ts
    openai-compatible.ts
  schemas/
    reply.ts
    assistant-answer.ts
    conversation-analysis.ts
    contact-memory.ts
```

## 14. Delivery phases

### Phase 0 — product and security decisions

- Select and add the repository license.
- Define Community versus Cloud entitlements without exact model names in marketing.
- Select the managed cloud secret store and KMS.
- Decide whether the initial billing UI shows dollars or branded AI credits backed by dollars.
- Define provider subprocessors and update the privacy policy.

### Phase 1 — provider-neutral core

- Add AI SDK Core and the OpenAI, Anthropic, Bedrock, and OpenAI-compatible providers.
- Implement `ClaireAIService`, task roles, schemas, normalized errors, and mock-model tests.
- Migrate `ai-processor.ts`, conversation assistant answers, voice profiles, smart cards, and contact
  insight extraction.
- Preserve the existing process-wide environment configuration as the default compatibility path.
- Add usage events without billing.

### Phase 2 — Community BYOK and local models

- Add configuration-file and environment-based provider definitions.
- Support Ollama and LM Studio through OpenAI-compatible endpoints.
- Add provider/model health checks and capability tests.
- Add embedding profiles and resumable reindexing.
- Document outbound data paths in the self-hosting guide.

### Phase 3 — Claire Cloud managed AI

- Add managed provider connections, allowance ledger, price book, budgets, and per-feature usage.
- Add subscription entitlements and opt-in overage.
- Add provider circuit breakers, quality eval gates, and equivalent-mode fallback.
- Ship the simple `fast / balanced / best` settings UI.

### Phase 4 — Cloud BYOK

- Add encrypted secret storage, credential rotation, provider setup UI, and deletion audit.
- Support OpenAI and Anthropic first; Bedrock follows after region and IAM UX is designed.
- Add model discovery where reliable and manual model IDs in advanced settings.
- Run penetration tests focused on secrets, logs, SSRF, and cross-tenant isolation.

### Phase 5 — supervised desktop-local execution

- Define an authenticated, replay-resistant AI job protocol for a companion device.
- Keep credentials and inference on the selected desktop.
- Make device availability and data flow visible on every client.
- Complete egress auditing before making desktop-only privacy guarantees.

## 15. Acceptance criteria

### Provider behavior

- The same reply, explanation, assistant-answer, and memory schemas pass against every supported
  generation provider.
- Unsupported capabilities prevent model selection before a real user request.
- Provider fallback never crosses managed, BYOK, or local billing/privacy boundaries silently.
- Cancellation, timeouts, rate limits, invalid keys, quota exhaustion, and malformed output map to
  stable Claire error codes.

### Security

- No credential appears in React state, AsyncStorage, ordinary tables, logs, analytics, traces,
  support exports, or crash reports.
- Cloud secrets can be rotated and deleted without deployment.
- Cross-user connection IDs return 404 and cannot influence routing.
- Custom endpoint SSRF tests cover DNS rebinding, redirects, IPv4/IPv6 private ranges, and cloud
  metadata addresses before custom URLs are allowed in Claire Cloud.

### Billing

- Managed usage reserves and settles atomically and is idempotent by `request_id`.
- BYOK and local requests never consume managed allowance.
- Exceeding an AI cap disables only AI features, not messaging.
- Provider invoice totals can be reconciled to ledger totals by provider, model, and day.

### Search and embeddings

- Vectors from different embedding profiles are never queried together.
- A model change performs a resumable parallel reindex with rollback.
- Keyword search remains available when semantic indexing is disabled or incomplete.
- Deleting messages deletes their embeddings and derived index rows.

### Privacy

- Data-flow disclosures match observed network traffic for each execution mode.
- AI SDK telemetry records no prompts, outputs, embeddings, or tool payloads.
- Managed, BYOK, self-hosted, and local modes pass automated egress-policy tests.

## 16. Decisions to make before implementation

1. Which license governs the downloadable edition?
2. Is Cloud BYOK included in the base Cloud plan or reserved for a higher tier?
3. Should managed allowance be shown directly in currency or as transparent credits backed by
   currency?
4. Which managed providers are acceptable subprocessors at launch?
5. Which secret-store and KMS implementation will be used in the current Railway deployment?
6. Does Claire support per-user settings only initially, or introduce workspaces before billing?
7. Is a local embedding model mandatory for the private desktop-only milestone, or is keyword-only
   search an acceptable first private release?

## 17. Source references

- Vercel AI SDK provider architecture and self-hosted options:
  <https://ai-sdk.dev/docs/foundations/providers-and-models>
- Vercel AI SDK provider and model registry:
  <https://ai-sdk.dev/docs/ai-sdk-core/provider-management>
- Vercel AI SDK custom OpenAI-compatible providers:
  <https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers>
- Vercel AI SDK telemetry and input/output recording controls:
  <https://ai-sdk.dev/docs/ai-sdk-core/telemetry>
- Vercel AI SDK deterministic model mocks:
  <https://ai-sdk.dev/docs/ai-sdk-core/testing>
- Anthropic warning that its OpenAI SDK compatibility path is primarily for evaluation rather than
  the best production feature coverage:
  <https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk>
- Ollama OpenAI-compatible chat, responses, models, and embedding endpoints:
  <https://docs.ollama.com/api/openai-compatibility>
- OpenAI production guidance for API-key security, spend limits, and project isolation:
  <https://developers.openai.com/api/docs/guides/production-best-practices>
- OpenAI endpoint-specific data retention controls:
  <https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint>
