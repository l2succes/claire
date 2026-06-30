# Claire — Autonomous Execution Loop

How Claire gets built to v1 without per-ticket hand-holding: a **loop driver** picks the
next GitHub ticket, builds it, tests it end-to-end in a headless browser, opens a PR, and
either auto-merges (low-risk) or parks it for review (high-risk) — then repeats until the
app works. This doc is the single source of truth; the `/claire-loop` slash command points
back here.

> **TL;DR (dedicated machine):** clone → `gh auth login` → `bun install` → `/claire-loop-init` (once) → `/claire-loop until-green`.

---

## Where the tickets live

All work is tracked as **GitHub Issues** on `l2succes/claire`.

- **Milestones = epics (M0–M7).** Browse: Issues tab → Milestones.
  - **M0** Test Harness & Green CI — *foundation, lands first; unblocks all e2e work*
  - **M1** Promises: the core loop — *the headline feature*
  - **M2** AI Reply Suggestions in chat
  - **M3** Notifications & Reminder delivery
  - **M4** Contact Inference & Memory
  - **M5** Multi-platform parity (WhatsApp / Telegram / Instagram)
  - **M6** Auto-Reply Rules & Snooze
  - **M7** Security & Production hardening
- **Pinned tracking issue: "Road to v1 — tracking"** — milestone checklist + entry point.
- **Labels:**
  - `area/*` — server, client, ai, promises, notifications, platforms, testing, infra, auth, db
  - `p0`–`p3` — priority (p0 = critical)
  - `type/*` — feature, bug, chore, test, docs
  - **`risk/auto-merge`** — loop may merge on green CI · **`risk/human-gate`** — auth/DB/infra/bridge, human review required
  - **`ready`** — unblocked, loop may pick · **`blocked`** — deps/failure · **`needs-review`** — human-gate PR open

**Find the next ticket** (lowest milestone, then lowest priority number):
```bash
gh issue list --state open --label ready --json number,title,labels,milestone \
  --jq 'map(.pri = (([.labels[].name]|map(select(test("^p[0-9]$")))|first) // "p9")) | sort_by(.milestone.title, .pri) | .[] | "#\(.number) [\(.milestone.title|split(" ")[0])] \(.pri) \(.title)"'
```
Skip anything labeled `blocked` or whose body lists `Depends on:` an issue that is still open.

The backlog is created (idempotently) by `scripts/loop-init.sh` via `/claire-loop-init`.

---

## Driver algorithm (one iteration)

1. **Sync** — `git checkout main && git pull --ff-only`.
2. **Pick** the next `ready` issue (query above). M0 first; within a milestone, p0 → p3. Respect `Depends on:`.
3. **Claim** — comment `🔁 loop: starting`; create an isolated branch (worktree): `git worktree add ../wt-<num> -b feat/<area>-<slug> origin/main`.
4. **Build** to the issue's Acceptance Criteria. Reuse existing code (see reuse map). Add/extend **mock Playwright e2e** + unit tests.
5. **Gate locally** — all must pass:
   ```bash
   (cd server && bun run lint && bun run typecheck && bun test)
   (cd client && bun run lint && bun run typecheck && bun test && MOCK_BRIDGE=true bunx playwright test)
   ```
   Red → fix in-loop (**max 2 retries**). Still red → label `blocked`, comment the failure, drop `ready`, move on.
6. **PR** — `gh pr create --base main` with `Closes #<num>`, the risk tier, and how it was verified.
7. **Merge decision:**
   - `risk/auto-merge` → `gh pr merge --squash --auto` (lands when CI is green).
   - `risk/human-gate` → leave open, add `needs-review` to the issue, ping the user. **Never auto-merge human-gate.**
8. **Record** — tick the milestone in the tracking issue when complete; append to `.context/loop-state.md`:
   `<iso-time> | #<num> <title> | PR #<pr> | <merged|needs-review|blocked>`.
9. **Clean up** worktree; repeat.

### Stop conditions
- Run bound reached (`/claire-loop N` count, or a single `M#` exhausted).
- No `ready`, unblocked, auto-mergeable tickets remain.
- **Definition of done:** core-loop e2e green for WhatsApp + Telegram + Instagram.
- A ticket hard-fails twice → `blocked`, continue; if all that remains is blocked/human-gate, stop and summarize.

### Guardrails
- **Ordering:** M0 lands first. Tickets touching shared files (`ci.yml`, `playwright.config`, `server/src/index.ts` handler, `supabase/migrations/*`) run **serially**.
- **Isolation:** each worker in its own git worktree; rebase on `main` before PR.
- **Human-gate respected:** the loop never merges auth/DB/infra/bridge-core PRs — it parks them.
- **Idempotent restart:** issue labels + `.context/loop-state.md` are the source of truth, so the loop resumes cleanly after any interruption, on any machine.

---

## Two execution tiers

- **Tier 1 — main-session driver (default).** The Claude session runs the loop inline, one ticket at a time. No dependency on the marketplace subagent backend. Start here.
- **Tier 2 — parallel fan-out (scale-up).** When the subagent backend is healthy, a `Workflow` script pipelines independent `risk/auto-merge` tickets across worktree-isolated subagents (cap ~3–4 concurrent), each running steps 3–7. Serial/shared-file tickets stay on the driver. **Auto-falls-back to Tier 1 if subagents error.**

---

## Merge policy

| Risk | Examples | Action |
|---|---|---|
| `risk/auto-merge` | tests, docs, isolated UI, client screens | squash-merge automatically on green CI |
| `risk/human-gate` | auth, DB schema/migrations, infra/CI, bridge core, anything that sends messages autonomously | open PR, label `needs-review`, wait for human |

CI must be green either way: lint + typecheck + jest + web build + **mock Playwright e2e**.

---

## Testing model (headless-browser first)

- **Mock backend (CI + fast loop):** server runs `MOCK_BRIDGE=true` — platform adapters replaced by a fake adapter; Supabase seeded with deterministic fixtures. No Docker, no real WhatsApp scan. This is what Playwright drives, and what an AI harness can drive via stable `data-testid` selectors documented in `docs/E2E_SELECTORS.md`.
- **Real stack (nightly):** scheduled workflow boots Supabase + Matrix, seeds a session, runs an e2e subset across all 3 platforms.
- **Core-loop e2e (definition of done):** sign in → inbox shows seeded messages → open chat → AI suggestion appears + accept → send → Promises tab lists the detected promise → mark complete → reminder scheduled.

---

## Reuse map (don't rebuild what exists)

- Promises: `server/src/services/promise-detector.ts`, table in `supabase/migrations/20250806092049_initial_schema.sql`; wire from `server/src/index.ts` (handler near the `aiProcessor.generateAndStore` call).
- AI: `server/src/services/{ai-processor,context-builder,prompt-templates,response-safety,response-cache}.ts`, routes in `server/src/routes/ai.ts`; client `client/components/ResponseSuggestion.tsx`.
- Smart cards / inference: `server/src/services/{smart-card-generator,contact-inference}.ts`, `server/src/routes/conversations.ts`, `client/components/{SmartCard,SmartCardList,ChatSmartCardTray,NudgeCard,MorningBrief,UrgentCard}.tsx`.
- Jobs/queue: `server/src/services/message-queue.ts` (Bull/Redis) for the reminder scheduler.
- E2E: `client/playwright.config.mjs`, `client/e2e/*`.

---

## Fresh dedicated-machine runbook

1. `git clone https://github.com/l2succes/claire.git && cd claire`
2. Install **Bun**, **Claude Code**, and **gh**; then `gh auth login` (scopes: `repo`, plus PR/issue access).
3. `cd server && bun install && cd ../client && bun install`
4. Copy env files: `server/.env`, `client/.env`. The mock-bridge loop needs **no** Docker and **no** real WhatsApp/Matrix — Docker is only for the real-stack nightly run.
5. **First time only:** `/claire-loop-init` to populate the backlog. Skip if another machine already created it (issues are shared server-side).
6. Run the loop: `/claire-loop until-green`.

Because GitHub Issues + `.context/loop-state.md` are the shared truth, you can stop/restart, or move to another machine, and the loop resumes where it left off.
