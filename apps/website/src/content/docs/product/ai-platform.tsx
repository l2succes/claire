// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, DocLink, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "AI platform and self-hosting specification",
  description: "Product architecture for managed AI, bring-your-own keys, local models, and self-hosting.",
  section: 'product',
  status: 'draft',
  lastReviewed: '2026-08-17',
  order: 4,
  roadmap: {
    status: 'research',
    summary: "Define verified self-hosted, local-model, and managed-AI product boundaries.",
  },
  hero: { kind: 'mockup', surface: 'mobile', screen: 'ai-and-privacy', caption: 'AI behaviour and privacy controls' },
  related: ['/docs/product/payments', '/docs/product/security', '/docs/product/end-to-end-encryption'],
};

export default function Page() {
  return (
    <Doc>
      <P lede><b>Status:</b> Proposed <b>Audience:</b> Product, design, backend, desktop, infrastructure, security, and billing <b>Scope:</b> Product packaging and the provider-neutral AI platform that powers reply assistance, Ask Claire, conversation memory, loop detection, summaries, and semantic search.</P>
      <Section id="executive-decision" title="Executive decision">
      <P>Claire should ship as one product with two operating editions and three AI execution modes:</P>
      <ol>
              <li><b>Claire Community</b> — users download and run the full Claire stack on infrastructure they control. They can disable AI, provide their own API key, or use a local model runtime.</li>
              <li><b>Claire Cloud</b> — Claire operates the server, database, Matrix infrastructure, bridges, backups, upgrades, and monitoring for a subscription. The plan includes a managed AI allowance, while still allowing bring-your-own-key (BYOK).</li>
              <li><b>Private desktop-only</b> — a later, verified execution mode in which messages, indexes, model inference, and credentials remain on a user-controlled computer. This is not part of the initial commercial launch and must not be marketed as available until egress tests pass.</li>
            </ol>
      <P>Use <b>Vercel AI SDK Core</b> as a provider abstraction inside the Bun server. Use dedicated provider packages for OpenAI, Anthropic, Amazon Bedrock, and other first-class providers, plus the OpenAI-compatible provider for runtimes such as Ollama, LM Studio, vLLM, and compatible hosted services. Do <b>not</b> require Vercel AI Gateway. Gateway can be an optional managed-cloud route later, but making it mandatory would add another data processor and weaken the clarity of BYOK and self-hosted data flows.</P>
      <P>The key product promise is:</P>
      <Callout kind="note">Download Claire and run it yourself for free, or pay Claire to keep your messaging infrastructure online and include the AI capacity. In either edition, you choose who runs the model.</Callout>
      </Section>
      <Section id="why-this-product-model-works" title="Why this product model works">
      <P>Messaging infrastructure and AI inference are different costs and different trust decisions. Claire should expose them separately.</P>
      <ul>
              <li>A user may want managed bridges but prefer to pay OpenAI or Anthropic directly.</li>
              <li>A user may want managed bridges and the simplest possible managed-AI experience.</li>
              <li>A technical user may self-host Claire while calling a commercial model provider.</li>
              <li>A privacy-sensitive user may self-host both Claire and an open-weight model.</li>
              <li>A local model may be adequate for classification and embeddings but not for the highest-quality relationship-aware reply generation.</li>
            </ul>
      <P>This separation avoids an artificial choice between “fully hosted” and “fully local” and gives Claire a durable business: customers pay for uptime, bridge maintenance, backups, and convenience, not for access to source code alone.</P>
      </Section>
      <Section id="editions-and-responsibilities" title="Editions and responsibilities">
      <Table
              head={[<>Capability</>, <>Claire Community</>, <>Claire Cloud</>]}
              rows={[
                [<>Mobile and desktop clients</>, <>Included</>, <>Included</>],
                [<>Bun server, Supabase, Redis, Matrix, bridges</>, <>User operates</>, <>Claire operates</>],
                [<>Upgrades and bridge recovery</>, <>User operates</>, <>Managed by Claire</>],
                [<>Backups and monitoring</>, <>User operates</>, <>Managed by Claire</>],
                [<>Managed Claire AI allowance</>, <>No</>, <>Included by plan</>],
                [<>Bring your own provider key</>, <>Yes</>, <>Yes</>],
                [<>Local models</>, <>Yes</>, <>Only through a user-controlled execution host</>],
                [<>Support</>, <>Community documentation</>, <>Product support and service status</>],
                [<>Data location</>, <>User-selected host</>, <>Claire-managed region, disclosed in product</>],
              ]}
            />
      <Section id="licensing-prerequisite" title="Licensing prerequisite" level={3}>
      <P>The repository currently has no explicit <C>LICENSE</C> file. Claire must not describe the downloadable edition as “open source” until a license is selected and added. Until then, use “self-hostable” or “source available.” License selection is a business decision outside this technical specification.</P>
      </Section>
      </Section>
      <Section id="ai-execution-modes" title="AI execution modes">
      <Section id="claire-managed-ai" title="Claire-managed AI" level={3}>
      <P>Claire owns the provider account and pays the upstream bill. A plan includes a monthly AI allowance.</P>
      <P>Data flow:</P>
      <Code lang="text">{"Client → Claire API → Claire context builder → Claire-selected model provider\n                                      ↘ usage ledger + redacted operational telemetry"}</Code>
      <P>Properties:</P>
      <ul>
              <li>No API-key setup for the customer.</li>
              <li>Claire selects task-appropriate models behind stable product tiers such as <C>fast</C>, <C>balanced</C>, and <C>best</C>.</li>
              <li>Claire can change the underlying model without changing user-visible settings, but only after evals show equal or better quality.</li>
              <li>Usage, rate limits, fallbacks, and provider outages are Claire’s responsibility.</li>
              <li>The UI identifies that selected conversation content is sent to Claire’s configured AI provider.</li>
            </ul>
      </Section>
      <Section id="cloud-byok" title="Cloud BYOK" level={3}>
      <P>Claire hosts the product, but the customer supplies a provider key and pays that provider directly.</P>
      <P>Data flow:</P>
      <Code lang="text">{"Client → Claire API → Claire context builder → provider using customer credential\n                          ↘ metadata-only usage record"}</Code>
      <P>Properties:</P>
      <ul>
              <li>Message content still passes through Claire Cloud because the cloud server builds the context.</li>
              <li>The provider credential is stored in an encrypted secret store, never an ordinary application table.</li>
              <li>Claire does not add model usage to the customer’s managed-AI allowance.</li>
              <li>Claire still charges for managed infrastructure.</li>
              <li>Provider usage and retention terms belong to the customer’s provider account.</li>
              <li>Disconnecting a provider deletes its secret and disables dependent task profiles.</li>
            </ul>
      <P>“Use my own key” must never be described as “local” or “Claire cannot see the content.”</P>
      </Section>
      <Section id="self-hosted-byok" title="Self-hosted BYOK" level={3}>
      <P>The user’s Claire server calls the selected provider directly using environment-backed or secret-store credentials on the user’s host.</P>
      <P>Properties:</P>
      <ul>
              <li>Claire Cloud receives no AI request or credential.</li>
              <li>The external model provider still receives the prompt and selected message context.</li>
              <li>Product telemetry is off by default in Community deployments.</li>
              <li>The setup wizard validates the provider without transmitting the key to Claire.</li>
            </ul>
      </Section>
      <Section id="local-model" title="Local model" level={3}>
      <P>The Claire server calls a model runtime on the same host or trusted LAN, normally through an OpenAI-compatible endpoint.</P>
      <P>Initial supported runtimes:</P>
      <ul>
              <li>Ollama</li>
              <li>LM Studio</li>
              <li>Any explicitly configured OpenAI-compatible endpoint in a self-hosted deployment</li>
            </ul>
      <P>Later supported runtimes may include vLLM, llama.cpp servers, and managed private endpoints.</P>
      <P>Important constraints:</P>
      <ul>
              <li>A Claire Cloud process cannot call <C>localhost</C> on a customer’s computer.</li>
              <li>Cloud accounts that want a desktop-resident model require a supervised desktop execution broker. That broker is a separate project and is not needed for Community self-hosting.</li>
              <li>Local model quality and feature support vary. Claire must capability-test structured output, context length, embeddings, tool calling, and streaming instead of assuming compatibility.</li>
              <li>The desktop or self-hosted machine must remain online for AI features to work.</li>
            </ul>
      </Section>
      </Section>
      <Section id="product-experience" title="Product experience">
      <Section id="settings-structure" title="Settings structure" level={3}>
      <P>Add <b>{"Settings → AI & models"}</b> with three primary choices:</P>
      <ol>
              <li><b>Claire AI — recommended</b></li>
              <li>“Included with your Claire Cloud plan.”</li>
              <li>Shows allowance remaining, renewal date, and current quality tier.</li>
              <li><b>Use my provider account</b></li>
              <li>OpenAI, Anthropic, Amazon Bedrock, Google, xAI, Groq, Mistral, and advanced OpenAI-compatible setup.</li>
              <li>Shows who bills the usage and where the key is stored.</li>
              <li><b>Run models locally</b></li>
              <li>Ollama, LM Studio, or custom compatible endpoint.</li>
              <li>Shows which device executes AI and whether that device is currently reachable.</li>
            </ol>
      <P>Each provider setup screen contains:</P>
      <ul>
              <li>Provider name and link to create a key.</li>
              <li>Secret field that can be submitted but never read back.</li>
              <li>Optional organization, project, region, and base URL fields when applicable.</li>
              <li>“Test connection” action.</li>
              <li>Models discovered from the provider when supported, plus an advanced manual model-ID field.</li>
              <li>A plain-language data-flow disclosure specific to the selected mode.</li>
              <li>Key fingerprint, creation time, last successful check, last error category, and revoke action.</li>
            </ul>
      </Section>
      <Section id="simple-and-advanced-model-selection" title="Simple and advanced model selection" level={3}>
      <P>Most users should not configure five model dropdowns. The default UI offers:</P>
      <ul>
              <li><b>Fast</b> — prioritizes latency and low usage.</li>
              <li><b>Balanced</b> — default for reply suggestions and Ask Claire.</li>
              <li><b>Best quality</b> — higher cost and latency, with an explicit allowance impact.</li>
            </ul>
      <P>An advanced panel maps individual AI jobs:</P>
      <Table
              head={[<>Task role</>, <>Product use</>, <>Required capability</>]}
              rows={[
                [<><C>reply</C></>, <>Suggested replies and rewrites</>, <>Structured output</>],
                [<><C>assistant</C></>, <>Ask Claire answers</>, <>Structured output, long context, streaming preferred</>],
                [<><C>analysis</C></>, <>Explanations, summaries, memory extraction</>, <>Structured output</>],
                [<><C>classification</C></>, <>Loop and intent detection</>, <>Low latency, structured output</>],
                [<><C>embedding</C></>, <>Cross-chat semantic search</>, <>Embedding model with fixed dimensions</>],
              ]}
            />
      <P>A provider connection can be valid for some roles and invalid for others. For example, an Anthropic connection can generate text but does not by itself provide an embedding model; the user must choose a separate embedding provider or use local lexical search.</P>
      </Section>
      <Section id="usage-ui" title="Usage UI" level={3}>
      <P>Managed AI displays:</P>
      <ul>
              <li>Allowance used and remaining.</li>
              <li>Usage grouped by feature, not just raw tokens.</li>
              <li>Optional daily warning and monthly hard cap.</li>
              <li>Whether a request used <C>fast</C>, <C>balanced</C>, or <C>best</C>.</li>
            </ul>
      <P>BYOK displays:</P>
      <ul>
              <li>Request and token counts reported by the provider.</li>
              <li>A clear statement that charges appear in the provider account.</li>
              <li>Cost estimates only when Claire has a current price entry; otherwise show usage without invented currency estimates.</li>
            </ul>
      <P>Local mode displays:</P>
      <ul>
              <li>Requests, latency, and model runtime health.</li>
              <li>No dollar estimate unless the user adds an optional local-cost profile.</li>
            </ul>
      </Section>
      </Section>
      <Section id="billing-and-ai-allowance-design" title="Billing and AI allowance design">
      <P>Do not create an arbitrary “one credit equals one request” economy. Different models and tasks have orders-of-magnitude cost differences.</P>
      <P>Internally, managed AI uses a dollar-denominated ledger:</P>
      <ul>
              <li>Store amounts as integer <C>micro_usd</C> values.</li>
              <li>Version the provider price book used to calculate each event.</li>
              <li>Reserve an estimated maximum before a managed request.</li>
              <li>Settle the reservation from actual provider-reported usage after completion.</li>
              <li>Release the reservation on provider failure.</li>
              <li>Reconcile aggregate provider invoices against the ledger.</li>
            </ul>
      <P>The user-facing plan may call the allowance “AI credits,” but the UI must also show a familiar value such as “$8 of managed AI included” or a feature-level estimate. Exact plan prices and markup remain a go-to-market decision.</P>
      <P>Launch packaging:</P>
      <ul>
              <li><b>Community:</b> free self-hosted software; BYOK or local models; no managed allowance.</li>
              <li><b>Claire Plus:</b> a $10 USD monthly personal subscription with a monthly managed-AI credit allowance.</li>
              <li><b>Cloud + BYOK:</b> same infrastructure subscription; provider usage bypasses the Claire allowance.</li>
              <li><b>Top-ups or overage:</b> opt-in only, with a user-set hard cap. Never silently run an unlimited bill.</li>
            </ul>
      <P>Infrastructure entitlement and AI allowance must be separate ledger concepts even if sold together. Users who exhaust AI remain able to read and send messages.</P>
      </Section>
      <Section id="provider-architecture" title="Provider architecture">
      <Section id="boundary" title="Boundary" level={3}>
      <P>Only files under <C>server/src/services/ai/</C> may import Vercel AI SDK or provider packages. Product services depend on a Claire-owned interface so a future SDK change does not touch every feature.</P>
      <Code lang="text">{"Reply / Ask Claire / Voice profile / Memory / Loop detector\n                              │\n                       ClaireAIService\n                              │\n             ┌────────────────┼────────────────┐\n             │                │                │\n       Task router      Policy middleware   Usage meter\n             │                │                │\n             └──────── Provider registry ─────┘\n                              │\n     OpenAI | Anthropic | Bedrock | Google | OpenAI-compatible | Local"}</Code>
      <P>Proposed interface:</P>
      <Code lang="ts">{"type AITaskRole = 'reply' | 'assistant' | 'analysis' | 'classification' | 'embedding';\n\ninterface AIExecutionContext {\n  userId: string;\n  task: AITaskRole;\n  hostingMode: 'claire_cloud' | 'self_hosted' | 'desktop_local';\n  providerConnectionId?: string;\n  modelProfileId: string;\n  requestId: string;\n  abortSignal?: AbortSignal;\n}\n\ninterface ClaireAIService {\n  generateObject<T>(context: AIExecutionContext, input: StructuredAIInput<T>): Promise<AIResult<T>>;\n  streamText(context: AIExecutionContext, input: TextAIInput): Promise<AITextStream>;\n  embedMany(context: AIExecutionContext, values: string[]): Promise<AIEmbeddingResult>;\n}"}</Code>
      <P>Every result normalizes:</P>
      <ul>
              <li>Provider and resolved model ID.</li>
              <li>Provider request ID when available.</li>
              <li>Input, cached-input, and output token usage.</li>
              <li>Finish reason and warnings.</li>
              <li>Latency and retry count.</li>
              <li>Whether a fallback was used.</li>
              <li>Estimated managed cost and price-book version.</li>
            </ul>
      <P>Prompt text, message content, and model output are not included in operational logs or usage events.</P>
      </Section>
      <Section id="provider-registry" title="Provider registry" level={3}>
      <P>Use AI SDK <C>createProviderRegistry</C> with stable Claire connection IDs rather than global singleton providers. Provider instances are created per encrypted credential reference and cached briefly in memory.</P>
      <P>Initial provider packages:</P>
      <ul>
              <li><C>ai</C></li>
              <li><C>@ai-sdk/openai</C></li>
              <li><C>@ai-sdk/anthropic</C></li>
              <li><C>@ai-sdk/amazon-bedrock</C></li>
              <li><C>@ai-sdk/openai-compatible</C></li>
            </ul>
      <P>Add Google and other dedicated provider packages only when a product setup screen and contract tests exist. Kimi can initially use the OpenAI-compatible provider. Prefer Anthropic’s dedicated provider over Anthropic’s OpenAI compatibility endpoint because Anthropic documents that compatibility as a testing path with feature limitations.</P>
      </Section>
      <Section id="provider-neutral-structured-output" title="Provider-neutral structured output" level={3}>
      <P>Reply suggestions and analysis features currently depend on hand-parsed JSON. Migrate them to a schema-backed structured-output call and validate the result again at the Claire boundary.</P>
      <P>Rules:</P>
      <ul>
              <li>Every structured task owns a Zod schema.</li>
              <li>A model must pass a setup-time structured-output smoke test before being selectable for that role.</li>
              <li>No provider-specific <C>response_format</C> appears in product services.</li>
              <li>Invalid output receives at most one repair attempt; repeated invalid output marks the model-role pair unhealthy.</li>
              <li>Fallbacks are allowed only between explicitly enabled model profiles with equivalent privacy and billing modes.</li>
            </ul>
      <P>Never fall back from BYOK or local execution to Claire-managed AI without explicit user consent.</P>
      </Section>
      <Section id="middleware" title="Middleware" level={3}>
      <P>Wrap every language model with Claire middleware for:</P>
      <ol>
              <li>Policy and task-role validation.</li>
              <li>Context-size and output-token budgets.</li>
              <li>Secret and PII-safe error normalization.</li>
              <li>Retry and provider circuit breaking.</li>
              <li>Usage measurement and allowance settlement.</li>
              <li>Content-free tracing.</li>
            </ol>
      <P>If AI SDK OpenTelemetry is enabled, set <C>recordInputs: false</C> and <C>recordOutputs: false</C>. Message content, embeddings, tool arguments, and outputs must not be copied into traces.</P>
      </Section>
      </Section>
      <Section id="embeddings-and-search" title="Embeddings and search">
      <P>Embeddings are not interchangeable merely because each provider returns an array of numbers. Dimensions, vector spaces, tokenization, and similarity characteristics differ.</P>
      <P>Create an immutable embedding profile:</P>
      <Code lang="ts">{"interface EmbeddingProfile {\n  id: string;\n  providerConnectionId: string;\n  modelId: string;\n  dimensions: number;\n  distanceMetric: 'cosine';\n  normalization: 'provider' | 'claire';\n  version: number;\n  status: 'building' | 'active' | 'retiring' | 'failed';\n}"}</Code>
      <P>Every stored vector references <C>embedding_profile_id</C>. Search queries use only vectors from the same profile. Changing the embedding model creates a new profile and a resumable parallel reindex. The old index remains active until the new index is complete, then can be deleted after a rollback window.</P>
      <P>For local-only users who decline embeddings, Claire should provide keyword and metadata search with an explicit “semantic search is off” state rather than failing the entire global search surface.</P>
      </Section>
      <Section id="persistent-data-model" title="Persistent data model">
      <P>Use <C>user_id</C> for the first release while keeping a nullable <C>workspace_id</C> migration path.</P>
      <Section id="ai-provider-connections" title="ai_provider_connections" level={3}>
      <ul>
              <li><C>id</C></li>
              <li><C>user_id</C></li>
              <li><C>workspace_id</C> nullable</li>
              <li><C>provider_type</C></li>
              <li><C>execution_mode</C>: <C>managed | cloud_byok | self_hosted | desktop_local</C></li>
              <li><C>display_name</C></li>
              <li><C>secret_reference</C> nullable</li>
              <li><C>base_url</C> nullable</li>
              <li><C>provider_account_metadata</C> JSONB containing non-secret organization/project/region fields</li>
              <li><C>credential_fingerprint</C> nullable</li>
              <li><C>status</C>: <C>pending | active | invalid | rate_limited | revoked | unreachable</C></li>
              <li><C>capability_snapshot</C> JSONB</li>
              <li><C>last_checked_at</C>, <C>last_error_code</C></li>
              <li>timestamps</li>
            </ul>
      </Section>
      <Section id="ai-model-profiles" title="ai_model_profiles" level={3}>
      <ul>
              <li><C>id</C>, <C>user_id</C>, <C>workspace_id</C></li>
              <li><C>provider_connection_id</C></li>
              <li><C>task_role</C></li>
              <li><C>model_id</C></li>
              <li><C>quality_tier</C></li>
              <li><C>capabilities</C> JSONB</li>
              <li><C>context_window</C> nullable</li>
              <li><C>max_output_tokens</C> nullable</li>
              <li><C>embedding_dimensions</C> nullable</li>
              <li><C>is_default</C>, <C>status</C></li>
              <li>timestamps</li>
            </ul>
      </Section>
      <Section id="ai-usage-events" title="ai_usage_events" level={3}>
      <ul>
              <li><C>id</C>, <C>request_id</C>, <C>user_id</C>, <C>workspace_id</C></li>
              <li><C>provider_connection_id</C>, <C>model_profile_id</C></li>
              <li><C>task_role</C>, <C>feature</C></li>
              <li><C>billing_source</C>: <C>managed_allowance | managed_overage | byok | local</C></li>
              <li><C>input_tokens</C>, <C>cached_input_tokens</C>, <C>output_tokens</C></li>
              <li><C>provider_cost_micro_usd</C> nullable</li>
              <li><C>billable_cost_micro_usd</C> nullable</li>
              <li><C>price_book_version</C> nullable</li>
              <li><C>latency_ms</C>, <C>retry_count</C>, <C>status</C>, <C>error_code</C></li>
              <li><C>provider_request_id</C> nullable</li>
              <li>timestamp</li>
            </ul>
      <P>No prompt, response, message excerpt, embedding, API key, or raw provider error body belongs in this table.</P>
      </Section>
      <Section id="ai-allowance-accounts-and-ai-allowance-entries" title="ai_allowance_accounts and ai_allowance_entries" level={3}>
      <P>Use an append-only credit ledger with reservations, settlements, top-ups, refunds, and expirations. Do not maintain a mutable balance without the ledger that explains it.</P>
      </Section>
      <Section id="embedding-profiles" title="embedding_profiles" level={3}>
      <P>Store the immutable profile described above and add <C>embedding_profile_id</C> to each message embedding.</P>
      </Section>
      </Section>
      <Section id="secrets-and-endpoint-security" title="Secrets and endpoint security">
      <Section id="cloud" title="Cloud" level={3}>
      <ul>
              <li>Put provider keys in a managed secret store with envelope encryption and KMS-backed rotation.</li>
              <li>Ordinary database rows store only an opaque secret reference and fingerprint.</li>
              <li>Decrypt immediately before provider-client construction; do not persist plaintext in caches.</li>
              <li>Never return a stored key through an API.</li>
              <li>Redact authorization headers and known secret patterns before logging.</li>
              <li>Revoke deletes the secret first, then marks the connection revoked.</li>
              <li>Admin tooling may report that a key exists but may never reveal it.</li>
            </ul>
      </Section>
      <Section id="desktop-and-self-hosted" title="Desktop and self-hosted" level={3}>
      <ul>
              <li>Desktop-held keys use macOS Keychain or Windows Credential Manager.</li>
              <li>Self-hosted server keys use environment variables, Docker secrets, or a user-configured secret store.</li>
              <li>Keys never enter React state, AsyncStorage, analytics, crash reports, or ordinary Supabase tables.</li>
            </ul>
      </Section>
      <Section id="custom-endpoint-rules" title="Custom endpoint rules" level={3}>
      <P>Arbitrary base URLs create server-side request forgery risk.</P>
      <ul>
              <li>Claire Cloud v1 supports only curated provider endpoints.</li>
              <li>Advanced custom URLs are permitted in self-hosted mode because the operator controls the network.</li>
              <li>A later Cloud enterprise feature must require HTTPS, resolve and validate DNS on every connection, block loopback/private/link-local/metadata ranges, use an egress proxy, cap response sizes, and prevent redirect-based bypasses.</li>
            </ul>
      </Section>
      </Section>
      <Section id="api-contract" title="API contract">
      <P>Suggested endpoints:</P>
      <Code lang="text">{"GET    /api/ai/definitions\nGET    /api/ai/connections\nPOST   /api/ai/connections\nPOST   /api/ai/connections/:id/test\nPOST   /api/ai/connections/:id/rotate-secret\nDELETE /api/ai/connections/:id\n\nGET    /api/ai/model-profiles\nPUT    /api/ai/model-profiles/:taskRole\nPOST   /api/ai/model-profiles/:id/test\n\nGET    /api/ai/usage?period=current\nGET    /api/ai/allowance\nPUT    /api/ai/budget\n\nGET    /api/ai/index/profiles\nPOST   /api/ai/index/migrations\nGET    /api/ai/index/migrations/:id"}</Code>
      <P><C>GET /api/ai/definitions</C> returns provider setup fields, supported execution modes, and task capabilities. Clients render setup flows from this registry rather than hard-coding provider switches.</P>
      <P>Connection creation accepts a write-only <C>secret</C> field. Responses replace it with:</P>
      <Code lang="json">{"{\n  \"credential\": {\n    \"configured\": true,\n    \"fingerprint\": \"…9A2F\",\n    \"updatedAt\": \"2026-08-14T20:00:00Z\"\n  }\n}"}</Code>
      </Section>
      <Section id="privacy-language" title="Privacy language">
      <P>Claire can make these initial claims:</P>
      <ul>
              <li>“Claire does not use your conversations to train Claire-owned models.”</li>
              <li>“With BYOK, model usage is billed by your provider account.”</li>
              <li>“With self-hosting, Claire’s application database and bridge infrastructure run on the host you control.”</li>
              <li>“You can disable AI without losing messaging.”</li>
            </ul>
      <P>Claire must not make these broad claims:</P>
      <ul>
              <li>“Your messages never reach the cloud” for Claire Cloud or cloud BYOK.</li>
              <li>“Zero retention” unless the exact provider account and endpoint are verified for it.</li>
              <li>“Local” when a cloud server builds context and calls a provider.</li>
              <li>“Private AI” solely because the customer supplied the API key.</li>
              <li>“Open source” until a repository license exists.</li>
            </ul>
      <P>The disclosure shown before enabling a provider should name each processor in the selected path. Provider retention and training claims should link to current provider terms rather than being copied into static Claire marketing text.</P>
      <P>
        Managed AI requires Claire to process selected message content. It is compatible with a
        hardened trusted-service model, but not with an unqualified end-to-end-encryption claim; see
        the <DocLink to="/docs/product/end-to-end-encryption">E2EE research boundary</DocLink>.
      </P>
      </Section>
      <Section id="current-code-audit-and-migration" title="Current-code audit and migration">
      <P>Claire already has the beginning of a provider abstraction, but provider choice is inconsistent:</P>
      <ul>
              <li><C>ai-processor.ts</C> switches between Amazon Bedrock, Kimi, and OpenAI for replies and explanations.</li>
              <li><C>conversation-assistant.ts</C> is OpenAI-only for both answers and embeddings.</li>
              <li><C>voice-profile-service.ts</C> is OpenAI-only.</li>
              <li><C>smart-card-generator.ts</C> is OpenAI-only.</li>
              <li><C>routes/conversations.ts</C> creates an OpenAI client directly and hard-codes <C>gpt-4-turbo-preview</C> for contact insight extraction.</li>
              <li>Provider configuration is process-wide environment state, not per-user or per-workspace.</li>
              <li>There is no provider credential store, model capability registry, allowance ledger, or unified usage record.</li>
            </ul>
      <Section id="migration-rule" title="Migration rule" level={3}>
      <P>No product service may construct a provider SDK client after the migration. All provider calls go through <C>ClaireAIService</C>.</P>
      </Section>
      <Section id="proposed-file-structure" title="Proposed file structure" level={3}>
      <Code lang="text">{"server/src/services/ai/\n  index.ts\n  types.ts\n  definitions.ts\n  registry.ts\n  execution-service.ts\n  task-router.ts\n  policy-middleware.ts\n  usage-meter.ts\n  price-book.ts\n  secret-store.ts\n  errors.ts\n  providers/\n    openai.ts\n    anthropic.ts\n    bedrock.ts\n    openai-compatible.ts\n  schemas/\n    reply.ts\n    assistant-answer.ts\n    conversation-analysis.ts\n    contact-memory.ts"}</Code>
      </Section>
      </Section>
      <Section id="delivery-phases" title="Delivery phases">
      <Section id="phase-0-product-and-security-decisions" title="Phase 0 — product and security decisions" level={3}>
      <ul>
              <li>Select and add the repository license.</li>
              <li>Define Community versus Cloud entitlements without exact model names in marketing.</li>
              <li>Select the managed cloud secret store and KMS.</li>
              <li>Decide whether the initial billing UI shows dollars or branded AI credits backed by dollars.</li>
              <li>Define provider subprocessors and update the privacy policy.</li>
            </ul>
      </Section>
      <Section id="phase-1-provider-neutral-core" title="Phase 1 — provider-neutral core" level={3}>
      <ul>
              <li>Add AI SDK Core and the OpenAI, Anthropic, Bedrock, and OpenAI-compatible providers.</li>
              <li>Implement <C>ClaireAIService</C>, task roles, schemas, normalized errors, and mock-model tests.</li>
              <li>Migrate <C>ai-processor.ts</C>, conversation assistant answers, voice profiles, smart cards, and contact insight extraction.</li>
              <li>Preserve the existing process-wide environment configuration as the default compatibility path.</li>
              <li>Add usage events without billing.</li>
            </ul>
      </Section>
      <Section id="phase-2-community-byok-and-local-models" title="Phase 2 — Community BYOK and local models" level={3}>
      <ul>
              <li>Add configuration-file and environment-based provider definitions.</li>
              <li>Support Ollama and LM Studio through OpenAI-compatible endpoints.</li>
              <li>Add provider/model health checks and capability tests.</li>
              <li>Add embedding profiles and resumable reindexing.</li>
              <li>Document outbound data paths in the self-hosting guide.</li>
            </ul>
      </Section>
      <Section id="phase-3-claire-cloud-managed-ai" title="Phase 3 — Claire Cloud managed AI" level={3}>
      <ul>
              <li>Add managed provider connections, allowance ledger, price book, budgets, and per-feature usage.</li>
              <li>Add subscription entitlements and opt-in overage.</li>
              <li>Add provider circuit breakers, quality eval gates, and equivalent-mode fallback.</li>
              <li>Ship the simple <C>fast / balanced / best</C> settings UI.</li>
            </ul>
      </Section>
      <Section id="phase-4-cloud-byok" title="Phase 4 — Cloud BYOK" level={3}>
      <ul>
              <li>Add encrypted secret storage, credential rotation, provider setup UI, and deletion audit.</li>
              <li>Support OpenAI and Anthropic first; Bedrock follows after region and IAM UX is designed.</li>
              <li>Add model discovery where reliable and manual model IDs in advanced settings.</li>
              <li>Run penetration tests focused on secrets, logs, SSRF, and cross-tenant isolation.</li>
            </ul>
      </Section>
      <Section id="phase-5-supervised-desktop-local-execution" title="Phase 5 — supervised desktop-local execution" level={3}>
      <ul>
              <li>Define an authenticated, replay-resistant AI job protocol for a companion device.</li>
              <li>Keep credentials and inference on the selected desktop.</li>
              <li>Make device availability and data flow visible on every client.</li>
              <li>Complete egress auditing before making desktop-only privacy guarantees.</li>
            </ul>
      </Section>
      </Section>
      <Section id="acceptance-criteria" title="Acceptance criteria">
      <Section id="provider-behavior" title="Provider behavior" level={3}>
      <ul>
              <li>The same reply, explanation, assistant-answer, and memory schemas pass against every supported generation provider.</li>
              <li>Unsupported capabilities prevent model selection before a real user request.</li>
              <li>Provider fallback never crosses managed, BYOK, or local billing/privacy boundaries silently.</li>
              <li>Cancellation, timeouts, rate limits, invalid keys, quota exhaustion, and malformed output map to stable Claire error codes.</li>
            </ul>
      </Section>
      <Section id="security" title="Security" level={3}>
      <ul>
              <li>No credential appears in React state, AsyncStorage, ordinary tables, logs, analytics, traces, support exports, or crash reports.</li>
              <li>Cloud secrets can be rotated and deleted without deployment.</li>
              <li>Cross-user connection IDs return 404 and cannot influence routing.</li>
              <li>Custom endpoint SSRF tests cover DNS rebinding, redirects, IPv4/IPv6 private ranges, and cloud metadata addresses before custom URLs are allowed in Claire Cloud.</li>
            </ul>
      </Section>
      <Section id="billing" title="Billing" level={3}>
      <ul>
              <li>Managed usage reserves and settles atomically and is idempotent by <C>request_id</C>.</li>
              <li>BYOK and local requests never consume managed allowance.</li>
              <li>Exceeding an AI cap disables only AI features, not messaging.</li>
              <li>Provider invoice totals can be reconciled to ledger totals by provider, model, and day.</li>
            </ul>
      </Section>
      <Section id="search-and-embeddings" title="Search and embeddings" level={3}>
      <ul>
              <li>Vectors from different embedding profiles are never queried together.</li>
              <li>A model change performs a resumable parallel reindex with rollback.</li>
              <li>Keyword search remains available when semantic indexing is disabled or incomplete.</li>
              <li>Deleting messages deletes their embeddings and derived index rows.</li>
            </ul>
      </Section>
      <Section id="privacy" title="Privacy" level={3}>
      <ul>
              <li>Data-flow disclosures match observed network traffic for each execution mode.</li>
              <li>AI SDK telemetry records no prompts, outputs, embeddings, or tool payloads.</li>
              <li>Managed, BYOK, self-hosted, and local modes pass automated egress-policy tests.</li>
            </ul>
      </Section>
      </Section>
      <Section id="decisions-to-make-before-implementation" title="Decisions to make before implementation">
      <ol>
              <li>Which license governs the downloadable edition?</li>
              <li>Is Cloud BYOK included in the base Cloud plan or reserved for a higher tier?</li>
              <li>Should managed allowance be shown directly in currency or as transparent credits backed by currency?</li>
              <li>Which managed providers are acceptable subprocessors at launch?</li>
              <li>Which secret-store and KMS implementation will be used in the current Railway deployment?</li>
              <li>Does Claire support per-user settings only initially, or introduce workspaces before billing?</li>
              <li>Is a local embedding model mandatory for the private desktop-only milestone, or is keyword-only search an acceptable first private release?</li>
            </ol>
      </Section>
      <Section id="source-references" title="Source references">
      <ul>
              <li>{"Vercel AI SDK provider architecture and self-hosted options: <https://ai-sdk.dev/docs/foundations/providers-and-models>"}</li>
              <li>{"Vercel AI SDK provider and model registry: <https://ai-sdk.dev/docs/ai-sdk-core/provider-management>"}</li>
              <li>{"Vercel AI SDK custom OpenAI-compatible providers: <https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers>"}</li>
              <li>{"Vercel AI SDK telemetry and input/output recording controls: <https://ai-sdk.dev/docs/ai-sdk-core/telemetry>"}</li>
              <li>{"Vercel AI SDK deterministic model mocks: <https://ai-sdk.dev/docs/ai-sdk-core/testing>"}</li>
              <li>{"Anthropic warning that its OpenAI SDK compatibility path is primarily for evaluation rather than the best production feature coverage: <https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk>"}</li>
              <li>{"Ollama OpenAI-compatible chat, responses, models, and embedding endpoints: <https://docs.ollama.com/api/openai-compatibility>"}</li>
              <li>{"OpenAI production guidance for API-key security, spend limits, and project isolation: <https://developers.openai.com/api/docs/guides/production-best-practices>"}</li>
              <li>{"OpenAI endpoint-specific data retention controls: <https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint>"}</li>
            </ul>
      </Section>
    </Doc>
  );
}
