# Claire’s proactive follow-up system: implementation and production audit

Investigated September 22, 2026. Production observations were taken around 23:30–23:35 UTC. Production access was read-only; no account preferences, conversations, queues, or deployments were changed. Synthetic experiments used disposable local infrastructure or mocks.

## Finding

Claire has a substantial loop extraction, reconciliation, and notification implementation, but it does not yet provide a dependable ongoing follow-up service. There are three distinct causes of the current experience:

1. **The main account has detection disabled on the server.** Notifications are enabled, but new messages cannot create or reconcile loops when `user_preferences.loop_detection_enabled = false`.
2. **The reminder policy excludes most of the existing backlog.** Undated loops usually become permanently quiet, and a reminder is generally a single interruption per semantic revision. Passing time and an unanswered conversation do not themselves create another review.
3. **Queue and persistence defects can silently lose subsequent work.** In particular, completed detection jobs retain the same IDs needed by later messages. These defects remain even after enabling detection.

The recorded iPhone push transport is working. The evidence points mainly to missing or stale decisions upstream of delivery. Provider acceptance is not proof that iOS displayed a banner or that the person saw it.

## Observed production state

The main account is the existing personal account with the large message history and registered iPhone. Two other matching accounts were inspected only to distinguish the personal account from an empty account and a demo account.

| Check | Observation | Meaning |
| --- | --- | --- |
| Global detection mode | `queue` | Production has the feature enabled globally. |
| Personal account detection | `false` | The detector’s account gate skips new work. |
| Notification preferences | Master on; loop alerts on; message alerts on; quiet hours off | The notification switches are not the immediate blocker. |
| Device | One enabled iOS Expo registration, Mexico City timezone | A delivery target exists. |
| Total loops | 1,536, all detector-originated | There is a substantial historical backlog. |
| Active, surfaced loops | 741 | This is the visible unfinished backlog. |
| Active without a deadline | 571; all 571 have quiet reminder plans | About 77% of the active backlog has no scheduled interruption. |
| Remaining plans | 153 sent, 17 scheduled | No active plan was due at the observation time. |
| Active overdue loops | 153 | Being overdue does not cause another reminder after the revision is marked sent. |
| Active loops without evidence for 30 days | 691 | Most of the backlog needs current-evidence revalidation. This does not mean those obligations are completed. |
| Active loops with `thread_state=resolved` | 11 | Lifecycle fields can disagree. |
| Latest loop detection timestamp on personal-account rows | September 12 | The loop rows have not been receiving current reconciliation. |
| Recent cursor outcomes | 37 `detection_disabled` | The disabled setting is actually being encountered by workers. |
| Eligible chats ahead of their recorded cursor | 99 of 200 eligible chats | There is substantial catch-up work; this alone does not distinguish skipped backfill from missed live processing. |
| Recorded loop deliveries | 162; all `delivered`, one provider attempt each | These have successful provider receipts, not device-display acknowledgements. |
| Loop deliveries by UTC date | September 15: 160; September 16: 1; September 17: 1 | No new loop delivery was recorded after September 17 at the observation time. |
| Largest one-minute loop batch | 81 | There is no effective per-user interruption budget. |
| Latest 1,000 delivery rows | All ordinary messages: 998 delivered, 1 submitted, 1 suppressed for active chat | Recent ordinary-message push is functioning. This is a bounded sample, not all 11,662 historical deliveries. |
| Detection queue | 100 retained completed jobs, no active/waiting/delayed jobs | The retention setting involved in the reproduction is present in production. |
| Personal-account retained detection jobs | 55; 31 belong to eligible chats ahead of their cursor | The queue-ID defect applies to real pending catch-up candidates, not only a hypothetical deployment. |

The preference row was last updated September 15. That timestamp does **not** establish who changed the detection switch, why, or when that particular field changed.

Production’s observed deployment was `177528f5` / PR #263, “back the Loop detection switch with the server preference,” deployed during this investigation. The local working checkout was `a72bac12` plus pre-existing edits. The core loop detector, queue, store, and reminder scheduler matched that deployed revision. Differences in notification delivery concern incoming-message artwork; the loop enqueue path under review is unchanged.

PR #263 already fixes the old control mismatch: the Settings switch previously wrote only AsyncStorage while the server read a database column. The local checkout still contains that old client store and lacks the new API preference field. Preserve the production fix during integration. The presence of the API deployment does not establish that the installed TestFlight build or OTA bundle contains the matching client fix. Device metadata only reports version `1.0.0`.

## What is implemented

The active path is:

```text
Bridge message saved
  → account AI / chat scope / non-backfill checks
  → per-chat Bull debounce (45 seconds, 180-second cap)
  → context: recent messages + existing loops + participant identity
  → deterministic gate
  → one structured AI extraction/reconciliation call
  → relevance and confidence guards
  → loop rows, evidence, participants, events, detection cursor
  → database trigger invalidates reminder plan after selected changes
  → scheduler every 60 seconds
  → deterministic reminder time
  → reminder queue
  → per-device notification delivery row and queue
  → Expo/APNs submission and Expo receipt checks
  → native notification actions: open, done, snooze
```

There is real work worth retaining: direction of responsibility and requester, evidence-backed closing, confidence/relevance filtering, per-chat AI scope, snoozes, revision checks that suppress stale deliveries, device registration/retries, timezone and quiet-hour handling, and native notification actions.

The loop-scoped agent is different from this pipeline. `runLoopAgent` is invoked by `POST /loops/:id/agent/messages` after the user asks a question. It reads context and proposes a reply or loop change. It is not scheduled to inspect all conversations, determine who needs attention, or notify the user. The conversation assistant also has no ongoing follow-up scheduler.

## Release blockers and repairs

### 1. Detection control is disconnected from the user’s experience

**Confirmed production cause.** The account-level flag is off. The old UI could display on because its value lived only in local storage. PR #263 addresses that mismatch, but does not automatically turn an existing server-side off into on.

Sources: [old client preference store](/Users/luc/Projects/claire/apps/client/stores/chatPreferencesStore.ts:61), [detector context](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-context.ts:219), [gate](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-gate.ts:156), and deployed commit `177528f5`.

**Repair:** ship/verify the server-backed switch on the actual client, preserve its explicit user choice, and expose detection health separately from notification permission. As part of a deliberate recovery, enable this account and schedule bounded catch-up. Enabling the switch alone is insufficient: skipped windows advance cursors, retained queue jobs can block re-runs, and historical messages are excluded from live scheduling.

### 2. A conversation can stop being reconciled after its first queued pass

**Reproduced defect.** `jobId` is permanently `loop:<user>:<chat>`. Completed jobs are retained with `removeOnComplete: 100`; failed jobs are retained too. Rescheduling removes only waiting/delayed jobs. Bull returns the existing ID without inserting work when that ID still exists. Messages arriving during an active pass also have no durable guarantee of a trailing pass.

Sources: [queue retention and processor](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-queue.ts:53), [rescheduling](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-queue.ts:118), installed Bull `addJob-6.lua`’s existing-key branch.

The isolated experiment submitted versions 1 and 2 of one synthetic conversation. The worker ran once; the stored payload remained version 1 and the job stayed completed. Production retains 55 completed jobs for the personal account.

**Repair:** use durable per-chat dirty state/generations, atomic claiming, and distinct work IDs. A running pass must arrange another pass when new evidence arrives. Removing completed jobs immediately can address one symptom, but does not by itself fix the active-job race, multiple producers, restart recovery, or the in-memory debounce cap. Start consumers explicitly on boot and add periodic reconciliation of unprocessed messages.

### 3. Undated follow-ups are excluded by design

**Confirmed policy gap and production cause.** The policy requires a deadline, a snooze, or an owned-loop score of at least 80. An undated owned loop has a maximum natural score of **55** without a manual override. Waiting-on-them loops without deadlines are quiet even with a high supplied score. Proposed/negotiating loops are also quiet, even when the user’s next action should be to answer or clarify.

Sources: [reminder policy](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-reminder-policy.ts:90), [priority calculation](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-priority.ts:24).

**Repair:** distinguish an explicit deadline from the time Claire should next review an unresolved thread. Add `next_review_at`, last meaningful inbound/outbound activity, next action, and why a follow-up is appropriate. An undated request can merit a reminder after a response window without inventing a deadline. Support both “you owe a reply” and “you are waiting for someone.” Respect chat scope and explicit user preferences.

### 4. Passing time does not keep the attention list current

**Confirmed architectural gap.** Only pending plans are recomputed. Sent/quiet plans are not revisited because a conversation remains unanswered. The database trigger invalidates plans for selected semantic changes, not for elapsed time. Priority is calculated during detection creation, but the current update/store, manual API writes, and scheduler do not recompute it. There is no periodic aging/ranking pass.

Sources: [pending-plan refresh](/Users/luc/Projects/claire/apps/server/src/services/reminder-scheduler.ts:116), [invalidation trigger](/Users/luc/Projects/claire/supabase/migrations/20260908120000_smart_loop_reminders.sql:22), [update persistence](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-store.ts:152).

The API lists loops by creation time while the mobile direct query uses persisted priority. Legacy manual `priority` is separate from the newer numerical score/override. Thus even the surfaces do not share a fully implemented attention contract.

**Repair:** one shared attention policy for the client and notifications; recompute after relevant writes and on scheduled review. Separate semantic revision from review/notification episode so a legitimate later follow-up can occur without fabricating a loop edit. Record acknowledgement, snooze, dismissal, and resolution so repeated reminders are intentional and bounded.

### 5. Error handling can turn lost work into apparent success

**Confirmed code defects; not the observed cause of the 162 successful loop deliveries.**

- The detector returns `context_error` or `extraction_failed` rather than rejecting the Bull job. Bull therefore completes it instead of applying its configured retries. An unchanged cursor does not schedule its own retry.
- Individual persistence failures can be logged and skipped while the pass still advances its cursor. Processing needs an all-required-writes-success boundary or a durable per-operation checkpoint.
- Notification delivery inserts the database row before adding the Redis job. If the add fails, retry sees a duplicate database row, counts it as accepted, and never recreates the missing job.
- The reminder scheduler marks `sent` and records `reminder_sent` when enqueue reports acceptance, before provider completion.
- A no-device attempt moves the reminder six hours into the future but completes the retained job. The later poll reuses the same loop/revision ID, so the retry can be ignored. Replanning an unchanged revision after preference/device changes can hit the same collision.

Sources: [detector error handling](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-detector.ts:185), [cursor advancement](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-detector.ts:400), [delivery insertion/deduplication](/Users/luc/Projects/claire/apps/server/src/services/notification-delivery.ts:305), [reminder outcomes](/Users/luc/Projects/claire/apps/server/src/services/reminder-scheduler.ts:231).

A second isolated reproduction exercised the real delivery method with synthetic database/queue dependencies. Redis insertion failed after the row was created; retry reported `{ queued: 1, outcome: 'queued' }` while zero jobs existed.

**Repair:** make the database a recoverable outbox. Workers claim due records with leases and can republish queued-but-unsubmitted records. Distinguish planned, queued, submitted, provider-accepted, failed, and user-acknowledged states. Propagate retryable detection failures. Make no-device deferral and device re-registration explicit recovery transitions. Recheck current preferences/device eligibility before a delayed delivery executes.

### 6. Detection coverage is narrower than “knows what messages I received”

**Confirmed implementation limitations.**

- The free gate is predominantly English regexes. Synthetic Spanish and French equivalents of “Could you send the document tomorrow?” were skipped; the English request ran. “What do you think of the proposal?” was also skipped with no existing loop.
- Live context keeps the newest 40 text messages / 6,000 characters and advances to the newest retained message. A burst larger than the cap can permanently skip older unprocessed messages. Supplying historical batches still applies the character cap.
- The cursor comparison uses timestamp alone although a message ID is stored. Late-arriving or equal-timestamp messages need a stable ingestion/keyset strategy.
- Only 20 recent surfaced live loops enter reconciliation context. Older obligations can disappear from consideration in a busy chat. Thread-root metadata is read but the implementation does not perform the thread partitioning described in its comments.
- Backfilled messages do not automatically run live detection. The manual backfill script exists, but it is not a continuous recovery mechanism.

Sources: [gate](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-gate.ts:22), [window and cursor](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-context.ts:195), [ingestion scheduling](/Users/luc/Projects/claire/apps/server/src/index.ts:984), [backfill runner](/Users/luc/Projects/claire/apps/server/scripts/backfill-loops.ts:1).

**Repair:** consume bounded windows chronologically without skipping unprocessed messages; use durable ingestion order; retrieve older relevant loops; handle message edits/deletions and native threads; measure multilingual and implicit-request recall. Preserve the cheap gate where it demonstrably retains recall, with a fallback for uncertain actionable content. Do not solve this by sending the entire history to the model repeatedly.

### 7. The system can be silent or flood, with little explanation

**Observed product gap.** There is no per-user notification budget or digest policy. The scheduler can enqueue up to 500 due loops per poll. Production’s 81-reminder minute shows why “enable everything and replay history” is not an acceptable recovery.

The operations monitor declares notifications healthy when it finds no recent failed deliveries. Zero generated reminders can therefore look healthy. Current evaluations primarily test deterministic relevance with supplied model judgments; they do not demonstrate real extraction, sustained reconciliation, or delivery across days. The in-loop agent tests largely inspect source structure.

Sources: [due plan scan](/Users/luc/Projects/claire/apps/server/src/services/reminder-scheduler.ts:168), [notification health](/Users/luc/Projects/claire/apps/server/src/services/operations-monitor.ts:135), [evaluation runner](/Users/luc/Projects/claire/apps/server/src/services/loops/eval/runner.ts:49).

**Repair:** persist one attention decision with its evidence, next action, reason, timing, and suppression reason. Display that same decision in Claire and use it for push. Provide a small digest for nonurgent backlog, reserve immediate pushes for justified urgency, cap interruptions, and report detection lag, review lag, due-but-undelivered work, and failure recovery. Treat device receipt and a person seeing/acting on a reminder as separate measurements.

## Recommended delivery sequence

### A. Restore a trustworthy pipeline

1. Integrate the already-deployed preference fix into the working branch and verify the actual TestFlight client.
2. Fix queue generations/trailing runs and add explicit worker startup and retry recovery.
3. Make detection persistence and notification outbox recovery reliable; fix no-device re-entry.
4. Add observability that distinguishes detection disabled, no relevant loop, intentionally quiet, deferred, missing device, queued, failed, and provider accepted.
5. Restore the intended account setting during recovery, then reprocess a bounded set of recent eligible chats using current evidence. Preview the changes before applying bulk reconciliation. Never automatically mark old agreed commitments done simply because they are old.

### B. Implement the proactive attention policy

Add a lightweight scheduled reviewer for active obligations and unanswered requests. New messages and time-based reviews should converge on the same policy:

```text
New evidence or review time
  → reconcile the obligation against current conversation evidence
  → determine who owes the next action and whether it is still useful
  → recompute priority and next review time
  → create/update the user-visible attention item
  → choose immediate push, digest, deferral, or quiet with a reason
  → record delivery and the user’s response
```

The model extracts meaning and can suggest a grounded next step. Ordinary code owns scheduling, deduplication, budgets, preference enforcement, and delivery. A periodic review does not require a new model call if no new evidence needs interpretation.

Store explicit deadlines separately from review timing. Start with transparent configurable response windows and cooldowns, then adapt them using observed conversation patterns and user corrections. A reminder should say who, what, why now, and the useful next step—for example, “Maya is waiting for your feedback on the proposal”—with a link to supporting messages. Drafting a reply can remain an optional user action.

### C. Recover the backlog without another notification burst

Revalidate old surfaced loops against subsequent messages; consolidate duplicate intents and repair inconsistent lifecycle fields. Keep uncertain commitments open for review. Seed future review times gradually and offer a compact prioritized digest. Do not translate all 571 quiet loops into immediate pushes. Establish a per-user budget before historical replay can emit notifications.

### D. Gate release on the complete experience

Use the real native client and the dedicated Lucas two-device loop in [the test specification](/Users/luc/Projects/claire/docs/testing/lucas-two-device-test-spec.md), following its account and action boundaries. Validate TestFlight push display on a physical iPhone; the current notification registration code deliberately skips simulator registration.

Required scenarios:

1. Two separated bursts in the same chat both reconcile, including a new message arriving while the first pass is active.
2. An undated request becomes a useful follow-up at its review time, without another message arriving.
3. An undated obligation owed by the other person becomes a chase-up suggestion at an appropriate time.
4. A reply or explicit completion cancels the pending reminder; quiet-hour delay cannot deliver a stale decision.
5. Snooze, keep-open, done, dismissal, account switches, and notification preferences remain consistent across devices and restarts.
6. Provider outage, Redis interruption after outbox insertion, no-device then registration, and process restart recover without duplicates or lost work.
7. Large message bursts, multilingual requests, and older relevant obligations survive bounded processing.
8. Historical recovery produces a bounded digest rather than a notification storm.
9. A user can understand why Claire is quiet and distinguish that from Claire being unhealthy.

Measure extraction/closure quality against actual expected obligations, plus time-to-detection, time-to-review, notification usefulness, duplicates, and stale reminders. A passing relevance fixture suite or successful manual push is insufficient evidence for release.

## Validation performed and limits

- **203 server tests passed**, covering loop policy/relevance/reconciliation/prompts, scheduler, notification helpers/provider mapping, and loop routes.
- **23 client tests passed; one suite failed to load** because Bun encountered Flow `import typeof` in React Native while loading `notification-responses.test.ts`. Notification actions therefore have no passing runtime proof from this run.
- **Queue lifecycle defect reproduced** with the installed Bull library and disposable local Redis, using the production key/retention pattern.
- **Outbox enqueue gap reproduced** with the real delivery service and synthetic dependencies.
- **Undated score/policy and multilingual gate limitations reproduced** using the actual pure functions.
- **Read-only production verification** covered deployment/flags, the personal account’s preferences and device, loop metadata/cursors, all 162 loop delivery records, a bounded recent message-delivery sample, and queue metadata. No private message bodies were needed or copied into this report.
- No new end-to-end messages or pushes were sent, no native runtime was changed, and no production setting was enabled during the audit. OS notification presentation and the installed client’s exact bundle remain unverified.

Supporting local evidence is in [the audit output directory](/Users/luc/Projects/claire/output/claire-proactive-audit-2026-09-22). The source code itself was not changed by this investigation.

The follow-up [recovery and lifecycle plan](/Users/luc/Projects/claire/docs/architecture/CLAIRE_PROACTIVE_RECOVERY_PLAN.md) turns these findings into ordered implementation work and adds a deeper closure investigation, including six reproduced unsafe transition paths. Its production references use this audit snapshot; its additional findings are identified as code-level evidence rather than newly observed production incidents.
