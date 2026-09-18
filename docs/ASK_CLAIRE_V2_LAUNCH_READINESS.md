# Ask Claire v2 launch-readiness handoff

Last updated: 2026-09-15

This is the continuation point for Ask Claire v2. Use it to run the dogfood period, record what is not usable enough, and decide when the feature is ready to launch.

The complete product and architecture specification remains in [`apps/website/src/content/docs/product/ask-claire-v2.tsx`](../apps/website/src/content/docs/product/ask-claire-v2.tsx) and renders at `/docs/product/ask-claire-v2`. That document explains the intended system. This handoff tracks the state of the shipped implementation and the work still needed for launch.

## Current recommendation

Ask Claire v2 is ready for sustained internal use and a small TestFlight cohort. It is not yet ready for an unrestricted public launch.

The core interaction is present: grounded retrieval, streamed answers, citations, persisted threads, conversation navigation, provider-neutral AI SDK generation, batched indexing, and retry-safe request IDs. The remaining uncertainty is product quality under ordinary use: whether Claire consistently finds the right person, plan, or conversation; explains uncertainty well; recovers cleanly; and stays useful when the underlying contact facts are incomplete.

Do not add plugin writes to the launch scope. The current actions are intentionally read-only or inert navigation. Sending messages, booking meetings, and writing to calendars belong to the future durable proposal and approval system.

## What shipped

PR [#219](https://github.com/l2succes/claire/pull/219) delivered the Ask Claire v2 implementation and was merged on 2026-09-12.

- Ask Claire uses the shared AI SDK provider registry instead of a product-specific OpenAI path.
- Answers stream over the AI SDK UI data-stream protocol, with planning, reading, saving, completion, and error states.
- The client renders incremental answer text and can cancel an active request.
- Turns are persisted, and a stable request ID prevents a retry from creating a duplicate completed turn.
- Retrieval compiles structured query constraints, combines lexical and vector evidence, and expands results into useful message windows.
- Embedding backfill uses batching and handles changed content hashes.
- Citations and suggested actions are validated against retrieved evidence before display.
- Conversation-scoped Ask Claire keeps a strict chat boundary.
- The production migration `20260908000001_ask_claire_v2.sql` has been applied, and the production API was healthy at the last verification.

## What we have manually verified

The following flows passed in the iOS Simulator against the deployed backend:

- Person recall: finding the recently discussed Russian person and opening the cited conversation.
- Plan recall: identifying the Saturday plan and the person involved.
- People and location: returning candidates using relationship and location context when that data exists.
- Incremental streamed text, status transitions, citations, and opening a source conversation.
- Clean Markdown rendering, bounded citation labels, and usable mobile header layout after the follow-up fixes.

These checks prove the end-to-end path works. They are not enough to establish recall quality across a broad message history or day-to-day usability.

## Known boundaries and risks

| Area | Current boundary or risk | Launch treatment |
| --- | --- | --- |
| People and location | Results are limited by `contact_profiles` coverage. An old or missing location can make “still based in Brooklyn” incomplete or stale. | Show provenance and dates where possible; test stale, conflicting, and absent facts. |
| “Closest people” | Communication frequency is evidence of contact, not proof of emotional closeness. | Use explainable language and avoid presenting a score as a personal truth. |
| Ambiguous memory | Partial descriptors, similar names, and references to a person discussed inside someone else’s chat can produce several plausible matches. | Prefer a short ranked set with uncertainty over one confident guess. |
| Plans | A discussed plan is not necessarily confirmed and may have been changed or cancelled later. | Test complete conversation windows and label plan status. |
| Old assistant history | Previously stored answers may retain formatting or citation artifacts created before the fixes. | Judge new turns separately; decide whether old internal test threads should be hidden or deleted before launch. |
| Recovery | Cancellation exists, but real reconnect, background/resume, slow-network, and duplicate-submission behavior needs more device time. | Treat stuck streaming turns or duplicate replies as launch blockers. |
| Platform parity | The mobile path has received the most validation. The Electron host has separate layout and cache behavior. | Verify on both the iOS Simulator and Electron; a browser build is not a substitute. |
| Actions | `open_conversation` navigates to evidence. `open_calendar` only opens the calendar and does not safely create an event. | Keep writes out of v2 launch messaging. Do not imply that Claire booked or sent anything. |
| Privacy and trust | Broad search across private conversations is powerful and can feel surprising. | Make scope, sources, retention, deletion, and AI processing understandable before public launch. |

## Dogfood period

Use Ask Claire normally for 7–14 days before making the public-launch decision. Aim for at least 30 real questions across several days, platforms, people, and time ranges. Avoid writing artificial prompts solely to make the feature pass.

Cover these query families:

1. **Identity:** “Who was the person I mentioned who…?” Include nationality, work, school, neighborhood, and a partial name.
2. **Plans:** “What did I agree to this weekend?” Include tentative, confirmed, rescheduled, and cancelled plans.
3. **People:** “Who do I talk to most in Mexico City?” Compare Claire’s explanation with what you actually know.
4. **Exact recall:** Search for a link, address, recommendation, number, or phrase from an older conversation.
5. **Ambiguity:** Ask about two people with similar names or a descriptor that matches several conversations.
6. **No answer:** Ask for something that is not in the connected history. Claire should say it cannot find support and show no misleading citation.
7. **Scoped use:** Ask inside a conversation and confirm that no evidence leaks in from another chat.
8. **Stress and recovery:** Cancel a response, background the app, reconnect, retry once, and submit the same request only once from the UI.

Record failures in GitHub with the label `ask-claire`. For every failure, preserve the question wording, expected behavior, actual behavior, platform, approximate date range, whether the correct source existed, and a screenshot. Do not paste private message content into a public issue; use synthetic or redacted evidence.

### Lightweight scorecard

Keep one row per real question. A spreadsheet is optional; a GitHub issue or private note is sufficient.

| Field | What to record |
| --- | --- |
| Question | Exact wording, with private details redacted when shared. |
| Query family | Identity, plan, people, exact recall, ambiguity, no-answer, scoped, or recovery. |
| Useful answer | Yes, partly, or no. |
| Correct evidence | All citations support the answer; some do; none do. |
| Best source found | Yes or no, if the source exists in Claire. |
| Confidence behavior | Appropriate, too confident, or too hesitant. |
| Perceived speed | Immediate, acceptable, slow, or stuck. |
| Next action | Opened the right chat; calendar affordance was clear; no action needed; action misleading. |
| Notes | Missing data, date interpretation, duplicated text, layout, recovery, or other friction. |

## Public-launch gates

These are the stop/go criteria. A failed safety or data-boundary gate blocks launch even if the overall usefulness rate is high.

### Must pass before public launch

- [ ] No answer cites a message outside the authenticated user or selected conversation scope.
- [ ] Every displayed citation supports the associated claim; a no-answer response does not attach decorative sources.
- [ ] All eight query families above have been exercised with real or privacy-safe representative history.
- [ ] At least 90% of the final 20 representative dogfood questions are useful or partly useful, with no repeated P0/P1 failure pattern.
- [ ] Person, Saturday-plan, and location/relationship golden queries pass after a clean install and after relaunch.
- [ ] Cancel, retry, background/resume, offline, timeout, and duplicate-submission paths always reach a clear terminal state.
- [ ] A failed request preserves the user’s question and offers an understandable retry; it never leaves a permanent fake answer bubble.
- [ ] iOS Simulator and a physical TestFlight device pass the primary flows.
- [ ] Electron passes global Ask Claire, conversation-scoped Ask Claire, citations, navigation, and persisted history.
- [ ] VoiceOver labels, Dynamic Type, keyboard avoidance, long answers, long contact names, and reduced-motion behavior are usable.
- [ ] Production telemetry reports retrieval time, time to first text, completion time, cancel/error rate, token usage, and estimated cost without storing raw private questions.
- [ ] p50 time to first text is at most 1.5 seconds, p95 is at most 3 seconds, and p95 completion is at most 10 seconds on the launch configuration.
- [ ] Median model input is at most 4,000 tokens, p95 is at most 8,000 tokens, and normal output is capped at 700 tokens.
- [ ] The launch model, per-user rate limits, global spend guardrail, and behavior when the AI provider is unavailable are configured and verified.
- [ ] User-facing privacy copy explains what conversation data is searched, what reaches the model provider, how assistant history is retained, and how it can be deleted.
- [ ] Product copy does not claim that Claire can send, book, schedule, or create calendar events in this release.

### High-value usability improvements after evidence from dogfooding

Do these in response to repeated friction rather than preemptively expanding the feature:

- Add a correction flow for person identity, aliases, location, relationship labels, and stale facts.
- Make searched scope and concrete resolved dates visible when they materially affect the answer.
- Highlight the cited message in its conversation instead of only opening the chat.
- Improve plan-state extraction when reschedules and cancellations are common failures.
- Add a clearer multi-candidate answer pattern for ambiguous people and plans.
- Add recent-query management and a deliberate way to start a clean Ask Claire thread.
- Tune source-card density, long-answer typography, and the composer from real accessibility feedback.

## Rollout sequence

1. **Internal dogfood:** 7–14 days and at least 30 real questions; file and fix recurring usability failures.
2. **Lucas two-device validation:** follow [`docs/testing/lucas-two-device-test-spec.md`](testing/lucas-two-device-test-spec.md). Obtain the required approval before logging in, pairing, sending a bridged message, or deleting test history.
3. **Small TestFlight cohort:** release to trusted users, watch errors, latency, cost, and qualitative failure reports for at least several days.
4. **5% rollout:** stop automatically for a scope leak, persistent duplicate turns, stuck streams, or spend-guardrail breach.
5. **25% rollout:** proceed only after the earlier cohort remains stable and answer quality does not regress.
6. **100% rollout:** keep a server-side disable switch and ordinary conversation search available.

## Next implementation work, in order

1. Build a deterministic Ask Claire evaluation fixture and command for the three golden questions plus ambiguity, no-answer, strict-scope, changed-plan, and stale-location cases.
2. Add privacy-safe production metrics and a small launch dashboard for latency, errors, cancellations, token usage, and estimated cost.
3. Run the dogfood period and convert recurring failures into a prioritized usability backlog.
4. Complete recovery, accessibility, physical-device, and Electron validation.
5. Verify rate limits, spend guardrails, model configuration, provider-outage behavior, and privacy/retention copy.
6. Run the staged rollout above.
7. After plugins are available, design durable, editable action proposals and explicit approval. Keep action execution as a separate launch.

## Where to continue in the code

- Product specification: `apps/website/src/content/docs/product/ask-claire-v2.tsx`
- Server orchestration and streaming: `apps/server/src/services/conversation-assistant.ts`
- HTTP routes and stream setup: `apps/server/src/routes/ai.ts`
- Provider registry: `apps/server/src/services/ai/`
- Source and action validation: `apps/server/src/services/conversation-assistant-sources.ts` and `conversation-assistant-actions.ts`
- Database schema and retrieval functions: `supabase/migrations/20260908000001_ask_claire_v2.sql`
- Client transport and stream parser: `apps/client/services/conversationAssistant.ts` and `assistant-stream-protocol.ts`
- Global mobile screen: `apps/client/app/(tabs)/ask-claire.tsx`
- Conversation-scoped screen: `apps/client/app/chat/assistant/[chatId].tsx`
- Shared answer UI: `apps/client/components/claire/`
- Two-device procedure: `docs/testing/lucas-two-device-test-spec.md`
- Future plugin/action policy: `apps/website/src/content/docs/extensibility/plugin-system.tsx`

## Useful verification commands

Run focused tests first so unrelated work in the current checkout does not obscure Ask Claire results:

```bash
cd apps/server
bun test src/services/conversation-assistant-actions.test.ts \
  src/services/conversation-assistant-sources.test.ts \
  src/services/__tests__/conversation-assistant-query.test.ts

cd ../client
bunx jest services/assistant-stream-protocol.test.ts

cd ../..
```

Then run the broader checks before a release candidate:

```bash
bun run typecheck:server
bun run typecheck:mobile
bun run test:server
bun run test:mobile
bun run mobile:ios:staging
bun run desktop:dev
```

Run mobile behavior in the iOS Simulator or on a physical device, and desktop behavior in Electron. Expo web is only a bundle smoke test for this feature because it does not exercise the native or Electron cache paths.

## Updating this handoff

Update the date and checkboxes after each dogfood or rollout session. Move a discovered problem into “Must pass” only when it can cause an incorrect, unsafe, stuck, or materially misleading experience. Keep feature ideas in the usability section or in separate issues so the launch boundary stays understandable.
