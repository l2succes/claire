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
            ['apps/server/src/services/loops/eval/', 'Scenario types, generator, runner'],
            ['apps/server/scripts/eval-loops.ts', 'Evaluation CLI'],
            ['apps/server/src/routes/loops.ts', 'REST API'],
            ['packages/platform-catalog/src/loop-semantics.ts', 'Per-platform behaviour'],
            ['supabase/migrations/20260817020*', 'Schema'],
          ]}
        />
      </Section>

      <Section id="not-built" title="Not built yet">
        <P>
          The windowed detection pipeline, the loop details page, the agent layer, and the plugin
          runtime are specified in the <DocLink to="/docs/plans/loops-revamp" /> but not implemented. Detection
          ships behind <C>LOOP_DETECTION_MODE=off</C> until the mining harness measures it against a
          real corpus.
        </P>
      </Section>
    </Doc>
  );
}
