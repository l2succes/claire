# Proactive follow-up recovery

## Implemented behavior

- Message inserts, meaningful edits and deletions create durable per-chat work in the same PostgreSQL transaction. Generations serialize within a chat, including late arrivals; workers start at boot, lease work, retry failures and preserve traffic arriving during a pass. Redis job retention no longer decides whether detection runs.
- Extraction consumes the oldest pending message window. The character budget never acknowledges only a prefix of a message: one oversized message runs alone, and provider-limit failures remain visible, retryable work. Native thread identifiers are included in the transcript. English keyword patterns no longer veto other languages, implicit requests or new intent after empty windows.
- An extraction/write failure cannot advance the cursor. Cursor updates are monotonic. Detection honors account AI, chat AI, sensitivity and the detection switch. Disabled scopes keep their backlog pending.
- User mutations and detector updates use one transactional, versioned transition RPC. Creation and transitions have atomic timeline events. Existing corrections are preserved by field. Every autonomous close becomes an evidenced, versioned proposal; elapsed time does not close anything. Cancellation, dismissal and expiry are distinct from fulfillment. Reopening clears terminal metadata, and terminal loops must be reopened before snoozing.
- Undated obligations receive a review time (24 hours for your next action, 48 hours when waiting on someone else), without inventing a deadline. Reviews and accepted reminders defer the next interruption. Unreviewed history older than 30 days stays in the review queue. Priority is recomputed when planning.
- Loop pushes use a database outbox, expiring delivery leases, current device tokens, execution-time settings/quiet-hour/snooze/version checks, bounded provider retries and receipt recovery. Enqueue is recorded separately from provider acceptance. Provider acceptance does **not** prove a visible notification banner.
- One daily digest contains at most three ordinary follow-ups. Two additional automatic standalone episodes are allowed per account calendar day (account timezone; UTC fallback). Atomic episode claims prevent a digest item also being sent as a standalone episode. Explicit snoozes are outside this automatic budget. Additional work remains in the persisted attention queue.
- `/loops/attention` powers the app's review queue. `/loops/health` reports effective controls, device count, dirty-chat age, errors and delivery outcomes. The Loops screen explains common blocking settings. Suggested edits have versioned Apply/Undo; stale closure proposals are hidden. Dismissed and cancelled loops can be reopened from Closed. Digest taps open Loops and expose no bulk completion action.

## Rollout order

1. Snapshot database/worker metrics and back up the database. Record `/loops/health` for the canary account. Check its detection, AI and notification preferences; deploying code must not silently override those choices.
2. Stop the old API workers before applying the migration. In particular, don't run the old Bull detector alongside the new worker. Disable rollout pushes with `LOOP_NOTIFICATIONS_ENABLED=false`; keep `LOOP_DETECTION_MODE=off` during migration.
3. Apply `20260923000000_proactive_recovery.sql` through the normal migration runner, transactionally. Test against the complete staging schema first. Adding the message column and triggers takes locks; use a maintenance window appropriate to table size. The migration does not replay history, close loops or reset user preferences.
4. Deploy the server and client together. Use `LOOP_DETECTION_MODE=queue` for the canary. `LOOP_DETECTION_SHADOW=true` writes shadow creations and skips updates/closure proposals; it is an evaluation setting, not automatic promotion. Use shadow mode on staging data; shadow rows are not automatically promoted. Keep live account recovery in normal detection mode. The shipped automatic-closure policy is always **review required**; there is no confidence-only auto-close bypass.
5. Verify ingestion advances `chat_loop_work.generation`, detection advances `processed_generation` and `chat_loop_cursors.last_ingest_seq`, and another message arriving during detection receives a trailing pass. Kill/restart a worker and verify recovery. Test both disabled preferences and an opted-out group.
6. Generate and inspect a bounded recovery plan. Apply only its reviewed hash. It can select at most 20 chats and 200 messages per chat from a 1–30-day window; the default is 14 days. These are explicit coverage limits, not a claim to have scanned the whole account.
7. Enable `LOOP_NOTIFICATIONS_ENABLED=true` for a canary environment. On a physical TestFlight device, verify background delivery, foreground behavior, a cold-start digest tap, ordinary loop tap, Complete and Snooze, token refresh, quiet hours and re-registration after a no-device deferral. Use synthetic data and the dedicated two-device test boundary.
8. Soak for at least 48 hours, then a week across undated follow-ups and recurrence. Confirm one digest + two standalone episodes/day, no old-revision pushes, no false closures, and backlog age decreasing. Expand users only after those checks pass.

## Controlled historical replay

Run from `apps/server` with the intended environment's existing configuration. The command does not print message content or credentials. Keep plan files private; they contain account/message identifiers.

```sh
bun scripts/recover-proactive.ts --user USER_UUID --days 14 --output /secure/path/recovery.json
# Inspect detectionEnabled, chats/messageIds and review candidates. Copy the printed hash.
bun scripts/recover-proactive.ts --user USER_UUID --apply /secure/path/recovery.json --sha256 REVIEWED_SHA256
```

A plan expires after 24 hours. Apply checks the user, exact file hash, message ownership and per-chat generation and rejects an active lease or intervening traffic. The entire batch queues atomically; repeating the same applied plan is idempotent. Apply does not enable detection. Historical active/resolved inconsistencies and recent detector closures are reported for individual review rather than guessed into a new status.

Replay creates or updates normal evidence-backed loops through the same guarded worker. There is no blanket automatic data rollback: pause detection/pushes, inspect timeline events, and reverse individual decisions with versioned user actions. Do not drop the new schema during an incident or restore an old worker that bypasses it. Preserve the outbox and work rows for diagnosis.

## Validation

Local validation passed the full server suite (757 tests, plus 8 outbox cases in its isolated child process), 20 PostgreSQL integration tests in a separate disposable database run, 33 targeted client tests, and both TypeScript checks. The database tests are skipped by the ordinary server suite unless the dedicated test URL is supplied. Production deployment and physical push delivery are not included in those results.

Server checks (from `apps/server`):

```sh
bun test tests/services/loops tests/services/reminder-scheduler.test.ts tests/routes/loops.test.ts src/services/notification-delivery.test.ts
bun test tests/services/proactive-outbox.test.ts
bun test tests/routes/preferences.test.ts
bun run typecheck
```

The outbox suite automatically runs its regression cases in a child process because Bun module mocks are process-global, including when the full server suite runs. It covers token refresh, changed settings, completion while queued, snooze/budget deferral, provider failure, persistence failure and stale digest items.

PostgreSQL integration setup uses an **empty disposable local database named `claire_recovery_test`**, never `DATABASE_URL` or account data:

```sh
psql "$LOCAL_FIXTURE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/server/tests/integration/fixtures/proactive-recovery.sql \
  -f supabase/migrations/20260908120000_smart_loop_reminders.sql \
  -f supabase/migrations/20260915000001_add_loop_hygiene.sql \
  -f supabase/migrations/20260923000000_proactive_recovery.sql
CLAIRE_RECOVERY_TEST_DATABASE_URL="$LOCAL_FIXTURE_DATABASE_URL" bun test apps/server/tests/integration/proactive-recovery.test.ts
```

These tests exercise actual row/advisory locks, concurrent transitions, transaction rollback, lease recovery, monotonic cursors, policy re-registration, hash-plan replay, digest claims and RPC permissions. The fixture covers the relevant preceding schema and triggers; it does not substitute for applying the migration to the complete staging schema.

Client checks (from `apps/client`):

```sh
bunx jest --runInBand tests/loops.test.ts tests/loop-query-cache.test.ts tests/loops-api-auth.test.ts tests/notification-responses.test.ts tests/loop-row.test.tsx tests/loop-proposal.test.tsx
bun run typecheck
```

Native verification used the installed Claire development client on iPhone 17 Pro / iOS 26, running this checkout's Metro bundle. A temporary synthetic fixture exercised Apply at version 5 and Undo at version 6 with the real component and hook; the fixture was removed. No bridged message or real push was sent.

## Remaining release checks and limits

Physical push delivery, the complete staging migration and the multi-day soak are deployment gates. They have not been performed by a local test run. Production preferences, data and deployment are unchanged by this PR.

Automatic closure remains review-only until a separately evaluated semantic verifier meets the false-closure bar. Native thread roots are model context, not a guarantee of perfect semantic attribution. The active-loop prompt is bounded to 100 loops per chat, so unusually large conversations still require retrieval/evaluation work. Oversized individual messages can exceed the usual prompt budget and will surface a retryable error if a provider rejects them.

Ordinary incoming-message pushes retain their existing delivery path; the new recovery outbox is for proactive loop reminders and digests. Provider timeouts leave an unavoidable uncertainty about acceptance; stable collapse IDs reduce duplicate presentation but cannot provide exactly-once delivery across an external provider.
