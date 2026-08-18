// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, P, Section, Step, Steps, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Autonomous execution loop',
  description: 'The issue-driven delivery loop used to take Claire from the backlog to v1.',
  section: 'contribute',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 2,
  related: ['/docs/contribute/workflow', '/docs/build-claire/testing'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        A loop driver picks the next GitHub ticket, builds it, tests it end to end in a headless browser,
        opens a pull request, and either auto-merges it (low risk) or parks it for review (high risk) —
        then repeats. This page is the source of truth; the <C>/claire-loop</C> command points back here.
      </P>

      <Callout kind="tip" title="On a dedicated machine">
        clone → <C>gh auth login</C> → <C>bun install</C> → <C>/claire-loop-init</C> (once) →{' '}
        <C>/claire-loop until-green</C>.
      </Callout>

      <Section id="tickets" title="Where the tickets live">
        <P>
          All work is tracked as GitHub Issues. Milestones are epics (M0–M7), and M0 — test harness and
          green CI — lands first because it unblocks every end-to-end ticket after it.
        </P>
        <Table
          head={['Label group', 'Values']}
          rows={[
            [<C key="a">area/*</C>, 'server, client, ai, loops, notifications, platforms, testing, infra, auth, db'],
            [<C key="b">p0–p3</C>, 'Priority; p0 is critical'],
            [<C key="c">type/*</C>, 'feature, bug, chore, test, docs'],
            [<C key="d">risk/*</C>, 'auto-merge — the loop may merge on green CI; human-gate — review required'],
            [<C key="e">state</C>, 'ready, blocked, needs-review'],
          ]}
        />
        <P>Find the next ticket — lowest milestone, then lowest priority number:</P>
        <Terminal>{`gh issue list --state open --label ready --json number,title,labels,milestone \\
  --jq 'map(.pri = (([.labels[].name]|map(select(test("^p[0-9]$")))|first) // "p9"))
        | sort_by(.milestone.title, .pri)
        | .[] | "#\\(.number) [\\(.milestone.title|split(" ")[0])] \\(.pri) \\(.title)"'`}</Terminal>
        <P>
          Skip anything labelled <C>blocked</C> or <C>needs-review</C>, and anything whose body lists a{' '}
          <C>Depends on:</C> issue that is still open.
        </P>
      </Section>

      <Section id="algorithm" title="One iteration">
        <Steps>
          <Step title="Sync">
            <P>
              <C>git fetch origin</C>. Branches are cut from <C>origin/main</C>, which works in both a
              fresh clone and a multi-worktree checkout.
            </P>
          </Step>
          <Step title="Pick the next ready issue">
            <P>M0 first; within a milestone, p0 through p3. Respect declared dependencies.</P>
          </Step>
          <Step title="Claim it">
            <Terminal>{`git worktree add ../wt-<num> -b feat/<area>-<slug> origin/main`}</Terminal>
            <P>
              And comment <C>🔁 loop: starting</C> on the issue so a second driver does not pick it up.
            </P>
          </Step>
          <Step title="Build to the acceptance criteria">
            <P>Reuse existing code. Add or extend mock Playwright end-to-end tests and unit tests.</P>
          </Step>
          <Step title="Gate locally">
            <Terminal>{`(cd server && bun run lint && bun run typecheck && bun test)
(cd mobile && bun run lint && bun run typecheck && bun test && MOCK_BRIDGE=true bunx playwright test)`}</Terminal>
            <P>
              Red means fix in-loop, at most twice. Still red: label <C>blocked</C>, comment the failure,
              drop <C>ready</C>, and move on.
            </P>
          </Step>
          <Step title="Open the pull request">
            <P>
              <C>gh pr create --base main</C> with <C>Closes #&lt;num&gt;</C>, the risk tier, and how it
              was verified.
            </P>
          </Step>
          <Step title="Decide the merge">
            <P>
              <C>risk/auto-merge</C> lands with <C>gh pr merge --squash --auto</C> once CI is green.{' '}
              <C>risk/human-gate</C> stays open, loses <C>ready</C>, and gains <C>needs-review</C>.
            </P>
          </Step>
          <Step title="Record and clean up">
            <P>
              Tick the milestone in the tracking issue and append a line to{' '}
              <C>.context/loop-state.md</C>, then remove the worktree.
            </P>
          </Step>
        </Steps>
      </Section>

      <Section id="guardrails" title="Guardrails">
        <ul>
          <li>
            <b>Ordering.</b> M0 lands first. Tickets touching shared files — CI config, the Playwright
            config, the server message handler, migrations — run serially.
          </li>
          <li>
            <b>Isolation.</b> Each worker gets its own git worktree and rebases on main before opening a
            pull request.
          </li>
          <li>
            <b>Human gate respected.</b> The loop never merges auth, database, infrastructure, or
            bridge-core changes. It parks them.
          </li>
          <li>
            <b>Idempotent restart.</b> Issue labels and the ledger are the source of truth, so the loop
            resumes cleanly after any interruption, on any machine.
          </li>
        </ul>
      </Section>

      <Section id="stop" title="Stop conditions">
        <ul>
          <li>The run bound is reached, or a milestone is exhausted.</li>
          <li>No ready, unblocked, auto-mergeable tickets remain.</li>
          <li>
            <b>Definition of done:</b> core-loop end-to-end green for WhatsApp, Telegram, and Instagram.
          </li>
          <li>A ticket hard-fails twice — mark it blocked and continue.</li>
        </ul>
      </Section>

      <Section id="merge-policy" title="Merge policy">
        <Table
          head={['Risk', 'Examples', 'Action']}
          rows={[
            [<C key="a">risk/auto-merge</C>, 'Tests, docs, isolated UI, client screens', 'Squash-merge automatically on green CI'],
            [
              <C key="b">risk/human-gate</C>,
              'Auth, schema and migrations, infra and CI, bridge core, anything that sends messages autonomously',
              'Open the PR, label needs-review, wait for a human',
            ],
          ]}
        />
        <P>
          CI must be green either way: lint, typecheck, Jest, the web build, and the mock Playwright
          suite.
        </P>
      </Section>

      <Section id="testing-model" title="Testing model">
        <ul>
          <li>
            <b>Mock backend</b> for CI and the fast loop. The server runs with <C>MOCK_BRIDGE=true</C>{' '}
            against deterministic fixtures. No Docker, no real device pairing.
          </li>
          <li>
            <b>Real stack</b> nightly. A scheduled workflow boots Supabase and Matrix, seeds a session,
            and runs a subset across all three platforms.
          </li>
          <li>
            <b>Core-loop end-to-end</b> is the definition of done: sign in → inbox shows seeded messages →
            open chat → AI suggestion appears and is accepted → send → Loops lists the detected loop
            → mark complete → reminder scheduled.
          </li>
        </ul>
      </Section>

      <Section id="watching" title="Watching a run">
        <P>
          <C>claude -p</C> runs headless, so there is no live TUI. Visibility comes from three places:
        </P>
        <ul>
          <li>
            <b>Live dashboard.</b> <C>scripts/loop-watch.sh</C> shows the active ticket, runner heartbeat,
            open pull requests, latest CI, queue counts, and the ledger.
          </li>
          <li>
            <b>Live agent trace.</b> The runner streams formatted JSON into{' '}
            <C>.context/loop-runner.log</C>, with raw JSONL in <C>.context/loop-trace.jsonl</C>.
          </li>
          <li>
            <b>Durable trail.</b> Issue comments, branches, pull requests, and{' '}
            <C>.context/loop-state.md</C>.
          </li>
        </ul>
        <Code lang="bash" title="Tail the trace">{`tail -f .context/loop-trace.jsonl | jq -Rrf scripts/loop-fmt.jq`}</Code>
      </Section>
    </Doc>
  );
}
