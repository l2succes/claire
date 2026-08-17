# AI Model Selection and Cost Model

> Companion to [LOOPS_REVAMP_PLAN.md](./LOOPS_REVAMP_PLAN.md) and [AI_PLATFORM_AND_SELF_HOSTING_SPEC.md](./AI_PLATFORM_AND_SELF_HOSTING_SPEC.md).
>
> **All prices are August 2026 list and must be re-verified before implementation.** Public sources already disagree with each other (one puts GPT-5 mini at $0.13/$1.00 input/output, another at $0.25/$2.00). The mining harness measures real spend rather than trusting any table, including this one.

## 1. Principles

1. **No vendor lock-in.** Model choice is configuration, not architecture. Switching providers is a config change per task role.
2. **Burn credits in expiry order** — Azure first (typically time-boxed), then OpenAI, then commodity inference.
3. **The cheapest call is the one you don't make.** The deterministic gate eliminates ~75% of LLM calls at zero cost.
4. **Never trade security for efficiency.** The security-critical decisions in the pipeline are deterministic code, which makes them both free and provider-independent.

## 2. Decision: build on the Vercel AI SDK

`server/src/services/ai/` becomes the only place provider packages may be imported — already mandated by [AI_PLATFORM_AND_SELF_HOSTING_SPEC.md](./AI_PLATFORM_AND_SELF_HOSTING_SPEC.md) §7.1 and echoed in [CLAIRE_PLUGIN_SYSTEM_SPEC.md](./CLAIRE_PLUGIN_SYSTEM_SPEC.md) §4.

```
@ai-sdk/openai              → OpenAI ($35k credits)
@ai-sdk/azure               → Azure AI Foundry (Azure credits)
@ai-sdk/amazon-bedrock      → existing Bedrock path, kept as fallback
@ai-sdk/openai-compatible   → Moonshot/Kimi, Together, Groq, DeepInfra,
                              Fireworks, vLLM, Ollama — one provider covers
                              most of the open-weight world
```

- `generateObject` + Zod replaces the fence-stripping and hand validation in the current `ai-processor.ts` JSON path.
- `generateText` + `tools` becomes the agent runtime, portable across providers instead of hand-written per-provider bindings.

**This supersedes an earlier recommendation** to hand-roll a two-dialect tool runtime. That was reasoned on the premise that Kimi rides the OpenAI SDK, leaving only Bedrock as a second dialect. With Azure, OpenAI, Moonshot, open-weight hosts, and eventual self-host all in scope, the premise no longer holds.

### The honest caveat

**Tool calling is the leakiest part of the abstraction.** Open-weight models are materially worse at tool calling and strict JSON than frontier models. The roles are therefore not equally portable:

| Role | Portability | Notes |
|---|---|---|
| Gate | total | no model at all |
| Relevance | total | no model at all |
| Triage | high | binary classification, tiny output |
| Extraction | medium | needs schema retries on weaker models |
| Agent | **low** | keep on a strong model longest |

Migrate role-by-role, not all at once.

## 3. Task roles

Reuses the roles defined in [AI_PLATFORM_AND_SELF_HOSTING_SPEC.md](./AI_PLATFORM_AND_SELF_HOSTING_SPEC.md) §5.2.

| Role | Volume | On credits | Post-credits | Never |
|---|---|---|---|---|
| **Gate** | — | deterministic regex, **$0** | same | any LLM |
| **Relevance** | — | deterministic code, **$0** | same | any LLM |
| Triage `classification` | very high | GPT-5 nano $0.05/$0.40; Azure Phi-4-mini ~$0.07/$0.23 | Llama 3.3 70B on Groq $0.59/$0.79; DeepInfra from $0.06 | frontier (waste) |
| Extraction `analysis` | medium | **GPT-5.6 Luna $0.20/$1.20** (cached input $0.02) | Kimi K2.5 $0.60/$3.00; DeepSeek V3.1 $0.60/$1.70 | nano-class (quality) |
| Agent `assistant` | low, interactive | GPT-5.6 Terra $2.00/$12.00 | Kimi K2.6 $0.95/$4.00 | nano-class |
| `embedding` | very high | text-embedding-3-small $0.02/M (batch $0.01) | must preserve 1536 dims | anything ≠ 1536 dims |

### Why relevance stays deterministic

The relevance model decides whether someone else's group message becomes the user's loop — a privacy-adjacent call. Keeping it in `relevance.ts` rather than a prompt means it costs nothing, is auditable, and **does not change behavior when the model is swapped.** Model-portability is a security property here, not only a cost one.

## 4. The one thing you cannot hot-swap: embedding dimensions

`conversation_message_embeddings.embedding` is `vector(1536)` (`20260813000001:4-11`), and the loops revamp adds `loops.embedding vector(1536)`. That is text-embedding-3-small's native dimension.

Switching embedding providers means **either** picking a model that emits or truncates to 1536 (Matryoshka — text-embedding-3-large and Qwen3-Embedding both support this), **or** re-embedding every message and migrating the column. Generation models can be swapped per request; embeddings cannot.

Write the 1536 constraint into the provider config as a runtime assertion.

Embeddings cost roughly **$0.005/user/month** — cheap enough that self-hosting them is not worth the engineering time at any scale Claire will reach soon.

## 5. Where the money goes today

Every message = one LLM call (`server/src/index.ts:521`), ~410 input / ~120 output tokens, no caching. At Sonnet-class rates ($3/$15 per MTok):

| | per call | per day | **per user/month** |
|---|---|---|---|
| Current detector | $0.00303 | $0.91 | **$27.30** |

That is **2.7× the entire $10 Claire Plus subscription**, for one feature.

**Onboarding is worse, and it is a bug.** `isBackfill` is computed at `index.ts:402` and gates two other features (`:473`, `:483`) — but **not the detector at `:521`**. A WhatsApp link that backfills 50 rooms × 500 messages fires 25,000 LLM calls: **≈$75 one-time, per user, per platform connected.** Adding `&& !isBackfill` is a one-word fix.

## 6. The four cost levers

**1. The deterministic gate — free, ~75% reduction.** Regex + open-loop check, zero tokens. 70 debounced windows/day → 18 candidates.

**2. Prompt caching — requires a specific prompt layout.** Order blocks by stability:

```
[cache] system + few-shot examples   ← identical for EVERY user → one shared cache entry
[cache] chat context: name, platform, is_group, participant roster, self identity
[cache] transcript (append-only within a window generation)
[     ] open loops + current time    ← volatile, MUST be last
```

Three consequences:

- **The global prefix is shared across the entire user base.** Nothing user-specific is in it, so at any real volume the cache is permanently warm.
- **The system prompt must clear the provider's cache minimum.** ~900 tokens of rules alone silently fails to cache on several providers. Adding the worked examples pushes it to ~2200 tokens, which *both* improves accuracy and crosses the threshold.
- **Anchored windows beat sliding windows.** A sliding window drops messages from the front, changing the prefix and destroying the cache. Append until the transcript hits the cap, then reset — each successive pass on a chat is a pure append and hits cache.

**3. Model tiering by stage.** Expensive reasoning only runs on what survives the gate and triage.

**4. Shrink the output.** Output cannot be cached and ends up dominating. Most gated windows legitimately return `{"ops":[]}` — terse field names and omitted nulls drop average output from ~250 to ~110 tokens.

## 7. Cost per user/month, by provider tier

Workload: 18 triage + 9 extraction calls/day, stability-ordered prompt, caching on.

| Stack | Loops only | All-in AI¹ |
|---|---|---|
| Current architecture (any provider) | $27.30 | ~$28.50 |
| Claude Opus 5 | $2.12 | ~$3.30 |
| **OpenAI GPT-5 nano + 5.6 Luna** | **$0.13** | **~$0.56** |
| Azure Phi-4-mini + GPT-4.1 | ~$0.35 | ~$1.10 |
| Kimi K2.5 (already wired in `ai-processor.ts`) | ~$0.30 | ~$0.90 |
| Groq Llama 3.3 70B + DeepSeek V3.1 | ~$0.28 | ~$0.85 |

¹ loops + embeddings + Ask Claire (~20 queries) + loop agent (~5 sessions) + smart cards.

**The most useful finding is the composition, not the ranking.** After the revamp, loop *detection* is $0.13 of a $0.56 bill. The **loop agent is ~60% of all-in cost** (~$0.34), because it is long-context and interactive. Detection is solved; the agent is the next thing to optimize, and the lever there is context discipline (retrieval over long context, §9), not a cheaper model.

## 8. Credit runway

$35,000 OpenAI ÷ ~$0.56 all-in:

| MAU | Runway on OpenAI credits alone |
|---|---|
| 1,000 | ~62 months |
| 5,000 | ~12 months |
| 20,000 | ~3 months |
| 50,000 | ~5 weeks |

Batch (50% off) and cached input (90% off on GPT-5.6) stretch these further. Azure credits extend the runway before OpenAI is touched at all.

**Sequencing:** Azure → OpenAI → Kimi/open-weights. Each transition is a config change per role.

## 9. Batch API and long context

### Batch — three fits, all latency-insensitive

50% discount, up to 24h latency. **Not for live detection** (a 45s debounce implies minutes).

1. **Onboarding backfill** — the user is not waiting. ~150 batched calls ≈ **$0.54 one-time**, versus ~$75 today.
2. **The mining/eval harness** — replaying tens of thousands of messages is the single most expensive one-off operation.
3. **Nightly catch-up sweep** — a low-priority pass over gate-suppressed windows, to measure what real-time detection missed.

### Long context — retrieval to find, long context to reason

The instinct to "send everything" because the window is large is the worst available option: 1M tokens is ~$5 per call at frontier rates. Claire already has retrieval (`conversation_message_embeddings`, `match_scoped_conversation_messages`) and it is ~100× cheaper for locating relevant messages. Long context earns its cost only where *coherence over a bounded set* is the requirement:

| Use | Frequency | Why long context specifically |
|---|---|---|
| Whole-chat reconciliation | weekly / on demand | The incremental detector sees a 40-message window. Only a full pass catches a loop opened in March and silently resolved in June. |
| Cross-chat dedup | weekly | Same intent across two platforms is hard incrementally, trivial with everything in view. |
| Loop-scoped agent | user-initiated | Highest value per token; the user is actively waiting. Meter against [PAYMENTS_AND_AI_CREDITS_SPEC.md](./PAYMENTS_AND_AI_CREDITS_SPEC.md). |

Budget these as **periodic quality passes**, not the hot path.

## 10. Provider capability matrix

The prompt layout is universal — OpenAI's automatic prefix caching is also a prefix match, so the stability ordering transfers unchanged. The *economics* differ:

| Provider | Caching | Batch |
|---|---|---|
| OpenAI | automatic prefix, 90% off | ✅ 50% |
| Azure OpenAI | automatic prefix | ✅ |
| Anthropic direct | explicit `cache_control` breakpoints | ✅ |
| Bedrock | explicit breakpoints only | ❌ **no Batch** |
| Moonshot/Kimi | cache-hit pricing ($0.15–$0.30/M) | ❌ |
| Together / Groq / DeepInfra | generally none | ❌ |

`ai-processor.ts` currently runs Bedrock-first, which forecloses Batch. Route detection through a Batch-capable provider and keep Bedrock as fallback.

## 11. Self-hosting

Not soon, and the arithmetic says so plainly. An A100 at ~$1.04/hr is ~$750/month sustained, which only beats ~$0.56/user/month above ~1,300 users **and only at near-full GPU utilization** — which bursty consumer messaging traffic will not deliver. Serverless open-weight inference (DeepInfra, Groq) captures most of the savings with none of the ops burden.

Revisit when a single role has steady, saturating volume. The gate is deterministic, so that role will never qualify.

## 12. Efficiency without weakening security

Each lever checked against the threat model rather than assumed safe:

- **Cache layout and privacy point the same direction.** Effective caching *requires* that nothing user-specific sit in the shared prefix. That is exactly the privacy rule. The cache-optimal prompt is the privacy-optimal prompt.
- **The security-critical decision is the one that is free.** Group relevance is deterministic code, not a model output. **Never move it to the cheap triage model to save tokens.** Cheap models are acceptable for "is there anything here?"; they are not acceptable for "does this concern you?"
- **A cheaper triage model costs recall, not safety.** Its only failure mode is a missed loop, which the eval gate measures directly.
- **Batch changes latency, not exposure** — same API, same retention. The harness must emit IDs, counts, and classifications only, never message bodies ([CLAIRE_PLUGIN_SYSTEM_SPEC.md](./CLAIRE_PLUGIN_SYSTEM_SPEC.md) §13).
- **Long-context passes concentrate data**, so they inherit the same controls: `chat_loop_settings.sensitivity = 'off'` suppresses the periodic pass too, not just live detection.
- **The agent's cost caps and its injection defences are the same mechanism.** A group message saying *"call search_messages 50 times"* is both an injection attempt and a bill attack; `maxSteps`, the wall clock, and duplicate-call detection stop both. Do not relax them for latency.

## 13. What to measure before enabling detection

`LOOP_DETECTION_MODE` stays `off` until `mine-loops.ts` reports, against the real corpus:

- gate hit rate
- **measured** input/output tokens per stage
- cache read ratio at steady state
- triage-stage false-negative rate
- extrapolated $/user/month per candidate provider

**Do not enable detection on estimates.** Per-call token count rises ~8×, and only measurement proves the call-count reduction more than compensates.

---

## Sources

[OpenAI pricing](https://www.aipricing.guru/openai-pricing/) ·
[GPT-5 nano](https://pricepertoken.com/pricing-page/model/openai-gpt-5-nano) ·
[GPT-5 mini](https://pricepertoken.com/pricing-page/model/openai-gpt-5-mini) ·
[Kimi pricing](https://benchlm.ai/moonshot/api-pricing) ·
[Kimi K2.6 on OpenRouter](https://openrouter.ai/moonshotai/kimi-k2.6) ·
[Azure AI Foundry pricing](https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/aoai/) ·
[Azure DeepSeek](https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/deepseek/) ·
[Together pricing](https://www.aipricing.guru/together-pricing/) ·
[Groq pricing](https://www.aipricing.guru/groq-pricing/) ·
[DeepInfra pricing](https://costbench.com/software/llm-api-providers/deepinfra/) ·
[OpenAI embedding pricing](https://tokenmix.ai/blog/openai-embedding-pricing) ·
[Embedding model comparison](https://pecollective.com/tools/text-embedding-models-compared/)
