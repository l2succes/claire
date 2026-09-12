// SPDX-License-Identifier: Apache-2.0
import {
  C,
  Callout,
  Code,
  Diagram,
  Doc,
  DocLink,
  MetricGrid,
  P,
  Panel,
  PanelGrid,
  Section,
  Table,
  Timeline,
} from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Claire on-device intelligence specification',
  description:
    'A local-first architecture for on-device models, private message search, Ask Claire, Loop detection, and safe action proposals.',
  section: 'product',
  status: 'draft',
  lastReviewed: '2026-09-09',
  order: 7,
  roadmap: {
    status: 'research',
    summary:
      'Validate on-device generation, build a device-specific search index, and route Ask Claire and Loops between local and managed execution.',
  },
  related: [
    '/docs/product/ask-claire-v2',
    '/docs/product/loops',
    '/docs/product/ai-platform',
    '/docs/extensibility/plugin-system',
  ],
};

export default function Page() {
  return (
    <Doc>
      <Callout kind="note" title="Decision">
        Claire should add an <b>on-device execution lane</b>, not a separate assistant. On
        capable devices, local search and a local model answer first. The existing server remains
        the synchronization and canonical-state layer, and managed AI remains an explicit fallback
        when the device, index, language, context size, or quality threshold cannot support the
        request.
      </Callout>

      <MetricGrid
        items={[
          {
            value: 'Local first',
            label: 'Default inference route',
            detail: 'When model, index, language, and battery policy permit',
            tone: 'good',
          },
          {
            value: '1',
            label: 'Canonical Loop writer',
            detail: 'A lease prevents local and server detectors racing',
            tone: 'accent',
          },
          {
            value: '0',
            label: 'Unapproved writes',
            detail: 'Local models can read and propose, never silently act',
            tone: 'warning',
          },
          {
            value: 'Per device',
            label: 'Embedding namespace',
            detail: 'Platform, model, revision, dimensions, and script are pinned',
            tone: 'info',
          },
        ]}
      />

      <Section id="product-outcome" title="Product outcome and boundary">
        <P lede>
          The user experiences one Claire. Whether an answer was generated on the phone or by
          managed AI is an execution detail, except where it changes privacy, availability, cost,
          or quality enough that the user should know.
        </P>
        <P>
          On-device Claire means message retrieval, ranking, prompt construction, generation, and
          citation selection can complete without sending message text to a model provider. It does{' '}
          <em>not</em> mean the entire Claire product is serverless. WhatsApp, Telegram, Instagram,
          and other bridges still need network services; cross-device synchronization needs a
          canonical source; and external actions still call the relevant API.
        </P>
        <Table
          head={[<>Capability</>, <>Can run locally?</>, <>Product boundary</>]}
          rows={[
            [
              <>Ask Claire answer generation</>,
              <>Yes</>,
              <>Use a local model when it clears capability and quality checks.</>,
            ],
            [
              <>Exact and semantic message search</>,
              <>Yes</>,
              <>The phone needs a complete-enough encrypted index and an explicit freshness state.</>,
            ],
            [
              <>Relationship and location ranking</>,
              <>Yes</>,
              <>Calculate facts deterministically; let the model explain them.</>,
            ],
            [
              <>Loop extraction and reconciliation</>,
              <>Yes, conditionally</>,
              <>Inference can be local; canonical persistence and race prevention stay coordinated.</>,
            ],
            [
              <>Loop-scoped drafts and questions</>,
              <>Yes</>,
              <>This is the lowest-risk Loop feature to move first because it is user initiated.</>,
            ],
            [
              <>Calendar, booking, and messaging actions</>,
              <>Proposal: yes; execution: depends</>,
              <>Native actions can stay on-device; external services require an authenticated API.</>,
            ],
            [
              <>Bridge ingestion and multi-device sync</>,
              <>No</>,
              <>Keep the existing Claire server, Matrix bridges, and synchronization layer.</>,
            ],
          ]}
        />
      </Section>

      <Section id="why-now" title="Why the current architecture can support it">
        <P>
          Claire already has most of the boundaries a local lane needs. Mobile uses encrypted
          SQLite, caches recent timelines, can optionally backfill full history, stores contacts and
          conversation settings, and preserves stable message IDs. Ask Claire v2 already separates
          deterministic query planning, retrieval, model generation, citations, persistence, and
          stream transport. Loops already separate their free gate, model extraction, deterministic
          relevance, reconciliation, and storage.
        </P>
        <Table
          head={[<>Existing component</>, <>Reusable locally</>, <>Required change</>]}
          rows={[
            [
              <><C>mobile-cache.native.ts</C></>,
              <>Encrypted messages, contacts, settings, cursors, full-history mode</>,
              <>Add AI index tables, model state, completeness, and narrow local queries.</>,
            ],
            [
              <><C>conversation-assistant-query.ts</C></>,
              <>Intent and relative-date planning</>,
              <>Move pure planning into a shared package usable by client and server.</>,
            ],
            [
              <><C>conversation-assistant.ts</C></>,
              <>Prompt, citation, result, and stream concepts</>,
              <>Split server persistence from a platform-neutral answer engine.</>,
            ],
            [
              <><C>loops/loop-gate.ts</C> and <C>loop-reconciler.ts</C></>,
              <>Pure, deterministic filters and safety checks</>,
              <>Move shared logic and types into a client-safe workspace package.</>,
            ],
            [
              <><C>loops/loop-detector.ts</C></>,
              <>Bounded window and structured operation contract</>,
              <>Separate extraction from Supabase reads and canonical writes.</>,
            ],
            [
              <>AI SDK provider registry</>,
              <>Stable generation and embedding vocabulary</>,
              <>Add a client-only on-device provider adapter and capability router.</>,
            ],
          ]}
        />
      </Section>

      <Section id="architecture" title="Target architecture">
        <Diagram
          caption="One product, two inference lanes"
          summary="The phone owns its encrypted replica and local AI index. A policy router chooses local inference or the existing managed path. The server remains authoritative for synchronized records and bridges."
        >{`
          flowchart TB
            User[Ask Claire or new message] --> Router[Device policy router]
            Router -->|eligible| Local[On-device model]
            Router -->|fallback| Cloud[Managed AI service]

            subgraph Phone[User device]
              Cache[Encrypted SQLite replica]
              Search[Lexical and semantic index]
              Memory[Relationship and plan facts]
              Local
              Proposals[Answer, citations, or Loop ops]
              Cache --> Search
              Cache --> Memory
              Search --> Local
              Memory --> Local
              Local --> Proposals
            end

            subgraph Server[Claire synchronization plane]
              API[Claire API]
              Canonical[(Supabase canonical state)]
              Bridges[Matrix and platform bridges]
              Cloud
              API <--> Canonical
              Bridges --> Canonical
              Canonical --> Cloud
            end

            Cache <--> API
            Proposals -->|idempotent commit| API
        `}</Diagram>
        <P>
          The policy router makes the choice before retrieval. It must never begin locally, discover
          after generation that required evidence was missing, and silently produce a weaker answer.
          Index readiness and scope coverage are explicit inputs to routing.
        </P>
        <Code lang="ts">{`type AIExecutionLane = 'on_device' | 'managed' | 'deterministic_only';

interface DeviceAICapabilities {
  generation: 'ready' | 'downloadable' | 'unsupported' | 'busy';
  modelId: string | null;
  modelRevision: string | null;
  supportedLanguages: string[];
  contextTokens: number | null;
  indexState: 'empty' | 'building' | 'partial' | 'ready' | 'stale';
  indexedThroughCursor: number;
  fullHistory: boolean;
}

interface ExecutionDecision {
  lane: AIExecutionLane;
  reason:
    | 'local_ready'
    | 'model_unavailable'
    | 'index_incomplete'
    | 'language_unsupported'
    | 'context_too_large'
    | 'local_busy'
    | 'quality_escalation'
    | 'offline_search_only';
}`}</Code>
      </Section>

      <Section id="model-runtime" title="On-device model runtime">
        <P>
          Use Expo AI Kit behind a Claire-owned adapter. Its built-in route uses Apple Foundation
          Models on eligible iOS devices and ML Kit on eligible Android devices. It can also run
          downloadable LiteRT-LM models and exposes an AI SDK provider. Claire must not import the
          package throughout feature code or couple persisted records to its native types.
        </P>
        <PanelGrid columns={3}>
          <Panel title="Built-in OS model" eyebrow="Default" tone="good">
            No separate multi-gigabyte app asset. Prefer it when available, the language is
            supported, and device evals pass.
          </Panel>
          <Panel title="Downloadable model" eyebrow="Optional" tone="warning">
            User-initiated only, with size, license, Wi-Fi, storage, and deletion controls shown
            before downloading.
          </Panel>
          <Panel title="Managed model" eyebrow="Fallback" tone="info">
            Preserve the current provider registry for unsupported hardware, difficult retrieval,
            larger context, and quality escalation.
          </Panel>
        </PanelGrid>
        <P>
          Plain-text answers may stream token by token. Structured output and tool calls can be
          buffered until validation succeeds. Only one text generation may run at a time on a
          device, so Ask Claire, Loop extraction, summaries, and drafts share a single priority
          queue. A user-visible request outranks background Loop processing; embeddings may proceed
          independently when the native backend supports that safely.
        </P>
        <Table
          head={[<>Priority</>, <>Work</>, <>Scheduling rule</>]}
          rows={[
            [<>P0</>, <>Active Ask Claire answer or user-requested Loop draft</>, <>Start immediately; allow the user to cancel.</>],
            [<>P1</>, <>Local retrieval and query planning</>, <>Run concurrently where safe; never block the UI thread.</>],
            [<>P2</>, <>Foreground incremental Loop extraction</>, <>Yield when a P0 request begins.</>],
            [<>P3</>, <>Embedding backfill and relationship recomputation</>, <>Run in bounded chunks while idle; pause on heat, low power, or app background limits.</>],
          ]}
        />
      </Section>

      <Section id="local-index" title="Private local search index">
        <P>
          Local generation is only useful when retrieval is trustworthy. Claire must search the
          local replica rather than placing an entire message archive in the model context. The
          index combines exact search, semantic search, time and conversation filters, and
          deterministic personal-memory tables.
        </P>
        <Table
          head={[<>Store</>, <>Minimum fields</>, <>Purpose</>]}
          rows={[
            [
              <><C>local_ai_index_state</C></>,
              <>user, corpus cursor, model ID, revision, dimensions, language/script, status, error</>,
              <>Makes completeness, compatibility, and rebuild decisions explicit.</>,
            ],
            [
              <><C>local_message_lexical</C></>,
              <>message ID, chat ID, normalized content, timestamp, sender, platform</>,
              <>Exact names, quoted phrases, dates, usernames, and fallback retrieval.</>,
            ],
            [
              <><C>local_message_embeddings</C></>,
              <>message ID, vector, namespace, content hash, indexed timestamp</>,
              <>Meaning-based retrieval without re-embedding unchanged messages.</>,
            ],
            [
              <><C>local_relationship_metrics</C></>,
              <>chat ID, 30/90-day counts, reciprocity, last interaction, computed cursor</>,
              <>Ranks people with deterministic evidence rather than model intuition.</>,
            ],
            [
              <><C>local_plan_facts</C></>,
              <>source IDs, participants, normalized time range, status, confidence</>,
              <>Answers plan questions without scanning every conversation.</>,
            ],
          ]}
        />
        <P>
          The existing encrypted SQLite key protects these tables at rest. Local indexes are derived
          data with the same sensitivity as the underlying messages: clearing local data, signing
          out, deleting a message, or disabling full history must remove or trim matching index rows.
        </P>

        <Section id="retrieval-pipeline" title="Retrieval pipeline" level={3}>
          <Diagram
            caption="Local hybrid retrieval"
            summary="A deterministic query plan fans out to lexical, vector, relationship, and plan indexes. Rank fusion chooses evidence windows, and the model receives only those windows."
          >{`
            flowchart LR
              Q[Question] --> Plan[Deterministic query plan]
              Plan --> FTS[Exact and lexical search]
              Plan --> Vec[Per-model vector search]
              Plan --> People[Relationship and location query]
              Plan --> Plans[Plan facts query]
              FTS --> Fuse[Rank fusion and filters]
              Vec --> Fuse
              People --> Fuse
              Plans --> Fuse
              Fuse --> Window[Chronological evidence windows]
              Window --> Model[Local answer model]
              Model --> Cite[Citation validation]
          `}</Diagram>
          <ol>
            <li>Parse intent, relative dates, named people, locations, and preferred conversations without a model where possible.</li>
            <li>Run lexical and semantic retrieval in parallel inside the requested user, chat, and date boundaries.</li>
            <li>Fuse ranks without directly comparing unrelated score scales.</li>
            <li>Expand top anchors into short chronological windows so plans and pronouns have context.</li>
            <li>Generate from stable source labels and discard any citation label that does not resolve.</li>
            <li>Return index scope and freshness with the answer so partial history is never presented as exhaustive.</li>
          </ol>
        </Section>

        <Section id="multilingual" title="Multilingual and cross-script search" level={3}>
          <P>
            This is a launch blocker, not an optimization. On iOS, Expo AI Kit uses separate Apple
            embedding assets for Latin, Cyrillic, and CJK scripts. Those vectors cannot be compared
            across model identities. An English question such as “Who was the Russian girl?” may
            need to find a Cyrillic message, and a single-vector-space implementation can miss it.
          </P>
          <P>The index must therefore support multiple namespaces and one of these evaluated strategies:</P>
          <ol>
            <li><b>Preferred:</b> ship or integrate a compact multilingual embedding model with one cross-language vector space.</li>
            <li><b>Fallback:</b> detect corpus scripts, produce query variants for each supported language/script, search each compatible namespace, then fuse the results.</li>
            <li><b>Safety valve:</b> route cross-script questions to managed retrieval when local recall is not proven.</li>
          </ol>
          <Callout kind="warning">
            Never mix vectors from different platforms, models, revisions, dimensions, or script
            assets in one similarity search. An OS model update invalidates that namespace and
            schedules a resumable rebuild; lexical search remains available while rebuilding.
          </Callout>
        </Section>
      </Section>

      <Section id="ask-claire-local" title="Ask Claire on-device flow">
        <Table
          head={[<>Phase</>, <>Local behavior</>, <>Fallback trigger</>]}
          rows={[
            [
              <>1. Capability check</>,
              <>Read model readiness, language support, index coverage, thermal and power policy.</>,
              <>Unsupported, busy beyond timeout, stale/incomplete required scope.</>,
            ],
            [
              <>2. Query planning</>,
              <>Compile intent, time range, people/location needs, and conversation scope.</>,
              <>Ambiguous compound request that the deterministic planner cannot represent.</>,
            ],
            [
              <>3. Retrieval</>,
              <>Search local indexes and form evidence windows with stable message IDs.</>,
              <>Cross-script recall risk, missing full history, or no adequate evidence.</>,
            ],
            [
              <>4. Generation</>,
              <>Stream a concise answer from evidence and local memory only.</>,
              <>Context exceeds model limit, inference error, or eval-classified hard query.</>,
            ],
            [
              <>5. Validation</>,
              <>Resolve every citation and constrain suggested actions to evidence.</>,
              <>Invalid structured output after bounded repair.</>,
            ],
            [
              <>6. Persistence</>,
              <>Show immediately, write to the local outbox, then synchronize the turn.</>,
              <>Offline is acceptable; retry by stable request ID when connectivity returns.</>,
            ],
          ]}
        />
        <P>
          A cloud fallback is a new request lane, not a hidden continuation. Before message evidence
          leaves the device for managed inference, apply the user&apos;s AI privacy setting and show a
          compact disclosure when required. Do not upload the full local index; send only the
          bounded evidence package selected for that answer.
        </P>
        <P>
          The existing Ask Claire UI, stream parts, answer cards, citations, Stop behavior, action
          proposals, and thread history remain unchanged. The result adds execution metadata:{' '}
          <C>lane</C>, model identity, index coverage, fallback reason, and measured latency. That
          metadata is diagnostic and privacy-visible but does not clutter the normal conversation.
        </P>
      </Section>

      <Section id="loops-local" title="Can Loop generation run locally?">
        <Callout kind="note" title="Yes—the model work can. Reliability still needs coordination.">
          Loop extraction is a strong on-device candidate because the existing detector already
          bounds its input to 40 messages and 6,000 characters, filters most windows with free code,
          requests a strict list of create/update/close operations, and validates relevance,
          confidence, evidence, deduplication, and closing rules outside the model.
        </Callout>
        <P>
          “Loop generation” is three distinct workloads. They should not move as one switch.
        </P>
        <Table
          head={[<>Workload</>, <>Local verdict</>, <>Reason</>]}
          rows={[
            [
              <>Loop-scoped assistant</>,
              <><b>Move first</b></>,
              <>User initiated, one loop, small tool set, recent context, and proposals are inert.</>,
            ],
            [
              <>Incremental create/update/close extraction</>,
              <><b>Viable with a lease</b></>,
              <>The structured operation contract fits small models, but only one detector may own a chat cursor.</>,
            ],
            [
              <>Continuous background detection</>,
              <><b>Hybrid</b></>,
              <>A phone can be offline, suspended, hot, or closed while bridge messages continue arriving.</>,
            ],
            [
              <>Historical Loop backfill</>,
              <><b>Opt-in local job</b></>,
              <>Potentially large and battery-intensive; resumable foreground/charging work with managed fallback.</>,
            ],
          ]}
        />

        <Section id="loops-ownership" title="Canonical ownership and synchronization" level={3}>
          <P>
            Claire Cloud should continue to guarantee that new messages are eventually examined even
            if the mobile app never opens. When a device is active and eligible, it may take a
            short-lived detection lease for a chat and run the extraction locally. The lease binds
            the user, chat, starting cursor, ending cursor, model identity, and expiry.
          </P>
          <Code lang="ts">{`interface LoopDetectionLease {
  leaseId: string;
  userId: string;
  chatId: string;
  fromCursor: string | null;
  throughCursor: string;
  owner: 'device' | 'server';
  expiresAt: string;
}

interface ProposedLoopBatch {
  requestId: string;       // idempotency key
  leaseId: string;
  operations: LoopOp[];    // create, update, close
  evidenceMessageIds: string[];
  model: { id: string; revision: string | null };
}`}</Code>
          <ol>
            <li>The server grants one owner for a bounded cursor range.</li>
            <li>The device builds the same window and runs the same deterministic gate.</li>
            <li>The local model returns structured operations, never direct database mutations.</li>
            <li>The device runs shared relevance and reconciliation guards before submission.</li>
            <li>The server rechecks ownership, live Loop IDs, evidence IDs, confidence policy, and idempotency inside one transaction.</li>
            <li>If the lease expires or the device disappears, the server safely processes the range.</li>
          </ol>
          <P>
            Self-hosted or explicitly device-only deployments may make the local database canonical
            while offline and merge later. Claire Cloud should not: a local-only background promise
            would miss messages whenever iOS suspends the app.
          </P>
        </Section>

        <Section id="loops-model-contract" title="Local Loop model contract" level={3}>
          <P>
            Preserve the existing <C>LoopOp</C> schema and all deterministic guards. Reduce the local
            prompt when necessary, but do not weaken these invariants:
          </P>
          <ul>
            <li>A conversation thread produces one evolving Loop, not one item per message.</li>
            <li>Every create or close cites real message IDs from the supplied window.</li>
            <li>Silence never closes a Loop.</li>
            <li>Unknown Loop IDs, invalid evidence, low confidence, and duplicate creates fail closed.</li>
            <li>Group relevance and self-identity remain deterministic.</li>
            <li>User edits outrank later model proposals.</li>
          </ul>
          <P>
            On-device models are weaker at large schemas and tool selection, so Loop extraction
            should remain one shallow structured-output request rather than a broad agent with many
            tools. A bounded repair attempt is allowed; failure leaves the cursor uncommitted so the
            server or a later local pass can retry.
          </P>
        </Section>
      </Section>

      <Section id="actions" title="Local intelligence and the future action system">
        <P>
          Local models fit the action system when they are planners, not authorities. Ask Claire or
          a Loop may propose a typed action. Claire then validates the proposal, displays the exact
          destination and fields, obtains approval, and hands it to a trusted native or plugin
          executor.
        </P>
        <Diagram
          caption="Propose, approve, execute"
          summary="The model can only create an inert proposal. Policy validation and the user approval boundary sit before native or plugin execution."
        >{`
          flowchart LR
            Model[Local or managed model] --> Proposal[Typed action proposal]
            Proposal --> Policy[Claire policy and schema validation]
            Policy --> Review[User reviews exact fields]
            Review -->|approve| Executor[Native or plugin executor]
            Review -->|reject| Stop[No effect]
            Executor --> Receipt[Durable receipt and undo where possible]
        `}</Diagram>
        <Table
          head={[<>Action</>, <>Planning</>, <>Execution</>]}
          rows={[
            [<>Open a cited conversation</>, <>Local</>, <>Local navigation</>],
            [<>Draft a reply</>, <>Local</>, <>Insert locally; sending still uses the bridge</>],
            [<>Create an Apple calendar event</>, <>Local</>, <>Native API after permission and confirmation</>],
            [<>Schedule through Google Calendar</>, <>Local</>, <>Plugin/API after confirmation</>],
            [<>Book a restaurant or service</>, <>Local with narrow tools</>, <>External plugin/API after confirmation</>],
          ]}
        />
        <P>
          Present only the tools relevant to the current task. Small on-device models should never
          choose from the entire installed plugin catalog. A deterministic capability router selects
          a small read/propose tool set; write credentials and execution functions stay outside the
          model runtime. See the <DocLink to="/docs/extensibility/plugin-system" />.
        </P>
      </Section>

      <Section id="privacy-security" title="Privacy, security, and data lifecycle">
        <Table
          head={[<>Requirement</>, <>Acceptance rule</>]}
          rows={[
            [
              <>No accidental model egress</>,
              <>The on-device lane contains no network-backed model provider and tests fail on any prompt upload.</>,
            ],
            [
              <>Encrypted derived data</>,
              <>Text indexes, vectors, facts, prompts, and local turns live only in the encrypted user database.</>,
            ],
            [
              <>Deletion propagation</>,
              <>Message deletion, sign-out, cache clearing, and history-retention changes delete corresponding derived rows.</>,
            ],
            [
              <>Untrusted conversation content</>,
              <>Messages are always data; they cannot alter tools, policy, routing, approvals, or system instructions.</>,
            ],
            [
              <>Minimal telemetry</>,
              <>Record lane, timing, model identity, counts, and typed errors; never raw prompts, answers, messages, vectors, or tool payloads.</>,
            ],
            [
              <>Honest privacy copy</>,
              <>“Processed on this device” appears only when both retrieval and generation stayed local.</>,
            ],
          ]}
        />
      </Section>

      <Section id="performance-cost" title="Performance, battery, storage, and cost budgets">
        <P>
          On-device inference removes per-token model charges; it does not make computation free.
          Claire pays with application complexity, test coverage, support, and synchronization, while
          the user pays with storage, battery, memory, and heat. Rollout gates must measure all four.
        </P>
        <Table
          head={[<>Metric</>, <>Initial target</>, <>Gate</>]}
          rows={[
            [<>Warm local first token</>, <>p50 ≤1.5s; p95 ≤4s on reference devices</>, <>Compare against managed streaming, by device class.</>],
            [<>Local hybrid retrieval</>, <>p95 ≤600ms after index readiness</>, <>Measured without blocking React Native&apos;s UI thread.</>],
            [<>Ask Claire completion</>, <>p95 ≤12s for golden queries</>, <>Quality and citation gates take precedence over speed.</>],
            [<>Incremental indexing</>, <>New text searchable within 10s while app is active</>, <>Never delays message receipt or screen navigation.</>],
            [<>Background generation</>, <>Zero while low-power, thermally constrained, or user-active</>, <>Resume from the last committed cursor.</>],
            [<>Large model download</>, <>Never automatic</>, <>Show exact size, license, network, storage, and delete controls.</>],
            [<>Cloud model cost</>, <>Zero on successful local-only requests</>, <>Fallback usage remains metered by feature and reason.</>],
          ]}
        />
        <P>
          These are candidate launch targets, not measurements. The reference-device matrix and
          current managed baseline must be captured before they become release gates.
        </P>
      </Section>

      <Section id="quality" title="Evaluation and release gates">
        <P>
          A local model ships by task, device class, OS version, model revision, and language—not
          because a single demo looked good. Apple may update the built-in model with the OS, so the
          same eval suite runs again for every supported revision.
        </P>
        <Table
          head={[<>Suite</>, <>Measures</>, <>Blocking failure</>]}
          rows={[
            [
              <>Ask Claire golden queries</>,
              <>Identity recall, plans, people/location, ambiguity, citation precision and recall</>,
              <>Unsupported claim, wrong person/date, fabricated citation, or material regression against managed baseline</>,
            ],
            [
              <>Multilingual retrieval</>,
              <>English/Spanish/Cyrillic and mixed-script recall</>,
              <>The relevant evidence falls outside the candidate set without an explicit fallback</>,
            ],
            [
              <>Loop extraction</>,
              <>Create/update/close F1, duplicate rate, ownership, deadline normalization</>,
              <>Wrong close, other-person group Loop surfaced, user edit overwritten, or evidence missing</>,
            ],
            [
              <>Action proposals</>,
              <>Tool selection, argument validity, approval boundary, prompt injection resistance</>,
              <>Any unapproved effect or credential/tool exposure</>,
            ],
            [
              <>Device performance</>,
              <>Cold/warm latency, memory, battery, thermal state, cancellation, app lifecycle</>,
              <>Crash, UI stall, sustained thermal escalation, or unrecoverable model/index state</>,
            ],
          ]}
        />
        <P>
          Start with anonymized fixtures and the existing synthetic Loop corpus, then run the Lucas
          two-device flow after the action is explicitly approved under its testing specification.
          Local and managed candidates receive identical evidence packages so generation quality can
          be compared independently from retrieval quality.
        </P>
      </Section>

      <Section id="delivery" title="Delivery plan">
        <Timeline
          label="On-device intelligence delivery sequence"
          items={[
            {
              phase: 'Spike 0 · Reference benchmark',
              title: 'Prove the model before changing product architecture',
              description:
                'Integrate Expo AI Kit in a development-only screen, run saved Ask Claire evidence and Loop windows, and capture quality, latency, memory, heat, and cancellation on real devices.',
              status: 'now',
            },
            {
              phase: 'PR 1 · Runtime boundary',
              title: 'Add the on-device provider and capability router',
              description:
                'Create a Claire-owned client runtime, model availability UI, one-generation queue, typed errors, and managed fallback without changing answers yet.',
              status: 'next',
            },
            {
              phase: 'PR 2 · Local generation pilot',
              title: 'Generate from existing server-selected evidence',
              description:
                'Keep retrieval unchanged, send a bounded evidence package to the phone, stream locally, validate citations, and compare against the managed answer path.',
              status: 'next',
            },
            {
              phase: 'PR 3 · Lexical index',
              title: 'Make exact and time-bounded search local',
              description:
                'Add encrypted index state, content hashes, deletion propagation, local query planning, rank fusion, and partial-history disclosures.',
              status: 'later',
            },
            {
              phase: 'PR 4 · Semantic and memory index',
              title: 'Add local embeddings and deterministic personal memory',
              description:
                'Persist model-versioned vectors, multilingual namespaces, relationship metrics, plan facts, incremental indexing, and resumable rebuilds.',
              status: 'later',
            },
            {
              phase: 'PR 5 · Ask Claire local-first',
              title: 'Route eligible golden queries entirely on-device',
              description:
                'Enable local retrieval plus generation by cohort, retain explicit escalation, and expose trustworthy privacy and freshness states.',
              status: 'later',
            },
            {
              phase: 'PR 6 · Loop assistant local',
              title: 'Move user-initiated Loop questions and drafts',
              description:
                'Use a small read/propose tool set over the local Loop replica with no execution authority.',
              status: 'later',
            },
            {
              phase: 'PR 7 · Leased Loop detection',
              title: 'Pilot local extraction with server guarantees',
              description:
                'Add cursor-range leases, shared deterministic guards, idempotent operation batches, server revalidation, and expiry takeover.',
              status: 'later',
            },
          ]}
        />
      </Section>

      <Section id="open-decisions" title="Decisions to resolve in the benchmark">
        <Table
          head={[<>Question</>, <>Default until measured</>]}
          rows={[
            [<>Which iOS model?</>, <>Apple&apos;s built-in Foundation Model on eligible devices.</>],
            [<>Downloadable fallback?</>, <>No automatic download; evaluate separately by device tier.</>],
            [<>Which multilingual embedder?</>, <>Keep managed semantic fallback until cross-script recall is proven.</>],
            [<>Who owns Loop detection?</>, <>Server, unless a device holds a valid cursor-range lease.</>],
            [<>Should local answers sync?</>, <>Yes, through an idempotent outbox; user may later choose device-only history.</>],
            [<>When may Claire escalate?</>, <>Only under the saved privacy policy, with a typed reason and bounded evidence payload.</>],
          ]}
        />
      </Section>

      <Section id="references" title="External implementation references">
        <ul>
          <li>
            <a href="https://expo-ai-kit.dev/guides/platform-support" rel="noreferrer" target="_blank">
              Expo AI Kit platform support and fallback requirements
            </a>
          </li>
          <li>
            <a href="https://expo-ai-kit.dev/guides/models" rel="noreferrer" target="_blank">
              Built-in and downloadable model lifecycle
            </a>
          </li>
          <li>
            <a href="https://expo-ai-kit.dev/guides/embeddings" rel="noreferrer" target="_blank">
              Local embeddings, RAG, model identity, and language namespaces
            </a>
          </li>
          <li>
            <a href="https://expo-ai-kit.dev/guides/vercel-ai-sdk" rel="noreferrer" target="_blank">
              Expo AI Kit provider for Vercel AI SDK
            </a>
          </li>
          <li>
            <a href="https://expo-ai-kit.dev/guides/tool-calling" rel="noreferrer" target="_blank">
              Tool calling, bounded repair, and human approval
            </a>
          </li>
          <li>
            <a
              href="https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models"
              rel="noreferrer"
              target="_blank"
            >
              Apple Foundation Models availability and fallback guidance
            </a>
          </li>
        </ul>
      </Section>
    </Doc>
  );
}
