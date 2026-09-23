**Jev assessment for Claire — 21 September 2026**

Recommendation: evaluate Jev as a server-side decision service for bounded classifications and for deciding when to spend a generative-model call. Start with group labels as a small integration pilot, then measure reply pre-generation and loop triage, where recurring savings could be larger. Keep extraction, writing, search indexing, and action authorization in their existing roles.

This assessment uses the working tree at commit `d21af4e6`, TypeSafe's current documentation, and a local synthetic check of Claire's existing loop gate. It is not a Jev benchmark or a measurement of production spending. No private conversation data was sent to TypeSafe, no paid inference was performed, and no application behavior was changed. Defaults below are code defaults; deployed settings and provider usage need separate measurement.

**What Jev supplies**

Jev takes text or structured state and answers bounded questions: Choice selects an enumerated label, Noul estimates the probability of a yes/no condition, and Score evaluates an ordered descriptive rubric. It does not write replies or arbitrary summaries. This matches decisions such as whether a message contains a request, but not extracting a new natural-language commitment title. [System One](https://docs.typesafe.ai/concepts/system-one)

The listed stable version is `jev-1.13.0`, priced at $0.042 per million input tokens with free output. The published limits are 1,200 requests/minute and 250,000 tokens/second, subject to change. Requests have a 64k combined budget and a 32k budget for state plus the longest question. English is its strongest language. Pin the version for evaluation and rollout. [Models](https://docs.typesafe.ai/models)

Several independent questions can share state in one request. This can amortize repeated context; question and rubric tokens still add cost. Questions cannot consume other answers from that same request. Compute dependent decisions afterward in code or use another stage. [Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out)

Choice and Score confidence describe concentration of the returned distribution; Noul has no separate confidence field. Neither a confidence of 0.9 nor a confident label establishes 90% correctness on Claire traffic. Fit thresholds per task and language; do not reuse the current group-label threshold or loop auto-close threshold as though the numbers were equivalent. [Confidence](https://docs.typesafe.ai/confidence)

**The architecture Jev would enter**

The relevant flow is unified platform ingestion into the Bun server, persisted messages in Supabase, background processing through direct async work and Redis/Bull, and results consumed by both the Expo and Electron clients. Jev belongs after persistence and policy checks. It should never delay message delivery, unread counts, or normal push delivery.

| Area | What the current code does | Jev opportunity | Priority |
| --- | --- | --- | --- |
| Incoming reply suggestions | Starts generation for eligible incoming text; requests three suggestions, uses conversation/voice context and a message-specific cache | Decide whether to pre-generate; coalesce bursts; keep explicit user requests available | Highest potential recurring savings |
| Loop detection | Free regex gate, then one extraction/reconciliation call, followed by code that validates and applies operations | Suppress clearly empty extraction windows; recover semantic signals missed by regex | High, but recall-sensitive |
| Group classification | Name/shape heuristics, then a triage model; normally once per group | Replace only the model fallback with a Choice over existing categories | Best small pilot; limited recurring savings |
| Ask Claire | Deterministic query planner, lexical/vector search, rank fusion, six expanded evidence anchors, generated answer | Rerank candidates; optionally improve ambiguous intent routing | Quality opportunity first |
| Sentiment | Dedicated generation call returning one of four labels | Direct Choice replacement | Easy but volume unknown |
| Smart cards and owner voice | Generate card content or writing guidance | Later: decide whether refresh is useful, or score bounded writing attributes | Secondary |
| Contact/memory handling | Regex contact inference and stored facts; these are not uniformly paid-model tasks | Candidate matching or verification after extraction | Quality work, not an assumed saving |
| Auto-reply rules, delivery, identity, reminders | Rules and code enforce operational behavior | Keep these checks in code | No initial Jev migration |

Relevant source: [ingestion](/Users/luc/Projects/claire/apps/server/src/index.ts:919), [reply generation](/Users/luc/Projects/claire/apps/server/src/services/ai-processor.ts:165), [loop detector](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-detector.ts:152), [group classifier](/Users/luc/Projects/claire/apps/server/src/services/group-classifier.ts:165), [retrieval](/Users/luc/Projects/claire/apps/server/src/services/conversation-assistant.ts:510).

The repository's AI cost document describes both earlier behavior and proposed stages. The actual loop detector currently has no separate paid triage call: `evaluateGate()` is free and surviving windows go directly to extraction. Merely changing the registry's `triage` model therefore does not optimize that path. Likewise, contact classification and message-type detection include free heuristics that should not automatically become network calls.

There are also multiple provider paths: loops/Ask Claire use the role registry, reply generation has its own provider clients, and smart cards and voice profiles use direct OpenAI clients. A Jev pilot should have one shared decision adapter, but it does not require a wholesale provider refactor.

**Reply generation: the largest plausible recurring opportunity**

The live ingestion code invokes `generateAndStore()` for incoming text when account/chat AI scope permits. That call constructs substantial context and asks for three ready-to-send suggestions. Classifying a final acknowledgment or an obsolete message in a burst is useful if it avoids generating replies nobody will use.

Proposed behavior:

1. Coalesce a short incoming burst per conversation, with a bounded maximum wait; experiment with the delay rather than copying the loop queue's 45-second delay.
2. Read the latest conversation revision and a compact recent exchange. Include speaker roles, reply targets, and whether the owner has already replied.
3. Ask whether an answer is requested and whether the exchange is a terminal acknowledgment. Add a bounded reply-opportunity rubric only if it improves routing beyond these simpler questions.
4. Pre-generate for useful or uncertain cases. For clear low-value cases, record that suggestions were deliberately deferred; leave manual generation available under the normal AI policy.
5. Cancel or discard work superseded by a newer message or owner reply. Recheck account/chat policy in the worker before any external call.

The client matters: [ResponseSuggestion](/Users/luc/Projects/claire/apps/client/components/ResponseSuggestion.tsx:95) automatically calls `generate(true)` after loading no stored suggestions. A server-only suppression would be undone when that component mounts. Add an explicit state such as `pending`, `ready`, `deferred`, `failed`, or `superseded`, and distinguish opening the component from explicitly asking to generate. An explicit request should bypass the optimization, not the account policy. Share in-flight work across ingest and interactive requests to avoid double generation.

A separate cost fix is visible without Jev: the suggestion branch does not exclude `isBackfill`, although loop scheduling does. Old incoming messages can therefore enter suggestion generation when proactive AI is enabled. Address historical pre-generation deliberately before attributing savings to a new model.

Evaluate against a simpler baseline too: generate only on demand, or only for the latest unanswered message. Jev earns its place only if selective pre-generation gives materially better reply readiness at acceptable cost.

**Loop detection: save extraction while protecting recall**

The current worker uses a 45-second trailing debounce with a three-minute maximum delay. Windows are capped at 40 messages/6,000 characters with six messages of overlap, plus bounded open-loop state. Jev's inference speed will not remove that scheduling delay. [Queue](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-queue.ts:22), [context](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-context.ts:28)

A local check of the actual gate, using one synthetic human message, no open loops, normal sensitivity and no backoff, returned:

| Synthetic input | Current gate |
| --- | --- |
| I will send the document tomorrow | Run: commitment/time signals |
| Te mando el documento mañana | Skip: no signal |
| ¿Me puedes enviar la factura? | Skip: no signal |
| Please enjoy this funny cat video | Run: directive signal |

This is evidence about Claire's gate, not Jev's accuracy. It makes multilingual recall and false positive filtering concrete evaluation targets.

Separate policy stops from linguistic guesses. AI disabled, sensitivity off, and invalid scope remain unconditional stops. English regex misses, short text, and backoff are fallible content heuristics. A Jev stage placed only after successful regex matches cannot recover the Spanish misses above.

Use two experiments:

- Cost experiment: Jev examines windows already headed to extraction. Skip only high-confidence, evaluated negatives. Initially bypass suppression when open loops exist, a watch term matches, or the owner makes a recognized commitment. Otherwise a cheap gate could prevent updates or completion detection.
- Recall experiment: sample allowed windows that the content heuristics skipped. Test whether Jev recovers commitments and questions, including short and mixed-language exchanges. Measure the added extraction cost separately from savings.

Ask atomic questions such as whether a new unresolved request exists, whether someone makes a new commitment, or whether evidence changes a particular known loop. Do not ask Jev to generate the entire operations list. Current operations contain free-text titles, distinct state summaries, change reasons, evidence, ownership, and deadlines; preserve the existing extractor and reconciliation contract.

Unknown, malformed, timed-out, or unavailable Jev results must not mean “nothing here.” Fall back to the existing extraction path for windows it would have processed. For semantic recovery candidates, preserve a bounded retry/audit path rather than recording an error as a successful negative. Cursor advancement must distinguish a valid skip from failed processing.

Keep relevance scoring, identity checks, evidence validation, deduplication, and close authorization in code. The current relevance formula does use extracted semantic fields alongside structural signals; its final policy should remain stable. Do not replace it with a Jev importance score. Preserve existing guarded close behavior and avoid wiring Jev confidence into its 0.75 threshold. [Relevance](/Users/luc/Projects/claire/apps/server/src/services/loops/relevance.ts:203), [close policy](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-reconciler.ts:167)

**Group classification: a contained pilot**

Keep the existing minimum-history guard, free heuristics, one-shot persistence, and explicit user corrections. Replace only the fallback with a Choice over `work`, `planning`, `family`, `friends`, `community`, `announcement`, and `unknown`. Render a modest category-based phrase from code: Jev cannot produce the current free-text reason.

Store probability distribution, model version, rubric version and method separately from a display decision. The existing 0.6 display threshold needs evaluation against the new confidence semantics. A failure can retain the current LLM fallback or the generic unlabeled banner.

Group categorization is an existing, disclosed account-level exception that can read a sample before group proactive AI is enabled. Preserve that narrow purpose; it does not authorize draft generation, loop analysis, or broad message classification in otherwise disabled groups. [AI policy](/Users/luc/Projects/claire/apps/server/src/services/ai-policy.ts)

**Ask Claire and other features**

Ask Claire retrieves up to 24 lexical and 24 semantic candidates, fuses them, and expands six anchors. Trial Jev after fusion over a small candidate set, then keep the best diverse anchors and expand their evidence. Score candidates independently with sufficient local context; retain related messages and contradictions instead of selecting only passages that agree. On failure, use the current ranking. Compare end-to-end answer quality, prompt size, and time to first token: reranking adds a request before generation. TypeSafe publishes a reranking example, but its benchmark is legal retrieval, not Claire conversations. [Reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe)

Jev could improve `lookup/plans/people/general` routing for ambiguous questions. The current planner is free, so this is a quality trade, not an immediate cost reduction. Keep date calculations and database filters in code. Keep the embedding index complete within its existing policy: a message with no action item can still be valuable search evidence. Jev is not an embedding provider.

Sentiment is a straightforward bounded-label migration if the endpoint has material traffic. Arbitrary topic extraction, summaries, smart-card copy, owner-voice prose, and reply writing remain generative tasks. Do not infer identity or sensitive attributes through a new classification scheme. Keep the loop agent's read/propose tools and user-controlled execution boundary intact; semantic routing may eventually select a simpler handler, but should not expand its permissions.

**Integration shape**

Add a dedicated `DecisionProvider` abstraction alongside the existing language-model roles, with a TypeSafe implementation and explicit per-task fallback behavior. Jev's `/v1/systemone` is a distinct API contract; changing an OpenAI-compatible base URL will not integrate it. The JavaScript SDK is `@typesafe-ai/sdk`; its documented runtime is Node 20+, so verify Bun compatibility or use the documented HTTP API through Bun fetch. [API](https://docs.typesafe.ai/api), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)

Suggested logical modules, not files created by this assessment:

- `services/ai/decisions.ts`: task interface, validated answers, uncertainty/error handling.
- `services/ai/typesafe-decisions.ts`: provider transport, bounded requests and usage recording.
- `services/message-triage.ts`: versioned questions, context assembly and decision policy.

Batch only questions that need the same authorized snapshot. Reply readiness and loop detection may have different windows and timing; reuse matching results without forcing them into one stale “universal” classifier. Never combine different users' conversations merely to save tokens.

Cache by user, chat, message/window revision, content hash, relevant open-loop version, task/rubric version and model version. Recheck permissions even on cache hits. Edits, deletions and changes to loop state invalidate affected decisions. Record IDs, decisions, durations, usage and fallback reasons rather than message bodies in telemetry.

Use `off`, `shadow`, and `enforce` flags per task. Set a total deadline and a circuit breaker, with separate limits for interactive and background work. SDK timeout defaults are per attempt, with no total retry budget; debug logging includes bodies. Configure both explicitly before handling private messages. [Client configuration](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig), [request cancellation](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RequestOptions)

**Economics and latency**

At the published rate, 1,000 total input tokens cost $0.000042/call, or $42 per million calls. A 3,000-token call costs $0.000126. These totals must include state, instructions and criteria; use reported usage rather than character estimates. [Pricing](https://docs.typesafe.ai/models)

For a fixed population of windows that currently receive extraction:

`new cost = N × C_jev + N × p × C_extraction`

Here `p` is the fraction that still receives extraction, including uncertainty and error fallbacks. The stage saves money when `C_jev < (1 − p) × C_extraction`. Add semantic-recovery calls separately because they increase the population. Count cheaper-first retries, caches, embeddings, and generation work that actually remains.

Illustration only: 100,000 windows, 3,000 input tokens per Jev call, an assumed measured extraction cost of $0.001, and 30% still extracted produce $12.60 + $30 = $42.60, versus $100 initially. That is 57.4% lower for this stage, not a forecast for Claire or its total bill.

Count dollars against provider credits as well as list-price compute. The registry prefers Azure/OpenAI partly for credits; paying a new vendor may reduce theoretical compute cost while increasing current cash spending. Verify credit availability rather than treating repository estimates as balances.

A cascade adds Jev latency to surviving requests. Skipped work becomes cheaper, but useful extraction or replies can become slower unless queue load or context size falls enough to compensate. TypeSafe's published batching example reports 0.27 seconds for one batched request, but compares it with sequential individual calls and uses Jev 1.12. It is neither a Claire latency measurement nor a production p95 guarantee. [Batching benchmark](https://docs.typesafe.ai/cookbooks/parallel_questions)

Respect request limits globally across replicas. For example, 10,000 users at 300 calls/day average roughly 35 requests/second, above the currently listed 20 requests/second equivalent; bursts are worse. Per-conversation coalescing and an approved higher limit may matter before token throughput does.

**Quality constraints to test**

TypeSafe documents literal interpretation, weak date/numeric operations, distraction from irrelevant context, adversarial steering, and inconsistent results across differently formulated equivalent questions. Keep arithmetic and policy in code, pass compact state, and do not treat typed output as correctness or an injection barrier. [Jev limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

For message processing, validate the data handling arrangement before rollout. TypeSafe says it does not train on input, but its ordinary privacy policy gives purpose-based retention rather than a fixed short period; enterprise ZDR is separately offered. Confirm the chosen plan's retention and processing terms and reflect the additional processor in Claire's disclosures. [Privacy policy](https://typesafe.ai/legal/privacy-policy), [data handling options](https://docs.typesafe.ai/legal)

**Rollout and decision criteria**

1. Establish the real baseline: calls, billable tokens, cached input, durations, queue delay, suggestion views/selections, and historical traffic by feature. Compare Jev against free lifecycle fixes and on-demand replies.
2. Build a labeled evaluation set spanning English, Spanish, mixed language, abbreviations, emojis, short answers, groups, replies/mentions, jokes, negations, superseded plans, existing-loop completions and injected instructions. Split by conversation to avoid train/test leakage; hold out a final test set after threshold tuning. Use synthetic/deidentified data first and approved conversation samples later.
3. Implement the group fallback behind a flag and validate the adapter's failures, bounded latency and persistence. This is the small pilot, not the business case for large savings.
4. Run reply and loop decisions in shadow. Include a sample of heuristic-skipped windows; otherwise the evaluation cannot discover gate false negatives. Record the added shadow spend explicitly.
5. Enforce reply deferral for clear negatives first, with a working manual path and client state. Promote loop suppression only after its false-negative cost and benefit are measured; initially protect open-loop windows.
6. Trial retrieval reranking separately. Adopt it only if answer quality or useful context per token improves enough to pay for the added latency and requests.

Measure task precision/recall, calibration by language, false negatives on commitments and completions, false suppression of useful replies, fallback rates, and end-to-end p50/p95. Use meaningful positive-sample counts and confidence intervals; an aggregate accuracy score can hide rare missed commitments. Choose acceptance targets before the experiment; a proposed conservative starting target is at least 99% recall for actionable windows, but it must be supported per important slice and is not a Jev capability claim.

Claire's existing loop evaluation runner primarily tests deterministic relevance with supplied semantic fields. It can supply useful fixtures, but passing it does not validate Jev or extraction. Add an API-backed evaluation harness with labeled decisions and replayed conversations. If implementation changes reply UI behavior, verify it in both the real iOS Simulator app and Electron, following AGENTS.md.

The adoption decision should be based on measured avoided generation and preserved recall. The recommended first production value is selective reply preparation, followed by conservative loop triage; group labeling is the simplest way to prove the integration mechanics.
