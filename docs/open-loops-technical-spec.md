# Open Loops technical implementation

## Recap

Open Loops is a thread-of-intent system, not a message classifier. The extractor
uses a bounded chat window once to identify commitments, participants, evidence,
requester, owner, state, and deadlines. Deterministic application code then
decides relevance, priority, ordering, and notification eligibility. This keeps
cost bounded and every result explainable.

## Canonical model

`requester` answers who initiated the requested outcome; `owner` answers who
owes the next move. Both are `me | them | shared | unknown`. A loop therefore
can render “You asked Maya for help · waiting on Maya” without deriving either
fact from the prose summary or participant display names.

The `loops` row gains `requester`, `requester_contact_id`, `priority_score`,
`priority_breakdown`, `priority_override`, and `priority_updated_at`. The
breakdown is a compact JSON document containing the inputs used for the score;
it is both a UI explanation and an audit trail. User preference profiles and
notification budgets are a later table/API addition, while `priority_override`
handles pin/manual importance immediately.

## Priority contract

The pure scorer returns an integer 0–100 and a breakdown. It runs on creation,
on detector updates, when snooze/deadline/ownership changes, and in a one-shot
backfill for existing live rows.

| Component | Range | Rule |
| --- | ---: | --- |
| urgency | 0–35 | overdue 35; today 27; ≤3 days 20; ≤7 days 10 |
| responsibility | 0–15 | me 15; shared 10; them 7; unknown 0 |
| commitment | 0–12 | agreed 12; pending confirmation 8; negotiating 3; proposed 0 |
| relevance | 0–12 | normalized detector relevance |
| freshness | 0–8 | recent evidence and unresolved aging |
| confidence | 0–8 | confidence is support, not an instruction to interrupt |
| manual override | −25–25 | explicit person choice; pins map to +25 |

Snoozed, done, dropped, superseded, and suppressed loops are ineligible for
attention/notifications regardless of score. The score is not an LLM output.

## APIs and clients

`GET /loops` orders by `priority_score DESC`, then latest evidence. The mobile
direct-Supabase query must use the same ordering. `PATCH /loops/:id` accepts a
bounded priority override and requester correction; user edits create a
`user_edit` event. The detail endpoint returns the breakdown and renders a
plain-language “why this is high priority” explanation.

The list row is title, one-line state summary, ownership/requester state,
conversation, and deadline separated by a single divider. Home asks the same
query for the top five eligible loops; it never duplicates the full list.

## Delivery sequence

1. Ship this migration, pure scorer, writes, and tests.
2. Extend strict extraction output with requester/requester name and map names
   to contact identities. Re-evaluate historical loops with the guarded runner.
3. Add user preference tables and correction controls.
4. Redesign list/detail and Home against the persisted score.
5. Add a threshold/digest notification worker after ranking telemetry proves
   the queue is useful. It delivers score changes; it does not call an LLM.

## Safety and observability

No score is permitted to override snooze, mute, completion, or a human
correction. The scorer is unit-tested at deadline boundaries and score bands.
Score changes are recorded in loop events with the breakdown, never message
content. Metrics track score distribution, correction rate, dismissals, and
notification opens—not private conversation text.
