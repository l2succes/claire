// SPDX-License-Identifier: Apache-2.0
import {
  BarChart,
  C,
  Callout,
  CapabilityGrid,
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
  title: 'Ask Claire v2: streaming, retrieval, and cost specification',
  description:
    'A staged implementation specification for a faster, cheaper, provider-portable Ask Claire with grounded streaming answers and a safe path to plugin actions.',
  section: 'product',
  status: 'draft',
  lastReviewed: '2026-09-08',
  order: 6,
  roadmap: {
    status: 'planned',
    summary:
      'Move Ask Claire onto the shared AI SDK runtime, stream grounded answers, and reduce retrieval and inference cost.',
  },
  related: [
    '/docs/product/on-device-intelligence',
    '/docs/product/ai-platform',
    '/docs/product/ai-model-costs',
    '/docs/extensibility/plugin-system',
    '/docs/plans/loops-revamp',
  ],
};

export default function Page() {
  return (
    <Doc>
      <Callout kind="note">
        <b>Decision:</b> adopt Vercel AI SDK Core for Ask Claire&apos;s server-side model,
        embedding, streaming, and future tool boundaries. Use direct provider packages through
        Claire&apos;s own registry; do not require Vercel AI Gateway. Adopt the AI SDK UI stream
        protocol, then pilot
        <C>@ai-sdk/react</C> on Expo behind an adapter instead of making Claire&apos;s persisted
        thread model depend on the hook.
      </Callout>

      <MetricGrid
        items={[
          {
            value: '3',
            label: 'Golden personal-memory queries',
            detail: 'Identity, plan recall, and people planning',
            tone: 'accent',
          },
          {
            value: '1',
            label: 'Normal generation step',
            detail: 'Escalate only for compound questions',
            tone: 'good',
          },
          {
            value: '4',
            label: 'Evidence windows maximum',
            detail: 'Chronological context, not isolated snippets',
            tone: 'info',
          },
          {
            value: '0',
            label: 'Unapproved external writes',
            detail: 'Every outreach action remains a proposal',
            tone: 'warning',
          },
        ]}
      />

      <Section id="purpose" title="Purpose and product boundary">
        <P>
          Ask Claire is the user-initiated research and assistance surface across connected
          conversations. It finds relevant evidence, answers with citations, and helps the person
          decide what to do next. It does not silently send messages, book meetings, edit external
          systems, or treat message text as authorization.
        </P>
        <P>
          This specification covers the interactive Ask Claire tab, the conversation-scoped Ask
          Claire surface, and the shared server engine behind both. It extends the{' '}
          <DocLink to="/docs/product/ai-platform">AI platform specification</DocLink>, the{' '}
          <DocLink to="/docs/product/ai-model-costs">AI model and cost model</DocLink>, and the{' '}
          <DocLink to="/docs/extensibility/plugin-system">plugin system specification</DocLink>.
          Those documents remain authoritative for account billing, provider credentials, plugin
          permissions, approvals, and external execution.
        </P>
        <Table
          head={[<>Goal</>, <>Required outcome</>]}
          rows={[
            [
              <>Fast</>,
              <>Show useful progress immediately and stream answer text as it is generated.</>,
            ],
            [
              <>Grounded</>,
              <>Every factual conversation claim links to the message evidence that supports it.</>,
            ],
            [
              <>Low cost</>,
              <>
                Use no model when deterministic data is sufficient and one generation step for a
                normal answer.
              </>,
            ],
            [
              <>Portable</>,
              <>
                Select providers and models by Claire task profile, not by imports in the product
                service.
              </>,
            ],
            [
              <>Safe</>,
              <>
                Read directly, propose writes, and require the plugin policy system to authorize
                every external effect.
              </>,
            ],
            [
              <>Durable</>,
              <>
                A reconnect, retry, server restart, or duplicate submission cannot lose or repeat a
                completed turn.
              </>,
            ],
          ]}
        />
        <P>
          <b>Non-goals for v2:</b> autonomous background agents, unrestricted MCP execution,
          model-generated UI, silently sending messages, and storing a full model transcript as the
          database source of truth.
        </P>
      </Section>

      <Section id="current-state" title="Current state and work already completed">
        <P>
          The current service is a persisted RAG chat. New messages are embedded with
          <C>text-embedding-3-small</C> and stored in <C>conversation_message_embeddings</C>. A
          question launches lexical and vector retrieval in parallel, merges up to 12 individual
          message hits, adds the last six assistant turns and selected conversation instructions,
          calls OpenAI Chat Completions for JSON, validates cited indices and two navigation
          actions, then stores the user and assistant turns.
        </P>
        <Table
          head={[<>Area</>, <>Already present</>, <>Gap</>]}
          rows={[
            [
              <>Retrieval</>,
              <>
                User-scoped full-text search, pgvector HNSW, strict chat scope, preferred <C>@</C>{' '}
                chats
              </>,
              <>
                Raw lexical rank and cosine similarity are compared directly; no threshold,
                neighborhood expansion, or retrieval evaluation.
              </>,
            ],
            [
              <>Grounding</>,
              <>
                The model selects source indices; server caps and validates them; source cards open
                the original message
              </>,
              <>
                When no source index is returned, the current fallback still displays the first
                retrieved sources, which can imply support the model did not claim.
              </>,
            ],
            [
              <>Threads</>,
              <>Persisted global threads and one retained thread per conversation</>,
              <>
                Every answer reads the entire thread even though only six turns enter the prompt.
              </>,
            ],
            [
              <>Indexing</>,
              <>Content hashes, resumable backfill, and live fire-and-forget indexing</>,
              <>
                Backfill embeds one message per provider call, stops after 1,000 rows, and only
                selects missing—not changed—embeddings.
              </>,
            ],
            [
              <>Actions</>,
              <>
                <C>open_conversation</C> and <C>open_calendar</C> suggestions are source-validated
                and inert
              </>,
              <>
                <C>open_calendar</C> only launches the native calendar; generated title/time are not
                written or prefilled, and this is not the plugin action system.
              </>,
            ],
            [
              <>AI runtime</>,
              <>
                AI SDK 7 provider registry, structured generation, and a bounded loop agent already
                exist under <C>services/ai</C>
              </>,
              <>
                Ask Claire still imports the OpenAI SDK directly and cannot use the shared
                providers, failover, usage, or timeout behavior.
              </>,
            ],
            [
              <>Client</>,
              <>Optimistic user turn, persisted history, cached thread list, mobile citations</>,
              <>
                The response is all-or-nothing; no token streaming, stop button, stream recovery, or
                shared mobile/desktop message-part renderer.
              </>,
            ],
          ]}
        />
        <Callout kind="warning">
          Fix before migration: <C>askConversation()</C> obtains a chat-scoped thread and calls
          <C>ask()</C>, but <C>ask()</C> reloads it through <C>getThread()</C> with the default
          <C>chat_id IS NULL</C> restriction. Add an integration test that proves global threads
          cannot read chat-scoped threads while the conversation endpoint can read its own thread.
        </Callout>
      </Section>

      <Section id="representative-questions" title="Representative questions and capability bar">
        <P>
          Ask Claire succeeds only if it can answer the questions people naturally ask when they
          remember part of a conversation but not where it happened. The following questions are
          release-defining workloads, not aspirational examples. They become versioned golden
          queries in the evaluation corpus and must work across every enabled messaging platform.
        </P>
        <CapabilityGrid
          items={[
            {
              title: 'Identity from a remembered detail',
              question:
                '“Who was the Russian girl I was talking about in the past couple of days?”',
              status: 'partial',
              description: (
                <>
                  Semantic search may find “Russian,” and <C>open_conversation</C> can navigate to a
                  cited chat. It cannot reliably join the person, attribute, name, and time window
                  across nearby messages.
                </>
              ),
            },
            {
              title: 'Plans on a relative date',
              question: '“I made plans on Saturday, but with whom?”',
              status: 'partial',
              description: (
                <>
                  Search may retrieve “Saturday,” “dinner,” or “see you.” It does not resolve the
                  date in the user&apos;s timezone or distinguish tentative, confirmed, changed, and
                  cancelled plans.
                </>
              ),
            },
            {
              title: 'People planning and outreach',
              question:
                '“Who are my closest people in Mexico City or Brooklyn, and can we reach out?”',
              status: 'missing',
              description: (
                <>
                  Ask Claire does not yet join temporal location facts with relationship metrics or
                  create approved, per-recipient outreach proposals.
                </>
              ),
            },
          ]}
        />
        <Callout kind="warning">
          Streaming improves perceived responsiveness, not reasoning quality. These workloads must
          pass retrieval and grounding evaluation before a faster streamed answer is considered an
          improvement.
        </Callout>

        <Section id="question-contracts" title="Required answer contracts" level={3}>
          <PanelGrid>
            <Panel title="Identify a discussed person" eyebrow="Identity lookup" tone="warning">
              <P>
                Resolve the time range, search descriptor anchors, and expand each hit into a
                chronological window. Return the likely person, uncertainty, citations, and a
                trusted link to the best source conversation.
              </P>
            </Panel>
            <Panel title="Recall a plan" eyebrow="Temporal memory" tone="info">
              <P>
                Resolve the local date, group nearby planning turns, and classify the plan as
                tentative, confirmed, changed, or cancelled. Preserve multiple credible candidates.
              </P>
            </Panel>
            <Panel title="Build a people shortlist" eyebrow="Relationship query" tone="good">
              <P>
                Filter provenance-backed location facts, then rank deterministic communication
                metrics. Explain why each person appears and when their location was last confirmed.
              </P>
            </Panel>
            <Panel title="Prepare outreach" eyebrow="Plugin proposal" tone="accent">
              <P>
                Confirm recipients and generate one editable draft per destination. Show the exact
                proposal payload; send nothing until the user explicitly approves it.
              </P>
            </Panel>
          </PanelGrid>
        </Section>

        <Section id="query-plan" title="Structured query plan" level={3}>
          <P>
            Compile every question into a Claire-owned plan before retrieval. Deterministic code
            handles relative dates, explicit people, platform filters, trusted <C>@</C> selections,
            and common workload phrases. Use at most one low-cost structured planner call only for
            compound or ambiguous questions that the deterministic compiler cannot represent. The
            planner emits constraints; it never receives database credentials or performs reads.
          </P>
          <Diagram
            caption="The personal-memory query path"
            summary="Claire resolves trusted constraints before retrieval, assembles cited evidence, and only then generates an answer or proposal."
          >{`flowchart LR
  Q["Natural question"] --> N["Normalize date, timezone, people"]
  N --> R{"Choose route"}
  R -->|"Remembered detail"| W["Message windows"]
  R -->|"Plans"| P["Plan candidates"]
  R -->|"People shortlist"| M["Facts + metrics"]
  W --> E["Cited evidence pack"]
  P --> E
  M --> E
  E --> A["Grounded answer"]
  A -.->|"write requested"| D["Durable proposal"]`}</Diagram>
          <Code lang="json">{`{
  "intent": "identity_lookup | plan_recall | people_ranking | conversation_qa | action_request",
  "timeRange": { "start": "ISO-8601", "end": "ISO-8601", "timezone": "IANA" },
  "people": [{ "name": null, "descriptors": ["Russian"], "chatId": null }],
  "location": { "city": "Mexico City", "asOf": "ISO-8601" },
  "planStatus": ["proposed", "confirmed", "changed", "cancelled"],
  "ranking": { "kind": "relationship_strength", "limit": 12 },
  "requestedAction": { "type": "draft_outreach", "requiresApproval": true }
}`}</Code>
          <ul>
            <li>
              Relative dates use the account timezone and an explicit request timestamp. Store the
              resolved range with the turn so a replay does not reinterpret “Saturday.”
            </li>
            <li>
              “Past couple of days” defaults to the preceding 48 hours through the request time;
              product copy may display the concrete dates Claire searched.
            </li>
            <li>
              If “Saturday” could reasonably mean two dates, prefer the nearest upcoming or most
              recent Saturday based on tense and show the chosen date. Ask a clarification only when
              candidates remain materially ambiguous.
            </li>
            <li>
              All filters are enforced in database queries. A prompt instruction to consider only a
              date, person, or chat is not a security or correctness boundary.
            </li>
          </ul>
        </Section>

        <Section id="people-memory" title="People memory and relationship ranking" level={3}>
          <P>
            Keep user-entered <C>contact_profiles</C> as authoritative overrides, but replace a
            single timeless location string as the only memory representation. Derived facts need
            provenance, time, and confidence so Claire can answer “still based in Brooklyn” without
            treating an old trip or previous home as current.
          </P>
          <Table
            head={[<>Record</>, <>Minimum fields</>, <>Rule</>]}
            rows={[
              [
                <>
                  <C>assistant_people</C> and <C>assistant_person_links</C>
                </>,
                <>
                  User-scoped person ID, preferred display name, aliases, optional linked Claire
                  contacts/platform identities, merge target, confidence, and source message IDs
                </>,
                <>
                  A person may be a contact or merely someone discussed inside another conversation.
                  Never assume that the chat participant and the person being discussed are the same
                  individual.
                </>,
              ],
              [
                <>
                  <C>assistant_person_facts</C>
                </>,
                <>
                  Person/contact identity, predicate, normalized and displayed value, valid-from,
                  valid-until, observed-at, last-confirmed-at, confidence, provenance type, source
                  message IDs
                </>,
                <>
                  User edits override inferred facts. Conflicting values coexist until resolved;
                  expired or stale facts are shown with their date rather than silently discarded.
                </>,
              ],
              [
                <>
                  <C>assistant_relationship_metrics</C>
                </>,
                <>
                  Person/chat, window start/end, sent/received counts, active days, last contact,
                  response balance, one-to-one/group share, user relationship label
                </>,
                <>
                  Derived asynchronously from metadata. Do not send message content to a model to
                  calculate communication frequency.
                </>,
              ],
            ]}
          />
          <P>
            “Closest” is an explainable product ranking, not a claim about the user&apos;s emotions.
            A default score may combine recency, active days, reciprocal exchanges, sustained
            contact, and a user-defined relationship label. Exclude raw message volume dominance,
            group-chat noise, automated accounts, and one-sided bursts. Return component
            explanations such as “you spoke on 9 days this month and last talked yesterday,” never
            the opaque score.
          </P>
          <P>
            Normalize safe lookup aliases such as “CDMX,” “Ciudad de México,” and “Mexico City,”
            while retaining the displayed source wording. Nationality, precise location, health,
            religion, sexuality, and similar inferred attributes receive an explicit sensitivity
            class. Use them ephemerally for on-demand retrieval by default; persist them only under
            the configured memory policy, with provenance, retention, correction, and deletion.
          </P>
        </Section>

        <Section id="plan-memory" title="Plan and event memory" level={3}>
          <P>
            Maintain structured plan candidates separately from calendar events and Loops. A plan
            candidate is evidence that people discussed doing something; it is not proof that an
            event exists on a calendar.
          </P>
          <P>
            Each <C>assistant_plan_candidate</C> stores the user, conversation, participants,
            normalized start/end when known, original date phrase, timezone, place/title, status,
            confidence, extraction version, source message IDs, and superseding candidate. Detect
            candidates asynchronously on changed conversation windows and support on-demand
            extraction for an uncovered date range. Cancellation or rescheduling creates a new state
            linked to the earlier evidence instead of overwriting history.
          </P>
        </Section>
      </Section>

      <Section id="target-architecture" title="Target architecture">
        <Diagram>{`flowchart LR
  A["Expo / Electron Ask Claire"] -->|"one authenticated stream request"| B["Assistant response controller"]
  B --> C["Thread + idempotency service"]
  B --> D["Query compiler + context router"]
  D --> E["Messages: lexical + vector"]
  D --> F["Recent chat windows"]
  D --> G["Loops + relationship context"]
  D --> N["People facts + relationship metrics"]
  D --> O["Plan candidates"]
  E --> H["Evidence pack"]
  F --> H
  G --> H
  N --> H
  O --> H
  H --> I["Claire AI service"]
  I --> J["AI SDK provider registry"]
  J --> K["Azure / OpenAI / Kimi / compatible / local"]
  I -->|"text deltas"| B
  B -->|"status + sources + text + final"| A
  B --> L["Final turn + usage event"]
  I -.->|"future: proposal only"| M["Plugin policy + durable approval"]`}</Diagram>
        <P>
          Keep retrieval and persistence in Claire-owned services. The AI SDK is the provider and
          stream runtime, not the product architecture. Product code asks for a task profile and
          consumes Claire types; only <C>apps/server/src/services/ai/</C> imports provider packages.
        </P>
      </Section>

      <Section id="ai-sdk-decision" title="AI SDK adoption decision">
        <Table
          head={[<>Layer</>, <>Decision</>, <>Reason</>]}
          rows={[
            [
              <>AI SDK Core</>,
              <>
                <b>Adopt</b>
              </>,
              <>
                The repository already uses it. <C>streamText</C>, <C>generateText</C>,{' '}
                <C>Output.object</C>, <C>embedMany</C>, tools, timeouts, usage, and provider-neutral
                models remove Ask Claire&apos;s duplicate OpenAI-only path.
              </>,
            ],
            [
              <>Direct provider packages</>,
              <>
                <b>Adopt</b>
              </>,
              <>
                Use <C>@ai-sdk/openai</C>, <C>@ai-sdk/azure</C>, and{' '}
                <C>@ai-sdk/openai-compatible</C> directly through Claire&apos;s registry. Add
                dedicated providers only with capability tests.
              </>,
            ],
            [
              <>AI SDK UI stream protocol</>,
              <>
                <b>Adopt</b>
              </>,
              <>
                It carries text, status data, sources, tool/proposal parts, terminal metadata, and
                errors over SSE and works with Node/Express.
              </>,
            ],
            [
              <>
                <C>@ai-sdk/react</C>
              </>,
              <>
                Pilot behind <C>useAssistantStream</C>
              </>,
              <>
                The official Expo integration supports streaming with <C>expo/fetch</C>. Claire
                still owns server thread IDs, offline snapshots, citations, and persistence; the
                hook must remain replaceable.
              </>,
            ],
            [
              <>AI SDK RSC</>,
              <>
                <b>Do not use</b>
              </>,
              <>
                Claire is Expo/Electron, not a React Server Components product, and the RSC API is
                not needed for data-only message parts.
              </>,
            ],
            [
              <>Vercel AI Gateway</>,
              <>Optional later</>,
              <>
                The SDK does not require Gateway. Making it mandatory would conflict with BYOK,
                self-hosted, and local execution modes.
              </>,
            ],
            [
              <>SDK tool approval</>,
              <>Transport aid only</>,
              <>
                Claire&apos;s database proposal, payload hash, policy decision, approval, execution,
                and receipt remain authoritative. SDK approval parts cannot replace durable
                cross-device authorization.
              </>,
            ],
          ]}
        />
        <P>
          Model portability is real for text generation and embeddings only when Claire tests the
          required capability. Maintain a capability record per configured model: streaming,
          structured output, tool calling, maximum context, embedding dimensions, usage reporting,
          and simulated-stream fallback. Never assume that every provider implements the abstraction
          equally well.
        </P>
      </Section>

      <Section id="request-lifecycle" title="Answer request lifecycle">
        <ol>
          <li>
            The client creates a UUID <C>requestId</C> and sends one request. A missing global
            thread is created inside this request.
          </li>
          <li>
            The server authenticates the user, checks AI policy and per-user budget, validates scope
            ownership, and idempotently inserts the user turn plus an empty assistant turn with{' '}
            <C>status=streaming</C>.
          </li>
          <li>
            The server immediately opens the stream and emits a sanitized <C>retrieving</C> state
            with the real persisted thread and turn IDs.
          </li>
          <li>
            The context router chooses deterministic sources. “Catch me up” reads a recent window;
            “what is unresolved?” reads Loops; scoped factual search uses hybrid retrieval. This
            choice does not require another model.
          </li>
          <li>
            Retrieval creates a bounded evidence pack. If no candidate passes the relevance floor,
            emit a deterministic no-evidence answer and spend no generation tokens.
          </li>
          <li>
            The budget service reserves the maximum permitted request cost. The model router selects
            an eligible model profile and provider candidate.
          </li>
          <li>
            <C>streamText</C> streams the grounded answer. Citations are stable source IDs, not
            array positions that can change between steps.
          </li>
          <li>
            On completion, validate citation markers and proposal parts, persist the final answer
            and usage atomically, settle the reservation, and emit <C>finish</C>.
          </li>
          <li>
            On provider failure before the first text delta, try the next eligible provider. After
            text has been shown, do not silently replay through another model; mark the turn
            failed/partial and offer an idempotent retry.
          </li>
        </ol>
      </Section>

      <Section id="streaming-contract" title="Streaming contract">
        <P>
          Add content negotiation to the existing message endpoints.{' '}
          <C>Accept: text/event-stream</C>
          selects the v2 AI SDK UI stream; <C>Accept: application/json</C> preserves the existing
          response during rollout. Do not create separate business logic for the two transports.
        </P>
        <Code lang="ts">{`type AskClaireRequest = {
  requestId: string;             // client UUID, unique per user
  threadId?: string;             // omitted to create a global thread
  question: string;
  scope:
    | { mode: 'global' }
    | { mode: 'preferred'; chatIds: string[] } // 1..5
    | { mode: 'strict_chat'; chatId: string };
};

type ClaireStreamData = {
  status: { phase: 'retrieving' | 'answering' | 'saving' };
  thread: { threadId: string; userTurnId: string; assistantTurnId: string };
  sources: { citations: AssistantCitation[]; indexStatus: AssistantIndexStatus };
  proposal: { proposalId: string; capabilityId: string; requiresApproval: boolean };
  finish: { finishReason: string; provider: string; model: string };
  error: { code: string; retryable: boolean };
};`}</Code>
        <P>
          Emit source metadata before answer text so citations can render without waiting for the
          final token. The text itself should be normal readable Markdown with stable citation marks
          such as <C>[S1]</C>. Do not stream serialized JSON into the answer bubble. Use custom data
          parts for Claire metadata and future proposals.
        </P>
        <Section id="stream-persistence" title="Persistence and disconnects" level={3}>
          <ul>
            <li>
              Persist once before generation and once on terminal completion; never write one
              database update per token.
            </li>
            <li>
              Store <C>pending | streaming | completed | failed | cancelled</C> on assistant turns
              and make <C>(user_id, request_id)</C> unique.
            </li>
            <li>
              A duplicate request returns or resumes the existing turn instead of creating another
              model call.
            </li>
            <li>
              Wire the client disconnect to an <C>AbortSignal</C>. Product policy decides whether a
              backgrounded mobile request gets a short grace period or is cancelled.
            </li>
            <li>
              For v2 launch, reconnect loads the persisted terminal turn. Resumable mid-token
              streams are deferred until production evidence justifies the storage and protocol
              complexity.
            </li>
          </ul>
        </Section>
        <Section id="stream-client" title="Client behavior" level={3}>
          <ul>
            <li>
              Add <C>useAssistantStream</C> as the only UI-facing transport adapter. It maps SDK{' '}
              <C>UIMessage</C> parts to the existing <C>AssistantTurn</C> renderer.
            </li>
            <li>
              Use <C>expo/fetch</C> on iOS and Android; use the host fetch implementation in
              Electron. Confirm proxy buffering is disabled in staging and production.
            </li>
            <li>
              Batch text deltas into UI updates approximately every 30–50ms to avoid a React Native
              render per token.
            </li>
            <li>
              Show Stop while generating, keep the composer editable after cancellation, and
              auto-scroll only while the user remains near the bottom.
            </li>
            <li>
              Do not announce every token to screen readers. Announce phases, then the completed
              answer.
            </li>
          </ul>
        </Section>
      </Section>

      <Section id="provider-and-model-routing" title="Provider and model routing">
        <P>
          Generalize the existing loop-only provider registry into Claire&apos;s shared AI service.
          Ask Claire must request a profile, not a vendor model string. Provider credentials and
          model IDs remain configuration.
        </P>
        <Table
          head={[<>Profile</>, <>Use</>, <>Budget behavior</>]}
          rows={[
            [
              <>
                <C>assistant_grounded</C>
              </>,
              <>Default cited synthesis and scoped chat questions</>,
              <>
                Cheapest model that clears the grounding and citation eval gates; one generation
                step.
              </>,
            ],
            [
              <>
                <C>assistant_reasoning</C>
              </>,
              <>Ambiguous multi-chat relationship analysis or complex reconciliation</>,
              <>
                Opt in through deterministic complexity signals or explicit user quality setting;
                never a retry merely because the answer was short.
              </>,
            ],
            [
              <>
                <C>assistant_agent</C>
              </>,
              <>Future read tools and plugin proposals</>,
              <>Strong tool-capable model, maximum three steps for global Ask Claire.</>,
            ],
            [
              <>
                <C>embedding_messages</C>
              </>,
              <>Message and query vectors</>,
              <>Fixed 1536-dimensional contract until a versioned re-index migration exists.</>,
            ],
          ]}
        />
        <P>
          A provider fallback is eligible only when it matches the profile&apos;s capabilities and
          data policy. Failover may happen before the first visible delta. Mid-stream failure is
          surfaced honestly because concatenating two providers&apos; answers can duplicate text,
          change claims, and invalidate citations.
        </P>
      </Section>

      <Section id="retrieval-v2" title="Retrieval v2">
        <Section id="context-router" title="Deterministic context router" level={3}>
          <Table
            head={[<>Question shape</>, <>Primary context</>, <>Model calls before answer</>]}
            rows={[
              [
                <>Catch up / summarize this chat</>,
                <>Most recent bounded chronological chat window</>,
                <>0</>,
              ],
              [
                <>Open commitments, questions, or plans</>,
                <>Live Loops plus their cited evidence</>,
                <>0</>,
              ],
              [
                <>Find a remembered fact or phrase</>,
                <>Hybrid lexical + semantic retrieval</>,
                <>0</>,
              ],
              [
                <>Tone or relationship pattern</>,
                <>Recent windows plus selected older semantic evidence</>,
                <>0</>,
              ],
              [
                <>Explicit person/platform/date filters</>,
                <>Apply structured metadata filters before ranking</>,
                <>0</>,
              ],
              [
                <>Discussed person identified by attributes</>,
                <>Time-bounded descriptor retrieval plus conversation-window expansion</>,
                <>0 normally; ≤1 planner call when ambiguous</>,
              ],
              [
                <>Plan recall for a relative date</>,
                <>Resolved local date range plus plan candidates and supporting message windows</>,
                <>0</>,
              ],
              [
                <>People ranked by relationship and location</>,
                <>Temporal person facts plus precomputed relationship metrics</>,
                <>0</>,
              ],
            ]}
          />
          <P>
            Routing should be conservative deterministic code. A cheap classifier adds latency and
            cost to every question; introduce one only if evals show that deterministic routing
            cannot reach the required recall.
          </P>
        </Section>
        <Section id="hybrid-ranking" title="Hybrid ranking and evidence assembly" level={3}>
          <ol>
            <li>
              Normalize the query and resolve explicit chat, platform, participant, and date filters
              from trusted UI IDs where possible.
            </li>
            <li>
              For relative time language, compile a concrete half-open timestamp range from the
              account timezone and request time. Apply it before text or vector ranking.
            </li>
            <li>
              Run full-text and vector retrieval concurrently. Add a GIN index over the full-text
              expression or a maintained <C>tsvector</C>; the current SQL recomputes{' '}
              <C>to_tsvector</C> without a matching index.
            </li>
            <li>
              Fuse result positions using reciprocal-rank fusion. Do not compare PostgreSQL text
              rank directly with cosine similarity.
            </li>
            <li>
              Apply calibrated relevance floors by route. Vector search must not always return “the
              best 12” when all 12 are poor.
            </li>
            <li>
              Diversify by chat and time, except in strict-chat mode. Avoid filling the prompt with
              near-duplicate adjacent messages.
            </li>
            <li>
              Expand each winning hit into a small chronological window around the message,
              preserving reply/thread metadata and sender identity.
            </li>
            <li>
              Fit at most four evidence windows into the context budget. The UI may show multiple
              messages inside one source window while citing stable message IDs.
            </li>
            <li>
              For identity and plan recall, cluster windows by person, chat, or plan candidate and
              preserve credible alternatives. Do not allow one high-scoring message to erase a
              second plausible answer.
            </li>
          </ol>
        </Section>
        <Section id="grounding-contract" title="Grounding contract" level={3}>
          <ul>
            <li>The model can cite only source IDs present in the evidence pack.</li>
            <li>
              Remove the current fallback that displays arbitrary retrieved sources when the model
              selects none.
            </li>
            <li>
              Claims about messages require citations; advice clearly labeled as advice does not.
            </li>
            <li>
              If evidence is insufficient, answer that plainly and suggest a narrower person, chat,
              or date. Do not manufacture a citation.
            </li>
            <li>
              All message content is untrusted data. It cannot alter system rules, scopes, tools,
              approvals, or destinations.
            </li>
          </ul>
        </Section>
      </Section>

      <Section id="cost-controls" title="Cost controls">
        <P>
          Measure cost from provider-reported usage and the versioned price book in integer
          micro-USD. Do not hard-code a permanent dollar estimate in this document. For request
          <C>r</C>:
        </P>
        <Code lang="text">{`estimated_max_cost(r) =
  query_embedding_tokens × embedding_rate
  + uncached_input_tokens × input_rate
  + cache_read_tokens × cache_read_rate
  + max_output_tokens × output_rate
  + permitted_additional_steps × step_reserve

settled_cost(r) = provider-reported usage × price_book(version)`}</Code>
        <Table
          head={[<>Lever</>, <>Specification</>, <>Why it matters</>]}
          rows={[
            [
              <>No-call paths</>,
              <>
                No generation for no-evidence search, index-disabled status, thread/navigation
                commands, or structured data Claire can render directly.
              </>,
              <>The cheapest request is the one not sent.</>,
            ],
            [
              <>One-step default</>,
              <>
                Normal Ask Claire performs one query embedding and one streamed generation. No
                planner model and no tool loop.
              </>,
              <>Every agent step repeats context and can multiply input cost.</>,
            ],
            [
              <>Compound-query escalation</>,
              <>
                Run the low-cost structured planner only when the deterministic compiler cannot
                represent a multi-constraint or action-oriented request. Permit one planner call,
                record why it was needed, and cap its input/output independently.
              </>,
              <>
                Identity lookup and date parsing stay cheap while complex birthday-style queries
                remain expressible.
              </>,
            ],
            [
              <>Metadata-first analytics</>,
              <>
                Compute communication frequency, active days, reciprocity, and recency with SQL or
                background jobs. Use incremental, changed-window extraction for person facts and
                plan candidates.
              </>,
              <>Avoids repeatedly sending a person&apos;s full message history to a model.</>,
            ],
            [
              <>Context budget</>,
              <>
                Default ≤4,000 input tokens; p95 ≤8,000; four evidence windows; six recent turns
                plus an optional bounded rolling summary.
              </>,
              <>Input growth is the dominant controllable interactive cost.</>,
            ],
            [
              <>Output budget</>,
              <>
                Default target ≤300 tokens and hard maximum 700. UI quick actions request shorter
                caps.
              </>,
              <>Output tokens are normally more expensive and cannot use prefix caching.</>,
            ],
            [
              <>Model routing</>,
              <>
                Use the least expensive profile that clears eval gates; reserve strong tool models
                for complex or action-oriented requests.
              </>,
              <>
                Provider portability should reduce spend without silently reducing grounding
                quality.
              </>,
            ],
            [
              <>Embedding batches</>,
              <>
                Use AI SDK <C>embedMany</C> for 32–100 messages per logical batch with bounded
                parallelism and bulk upsert.
              </>,
              <>
                Reduces HTTP and database overhead; provider batch pricing may further reduce
                offline backfill cost.
              </>,
            ],
            [
              <>Prompt caching</>,
              <>
                Place the stable Claire system prefix first and volatile user evidence last. Enable
                provider-specific cache controls only after measuring a real cache hit.
              </>,
              <>Do not pad prompts merely to cross a provider cache minimum.</>,
            ],
            [
              <>Query embedding cache</>,
              <>
                Optional short-TTL Redis cache keyed by an HMAC of normalized query + embedding
                model/version; never store raw query text in the cache key.
              </>,
              <>
                Helps repeated quick actions; embedding spend itself is small, so complexity must
                earn its latency benefit.
              </>,
            ],
            [
              <>Answer cache</>,
              <>
                Deferred. A safe key requires user, scope, thread summary, instruction version,
                evidence content hashes, prompt version, and model profile.
              </>,
              <>A broad semantic answer cache risks stale or cross-context answers.</>,
            ],
            [
              <>Budget reservation</>,
              <>
                Reserve worst-case managed cost before calling a provider; settle actual usage;
                release on failure. Enforce per-request, daily warning, monthly allowance, and
                opt-in overage caps.
              </>,
              <>
                A rate limit alone does not prevent an expensive valid request or shared-IP
                unfairness.
              </>,
            ],
          ]}
        />
      </Section>

      <Section id="indexing" title="Message indexing specification">
        <ul>
          <li>
            Replace process-local fire-and-forget backfill with a durable per-user job and bounded
            provider concurrency. Message ingestion must never wait for embedding.
          </li>
          <li>
            Use <C>embedMany</C>; split by provider maximum and token budget, then bulk upsert
            vectors in the same order.
          </li>
          <li>
            Select rows whose embedding is missing <em>or</em> whose stored <C>content_hash</C>{' '}
            differs. Content edits must become searchable.
          </li>
          <li>
            Delete or exclude vectors when messages are soft-deleted, and keep index counts scoped
            to eligible live text rows.
          </li>
          <li>
            Maintain index progress incrementally. Do not run exact counts over messages and
            embeddings during every answer request.
          </li>
          <li>
            Store <C>embedding_model</C>, <C>dimensions</C>, and <C>embedding_version</C>. A
            model/dimension change creates a parallel versioned index and controlled cutover, not
            mixed vectors.
          </li>
          <li>
            Retry transient provider failures with jitter and a ceiling; expose permanent failures
            without blocking lexical search.
          </li>
        </ul>
      </Section>

      <Section id="data-and-api" title="Data model and API changes">
        <Table
          head={[<>Change</>, <>Purpose</>]}
          rows={[
            [
              <>
                <C>conversation_assistant_turns.status</C>
              </>,
              <>Represent streaming, completed, failed, and cancelled turns.</>,
            ],
            [
              <>
                <C>conversation_assistant_turns.request_id</C>
              </>,
              <>Unique per user for retry/idempotency.</>,
            ],
            [
              <>
                <C>conversation_assistant_turns.prompt_version</C>
              </>,
              <>Make evals, cache invalidation, and regressions traceable.</>,
            ],
            [
              <>
                <C>conversation_assistant_turns.provider/model/finish_reason</C>
              </>,
              <>
                Privacy-safe operational provenance. Token/cost authority remains the usage ledger.
              </>,
            ],
            [
              <>
                <C>assistant_thread_summaries</C> or bounded summary columns
              </>,
              <>
                Optional older-thread continuity without replaying every turn. Generate
                asynchronously only after a threshold.
              </>,
            ],
            [
              <>
                <C>conversation_message_embeddings</C> version fields
              </>,
              <>Prevent incompatible models or dimensions from sharing one index.</>,
            ],
            [
              <>
                <C>assistant_people</C> and <C>assistant_person_links</C>
              </>,
              <>
                Resolve aliases and cross-platform identities while supporting people mentioned in a
                conversation who are not themselves Claire contacts.
              </>,
            ],
            [
              <>
                <C>assistant_person_facts</C>
              </>,
              <>
                Provenance-backed, time-aware person facts for identity, location, aliases, and
                other durable memory.
              </>,
            ],
            [
              <>
                <C>assistant_relationship_metrics</C>
              </>,
              <>
                Deterministic rolling communication aggregates used for explainable people ranking.
              </>,
            ],
            [
              <>
                <C>assistant_plan_candidates</C>
              </>,
              <>
                Tentative, confirmed, changed, and cancelled plans linked to their source messages.
              </>,
            ],
            [
              <>
                <C>conversation_assistant_turns.query_plan</C>
              </>,
              <>
                The resolved intent, filters, timezone, and absolute date range used for a
                reproducible answer; exclude raw message content.
              </>,
            ],
          ]}
        />
        <P>
          Persist the user turn and assistant placeholder in one database function. Finalize the
          assistant turn, update the thread title/timestamp, and settle the usage record atomically
          where practical. Return the updated thread in the terminal stream data so the client does
          not reload the entire thread list after every answer. Thread history uses keyset
          pagination; generation reads only the bounded recent slice.
        </P>
      </Section>

      <Section id="actions" title="Path to plugins and real actions">
        <P>
          Keep <C>open_conversation</C> as trusted Claire navigation. Rename the current calendar
          affordance to “Open calendar” so it does not imply that anything was created. When plugins
          land, Ask Claire receives two classes of tools:
        </P>
        <Table
          head={[<>Tool class</>, <>Examples</>, <>Execution rule</>]}
          rows={[
            [
              <>Read</>,
              <>Free/busy, installed capabilities, selected file search</>,
              <>
                Execute only within installation and context grants; bounded result returned to the
                model.
              </>,
            ],
            [
              <>Propose</>,
              <>Create event, invite guests, create task, update CRM</>,
              <>
                The tool may only call <C>PluginPolicyEngine.authorize()</C> and create a durable
                proposal. It cannot call the provider adapter.
              </>,
            ],
          ]}
        />
        <Diagram
          caption="External writes remain user-controlled"
          summary="Ask Claire may prepare a proposal, but the plugin policy service and the user approval step stand between the model and external execution."
        >{`sequenceDiagram
  participant U as User
  participant C as Ask Claire
  participant P as Plugin policy
  participant X as External service
  C->>P: Create proposal with payload hash
  P-->>U: Show recipients, destination, and drafts
  U->>P: Approve exact proposal
  P->>P: Recheck grant, hash, and idempotency
  P->>X: Execute authorized action
  X-->>P: Receipt
  P-->>U: Show result`}</Diagram>
        <P>
          The streamed proposal part contains only a Claire <C>proposalId</C> and display metadata.
          Approval reloads the proposal from the server, verifies the payload hash and destination,
          then queues idempotent execution and writes a receipt. External writes and invitations
          always follow the plugin specification even if the AI SDK marks a tool call approved.
        </P>
        <P>
          Default Ask Claire remains one-step RAG. Enable tool calling only when an installed,
          granted capability is relevant or the question requires a structured Claire read tool. Cap
          global Ask Claire at three model steps, 20 seconds total, five seconds per read tool, 4KB
          per tool result, and one proposal per user intent. A model denial response must not cause
          it to retry the same proposal.
        </P>
      </Section>

      <Section id="privacy-security" title="Privacy and security requirements">
        <ul>
          <li>
            Every service-key database query includes <C>user_id</C>; every chat and thread scope is
            ownership-checked server-side.
          </li>
          <li>
            Telemetry sets <C>recordInputs: false</C> and <C>recordOutputs: false</C>. Metadata may
            include request ID, route, provider, model, token counts, timings, source count, cache
            status, and error class—never message text, question text, embeddings, tool inputs, or
            provider credentials.
          </li>
          <li>
            Only citations selected for the answer leave the server in source parts. Retrieval
            candidates that were not used are not exposed to plugins.
          </li>
          <li>
            Remote provider and plugin data handling follows the user&apos;s configured consent and
            the plugin manifest. BYOK is not described as local.
          </li>
          <li>
            Sensitive inferred person attributes are ephemeral by default. Persisting them requires
            the applicable memory policy, purpose limitation, retention, correction, deletion, and
            source provenance; they are never exposed to a plugin merely because they appeared in
            retrieval.
          </li>
          <li>
            Prompt injection fixtures must prove that message text cannot expand scope, select a
            hidden destination, grant a capability, lower approval, or cause direct execution.
          </li>
          <li>
            Error events expose stable safe codes; raw provider errors remain in redacted server
            logs.
          </li>
        </ul>
      </Section>

      <Section id="observability" title="Observability and cost accounting">
        <P>Record one trace and one usage event per answer with privacy-safe spans:</P>
        <Code lang="text">{`assistant.request
  ├─ thread.load
  ├─ context.route
  ├─ retrieval.lexical
  ├─ retrieval.embedding
  ├─ retrieval.vector
  ├─ evidence.assemble
  ├─ model.first_attempt | model.fallback
  │    ├─ time_to_first_token
  │    └─ stream_duration
  └─ turn.finalize`}</Code>
        <P>
          Dashboards break down p50/p95 time to first token, completion latency, input/output/cache
          tokens, estimated and settled micro-USD, no-call rate, fallback rate, cancellation rate,
          stream failure rate, retrieval route, source count, and model profile. Alerts use error
          and budget rates, not conversation content.
        </P>
      </Section>

      <Section id="evaluation" title="Evaluation and test plan">
        <Table
          head={[<>Suite</>, <>Coverage</>]}
          rows={[
            [
              <>Retrieval corpus</>,
              <>
                Factual lookup, paraphrase, temporal query, multiple people with the same name,
                cross-platform duplicates, strict scope, preferred scope, tone, open loop,
                no-answer, deleted/edited messages.
              </>,
            ],
            [
              <>Golden personal-memory queries</>,
              <>
                Attribute-based person identification in a recent time window; Saturday plan recall
                with proposals, confirmations, reschedules, and cancellations; Mexico City and
                Brooklyn location filtering; explainable relationship ranking; multiple plausible
                candidates; stale and conflicting facts.
              </>,
            ],
            [
              <>Grounded answer eval</>,
              <>
                Citation precision/recall, unsupported-claim rate, no-answer correctness,
                instruction adherence, useful concision, and source-card navigation.
              </>,
            ],
            [
              <>Provider contract tests</>,
              <>
                Streaming, abort, structured output, tools, usage fields, context limit, embedding
                dimensions, and simulated streaming fallback for every enabled profile.
              </>,
            ],
            [
              <>Transport tests</>,
              <>
                Chunk fragmentation, UTF-8 boundaries, custom data parts, sanitized errors after
                headers, cancellation, duplicate request ID, reconnect, proxy buffering, and
                terminal event.
              </>,
            ],
            [
              <>Client tests</>,
              <>
                Optimistic/persisted ID replacement, batched deltas, Stop, background/foreground,
                offline retry, citations during stream, screen-reader behavior, mobile and Electron
                parity.
              </>,
            ],
            [
              <>Action safety</>,
              <>
                Injection, mutated approval payload, missing grant, revoked account, duplicate
                execution, timeout, retry, denial, and receipt provenance.
              </>,
            ],
            [
              <>People and plan memory</>,
              <>
                User override precedence, fact provenance, validity intervals, last-confirmed copy,
                metric reproducibility, group-noise exclusion, tentative-versus-confirmed plans,
                timezone boundaries, and superseded plan state.
              </>,
            ],
          ]}
        />
        <P>
          Reuse the Lucas two-device context-token scenario for real bridge grounding. Add a
          deterministic AI SDK mock stream so UI and server tests require no provider key and do not
          depend on token timing.
        </P>
      </Section>

      <Section id="acceptance-gates" title="Release acceptance gates">
        <BarChart
          title="Interactive latency budget"
          caption="Warm-staging launch targets; lower is better"
          max={10}
          items={[
            {
              label: 'Visible retrieval state',
              value: 0.25,
              displayValue: '≤250ms',
              tone: 'accent',
              detail: 'The stream is open and the UI acknowledges work immediately.',
            },
            {
              label: 'p50 first answer text',
              value: 1.5,
              displayValue: '≤1.5s',
              tone: 'good',
            },
            {
              label: 'p95 first answer text',
              value: 3,
              displayValue: '≤3s',
              tone: 'warning',
            },
            {
              label: 'p95 answer completion',
              value: 10,
              displayValue: '≤10s',
              tone: 'info',
            },
          ]}
        />
        <Table
          head={[<>Dimension</>, <>Gate</>]}
          rows={[
            [
              <>Correctness</>,
              <>
                Global and strict-chat integration tests pass; strict scope has zero cross-chat
                sources; no source is shown unless selected by the answer.
              </>,
            ],
            [
              <>Personal-memory quality</>,
              <>
                Golden queries resolve absolute date ranges correctly, retrieve the supporting
                conversation window, preserve plausible alternatives, and attach provenance to every
                identity, location, relationship, and plan claim.
              </>,
            ],
            [
              <>Action honesty</>,
              <>
                Person shortlists and outreach drafts may be produced, but zero recipient is
                contacted until the user approves the exact durable plugin proposal.
              </>,
            ],
            [
              <>Latency</>,
              <>
                On warm staging: p50 time to first text ≤1.5s, p95 ≤3s; p95 answer-only completion
                ≤10s. Emit a visible retrieval state within 250ms of opening the response stream.
              </>,
            ],
            [
              <>Request count</>,
              <>
                One client request per question; normal answer uses at most one query embedding and
                one generation step.
              </>,
            ],
            [
              <>Context</>,
              <>
                Median generation input ≤4,000 tokens and p95 ≤8,000; hard output maximum 700
                tokens.
              </>,
            ],
            [
              <>Cost</>,
              <>
                Measured cost per successful answer and per monthly active user is recorded. A
                candidate model must clear quality gates and reduce or hold settled cost; a &gt;15%
                cost regression blocks rollout unless explicitly approved.
              </>,
            ],
            [
              <>Indexing</>,
              <>
                Backfill averages at least 32 texts per embedding provider request, resumes after
                restart, indexes edits, and never blocks message ingestion.
              </>,
            ],
            [
              <>Reliability</>,
              <>
                ≥99% of opened streams produce a completed, failed, or cancelled terminal turn;
                retries with the same request ID produce no duplicate model call or turn.
              </>,
            ],
            [
              <>Safety</>,
              <>
                Zero tested path performs an external write from Ask Claire without a durable
                authorized plugin proposal; telemetry contains no prompt, output, embedding, or tool
                payload.
              </>,
            ],
          ]}
        />
        <P>
          Numeric latency and quality gates are launch targets, not claims about the current system.
          Capture the current baseline before PR 1 and revise targets only from measured staging and
          device evidence.
        </P>
      </Section>

      <Section id="delivery" title="Delivery plan">
        <Timeline
          label="Ask Claire v2 pull request sequence"
          items={[
            {
              phase: 'PR 0 · Now',
              title: 'Correctness and baseline',
              description:
                'Fix conversation-thread access, add global/chat integration tests, and record current latency, tokens, request counts, and cost.',
              status: 'now',
            },
            {
              phase: 'PR 1',
              title: 'Shared AI runtime',
              description:
                'Move generation and embeddings behind services/ai with task profiles, provider contracts, timeouts, and usage normalization.',
              status: 'next',
            },
            {
              phase: 'PR 2',
              title: 'Hot path and index',
              description:
                'Add recent-turn queries, incremental index state, indexed full-text search, embedMany, atomic finalization, and idempotency.',
              status: 'next',
            },
            {
              phase: 'PR 3',
              title: 'Server streaming',
              description:
                'Ship AI SDK UI streams over Express with typed parts, cancellation, finalization, and a legacy JSON fallback.',
              status: 'next',
            },
            {
              phase: 'PR 4',
              title: 'Client streaming',
              description:
                'Add the shared Expo and Electron stream adapter, incremental rendering, Stop, recovery, and accessibility.',
              status: 'later',
            },
            {
              phase: 'PR 5',
              title: 'Personal-memory retrieval v2',
              description:
                'Add structured query compilation, relative dates, message windows, person facts, relationship metrics, plan candidates, and golden-query evals.',
              status: 'later',
            },
            {
              phase: 'PR 6 · After plugins',
              title: 'Durable action proposals',
              description:
                'Expose installed read and propose tools through the plugin policy engine without granting the model direct write access.',
              status: 'later',
            },
          ]}
        />
        <P>
          Roll out by account: internal fixtures → Lucas two-device account → 5% → 25% → 100%. Keep
          the JSON path and previous provider profile available for one release. Automatically roll
          back on grounding, cost, stream-error, or latency gate regression.
        </P>
      </Section>

      <Section id="implementation-map" title="Primary implementation map">
        <ul>
          <li>
            <C>apps/server/src/services/conversation-assistant.ts</C> — split orchestration,
            retrieval, persistence, and transport responsibilities.
          </li>
          <li>
            <C>apps/server/src/services/ai/</C> — shared model profiles, provider capabilities,
            streamed generation, embeddings, usage, and test mocks.
          </li>
          <li>
            <C>apps/server/src/routes/ai.ts</C> — content negotiation, stream lifecycle, abort, and
            legacy JSON fallback.
          </li>
          <li>
            <C>supabase/migrations/</C> — turn lifecycle/idempotency, embedding versioning,
            full-text index, and atomic database functions.
          </li>
          <li>
            <C>apps/client/services/conversationAssistant.ts</C> — typed stream transport and legacy
            fallback.
          </li>
          <li>
            <C>apps/client/hooks/useAssistantStream.ts</C> — shared mobile, in-chat, and Electron
            state adapter.
          </li>
          <li>
            <C>apps/client/components/claire/</C> — shared answer, source, proposal, status, stop,
            and error parts.
          </li>
        </ul>
      </Section>

      <Section id="references" title="External implementation references">
        <ul>
          <li>
            <a
              href="https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text"
              rel="noreferrer"
              target="_blank"
            >
              AI SDK <C>streamText</C> reference
            </a>
          </li>
          <li>
            <a
              href="https://ai-sdk.dev/cookbook/api-servers/express"
              rel="noreferrer"
              target="_blank"
            >
              AI SDK Express streaming
            </a>
          </li>
          <li>
            <a href="https://ai-sdk.dev/docs/getting-started/expo" rel="noreferrer" target="_blank">
              AI SDK Expo streaming with <C>expo/fetch</C>
            </a>
          </li>
          <li>
            <a
              href="https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol"
              rel="noreferrer"
              target="_blank"
            >
              AI SDK UI stream protocol
            </a>
          </li>
          <li>
            <a
              href="https://ai-sdk.dev/docs/ai-sdk-core/provider-management"
              rel="noreferrer"
              target="_blank"
            >
              Provider and model management
            </a>
          </li>
          <li>
            <a
              href="https://ai-sdk.dev/docs/reference/ai-sdk-core/embed-many"
              rel="noreferrer"
              target="_blank"
            >
              AI SDK <C>embedMany</C> reference
            </a>
          </li>
          <li>
            <a
              href="https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling"
              rel="noreferrer"
              target="_blank"
            >
              Tool calling and approval parts
            </a>
          </li>
          <li>
            <a
              href="https://ai-sdk.dev/docs/ai-sdk-core/telemetry"
              rel="noreferrer"
              target="_blank"
            >
              Telemetry input/output recording controls
            </a>
          </li>
          <li>
            <a href="https://ai-sdk.dev/docs/ai-sdk-core/testing" rel="noreferrer" target="_blank">
              Deterministic model testing
            </a>
          </li>
        </ul>
      </Section>
    </Doc>
  );
}
