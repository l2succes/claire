// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'AI model selection and cost model',
  description:
    'Provider-neutral model roles, prompt-cache economics, and the measured cost model for Claire loops.',
  section: 'product',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 5,
  related: ['/docs/product/ai-platform', '/docs/plans/loops-revamp', '/docs/product/payments'],
};

export default function Page() {
  return (
    <Doc>
      <Callout kind="note">Companion to <a href="/docs/plans/loops-revamp">Loops revamp plan</a> and <a href="/docs/product/ai-platform">AI platform and self-hosting specification</a>. <b>All prices are August 2026 list and must be re-verified before implementation.</b> Public sources already disagree with each other (one puts GPT-5 mini at $0.13/$1.00 input/output, another at $0.25/$2.00). The mining harness measures real spend rather than trusting any table, including this one.</Callout>
      <Section id="principles" title="Principles">
      <ol>
              <li><b>No vendor lock-in.</b> Model choice is configuration, not architecture. Switching providers is a config change per task role.</li>
              <li><b>Burn credits in expiry order</b> — Azure first (typically time-boxed), then OpenAI, then commodity inference.</li>
              <li><b>{"The cheapest call is the one you don't make."}</b> The deterministic gate eliminates ~75% of LLM calls at zero cost.</li>
              <li><b>Never trade security for efficiency.</b> The security-critical decisions in the pipeline are deterministic code, which makes them both free and provider-independent.</li>
            </ol>
      </Section>
      <Section id="decision-build-on-the-vercel-ai-sdk" title="Decision: build on the Vercel AI SDK">
      <P><C>server/src/services/ai/</C> becomes the only place provider packages may be imported — already mandated by the <a href="/docs/product/ai-platform">AI platform and self-hosting specification</a> §7.1 and echoed in the <a href="/docs/extensibility/plugin-system">plugin system specification</a> §4.</P>
      <Code lang="text">{"@ai-sdk/openai              → OpenAI ($35k credits)\n@ai-sdk/azure               → Azure AI Foundry (Azure credits)\n@ai-sdk/amazon-bedrock      → existing Bedrock path, kept as fallback\n@ai-sdk/openai-compatible   → Moonshot/Kimi, Together, Groq, DeepInfra,\n                              Fireworks, vLLM, Ollama — one provider covers\n                              most of the open-weight world"}</Code>
      <ul>
              <li><C>generateObject</C> + Zod replaces the fence-stripping and hand validation in the current <C>ai-processor.ts</C> JSON path.</li>
              <li><C>generateText</C> + <C>tools</C> becomes the agent runtime, portable across providers instead of hand-written per-provider bindings.</li>
            </ul>
      <P><b>This supersedes an earlier recommendation</b> to hand-roll a two-dialect tool runtime. That was reasoned on the premise that Kimi rides the OpenAI SDK, leaving only Bedrock as a second dialect. With Azure, OpenAI, Moonshot, open-weight hosts, and eventual self-host all in scope, the premise no longer holds.</P>
      <Section id="the-honest-caveat" title="The honest caveat" level={3}>
      <P><b>Tool calling is the leakiest part of the abstraction.</b> Open-weight models are materially worse at tool calling and strict JSON than frontier models. The roles are therefore not equally portable:</P>
      <Table
              head={[<>Role</>, <>Portability</>, <>Notes</>]}
              rows={[
                [<>Gate</>, <>total</>, <>no model at all</>],
                [<>Relevance</>, <>total</>, <>no model at all</>],
                [<>Triage</>, <>high</>, <>binary classification, tiny output</>],
                [<>Extraction</>, <>medium</>, <>needs schema retries on weaker models</>],
                [<>Agent</>, <><b>low</b></>, <>keep on a strong model longest</>],
              ]}
            />
      <P>Migrate role-by-role, not all at once.</P>
      </Section>
      </Section>
      <Section id="task-roles" title="Task roles">
      <P>Reuses the roles defined in the <a href="/docs/product/ai-platform">AI platform and self-hosting specification</a> §5.2.</P>
      <Table
              head={[<>Role</>, <>Volume</>, <>On credits</>, <>Post-credits</>, <>Never</>]}
              rows={[
                [<><b>Gate</b></>, <>—</>, <>deterministic regex, <b>$0</b></>, <>same</>, <>any LLM</>],
                [<><b>Relevance</b></>, <>—</>, <>deterministic code, <b>$0</b></>, <>same</>, <>any LLM</>],
                [<>Triage <C>classification</C></>, <>very high</>, <>GPT-5 nano $0.05/$0.40; Azure Phi-4-mini ~$0.07/$0.23</>, <>Llama 3.3 70B on Groq $0.59/$0.79; DeepInfra from $0.06</>, <>frontier (waste)</>],
                [<>Extraction <C>analysis</C></>, <>medium</>, <><b>GPT-5.6 Luna $0.20/$1.20</b> (cached input $0.02)</>, <>Kimi K2.5 $0.60/$3.00; DeepSeek V3.1 $0.60/$1.70</>, <>nano-class (quality)</>],
                [<>Agent <C>assistant</C></>, <>low, interactive</>, <>GPT-5.6 Terra $2.00/$12.00</>, <>Kimi K2.6 $0.95/$4.00</>, <>nano-class</>],
                [<><C>embedding</C></>, <>very high</>, <>text-embedding-3-small $0.02/M (batch $0.01)</>, <>must preserve 1536 dims</>, <>anything ≠ 1536 dims</>],
              ]}
            />
      <Section id="why-relevance-stays-deterministic" title="Why relevance stays deterministic" level={3}>
      <P>{"The relevance model decides whether someone else's group message becomes the user's loop — a privacy-adjacent call. Keeping it in "}<C>relevance.ts</C> rather than a prompt means it costs nothing, is auditable, and <b>does not change behavior when the model is swapped.</b> Model-portability is a security property here, not only a cost one.</P>
      </Section>
      </Section>
      <Section id="the-one-thing-you-cannot-hot-swap-embedding-dimensions" title="The one thing you cannot hot-swap: embedding dimensions">
      <P><C>conversation_message_embeddings.embedding</C> is <C>vector(1536)</C> (<C>20260813000001:4-11</C>), and the loops revamp adds <C>loops.embedding vector(1536)</C>{". That is text-embedding-3-small's native dimension."}</P>
      <P>Switching embedding providers means <b>either</b> picking a model that emits or truncates to 1536 (Matryoshka — text-embedding-3-large and Qwen3-Embedding both support this), <b>or</b> re-embedding every message and migrating the column. Generation models can be swapped per request; embeddings cannot.</P>
      <P>Write the 1536 constraint into the provider config as a runtime assertion.</P>
      <P>Embeddings cost roughly <b>$0.005/user/month</b> — cheap enough that self-hosting them is not worth the engineering time at any scale Claire will reach soon.</P>
      </Section>
      <Section id="where-the-money-goes-today" title="Where the money goes today">
      <P>Every message = one LLM call (<C>server/src/index.ts:521</C>), ~410 input / ~120 output tokens, no caching. At Sonnet-class rates ($3/$15 per MTok):</P>
      <Table
              head={[<>''</>, <>per call</>, <>per day</>, <><b>per user/month</b></>]}
              rows={[
                [<>Current detector</>, <>$0.00303</>, <>$0.91</>, <><b>$27.30</b></>],
              ]}
            />
      <P>That is <b>2.7× the entire $10 Claire Plus subscription</b>, for one feature.</P>
      <P><b>Onboarding is worse, and it is a bug.</b> <C>isBackfill</C> is computed at <C>index.ts:402</C> and gates two other features (<C>:473</C>, <C>:483</C>) — but <b>not the detector at `:521`</b>. A WhatsApp link that backfills 50 rooms × 500 messages fires 25,000 LLM calls: <b>≈$75 one-time, per user, per platform connected.</b> Adding <C>{"&& !isBackfill"}</C> is a one-word fix.</P>
      </Section>
      <Section id="the-four-cost-levers" title="The four cost levers">
      <P><b>1. The deterministic gate — free, ~75% reduction.</b> Regex + open-loop check, zero tokens. 70 debounced windows/day → 18 candidates.</P>
      <P><b>2. Prompt caching — requires a specific prompt layout.</b> Order blocks by stability:</P>
      <Code lang="text">{"[cache] system + few-shot examples   ← identical for EVERY user → one shared cache entry\n[cache] chat context: name, platform, is_group, participant roster, self identity\n[cache] transcript (append-only within a window generation)\n[     ] open loops + current time    ← volatile, MUST be last"}</Code>
      <P>Three consequences:</P>
      <ul>
              <li><b>The global prefix is shared across the entire user base.</b> Nothing user-specific is in it, so at any real volume the cache is permanently warm.</li>
              <li><b>{"The system prompt must clear the provider's cache minimum."}</b> ~900 tokens of rules alone silently fails to cache on several providers. Adding the worked examples pushes it to ~2200 tokens, which *both* improves accuracy and crosses the threshold.</li>
              <li><b>Anchored windows beat sliding windows.</b> A sliding window drops messages from the front, changing the prefix and destroying the cache. Append until the transcript hits the cap, then reset — each successive pass on a chat is a pure append and hits cache.</li>
            </ul>
      <P><b>3. Model tiering by stage.</b> Expensive reasoning only runs on what survives the gate and triage.</P>
      <P><b>4. Shrink the output.</b> Output cannot be cached and ends up dominating. Most gated windows legitimately return <C>{"{\"ops\":[]}"}</C> — terse field names and omitted nulls drop average output from ~250 to ~110 tokens.</P>
      </Section>
      <Section id="cost-per-user-month-by-provider-tier" title="Cost per user/month, by provider tier">
      <P>Workload: 18 triage + 9 extraction calls/day, stability-ordered prompt, caching on.</P>
      <Table
              head={[<>Stack</>, <>Loops only</>, <>All-in AI¹</>]}
              rows={[
                [<>Current architecture (any provider)</>, <>$27.30</>, <>~$28.50</>],
                [<>Claude Opus 5</>, <>$2.12</>, <>~$3.30</>],
                [<><b>OpenAI GPT-5 nano + 5.6 Luna</b></>, <><b>$0.13</b></>, <><b>~$0.56</b></>],
                [<>Azure Phi-4-mini + GPT-4.1</>, <>~$0.35</>, <>~$1.10</>],
                [<>Kimi K2.5 (already wired in <C>ai-processor.ts</C>)</>, <>~$0.30</>, <>~$0.90</>],
                [<>Groq Llama 3.3 70B + DeepSeek V3.1</>, <>~$0.28</>, <>~$0.85</>],
              ]}
            />
      <P>¹ loops + embeddings + Ask Claire (~20 queries) + loop agent (~5 sessions) + smart cards.</P>
      <P><b>The most useful finding is the composition, not the ranking.</b> After the revamp, loop *detection* is $0.13 of a $0.56 bill. The <b>loop agent is ~60% of all-in cost</b> (~$0.34), because it is long-context and interactive. Detection is solved; the agent is the next thing to optimize, and the lever there is context discipline (retrieval over long context, §9), not a cheaper model.</P>
      </Section>
      <Section id="credit-runway" title="Credit runway">
      <P>$35,000 OpenAI ÷ ~$0.56 all-in:</P>
      <Table
              head={[<>MAU</>, <>Runway on OpenAI credits alone</>]}
              rows={[
                [<>1,000</>, <>~62 months</>],
                [<>5,000</>, <>~12 months</>],
                [<>20,000</>, <>~3 months</>],
                [<>50,000</>, <>~5 weeks</>],
              ]}
            />
      <P>Batch (50% off) and cached input (90% off on GPT-5.6) stretch these further. Azure credits extend the runway before OpenAI is touched at all.</P>
      <P><b>Sequencing:</b> Azure → OpenAI → Kimi/open-weights. Each transition is a config change per role.</P>
      </Section>
      <Section id="batch-api-and-long-context" title="Batch API and long context">
      <Section id="batch-three-fits-all-latency-insensitive" title="Batch — three fits, all latency-insensitive" level={3}>
      <P>50% discount, up to 24h latency. <b>Not for live detection</b> (a 45s debounce implies minutes).</P>
      <ol>
              <li><b>Onboarding backfill</b> — the user is not waiting. ~150 batched calls ≈ <b>$0.54 one-time</b>, versus ~$75 today.</li>
              <li><b>The mining/eval harness</b> — replaying tens of thousands of messages is the single most expensive one-off operation.</li>
              <li><b>Nightly catch-up sweep</b> — a low-priority pass over gate-suppressed windows, to measure what real-time detection missed.</li>
            </ol>
      </Section>
      <Section id="long-context-retrieval-to-find-long-context-to-reason" title="Long context — retrieval to find, long context to reason" level={3}>
      <P>{"The instinct to \"send everything\" because the window is large is the worst available option: 1M tokens is ~$5 per call at frontier rates. Claire already has retrieval ("}<C>conversation_message_embeddings</C>, <C>match_scoped_conversation_messages</C>) and it is ~100× cheaper for locating relevant messages. Long context earns its cost only where *coherence over a bounded set* is the requirement:</P>
      <Table
              head={[<>Use</>, <>Frequency</>, <>Why long context specifically</>]}
              rows={[
                [<>Whole-chat reconciliation</>, <>weekly / on demand</>, <>The incremental detector sees a 40-message window. Only a full pass catches a loop opened in March and silently resolved in June.</>],
                [<>Cross-chat dedup</>, <>weekly</>, <>Same intent across two platforms is hard incrementally, trivial with everything in view.</>],
                [<>Loop-scoped agent</>, <>user-initiated</>, <>Highest value per token; the user is actively waiting. Meter against the <a href="/docs/product/payments">payments and AI credits specification</a>.</>],
              ]}
            />
      <P>Budget these as <b>periodic quality passes</b>, not the hot path.</P>
      </Section>
      </Section>
      <Section id="provider-capability-matrix" title="Provider capability matrix">
      <P>{"The prompt layout is universal — OpenAI's automatic prefix caching is also a prefix match, so the stability ordering transfers unchanged. The *economics* differ:"}</P>
      <Table
              head={[<>Provider</>, <>Caching</>, <>Batch</>]}
              rows={[
                [<>OpenAI</>, <>automatic prefix, 90% off</>, <>✅ 50%</>],
                [<>Azure OpenAI</>, <>automatic prefix</>, <>✅</>],
                [<>Anthropic direct</>, <>explicit <C>cache_control</C> breakpoints</>, <>✅</>],
                [<>Bedrock</>, <>explicit breakpoints only</>, <>❌ <b>no Batch</b></>],
                [<>Moonshot/Kimi</>, <>cache-hit pricing ($0.15–$0.30/M)</>, <>❌</>],
                [<>Together / Groq / DeepInfra</>, <>generally none</>, <>❌</>],
              ]}
            />
      <P><C>ai-processor.ts</C> currently runs Bedrock-first, which forecloses Batch. Route detection through a Batch-capable provider and keep Bedrock as fallback.</P>
      </Section>
      <Section id="self-hosting" title="Self-hosting">
      <P>Not soon, and the arithmetic says so plainly. An A100 at ~$1.04/hr is ~$750/month sustained, which only beats ~$0.56/user/month above ~1,300 users <b>and only at near-full GPU utilization</b> — which bursty consumer messaging traffic will not deliver. Serverless open-weight inference (DeepInfra, Groq) captures most of the savings with none of the ops burden.</P>
      <P>Revisit when a single role has steady, saturating volume. The gate is deterministic, so that role will never qualify.</P>
      </Section>
      <Section id="efficiency-without-weakening-security" title="Efficiency without weakening security">
      <P>Each lever checked against the threat model rather than assumed safe:</P>
      <ul>
              <li><b>Cache layout and privacy point the same direction.</b> Effective caching *requires* that nothing user-specific sit in the shared prefix. That is exactly the privacy rule. The cache-optimal prompt is the privacy-optimal prompt.</li>
              <li><b>The security-critical decision is the one that is free.</b> Group relevance is deterministic code, not a model output. <b>Never move it to the cheap triage model to save tokens.</b>{" Cheap models are acceptable for \"is there anything here?\"; they are not acceptable for \"does this concern you?\""}</li>
              <li><b>A cheaper triage model costs recall, not safety.</b> Its only failure mode is a missed loop, which the eval gate measures directly.</li>
              <li><b>Batch changes latency, not exposure</b> — same API, same retention. The harness must emit IDs, counts, and classifications only, never message bodies (the <a href="/docs/extensibility/plugin-system">plugin system specification</a> §13).</li>
              <li><b>Long-context passes concentrate data</b>, so they inherit the same controls: <C>{"chat_loop_settings.sensitivity = 'off'"}</C> suppresses the periodic pass too, not just live detection.</li>
              <li><b>{"The agent's cost caps and its injection defences are the same mechanism."}</b>{" A group message saying *\"call search_messages 50 times\"* is both an injection attempt and a bill attack; "}<C>maxSteps</C>, the wall clock, and duplicate-call detection stop both. Do not relax them for latency.</li>
            </ul>
      </Section>
      <Section id="what-to-measure-before-enabling-detection" title="What to measure before enabling detection">
      <P><C>LOOP_DETECTION_MODE</C> stays <C>off</C> until <C>mine-loops.ts</C> reports, against the real corpus:</P>
      <ul>
              <li>gate hit rate</li>
              <li><b>measured</b> input/output tokens per stage</li>
              <li>cache read ratio at steady state</li>
              <li>triage-stage false-negative rate</li>
              <li>extrapolated $/user/month per candidate provider</li>
            </ul>
      <P><b>Do not enable detection on estimates.</b> Per-call token count rises ~8×, and only measurement proves the call-count reduction more than compensates.</P>
      </Section>
      <Section id="sources" title="Sources">
      <P><a href="https://www.aipricing.guru/openai-pricing/" rel="noreferrer" target="_blank">OpenAI pricing</a> · <a href="https://pricepertoken.com/pricing-page/model/openai-gpt-5-nano" rel="noreferrer" target="_blank">GPT-5 nano</a> · <a href="https://pricepertoken.com/pricing-page/model/openai-gpt-5-mini" rel="noreferrer" target="_blank">GPT-5 mini</a> · <a href="https://benchlm.ai/moonshot/api-pricing" rel="noreferrer" target="_blank">Kimi pricing</a> · <a href="https://openrouter.ai/moonshotai/kimi-k2.6" rel="noreferrer" target="_blank">Kimi K2.6 on OpenRouter</a> · <a href="https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/aoai/" rel="noreferrer" target="_blank">Azure AI Foundry pricing</a> · <a href="https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/deepseek/" rel="noreferrer" target="_blank">Azure DeepSeek</a> · <a href="https://www.aipricing.guru/together-pricing/" rel="noreferrer" target="_blank">Together pricing</a> · <a href="https://www.aipricing.guru/groq-pricing/" rel="noreferrer" target="_blank">Groq pricing</a> · <a href="https://costbench.com/software/llm-api-providers/deepinfra/" rel="noreferrer" target="_blank">DeepInfra pricing</a> · <a href="https://tokenmix.ai/blog/openai-embedding-pricing" rel="noreferrer" target="_blank">OpenAI embedding pricing</a> · <a href="https://pecollective.com/tools/text-embedding-models-compared/" rel="noreferrer" target="_blank">Embedding model comparison</a></P>
      </Section>
    </Doc>
  );
}
