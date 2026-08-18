// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, DocLink, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'How Loops work',
  description:
    'A loop is one thing you still owe someone, or that someone still owes you — and how Claire decides which ones are yours.',
  section: 'product',
  status: 'current',
  lastReviewed: '2026-08-18',
  order: 2,
  roadmap: {
    status: 'in_progress',
    summary:
      'Relevance scoring, the thread-of-intent schema, and the evaluation harness are built. The windowed detector, details page, and plugin bridge are specified but not yet implemented.',
  },
  related: ['/docs/build-claire/loops', '/docs/extensibility/plugin-system'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        A <strong>loop</strong> is one thing you still owe someone, or that someone still owes you.
        It opens when a conversation creates an obligation, changes as the conversation changes, and
        closes when the conversation resolves it — as a single item, not a pile of fragments.
      </P>

      <Section id="thread" title="A loop is a thread, not a task">
        <P>
          Plans are not made in one message. They get proposed, negotiated, confirmed, amended, and
          finished. A system that reads messages one at a time sees six unrelated commitments in the
          exchange below. Claire keeps one loop and updates it.
        </P>

        <Table
          head={['When', 'Message', 'The loop after']}
          rows={[
            ['Mon 09:12', '“We should catch up — coffee next week?”', 'Opened, but not on your list yet'],
            ['Mon 09:20', '“Yes! Tuesday or Wednesday?”', 'Same loop, two candidate days'],
            ['Tue 18:03', '“Wednesday works. 3pm?”', 'A time appears, nobody has agreed'],
            ['Tue 18:05', '“Perfect, see you Wed at 3.”', 'Now actionable — a calendar action is offered'],
            ['Wed 14:47', '“Running 15 late!”', 'The same event is updated, not duplicated'],
            ['Wed 17:30', '“Great seeing you”', 'Closed by the conversation'],
          ]}
        />

        <Callout kind="note" title="Why the early states stay quiet">
          “How about Tuesday?” is not a plan. Surfacing it would fill your list with things nobody
          has committed to. A loop only becomes actionable — and only then can a plugin offer to do
          something about it — once the conversation actually agrees.
        </Callout>
      </Section>

      <Section id="relevance" title="Being useful in a group means staying quiet">
        <P>
          The hard part is not finding commitments. It is knowing which ones are about you. In a
          group chat, most are not.
        </P>
        <P>
          When Aunt Rita asks Sam to pick up the cake and Sam agrees, that is a real commitment —
          and none of your business. Claire scores every candidate against a fixed set of signals
          before showing you anything. Two of them settle it outright: a one-to-one conversation
          (there is nobody else it could concern), and you having committed to something yourself
          (your own words bind you, whatever the size of the room).
        </P>
        <P>
          A <C>@channel</C> announcement is the interesting case. It mentions everyone, which is
          evidence a message is <em>not</em> aimed at you — so it counts against surfacing, not for
          it. A personal mention inside that same broadcast still reaches you.
        </P>

        <Callout kind="note" title="This decision is not made by a model">
          Relevance is deterministic code, not a prompt. It decides whether someone else’s business
          becomes your loop, so it stays auditable, costs nothing to run, and does not change
          behaviour when the underlying model changes.
        </Callout>
      </Section>

      <Section id="sensitivity" title="You decide how closely Claire watches">
        <P>
          The default is deliberately conservative. Some conversations deserve more attention than
          that and some deserve none, so the threshold is per-conversation rather than global.
        </P>
        <Table
          head={['Setting', 'What surfaces', 'Good for']}
          rows={[
            ['off', 'Nothing, ever — including things you commit to yourself.', 'Chats you never want tracked'],
            ['low', 'Only unambiguous cases: you were named, or you committed.', 'High-traffic channels you skim'],
            ['normal', 'The balanced default. Suppresses work assigned to other people.', 'Most conversations'],
            ['high', 'Also surfaces unclaimed work for you to claim or dismiss.', 'A project channel you own'],
          ]}
        />
        <P>
          Group chats start at <C>normal</C>, but channel platforms like Slack start at <C>low</C>.
          A work channel produces far more traffic than a family group and almost none of it is
          addressed to any one person — so you opt channels <em>in</em> rather than having to opt a
          firehose <em>out</em>.
        </P>
      </Section>

      <Section id="plugins" title="From noticing to doing">
        <P>
          A loop that only reminds you is a nicer to-do list. A loop becomes useful when it can be
          closed — the calendar event created, the task filed, the reply drafted. Plugins are how
          that happens, and it runs both ways: a calendar plugin that sees an unanswered invite can
          open a loop even though no message mentioned it.
        </P>
        <P>
          Noticing a date never authorises creating an event. A plugin proposes; only you approve.
          Anything leaving Claire shows you the exact fields and destination first, writes a receipt,
          and can be undone. By default a plugin receives the structured loop — title, owner,
          deadline, participant names — and not your raw messages. See the{' '}
          <DocLink to="/docs/extensibility/plugin-system" />.
        </P>
      </Section>

      <Section id="principles" title="The rules behind the behaviour">
        <Table
          head={['Rule', 'What it means in practice']}
          rows={[
            [
              'Silence is never resolution',
              'A loop closes only on explicit evidence it happened, was cancelled, or stopped mattering. A conversation going quiet proves nothing, and a wrongly-closed loop is a broken promise.',
            ],
            [
              'A missed loop beats a wrong one',
              'When unsure, Claire stays quiet. One wrong item makes you doubt every other item; a missed one is a gap you can still fill yourself.',
            ],
            [
              'Your edits win',
              'Change a deadline or an owner and Claire will not quietly overwrite it. It can suggest a change, and you decide.',
            ],
            [
              'Messages are data, not instructions',
              'Text from other people can never change what Claire is allowed to do, what needs approval, or where an action is sent — whatever it says.',
            ],
          ]}
        />
      </Section>

      <Section id="build" title="Building on this">
        <P>
          For the relevance signals and weights, the platform-semantics table, and how to run the
          evaluation harness, see <DocLink to="/docs/build-claire/loops" />.
        </P>
      </Section>
    </Doc>
  );
}
