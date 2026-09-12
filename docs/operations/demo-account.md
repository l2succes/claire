# Demo accounts

A demo account carries invented conversations so a recorded product demo never
shows real messages. Claire's AI runs against it for real: loops, Ask Claire,
suggestions and group summaries are produced by the ordinary pipeline, and when
you message one of the fake people, that person answers in character.

It does **not** exercise the WhatsApp, Telegram or Instagram bridges. The
Connections screen shows the three platforms connected, but the sessions are
synthetic. Do not film the connect or QR flow on a demo account; everything
downstream of a connection is real.

## The gate

Two switches must agree. Neither alone does anything:

| Switch | Where | Meaning |
| --- | --- | --- |
| `DEMO_MODE_ENABLED=true` | server environment | this deployment allows demo behaviour |
| `users.is_demo = true` | database row | this account is a demo account |

That is why the demo adapter can be wrapped around the production Matrix
adapter: with the flag unset, every call passes straight through, and with the
flag set, an account without the column is still an ordinary account. The
seeding routes under `/demo` return **404** — not 403 — to any caller that is
not itself a demo account, so the surface is invisible to real users.

## Prerequisites

1. Apply migration `20260912120000_add_demo_accounts.sql` to the target
   database, then reload the PostgREST schema cache — otherwise the new column
   is invisible to the API and seeding fails on `is_demo`:

   ```bash
   docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
   ```

   On a hosted Supabase, run the `NOTIFY` from the SQL editor instead.
2. Set `DEMO_MODE_ENABLED=true` on the API service.
3. Configure an AI provider on that service (`OPENAI_API_KEY`, or the Azure
   set). Without one the account still seeds and the personas still answer, but
   from a small set of fixed fallback lines — no suggestions, no Ask Claire, and
   no genuinely responsive replies.

Staging is already provisioned with `MOCK_BRIDGE=true`, which makes it the
natural home for a demo account: no bridge topology is involved either way.

## Seed an account

From the repository root, with the API running:

```bash
bun run demo:seed -- --email you+demo@example.com --api https://your-api-host
```

The script provisions the account (creates the auth user if needed, sets
`is_demo`, enables AI processing), then authenticates as that account and asks
the API to seed it. `--api` defaults to `http://localhost:3001`.

To wipe and re-seed between takes:

```bash
bun run demo:seed -- --email you+demo@example.com --api https://your-api-host --reset
```

Seeding is idempotent without `--reset`: platform message identifiers are
deterministic, and ingestion de-duplicates on them.

Loop detection and the Ask Claire index finish in the background. Give it a
minute, then check readiness:

```bash
curl -H "Authorization: Bearer <demo account token>" https://your-api-host/demo/status
```

## Signing in

Sign in on the client with the demo address and request an email code. Use an
address you control, and one that is **not** your real Claire account — the
demo flag changes how that account behaves, and a reset deletes all of its
conversation data. A `+demo` alias on your usual inbox is the easy answer. The session persists on the
device afterwards, so this is a once-before-filming step rather than a per-take
one.

## What is in the account

Nine invented people across WhatsApp, Telegram and Instagram; nine
conversations including two groups; 121 messages spread over the past three
weeks, with timestamps resolved relative to seed time so the inbox never looks
stale.

The script is written backwards from what is worth filming. `FILMABLE_SURFACES`
in `apps/server/src/demo/personas.ts` maps each demo beat to the conversation
that produces it — an overdue commitment, an unanswered question, a scheduling
decision to recall, a detail shared in one chat and asked about in another, a
group with an action item buried in banter. Editing the script without reading
that map is how a demo quietly loses a surface; the fixture tests in
`apps/server/src/demo/fixtures.test.ts` catch the mechanical half of that.

## Live replies

Messaging a persona schedules an in-character reply:

- A burst of messages gets **one** reply, to the last of them.
- Replies land after a short think time, occasionally as two bubbles.
- They arrive through the normal ingestion path, so they raise an unread badge
  and a push notification, and they feed loop detection and the Ask Claire
  index exactly as a real message would.
- If the model call fails or times out, the persona sends a fixed in-voice line
  instead. A demo should never stall mid-take.
- Replies are capped per account (24 per 10 minutes) so a stuck client cannot
  run up a provider bill.

Pacing is adjustable via `DemoResponderDelays` in
`apps/server/src/services/demo-responder.ts` if the default rhythm reads too
slowly on camera.

## Files

| Path | Role |
| --- | --- |
| `apps/server/src/demo/personas.ts` | the cast, their character sheets, and the scripted history |
| `apps/server/src/demo/fixtures.ts` | scripted lines → unified messages, chats, contacts, sessions |
| `apps/server/src/demo/demo-accounts.ts` | the two-switch gate |
| `apps/server/src/demo/unread.ts` | unread derivation after a backfill replay |
| `apps/server/src/adapters/demo/index.ts` | decorator over the real platform adapter |
| `apps/server/src/services/demo-responder.ts` | in-character reply generation |
| `apps/server/src/routes/demo.ts` | seed, reset and status, demo-accounts only |
| `apps/server/src/scripts/seed-demo.ts` | account provisioning CLI |
