# Claire proactive recovery and loop lifecycle plan

Status: proposed implementation plan, September 22, 2026.

This plan covers the [production audit](/Users/luc/Projects/claire/docs/architecture/CLAIRE_PROACTIVE_AUDIT_2026-09-22.md) and a subsequent investigation of loop closure. The production numbers in that audit are a timestamped snapshot; refresh them before recovery. The closure investigation checked local revision `bb5566c2`. This document does not indicate that any fix has shipped or production settings have changed.

## Outcome

Claire continuously maintains the obligations and unanswered requests in eligible conversations, tells the user who needs attention and why, and stops reminding when there is reliable evidence that the obligation ended. Silence remains a reason to review or follow up. It does not establish completion.

The first recovery milestone is useful, bounded reminders on the personal account, with dependable processing and conservative closure. Broader release follows demonstrated lifecycle accuracy, delivery recovery, and several days of real usage.

## Additional closure findings

The following are implementation defects or missing guards. They establish possible failure paths, not the frequency of mistaken closures in production. Six paths were exercised with the real policy/store/hygiene functions and synthetic storage in [the reproduction](/Users/luc/Projects/claire/output/claire-proactive-audit-2026-09-22/closure-reproduction.ts); its [results](/Users/luc/Projects/claire/output/claire-proactive-audit-2026-09-22/closure-reproduction.json) contain no private conversation data.

| ID | Finding | Consequence and repair |
| --- | --- | --- |
| C1 | Ordinary updates accept `state=resolved` with confidence 0.4, zero citations, and auto-close disabled. Creates also accept resolved state while producing open/waiting status. | A loop can bypass close validation or be simultaneously active and resolved. Terminal transitions must go through one guarded command; forbid resolved state in ordinary create/update output. |
| C2 | Close validation checks that at least one citation exists and confidence is at least 0.75. It does not validate that the evidence fulfills this obligation. | A high-confidence “invoice paid” operation citing “Lunch on Wednesday works” is accepted. Require evidence relevant to the particular obligation and distinguish agreement from fulfillment. |
| C3 | `closeLoop` does not inspect user corrections; the update path protects only owner/requester/deadline fields. | A “keep open” decision can be overridden by auto-close. A stale worker can reopen a user-completed loop without clearing its completion fields. Add version checks and explicit human-decision precedence. |
| C4 | Every automated closure sets `status=done`, including cancellation, expiry, and supersession, and omits `completed_at`. The review endpoint likewise maps accepted cancellation to done. | Cancelled work appears in Completed. Normalize terminal outcomes and timestamps consistently. |
| C5 | Cleanup selects old proposed/negotiating loops, but its later update only rechecks live status. | A plan that becomes agreed after selection can still be expired. The synthetic interleaving reproduced this. Perform a conditional atomic transition against the selected version and evidence. |
| C6 | A single `user_edited` bit freezes all owner/deadline updates after any user edit, while leaving lifecycle changes unprotected. Re-reading old evidence clears `reviewed_at`. | Corrections both prevent useful updates and fail to protect the user’s intent. Track field-specific corrections and the evidence revision the user reviewed. |
| C7 | Completed/dismissed loops are absent from reconciliation context; duplicate protection covers only live rows. | A previously closed intent can be recreated from overlap/history. Preserve closure/dismissal identity and distinguish genuinely new requests from old evidence. |
| C8 | Close suggestions are unversioned events; later contradictory evidence does not invalidate them. The review endpoint records a supplied suggestion ID without validating that it is current and belongs to that loop. | An outdated suggestion can still close a changed obligation. Give proposals lifecycle/version/evidence identity and check it on acceptance. |
| C9 | Manual PATCH/reopen/snooze/delete do not consistently append lifecycle events. Detail retrieves the oldest 200 events, while the client looks there for the latest pending suggestion. | History can be incomplete and current suggestions missing or stale. Write events transactionally and return the current pending proposal independently of paginated history. |
| C10 | The “help close this” agent displays proposed updates but offers no apply action. | Users get advice without a direct way to accept that proposal. Add an explicit Apply action using the same validated mutation API, with current evidence visible. |

Primary sources: [extraction schemas](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-prompts.ts:43), [reconciler](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-reconciler.ts:154), [store](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-store.ts:152), [cleanup](/Users/luc/Projects/claire/apps/server/src/services/loops/loop-hygiene.ts:43), [review and mutations](/Users/luc/Projects/claire/apps/server/src/routes/loops.ts:405), [client suggestion selection](/Users/luc/Projects/claire/apps/client/services/loop-review.ts:23), [agent panel](/Users/luc/Projects/claire/apps/client/features/loops/loop-agent-panel.tsx:88).

The existing close test uses scheduling/confirmation text as the cited window and supplies “They met” as the model’s reason. It verifies a structural gate, not semantic evidence of fulfillment. The 73 existing relevant tests pass despite the reproduced paths.

## Closure behavior to implement

An obligation needs a completion condition as well as a subject. “Arrange lunch,” “attend lunch,” “send the document,” and “receive approval of the document” have different completion conditions.

| Evidence or user action | Claire’s behavior |
| --- | --- |
| Clear, current evidence that the specific obligation was fulfilled | Automatically close as fulfilled when validated; show the supporting evidence and offer Undo. |
| “Tuesday works” for arranging a meeting | Complete the scheduling obligation if arrangements are settled; retain a separate attendance obligation only if one is actually relevant. Never claim the meeting already happened. |
| A relevant question receives a substantive answer | Close the answer-needed obligation, while retaining any distinct task created by that answer. |
| Draft prepared, outgoing message queued, send failed, “I’ll do it,” “working on it,” or acknowledgement | Record progress; do not count it as fulfilled work. A send-based completion needs a successful send, not an optimistic local row. |
| Only part of a commitment is fulfilled | Update progress or split remaining obligations with a relationship to the original. Do not close the whole commitment. |
| Explicit cancellation / a replacement commitment | Close as cancelled or superseded; link the replacement when known. Keep it out of Completed. |
| Ambiguous “done,” unrelated completion, quoted speech, negation, conflicting evidence, or third-party claim | Keep active and offer a grounded “Looks resolved?” proposal when useful. New evidence invalidates stale proposals. |
| Deadline passes or conversation becomes quiet | Schedule a review or follow-up. Do not infer success or cancel agreed work. |
| Vague unconfirmed plan gets old | Move it to a quiet/dormant attention state, preserving the obligation and history. Offer a bounded review rather than automatically treating silence as expiry. |
| A genuinely time-limited opportunity ends | Expiry may be appropriate when its completion condition is no longer possible; record that reason and distinguish it from fulfillment. |
| User chooses Done / Dismiss / Keep open / Snooze / Undo | Apply immediately and consistently across devices. The same or older evidence cannot reverse that choice. Later evidence can justify a new proposal or a validated transition. |

Automated closure should remain part of the product. Requiring confirmation for every obvious completion would shift maintenance back onto the user. During recovery, start inferred closures in proposal/shadow mode; enable automatic fulfillment for validated cases after the new guards and evaluations pass. Raising a confidence threshold alone is not sufficient.

## Data and mutation contract

Keep existing statuses for compatibility, but define one canonical mapping:

- Active: open/waiting, or snoozed as a presentation deferral. `thread_state` cannot be resolved; no terminal resolution/timestamps.
- Fulfilled: done + resolved + fulfilled; both completion and resolution timestamps set.
- Cancelled/dismissed/false positive/explicitly expired: dropped + resolved + the actual reason; resolution timestamp set, completion timestamp null.
- Replaced/merged: superseded + resolved + the actual reason; relationship to the surviving/replacement loop where applicable; never counted as completed work.
- Reopen: explicit transition restoring the correct owner-derived workflow, clearing terminal fields and obsolete snooze state, writing a reopened event, and scheduling review.

Introduce an atomic `applyLoopTransition` service backed by a transaction/RPC. All detector, API, cleanup, notification-action, and agent-proposal writes must use it. It validates tenant, expected row version, current lifecycle, evidence, user corrections, and operation idempotency. It writes the row, event, priority changes, and reminder invalidation together. Zero matched rows is a conflict, not success.

Use a row version distinct from the reminder revision. Track meaningful evidence revisions so overlap does not look like new progress. Store the user’s reviewed evidence version and field-level corrections; do not keep the broad `user_edited` behavior as the permanent authority model. Resolve simultaneous or conflicting model operations against the current row rather than blindly applying separate create/update/close buckets.

Store close proposals with loop/version, proposed outcome, all supporting message IDs, evidence revision, reason, and pending/accepted/rejected/invalidated state. Validate proposal identity at acceptance. Keep closure/dismissal memory long enough to prevent historical replay from resurrecting old intents while allowing a genuinely new request to become a new episode.

Add cross-field database constraints after existing contradictions have been assessed and repaired. Do not silently convert every old active/resolved row to done: that would turn existing uncertainty into fabricated completion.

## Ordered implementation work

Each work package is intended to produce a reviewable change with the listed exit evidence. The dependency order is about correctness, not simply turning switches on quickly.

### 0. Baseline, settings, and recovery controls

Refresh deployment SHA, schema migrations, account flags, devices, queue state, cursor lag, and reminder backlog. Ensure PR #263’s server-backed switch is integrated wherever missing and is included in the actual native build/OTA. Keep settings failures visible and preserve per-account choices.

Add independently controlled modes for detection/reconciliation, proposed versus automatic terminal transitions, and notification delivery. A shadow run must not mutate live lifecycle or emit notifications. Preserve pending work when changing modes. Expose a small diagnostic view: last processed message, last successful reconciliation, next review, and why notifications are quiet.

**Exit:** the native switch and server agree after relaunch/account changes; mode changes behave as advertised; a read-only baseline can be reproduced. Do not re-enable mass processing before packages 1, 2, and 4 prevent unsafe transitions and lost work.

### 1. Make loop lifecycle transitions safe

Implement the canonical mutation contract and repair C1–C9’s backend paths. Remove terminal states from ordinary model updates/creates. Validate completion evidence against the obligation; protect decisions against stale evidence and races. Replace blanket stale-proposal expiry with dormant/review behavior; any retained expiry path uses atomic eligibility checks. Normalize cancellation/replacement outcomes, reopening, and event history.

Main areas: loop schemas/reconciler/store/detector/hygiene, loop routes, migrations, notification actions.

**Exit:** all six audit reproductions become regression tests that reject the unsafe behavior. Real database tests prove atomicity, tenant isolation, version conflicts, and idempotency. Human completion wins against an in-flight worker; the same rejected close suggestion cannot return from overlap alone. No active/resolved or done/cancelled combination can be newly written.

### 2. Make detection durable and restart-safe

Replace the permanent retained conversation job ID with a durable per-chat dirty generation and claimed processing watermark. Preserve the first-pending time outside process memory for the debounce cap. New messages during an active run guarantee a trailing run. Start consumers at server/worker boot; propagate retryable failures; persist failed work with a recoverable retry schedule.

Advance a cursor only after all required operations are durably applied or explicitly rejected by policy. Use a stable ingestion watermark, not timestamp-only comparison. A catch-up sweeper detects messages beyond the watermark even after crashes, disabled periods, or failed scheduling. Snapshot applicable AI scope in neither the payload nor the past: recheck current account/chat permissions when processing.

**Exit:** two separated bursts and a message during an active pass all reconcile. Restart, model outage, DB failure, concurrent producers, and retained failed jobs cannot lose the next pass. Catch-up is bounded, fair across accounts, and observable.

### 3. Improve detection coverage and completion recall

Process bounded windows chronologically, preserving overlap without discarding older unprocessed text at the character cap. Handle late messages, edits/deletions, and actual platform threads. Retrieve older relevant active loops and recently closed/dismissed intents instead of only the latest 20 live rows.

Expand the gate for multilingual and implicit requests, with an uncertainty fallback and measured cost budget. Distinguish scheduling, attendance, sending, answering, and approval in extraction. Sort evidence by actual chronology and preserve monotonic activity markers. Define absent versus explicitly cleared fields so a summary update cannot erase a deadline through required nullable JSON fields. Historical relative dates must be interpreted relative to the message context.

**Exit:** a corpus spanning English/Spanish/French requests, unrelated “done,” partial completion, rescheduling, repeated requests, and long/busy conversations passes end-to-end extraction/reconciliation evaluation. Historical replay cannot recreate dismissed obligations or skip over a budget-truncated slice.

### 4. Make notification delivery recoverable

Use durable delivery rows as an outbox with leases, attempt state, and a publisher/sweeper. Recover database-insert/Redis-enqueue gaps. Treat no-device as a deferral that can re-enter delivery after registration. Distinguish queued, submitted, provider accepted, permanently failed, suppressed, and acknowledged; stop calling enqueue acceptance “reminder sent.”

Use an attention episode plus device identity for delivery dedupe. Recheck current loop version, preference, device validity, snooze, and timing when a delayed job executes. Isolate one bad row from the rest of the polling cycle. Keep worker startup/recovery independent from new user messages.

**Exit:** the audit enqueue-gap reproduction is fixed. Failure injection before/after each boundary, expired lease, restart, token rotation, preference changes during quiet hours, and no-device-then-registration recover without duplicate pushes or invisible loss. Provider receipts and device display remain separate claims.

### 5. Add continuous follow-up review and shared priority

Introduce `next_review_at`, review reason, next-action kind, response/waiting anchor, last meaningful activity, and user acknowledgement/cooldown state. Keep explicit deadlines separate. New messages and periodic due reviews call the same attention policy. Most time-only reviews should not require another model call.

Recompute priority on semantic changes and due review, including owner changes, aging, manual importance, and snooze expiry. Use the same ordering in API, mobile, desktop, and notifications. Set the next review after a reminder rather than leaving the obligation permanently sent/quiet. Retain quiet-with-a-reason as a legitimate outcome.

**Proposed initial defaults for dogfooding:** review unanswered direct requests after roughly one local day and waiting-on-them obligations after roughly two, with immediate escalation only for explicit urgency/deadlines. Respect weekend/quiet-hour preferences and explicit dates; learn or customize timing later. These are review opportunities, not guaranteed pushes or invented commitments.

**Exit:** an undated request generates a useful decision without another incoming message; a reply cancels the pending nudge; waiting-on-them receives the correct next action; keep-open and snooze produce bounded future review. Virtual-clock tests cover several days and timezones.

### 6. Deliver a bounded, explainable attention experience

Persist attention items independently of pushes: who, what, why now, supporting messages, suggested next step, next review, and any suppression reason. The app and push read the same decision. Fetch the current close proposal directly; paginate history separately. Distinguish Completed, Cancelled, Dismissed, and Replaced in the UI. Add Apply/Undo actions for validated agent proposals and retain evidence links.

Implement atomic per-user budgets across workers, a digest, coalescing by obligation/conversation, and cooldowns. Proposed dogfood default: one digest of up to three useful items, with at most two additional standalone reminders per day; explicit user-requested snoozes/reminders follow a separately defined policy. Keep overflow visible in the attention list and schedule later review rather than dropping it. Instrument opens/actions without claiming that a provider receipt means a banner was viewed.

**Exit:** 500 due loops yield the configured bounded output, including under concurrent workers. Every interruption has an understandable reason. Dismiss/Done/Snooze/Undo work in the iOS app and Electron where supported. A disabled or unhealthy subsystem is distinguishable from “nothing needs your attention.”

### 7. Recover the personal backlog deliberately

Run a dry-run plan over a bounded recent set of eligible chats. Report proposed creates, progress changes, evidence-backed fulfillment, cancellation, duplicate merges, conflicts, and unresolved uncertainty. Validate subsequent messages for old obligations; do not use the audit’s 30-day age as a completion rule. Preserve original IDs/history and record recovery operation IDs and before/after versions.

Repair contradictory fields only when the recorded events/evidence settle the outcome. Route uncertain cases to review. Apply gradually after lifecycle/queue tests pass; keep automatic inferred closure conservative initially. Seed review times gradually and publish a digest under the budget. Broaden history in batches after the first cohort’s decisions are useful.

**Exit:** intended account detection is enabled and stays enabled; new traffic and catch-up both reconcile; no unreviewed notification burst; unresolved old work is either actionable, scheduled for review, deliberately quiet, or explicitly resolved. A rollback can revert recovery changes only when the row still has the recovery version, preserving later user actions.

### 8. Prove release readiness and roll out

Add a lifecycle scenario suite exercising the actual extraction, transition, review, and delivery boundaries. Unit tests alone are insufficient. Fix the client notification-response test harness that failed on Flow imports in the audit. Use synthetic tenants and the dedicated [Lucas two-device test loop](/Users/luc/Projects/claire/docs/testing/lucas-two-device-test-spec.md); do not send test traffic through personal conversations.

Verify the shipping surfaces: iOS Simulator for native lifecycle/actions, a physical TestFlight iPhone for real push/background/cold-start behavior, and Electron for desktop behavior. Desktop background APNs requires its own provider configuration and helper validation; an iPhone success is not desktop proof.

**Proposed release gates:**

- Zero known wrong closures in the mandatory adversarial/race fixtures; evaluate fulfilled/cancelled/superseded independently on a held-out labelled corpus. Target at least 99% precision for enabled automatic closure cases, and report sample size/uncertainty rather than claiming a guarantee.
- Every failure-injection scenario recovers without lost work; successful repeated delivery attempts produce one user-facing notification episode per device.
- No silent cursor gaps or violated lifecycle constraints after replay and restart tests.
- Due review lag and detection lag remain within declared service targets; initial targets: a settled chat handled within the three-minute debounce cap plus bounded processing time, and due reviews normally handled within five minutes when dependencies are healthy.
- Bounded notifications, accurate cancellation of stale reminders, and successful actions after cold start on the real iPhone.
- At least 48 hours of initial personal-account observation, followed by approximately a week of useful dogfooding before expanding invitations. Review false positives, missed obligations, and notification usefulness; elapsed time alone is not a release criterion.

Instrument disabled detection, cursor lag, review lag, lifecycle conflicts, rejected close proposals, repeated suggestions, outbox age, delivery failures, no-device deferrals, budgets, and user corrections. Define alerts for stuck work even when there are zero provider failures. Roll out per account with independent controls to pause automatic closure or outbound notifications while retaining diagnostic/recovery state.

## Dependencies and scope

Package 0 establishes the baseline. Packages 1, 2, and 4 are the first repair tranche. Package 3 makes catch-up trustworthy; packages 5 and 6 supply the missing proactive product behavior. Package 7 depends on lifecycle safety, durable processing, coverage, and notification limits. Package 8’s test infrastructure should be built alongside each package, with its final native/soak gates before broader release.

All seven categories of the original audit are covered: settings (0), queue defects (2), undated reminders (5), time-based review/priority (5), persistence/delivery recovery (1/2/4), detection coverage (3), and floods/observability (6/8). The new closure findings are covered by 1, 3, and 6. No production enablement or application-code implementation was performed while writing this plan.

The smallest trustworthy recovery is **settings + lifecycle safety + durable detection/delivery + a bounded undated follow-up policy**. That should be the immediate milestone; backlog volume or raw notification counts should not be used as a proxy for progress.
