#!/usr/bin/env bash
# loop-init.sh — idempotent GitHub backlog bootstrap for Claire's autonomous loop.
#
# Creates labels, milestones (M0–M7 epics), ~41 issues, and the "Road to v1"
# tracking issue. Safe to re-run: every object is created only if missing.
#
# Prereqs: gh CLI authenticated (`gh auth login`) with repo+issue scopes.
# Usage:   bash scripts/loop-init.sh
set -euo pipefail

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo "Repo: $REPO"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
ensure_label() { # name color description
  if gh label list --limit 200 --json name --jq '.[].name' | grep -qx "$1"; then
    gh label edit "$1" --color "$2" --description "$3" >/dev/null 2>&1 || true
    echo "  label = $1 (exists)"
  else
    gh label create "$1" --color "$2" --description "$3" >/dev/null
    echo "  label + $1"
  fi
}

ensure_milestone() { # title description
  local title="$1" desc="$2"
  local existing
  existing="$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq ".[] | select(.title==\"$title\") | .number" 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    echo "  milestone = $title (#$existing)"
  else
    gh api "repos/$REPO/milestones" -f title="$title" -f description="$desc" --jq '.number' >/dev/null
    echo "  milestone + $title"
  fi
}

# cache of all existing issue titles (open+closed) for idempotency
ALL_TITLES_FILE="$(mktemp)"
gh issue list --state all --limit 500 --json title --jq '.[].title' > "$ALL_TITLES_FILE" 2>/dev/null || true

ensure_issue() { # title labels milestone body
  local title="$1" labels="$2" milestone="$3" body="$4"
  if grep -Fxq "$title" "$ALL_TITLES_FILE"; then
    echo "  issue = $title"
    return
  fi
  gh issue create --title "$title" --label "$labels" --milestone "$milestone" --body "$body" >/dev/null
  echo "  issue + $title"
}

# ---------------------------------------------------------------------------
# labels
# ---------------------------------------------------------------------------
echo "== labels =="
for a in server client ai promises notifications platforms testing infra auth db; do
  ensure_label "area/$a" "1d76db" "Area: $a"
done
ensure_label "p0" "b60205" "Priority: critical"
ensure_label "p1" "d93f0b" "Priority: high"
ensure_label "p2" "fbca04" "Priority: medium"
ensure_label "p3" "0e8a16" "Priority: low"
ensure_label "type/feature" "5319e7" "Feature work"
ensure_label "type/bug"     "5319e7" "Bug fix"
ensure_label "type/chore"   "5319e7" "Chore / maintenance"
ensure_label "type/test"    "5319e7" "Testing work"
ensure_label "type/docs"    "5319e7" "Documentation"
ensure_label "risk/auto-merge" "0e8a16" "Low-risk: loop may auto-merge on green CI"
ensure_label "risk/human-gate" "b60205" "High-risk: auth/DB/infra/bridge — human review required"
ensure_label "ready"        "0e8a16" "Unblocked: loop may pick this up"
ensure_label "blocked"      "d93f0b" "Blocked by deps or failure"
ensure_label "needs-review" "fbca04" "Human-gate PR open, awaiting review"

# ---------------------------------------------------------------------------
# milestones
# ---------------------------------------------------------------------------
echo "== milestones =="
ensure_milestone "M0 — Test Harness & Green CI"        "Foundation: web build, mock backend, Playwright e2e, green CI. Unblocks everything."
ensure_milestone "M1 — Promises: the core loop"        "Wire promise detection live -> API -> UI -> reminders. The headline feature."
ensure_milestone "M2 — AI Reply Suggestions in chat"   "Surface AI suggestions already generated server-side; draft/accept/edit/reject."
ensure_milestone "M3 — Notifications & Reminder delivery" "Push token -> server -> reminder scheduler."
ensure_milestone "M4 — Contact Inference & Memory"     "Finish smart cards, clarification cards, memory system + injection."
ensure_milestone "M5 — Multi-platform parity"          "WhatsApp/Telegram/Instagram send+receive+media+self-detection solid."
ensure_milestone "M6 — Auto-Reply Rules & Snooze"      "Reply-later/snooze, auto-reply rule engine, group summaries."
ensure_milestone "M7 — Security & Production hardening" "Token encryption, RLS audit, secrets, Sentry, rate limiting."

# ---------------------------------------------------------------------------
# issues
# ---------------------------------------------------------------------------
echo "== issues =="

M0="M0 — Test Harness & Green CI"
M1="M1 — Promises: the core loop"
M2="M2 — AI Reply Suggestions in chat"
M3="M3 — Notifications & Reminder delivery"
M4="M4 — Contact Inference & Memory"
M5="M5 — Multi-platform parity"
M6="M6 — Auto-Reply Rules & Snooze"
M7="M7 — Security & Production hardening"

# ---- M0 ----
ensure_issue "Make the web build pass under react-native-web" \
  "area/client,type/chore,p1,risk/human-gate,ready" "$M0" \
$'**Scope:** Fix native-only modules under `react-native-web` (react-native-webview, @react-native-cookies/cookies, expo-notifications, reanimated/worklets) via `.web.tsx` shims / `Platform` guards.\n\n**Acceptance:**\n- `cd client && bunx expo export -p web` succeeds with no module-resolution errors.\n- e2e: app boots at `/` in a headless browser.\n\n**Risk:** human-gate (touches build config / native shims).\n**Depends on:** nothing. Part of M0 (lands before all e2e work).'

ensure_issue "Add MOCK_BRIDGE server mode + seeded fixtures" \
  "area/server,area/testing,type/feature,p0,risk/human-gate,ready" "$M0" \
$'**Scope:** Add `MOCK_BRIDGE=true` server mode where platform adapters are replaced by a fake adapter emitting scripted messages/promises. Seed Supabase with deterministic fixtures: 1 user, 3 connected platforms (WA/TG/IG), several chats/messages including at least one promise-bearing message.\n\n**Acceptance:**\n- Server boots in mock mode with zero Docker/Matrix dependency.\n- Fixtures documented (counts, the promise message text).\n- A seed script/route resets to known state for tests.\n\n**Risk:** human-gate (core server wiring).\n**Depends on:** nothing. Prerequisite for all mock e2e.'

ensure_issue "testID coverage pass + selector map doc" \
  "area/client,area/testing,type/test,p1,risk/auto-merge,ready" "$M0" \
$'**Scope:** Add stable `testID`s (map to `data-testid` on web) across inbox, chat, promises, contacts, settings, and platform-connect screens.\n\n**Acceptance:**\n- Documented selector map committed at `docs/E2E_SELECTORS.md`.\n- Selectors are stable + unique.\n\n**Risk:** auto-merge.\n**Depends on:** #1 (web build).'

ensure_issue "Playwright e2e: core flows vs mock backend" \
  "area/testing,type/test,p0,risk/auto-merge,ready" "$M0" \
$'**Scope:** Playwright specs covering: auth -> inbox renders seeded messages -> open chat -> send -> AI suggestion shows -> Promises tab lists a promise -> mark complete.\n\n**Acceptance:**\n- `cd client && bunx playwright test` green against the MOCK_BRIDGE backend.\n\n**Risk:** auto-merge.\n**Depends on:** #1, #2, #3.'

ensure_issue "CI: gate on mock e2e + fix unit tests + typecheck" \
  "area/infra,area/testing,type/chore,p1,risk/human-gate,ready" "$M0" \
$'**Scope:** Wire Playwright (mock backend) into `.github/workflows/ci.yml`. Make `typecheck`, `lint`, and `jest` green on both server and client.\n\n**Acceptance:**\n- CI green on a PR: lint + typecheck + jest + web build + mock e2e.\n\n**Risk:** human-gate (CI/infra).\n**Depends on:** #2, #4.'

ensure_issue "Nightly e2e vs real Docker stack" \
  "area/infra,area/testing,type/chore,p2,risk/human-gate,ready" "$M0" \
$'**Scope:** Scheduled GitHub Actions workflow that boots Supabase+Matrix, seeds a test session, runs an e2e subset across all 3 platforms. Manual `workflow_dispatch` too.\n\n**Acceptance:**\n- Scheduled run + manual dispatch both work.\n\n**Risk:** human-gate (infra).\n**Depends on:** #4.'

ensure_issue "Server route test scaffolding (supertest)" \
  "area/server,area/testing,type/test,p2,risk/auto-merge,ready" "$M0" \
$'**Scope:** `supertest` harness + fixtures; smoke tests for `/messages`, `/ai`, `/platforms`.\n\n**Acceptance:**\n- Route smoke tests pass in CI; replaces the ~3 trivial example tests.\n\n**Risk:** auto-merge.'

ensure_issue "Remove duplicate inbox tab (dashboard vs messages)" \
  "area/client,type/chore,p2,risk/auto-merge,ready" "$M0" \
$'**Scope:** Reconcile `client/app/(tabs)/dashboard.tsx` and `messages.tsx` into one canonical inbox; remove the dead screen + tab entry.\n\n**Acceptance:**\n- Single inbox tab; no dead screen; e2e inbox still green.\n\n**Risk:** auto-merge.'

# ---- M1 ----
ensure_issue "Wire promise detection into live Matrix ingestion path" \
  "area/server,area/promises,type/feature,p0,risk/human-gate,ready" "$M1" \
$'**Scope:** Call `promiseDetector.detectPromises` from the live message handler in `server/src/index.ts` (where `aiProcessor.generateAndStore` runs) and persist results to the `promises` table. The detector is currently only invoked from the unused Bull queue path.\n\n**Acceptance:**\n- A scripted promise message in MOCK_BRIDGE mode creates a `promises` row scoped to the user.\n\n**Risk:** human-gate (core ingestion path).\n**Depends on:** #2.'

ensure_issue "Upgrade promise-detector to LLM intent classification" \
  "area/ai,area/promises,type/feature,p1,risk/auto-merge,ready" "$M1" \
$'**Scope:** Replace/augment regex detection (`server/src/services/promise-detector.ts:35`) with Claude-based extraction returning {text, deadline, contact, confidence}; keep regex as fallback. Reuse `prompt-templates.ts` and `response-cache.ts`.\n\n**Acceptance:**\n- Extracts a structured promise from free text; unit tests cover positive/negative cases + fallback.\n\n**Risk:** auto-merge.\n**Depends on:** #9.'

ensure_issue "/promises REST API (list/get/update/snooze/delete)" \
  "area/server,area/promises,area/db,type/feature,p0,risk/human-gate,ready" "$M1" \
$'**Scope:** New `server/src/routes/promises.ts`: list (filters status/platform/contact), get, update status, snooze, delete. Mount in `index.ts`. RLS-scoped to the user.\n\n**Acceptance:**\n- CRUD works; cross-user access denied; smoke tests pass.\n\n**Risk:** human-gate (DB + new route).\n**Depends on:** #9.'

ensure_issue "Promises screen — real UI" \
  "area/client,area/promises,type/feature,p0,risk/auto-merge,ready" "$M1" \
$'**Scope:** Replace stub `client/app/(tabs)/promises.tsx` with a list (open/done/overdue), source-message link, complete + snooze actions, and empty state. Reuse `NudgeCard.tsx`/`SmartCard.tsx` patterns + react-query.\n\n**Acceptance:**\n- e2e: seeded promise visible; mark-complete moves it to Done.\n\n**Risk:** auto-merge.\n**Depends on:** #11.'

ensure_issue "Promise badge + dashboard surfacing" \
  "area/client,area/promises,type/feature,p1,risk/auto-merge,ready" "$M1" \
$'**Scope:** Pending-promise count badge on the Promises tab + inbox highlight for chats with open promises.\n\n**Acceptance:**\n- e2e: badge count matches fixtures.\n\n**Risk:** auto-merge.\n**Depends on:** #11, #12.'

ensure_issue "Promise unit + e2e tests" \
  "area/promises,area/testing,type/test,p1,risk/auto-merge,ready" "$M1" \
$'**Scope:** Detector cases, `/promises` API, and Promises screen flow.\n\n**Acceptance:**\n- Covered in CI mock e2e + jest.\n\n**Risk:** auto-merge.\n**Depends on:** #10, #11, #12.'

# ---- M2 ----
ensure_issue "Surface stored AI suggestions in chat" \
  "area/client,area/ai,type/feature,p1,risk/auto-merge,ready" "$M2" \
$'**Scope:** Wire `client/components/ResponseSuggestion.tsx` into `client/app/chat/[chatId].tsx`. Read the suggestion stored by `aiProcessor.generateAndStore`; provide accept/edit/reject. (Component is currently imported nowhere.)\n\n**Acceptance:**\n- e2e: suggestion chip appears on an inbound message; Accept fills the composer.\n\n**Risk:** auto-merge.\n**Depends on:** #4.'

ensure_issue "On-demand 'Draft reply' button" \
  "area/client,area/ai,type/feature,p2,risk/auto-merge,ready" "$M2" \
$'**Scope:** Button in chat that calls `POST /ai/responses/generate` and populates the composer; streaming optional.\n\n**Acceptance:**\n- Tap -> draft populates composer (e2e against mock AI).\n\n**Risk:** auto-merge.\n**Depends on:** #15.'

ensure_issue "AI suggestion feedback loop" \
  "area/client,area/ai,type/feature,p2,risk/auto-merge,ready" "$M2" \
$'**Scope:** POST `/ai/responses/feedback` on accept/edit/reject.\n\n**Acceptance:**\n- Feedback row persisted; unit/e2e covers each action.\n\n**Risk:** auto-merge.\n**Depends on:** #15.'

ensure_issue "Tone/personality settings -> prompt injection" \
  "area/client,area/ai,type/feature,p2,risk/auto-merge,ready" "$M2" \
$'**Scope:** Settings UI for tone/personality persisted to user memory; injected via `context-builder.ts`/`prompt-templates.ts`.\n\n**Acceptance:**\n- Tone change alters the prompt payload (unit test).\n\n**Risk:** auto-merge.'

# ---- M3 ----
ensure_issue "Register Expo push token -> server" \
  "area/client,area/notifications,area/db,type/feature,p1,risk/human-gate,ready" "$M3" \
$'**Scope:** `client/services/notifications.ts` posts the Expo push token to a new server route; add a `push_tokens` table. Web: graceful no-op.\n\n**Acceptance:**\n- Token persisted on login; web build does not crash.\n\n**Risk:** human-gate (DB + new route).'

ensure_issue "Server push-send service (Expo Push API)" \
  "area/server,area/notifications,type/feature,p1,risk/human-gate,ready" "$M3" \
$'**Scope:** Expo Push API client; send on new urgent message + promise reminder.\n\n**Acceptance:**\n- Unit test mocks Expo Push and asserts payloads.\n\n**Risk:** human-gate (infra/external).\n**Depends on:** #19.'

ensure_issue "Reminder scheduler for promises" \
  "area/server,area/notifications,area/promises,type/feature,p1,risk/human-gate,ready" "$M3" \
$'**Scope:** Recurring job (reuse Bull/Redis in `services/message-queue.ts`) scans promises by `deadline`/snooze and enqueues reminder pushes.\n\n**Acceptance:**\n- A due promise triggers a (mocked) push.\n\n**Risk:** human-gate (infra/jobs).\n**Depends on:** #11, #20.'

ensure_issue "Notification preferences UI" \
  "area/client,area/notifications,type/feature,p2,risk/auto-merge,ready" "$M3" \
$'**Scope:** Quiet hours, per-type toggles, DND.\n\n**Acceptance:**\n- Prefs persisted; respected by the sender (unit test).\n\n**Risk:** auto-merge.\n**Depends on:** #20.'

# ---- M4 ----
ensure_issue "Finish smart-card surfacing in chat" \
  "area/client,area/ai,type/feature,p2,risk/auto-merge,ready" "$M4" \
$'**Scope:** Verify `ChatSmartCardTray`/`SmartCardList` render `/conversations/:id/smart-cards`; wire act/dismiss.\n\n**Acceptance:**\n- e2e: seeded card shows; dismiss removes it.\n\n**Risk:** auto-merge.'

ensure_issue "Contact clarification card" \
  "area/client,area/ai,type/feature,p2,risk/auto-merge,ready" "$M4" \
$'**Scope:** "Is this your boss/friend/...?" card writing to the contact profile (reuse `contact-inference.ts`, `/conversations/:id/profile`).\n\n**Acceptance:**\n- e2e: answer persists to profile.\n\n**Risk:** auto-merge.'

ensure_issue "Memory system + prompt injection" \
  "area/server,area/ai,area/db,type/feature,p2,risk/human-gate,ready" "$M4" \
$'**Scope:** Persist user/contact memory; inject into prompts.\n\n**Acceptance:**\n- Memory appears in built context (unit test).\n\n**Risk:** human-gate (DB schema).'

ensure_issue "MorningBrief / UrgentCard real-endpoint wiring" \
  "area/client,type/feature,p3,risk/auto-merge,ready" "$M4" \
$'**Scope:** Confirm `MorningBrief.tsx`/`UrgentCard.tsx` are fed by real endpoints (not mock-only props).\n\n**Acceptance:**\n- e2e renders from fixtures.\n\n**Risk:** auto-merge.'

# ---- M5 ----
ensure_issue "Enable double-puppeting for correct self-attribution" \
  "area/platforms,area/server,type/feature,p1,risk/human-gate,ready" "$M5" \
$'**Scope:** Enable double-puppeting (see CLAUDE.md) so the user own phone-sent messages attribute to the user, not a ghost.\n\n**Acceptance:**\n- Outgoing-from-phone shows as self across WA/TG/IG (nightly real-stack).\n\n**Risk:** human-gate (bridge core).'

ensure_issue "Send reliability across WhatsApp/Telegram/Instagram" \
  "area/platforms,area/server,type/bug,p1,risk/human-gate,ready" "$M5" \
$'**Scope:** Verify `/platforms/:platform/send` round-trips per platform; fix failures.\n\n**Acceptance:**\n- Nightly real-stack send+receive per platform.\n\n**Risk:** human-gate (bridge core).'

ensure_issue "Media in/out (images, video, docs)" \
  "area/platforms,area/client,type/feature,p2,risk/auto-merge,ready" "$M5" \
$'**Scope:** Render incoming media in chat and support sending media.\n\n**Acceptance:**\n- e2e: media fixture renders; send path covered.\n\n**Risk:** auto-merge.'

ensure_issue "Telegram + Instagram connect-flow polish" \
  "area/platforms,area/client,type/feature,p2,risk/auto-merge,ready" "$M5" \
$'**Scope:** Error states, reconnect, accurate status for TG + IG connect flows.\n\n**Acceptance:**\n- e2e: mock connect -> connected per platform.\n\n**Risk:** auto-merge.'

ensure_issue "Per-platform self-ghost / group-detection regression tests" \
  "area/platforms,area/testing,type/test,p2,risk/auto-merge,ready" "$M5" \
$'**Scope:** Lock in fixes from project memory (self-ghost prefixes; DM-vs-group detection) with unit fixtures per platform.\n\n**Acceptance:**\n- Regression tests pass for WA/TG/IG.\n\n**Risk:** auto-merge.'

# ---- M6 ----
ensure_issue "Reply-Later / Snooze on messages" \
  "area/client,area/server,type/feature,p2,risk/auto-merge,ready" "$M6" \
$'**Scope:** Snooze a message -> it resurfaces later + triggers a reminder.\n\n**Acceptance:**\n- e2e: snooze hides then resurfaces.\n\n**Risk:** auto-merge.\n**Depends on:** #21.'

ensure_issue "Auto-reply rule engine" \
  "area/server,area/ai,type/feature,p2,risk/human-gate,ready" "$M6" \
$'**Scope:** Triggers (birthday/thanks/keyword) + safe defaults + rate caps. Reuse `response-safety.ts`.\n\n**Acceptance:**\n- Rule fires in mock; respects caps (unit test).\n\n**Risk:** human-gate (sends messages autonomously).'

ensure_issue "Auto-reply rule config UI" \
  "area/client,type/feature,p3,risk/auto-merge,ready" "$M6" \
$'**Scope:** Settings UI to create/toggle auto-reply rules.\n\n**Acceptance:**\n- e2e: create/toggle a rule.\n\n**Risk:** auto-merge.\n**Depends on:** #33.'

ensure_issue "Group-chat summaries" \
  "area/client,area/ai,type/feature,p3,risk/auto-merge,ready" "$M6" \
$'**Scope:** Wire `GroupChatSummary.tsx` to a summarization endpoint.\n\n**Acceptance:**\n- e2e: summary renders for a group fixture.\n\n**Risk:** auto-merge.'

# ---- M7 ----
ensure_issue "Encrypt platform session/tokens at rest" \
  "area/server,area/auth,type/feature,p1,risk/human-gate,ready" "$M7" \
$'**Scope:** Encrypt platform session blobs/tokens in Redis/DB.\n\n**Acceptance:**\n- Stored blobs encrypted; decrypt path tested.\n\n**Risk:** human-gate (security).'

ensure_issue "Audit + complete RLS on all tables" \
  "area/db,area/auth,type/chore,p1,risk/human-gate,ready" "$M7" \
$'**Scope:** Audit/complete Row Level Security incl. `promises`, `push_tokens`, memory tables.\n\n**Acceptance:**\n- Cross-user access denied (test).\n\n**Risk:** human-gate (DB/security).'

ensure_issue "Secrets hygiene: purge committed .env, rotate, document" \
  "area/infra,area/auth,type/chore,p1,risk/human-gate,ready" "$M7" \
$'**Scope:** Purge committed `.env` from the tree/history, rotate exposed secrets, document setup.\n\n**Acceptance:**\n- No secrets in tree; only `.env.example` remains.\n\n**Risk:** human-gate (security).'

ensure_issue "Sentry error tracking (server + client)" \
  "area/infra,type/chore,p2,risk/auto-merge,ready" "$M7" \
$'**Scope:** Add Sentry to server and client.\n\n**Acceptance:**\n- A test error reaches Sentry.\n\n**Risk:** auto-merge.'

ensure_issue "Rate limiting + abuse prevention on AI + auth routes" \
  "area/server,area/auth,type/feature,p2,risk/auto-merge,ready" "$M7" \
$'**Scope:** Apply `express-rate-limit` to AI + auth routes.\n\n**Acceptance:**\n- Limit enforced (test).\n\n**Risk:** auto-merge.'

ensure_issue "Health/readiness + structured logging review" \
  "area/infra,area/server,type/chore,p3,risk/auto-merge,ready" "$M7" \
$'**Scope:** `/health` covers DB+Redis+Matrix; review structured logging.\n\n**Acceptance:**\n- Health endpoint reports each dependency.\n\n**Risk:** auto-merge.'

# ---------------------------------------------------------------------------
# tracking issue
# ---------------------------------------------------------------------------
echo "== tracking issue =="
TRACK_TITLE="Road to v1 — tracking"
ensure_issue "$TRACK_TITLE" "type/docs,p0" "$M0" \
$'Master tracker for shipping Claire to v1 (full multi-platform parity). Worked autonomously by the loop driver (see `docs/AUTONOMOUS_LOOP.md`).\n\n**Definition of done:** all 8 milestones closed; core-loop e2e green for WhatsApp, Telegram, and Instagram.\n\n## Milestones (epics)\n- [ ] **M0** Test Harness & Green CI\n- [ ] **M1** Promises: the core loop\n- [ ] **M2** AI Reply Suggestions in chat\n- [ ] **M3** Notifications & Reminder delivery\n- [ ] **M4** Contact Inference & Memory\n- [ ] **M5** Multi-platform parity\n- [ ] **M6** Auto-Reply Rules & Snooze\n- [ ] **M7** Security & Production hardening\n\nBrowse the live backlog: `gh issue list --state open --label ready`\nMilestone view: Issues tab -> Milestones.'

# best-effort pin (GraphQL; ignore if already pinned / no perms)
TRACK_NUM="$(gh issue list --state all --search "in:title \"$TRACK_TITLE\"" --json number,title --jq ".[] | select(.title==\"$TRACK_TITLE\") | .number" | head -1 || true)"
if [ -n "${TRACK_NUM:-}" ]; then
  REPO_ID="$(gh api "repos/$REPO" --jq .node_id 2>/dev/null || true)"
  ISSUE_ID="$(gh api "repos/$REPO/issues/$TRACK_NUM" --jq .node_id 2>/dev/null || true)"
  if [ -n "$ISSUE_ID" ]; then
    gh api graphql -f query='mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{number}}}' -f id="$ISSUE_ID" >/dev/null 2>&1 \
      && echo "  pinned tracking issue #$TRACK_NUM" || echo "  (tracking issue #$TRACK_NUM created; pin manually if desired)"
  fi
fi

rm -f "$ALL_TITLES_FILE"
echo "== done =="
