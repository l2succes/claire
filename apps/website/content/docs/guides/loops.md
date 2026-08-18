---
title: How Loops work
description: Threads of intent, the relevance model, and how loops become actions.
status: current
audience: contributors
owner: maintainers
keywords: loops, relevance, detection, plugins
last-reviewed: 2026-08-17
---

# How Loops work

A **loop** is one thing you still owe someone, or that someone still owes you. It opens when a conversation creates an obligation, changes as the conversation changes, and closes when the conversation resolves it.

There is a visual walkthrough at [/mockups/loops](https://claire.chat/mockups/loops) — that page is the one to send to someone asking *what* loops are. This page is the contributor view of *how* they work.

## A loop is a thread, not a row

The old detector read one message at a time. A plan spread across six messages became up to six disconnected rows, none of which ever closed.

A loop now spans messages and carries state:

```
proposed → negotiating → pending_confirmation → agreed → resolved
```

Only `agreed` and later are actionable. "How about Tuesday?" opens a loop, but it stays out of your list and no plugin is offered until the conversation actually agrees — the rule the plugin spec states as *"How about Tuesday?" does not trigger; "Tuesday at 10 works — see you then" can.*

Status on the row itself is a separate, smaller vocabulary: `open`, `waiting`, `snoozed`, `done`, `dropped`, `superseded`. **Overdue is derived, never stored** — `status IN ('open','waiting') AND COALESCE(snoozed_until, deadline) < now()`.

## Relevance: does this concern the user?

The hard part is not finding commitments. It is knowing which are about *you*. In a group chat most are not.

`apps/server/src/services/loops/relevance.ts` scores every candidate. Three properties, each deliberate:

- **Deterministic.** No model call. It decides whether someone else's business becomes your loop, which is privacy-adjacent, so it must be auditable and must not change when the model provider changes.
- **Pure.** No I/O, so every branch is table-testable.
- **Explainable.** Every decision returns the signals that produced it, stored on the loop, so "why didn't Claire catch this?" has an answer.

Two **hard passes** bypass the threshold entirely: a 1:1 DM (nobody else it could concern) and the user having committed themselves (your own words bind you regardless of audience). `sensitivity: off` outranks both.

Key signals:

| Signal | Weight | Note |
|---|---|---|
| `mention_exact` | +0.45 | Structured `m.mentions` preferred; text matching is a fallback |
| `reply_to_me` | +0.40 | Requires persisted reply metadata |
| `named_other` | **−0.55** | The most important suppressor: the work is explicitly someone else's |
| `broadcast_mention` | −0.35 | `@channel` addresses everyone, so it addresses no one in particular |

Thresholds come from the chat's sensitivity (`off` / `low` / `normal` / `high`). Group chats default to `normal`; channel platforms like Slack default to `low`, so users opt channels in rather than opting a firehose out.

## Platform differences are data, not branches

The pipeline contains no `if (platform === 'slack')`. Every difference lives in `loopSemantics` on `PlatformDefinition` in `packages/platform-catalog`:

- **Mentions render differently.** WhatsApp writes the phone number, Telegram a handle, Slack a display name. Text matching works on Telegram, **fails outright on WhatsApp**, and is fragile on Slack — which is why structured mentions are the real mechanism.
- **Broadcast tokens** vary (`@channel`, `@here`, `@everyone`) and are a *negative* signal.
- **Self-identity is per-workspace on Slack**, so it is keyed `(userId, platform, accountRef)`.
- **Threading** differs: Slack and Discord partition a channel; WhatsApp and Telegram only have replies.

Platforms absent from the table get safe defaults, so adding a bridge never requires editing detection logic.

## Testing it

```bash
bun run eval:loops                                  # report
cd apps/server && bun run eval:loops --show-passing # every scenario
cd apps/server && bun test                          # eval runs here too
```

The eval needs no database, network, or API key — the relevance stage is deterministic, so a failure is always a real regression rather than model variance.

Three corpora in `apps/server/src/services/loops/eval/`:

| | Purpose |
|---|---|
| `HAND_AUTHORED` | Acceptance criteria, each stating why it matters |
| `ADVERSARIAL` | Conflicting signals and messy language |
| `generateScenarios` | Seeded breadth across platform × group size × mention style |

**`knownLimitation` is the mechanism that keeps this honest.** Cases deterministic scoring cannot resolve — quoted commitments, jokes, first-name collisions — are marked with a written reason. They are reported but do not fail the build, *and an unexpected pass is also reported*, since that means the limitation is gone and the case should be promoted to an enforced expectation. Those marked cases are the requirements list for the model-backed extraction stage.

Release gates: group-suppression accuracy ≥ 0.90, precision ≥ 0.85, recall ≥ 0.70. False positives are weighted harder than misses throughout — a wrong loop erodes trust in every other loop.

## Loops and plugins

Bidirectional. A loop reaching `agreed` emits `loop.detected`, and a plugin may **propose** an action; only a person approves it. Plugins can also open loops (a calendar plugin seeing an unanswered invite).

A plugin receives the **structured loop only** — title, owner, deadline, participant display names — never raw message text unless the capability declares it and the user grants it. Every action writes a receipt. See [Plugin development](./plugins.md) and `docs/CLAIRE_PLUGIN_SYSTEM_SPEC.md`.

## Where the code lives

| Path | What |
|---|---|
| `apps/server/src/services/loops/relevance.ts` | Signal scoring and thresholds |
| `apps/server/src/services/loops/eval/` | Scenario types, generator, runner |
| `apps/server/scripts/eval-loops.ts` | Eval CLI |
| `apps/server/src/routes/loops.ts` | REST API |
| `packages/platform-catalog/src/loop-semantics.ts` | Per-platform behavior |
| `supabase/migrations/20260817020*` | Schema |

## Not built yet

The windowed detection pipeline, the loop details page, the agent layer, and the plugin runtime are specified in `docs/LOOPS_REVAMP_PLAN.md` but not implemented. Detection ships behind `LOOP_DETECTION_MODE=off` until the eval measures it against a real corpus.
