// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, DocLink, P, Section, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Loops: relevance and evaluation',
  description:
    'How relevance scoring decides whether a group message concerns the user, and how to evaluate it.',
  section: 'build-claire',
  status: 'current',
  lastReviewed: '2026-08-18',
  order: 8,
  related: ['/docs/product/loops', '/docs/build-claire/testing'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        The contributor view of loops. For what a loop <em>is</em>, start at{' '}
        <DocLink to="/docs/product/loops" />.
      </P>

      <Section id="states" title="States and status">
        <P>
          A loop spans messages and carries state through{' '}
          <C>proposed → negotiating → pending_confirmation → agreed → resolved</C>. Only{' '}
          <C>agreed</C> and later are actionable — no plugin is offered until the conversation
          actually agrees.
        </P>
        <P>
          Status on the row is a separate, smaller vocabulary: <C>open</C>, <C>waiting</C>,{' '}
          <C>snoozed</C>, <C>done</C>, <C>dropped</C>, <C>superseded</C>. <strong>Overdue is
          derived, never stored</strong> —{' '}
          <C>{'status IN (open, waiting) AND COALESCE(snoozed_until, deadline) < now()'}</C>.
          Snoozing writes <C>snoozed_until</C> and never touches <C>deadline</C>, so a loop snoozed
          twice does not lose the date the user committed to.
        </P>
      </Section>

      <Section id="relevance" title="Relevance scoring">
        <P>
          <C>apps/server/src/services/loops/relevance.ts</C> scores every candidate. Three
          properties, each deliberate:
        </P>
        <ul>
          <li>
            <strong>Deterministic.</strong> No model call. It decides whether someone else’s
            business becomes your loop, which is privacy-adjacent, so it must be auditable and must
            not change when the model provider changes.
          </li>
          <li>
            <strong>Pure.</strong> No I/O, so every branch is table-testable.
          </li>
          <li>
            <strong>Explainable.</strong> Every decision returns the signals that produced it,
            stored on the loop, so “why didn’t Claire catch this?” has an answer.
          </li>
        </ul>
        <P>
          Two <strong>hard passes</strong> bypass the threshold: a one-to-one conversation, and the
          user having committed themselves. <C>sensitivity: off</C> outranks both — “never make
          loops here” has to mean it.
        </P>
        <Table
          head={['Signal', 'Weight', 'Note']}
          rows={[
            ['mention_exact', '+0.45', 'Structured m.mentions preferred; text matching is a fallback'],
            ['reply_to_me', '+0.40', 'Requires persisted reply metadata'],
            ['llm_assigned_to_me', '+0.35', 'From the extraction stage'],
            ['named_other', '−0.55', 'The most important suppressor: the work is explicitly someone else’s'],
            ['broadcast_mention', '−0.35', '@channel addresses everyone, so it addresses no one in particular'],
            ['no_self_signal', '−0.25', 'Nothing ties the message to the user'],
          ]}
        />
        <Callout kind="note" title="Audience size never cancels a direct mention">
          The large-channel penalty applies only to messages not personally addressed. Without that
          exemption an <C>@mention</C> in a busy channel scores the same as ambient chatter — which
          is exactly backwards. The evaluation corpus pins this.
        </Callout>
      </Section>

      <Section id="platforms" title="Platform differences are data, not branches">
        <P>
          The pipeline contains no <C>if (platform === &apos;slack&apos;)</C>. Every difference
          lives in <C>loopSemantics</C> on <C>PlatformDefinition</C> in{' '}
          <C>packages/platform-catalog</C>. Platforms absent from the table get safe defaults, so
          adding a bridge never requires editing detection logic.
        </P>
        <Table
          head={['Platform', 'How a mention renders', 'Threading']}
          rows={[
            ['WhatsApp', 'The phone number — never the display name', 'Replies only'],
            ['Telegram', 'A stable @handle', 'Replies only'],
            ['Slack', 'Display name in the body; the real id only in m.mentions', 'Native threads'],
            ['Instagram', 'A @username', 'Replies only'],
          ]}
        />
        <P>
          This is why structured mentions are the real mechanism: text matching works on Telegram,{' '}
          <strong>fails outright on WhatsApp</strong>, and is fragile on Slack. Self-identity is
          also per-workspace on Slack, so it is keyed <C>(userId, platform, accountRef)</C>.
        </P>
      </Section>

      <Section id="evaluating" title="Evaluating it">
        <Terminal>{`bun run eval:loops                                  # report
cd apps/server && bun run eval:loops --show-passing # every scenario
cd apps/server && bun test                          # the eval runs here too`}</Terminal>
        <P>
          No database, network, or API key. The relevance stage is deterministic, so a failure is
          always a real regression rather than model variance — which is why it belongs in CI rather
          than a manual step.
        </P>
        <Table
          head={['Corpus', 'Purpose']}
          rows={[
            ['HAND_AUTHORED', 'Acceptance criteria, each stating why it matters'],
            ['ADVERSARIAL', 'Conflicting signals and messy language'],
            ['generateScenarios', 'Seeded breadth across platform × group size × mention style'],
          ]}
        />
        <Callout kind="warning" title="knownLimitation is what keeps this honest">
          Cases deterministic scoring cannot resolve — quoted commitments, jokes, first-name
          collisions — are marked with a written reason. They are reported but do not fail the
          build, <strong>and an unexpected pass is also reported</strong>, since that means the
          limitation is gone and the case should be promoted to an enforced expectation. Those
          marked cases are the requirements list for the model-backed extraction stage.
        </Callout>
        <P>
          Release gates: group-suppression accuracy ≥ 0.90, precision ≥ 0.85, recall ≥ 0.70. False
          positives are weighted harder than misses throughout — a wrong loop erodes trust in every
          other loop.
        </P>
      </Section>

      <Section id="code" title="Where the code lives">
        <Table
          head={['Path', 'What']}
          rows={[
            ['apps/server/src/services/loops/relevance.ts', 'Signal scoring and thresholds'],
            ['apps/server/src/services/loops/loop-{gate,context,prompts,reconciler,detector,queue}.ts', 'The detection pipeline'],
            ['apps/server/src/services/loops/loop-agent.ts', 'The loop-scoped agent (read and propose only)'],
            ['apps/server/src/services/ai/', 'Provider registry and schema-validated output'],
            ['apps/server/src/plugins/blocks/schema.ts', 'Plugin block validation'],
            ['apps/client/features/loops/', 'List, details page, timeline, agent panel, block renderer'],
            ['apps/server/src/services/loops/eval/', 'Scenario types, generator, runner'],
            ['apps/server/scripts/eval-loops.ts', 'Evaluation CLI'],
            ['apps/server/src/routes/loops.ts', 'REST API'],
            ['packages/platform-catalog/src/loop-semantics.ts', 'Per-platform behaviour'],
            ['supabase/migrations/20260817020*', 'Schema'],
          ]}
        />
      </Section>

      <Section id="pipeline" title="The detection pipeline">
        <P>
          One pass over a chat is <C>gate → extract+reconcile → apply</C>. Scheduling is per
          <em>chat</em> and debounced, not per message: a burst of twenty messages costs one pass
          over the whole exchange rather than twenty passes over twenty fragments. That is what lets
          one plan stay one loop as it evolves.
        </P>
        <Table
          head={['Stage', 'Cost', 'What it does']}
          rows={[
            ['loop-gate.ts', 'free', 'Regex plus an open-loop check. A chat with a live loop always re-runs — otherwise resolutions are never noticed and nothing ever closes.'],
            ['loop-context.ts', 'free', 'Windowing with overlap so a loop spanning the cursor stays coherent. Evidence attachment is idempotent in the database, so re-reading cannot duplicate.'],
            ['loop-prompts.ts', 'one call', 'The model returns operations against already-open loops, not a list of loops.'],
            ['loop-reconciler.ts', 'free', 'Pure guards. Decides what each operation is allowed to do.'],
          ]}
        />
        <Callout kind="note" title="Why the model is asked for operations, not loops">
          A model asked for “the commitments in this window” returns one per message. Asking for{' '}
          <C>create</C>/<C>update</C>/<C>close</C> against loops it can already see is what turns a
          row into a thread. Extraction and reconciliation share the call because they share a
          transcript — splitting them doubles cost and lets the two stages disagree about what a
          message meant.
        </Callout>
        <P>
          Closes are guarded hardest: explicit cited evidence, confidence ≥ 0.75, and the chat’s{' '}
          <C>auto_close</C>. Failing any of those, the close is recorded as a suggestion rather than
          applied. A missed loop disappoints; a wrongly-closed loop is a broken promise.
        </P>
      </Section>

      <Section id="agent" title="The loop agent">
        <P>
          The details page can ask Claire to help close a loop. Its safety property is{' '}
          <strong>structural, not prompted</strong>: the four tools are two reads and two proposals,
          and there is no tool that sends a message, writes externally, or mutates a row. A prompt
          injection that fully succeeds can make Claire say something wrong; it cannot make Claire
          do anything. Tests assert this against the source, so adding a sending tool later fails
          the build.
        </P>
        <P>
          The step cap, the wall clock, and output truncation are one mechanism doing two jobs — “call
          search fifty times” is both an injection attempt and a bill.
        </P>
      </Section>

      <Section id="blocks" title="Plugin blocks">
        <P>
          A plugin can contribute a small, fixed vocabulary of typed blocks to a loop. This is
          deliberately the opposite of unrestricted UI: no styling, no markup, no nesting, no code.{' '}
          <strong>The plugin supplies data; Claire owns rendering.</strong>
        </P>
        <P>
          Validation runs server-side before persistence, never at render time — a renderer that
          trusted the shape would be trusting the plugin, and every client would have to
          re-implement the checks. Three rules carry the weight:{' '}
          <C>requiresApproval</C> is computed from the installation’s manifest risk and overwrites
          whatever the plugin supplied; <C>link.url</C> must be https with a host in the egress
          allowlist, and the host is re-derived rather than accepted; and an unknown block kind is
          rejected rather than ignored, so a newer plugin cannot smuggle a payload past an older
          server.
        </P>
      </Section>

      <Section id="not-built" title="Not built yet">
        <P>
          Detection ships behind <C>LOOP_DETECTION_MODE=off</C> until the mining harness measures it
          against a real corpus — the per-call token count rises sharply and only measurement proves
          the call-count reduction more than compensates.
        </P>
        <P>
          Still specified in the <DocLink to="/docs/plans/loops-revamp" /> but not implemented: the
          plugin <em>runtime</em> (registry, policy engine, gateway, approvals, receipts) behind the
          block schema, the corpus-mining harness, cross-platform loop merging, and the transactional
          outbox that trigger fan-out will need before any plugin performs a background external
          write.
        </P>
      </Section>
    </Doc>
  );
}
