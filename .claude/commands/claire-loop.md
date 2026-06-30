---
description: Autonomous ticket-driven loop — pick the next ready issue, build it, test it, open a PR, gate-merge, repeat.
argument-hint: "[N | M0..M7 | until-green]   (default: until-green)"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Task
---

# /claire-loop

You are the **loop driver** for the Claire project. Work GitHub tickets end-to-end,
autonomously, until the bound in `$ARGUMENTS` is hit. Full spec: `docs/AUTONOMOUS_LOOP.md`
(read it first if anything here is ambiguous).

**Run bound (`$ARGUMENTS`):**
- empty or `until-green` → run until the definition of done (core-loop e2e green across WA/TG/IG) or no actionable tickets remain.
- a number `N` → process at most N tickets, then stop and summarize.
- `M0`..`M7` → only work tickets in that milestone.

## Preconditions (check once at start)
- `gh auth status` ok; `git status` clean; on an up-to-date `main`.
- Backlog exists: `gh issue list --label ready` returns issues. If empty, tell the user to run `/claire-loop-init` and stop.

## One iteration
1. **Sync:** `git fetch origin` (branches are cut from `origin/main` in step 3, so this works in a fresh clone *and* a multi-worktree checkout where local `main` may be held by another worktree — never rely on `git checkout main`).
2. **Pick the next ticket:**
   ```bash
   gh issue list --state open --label ready --json number,title,labels,milestone \
     --jq 'map(.pri = (([.labels[].name]|map(select(test("^p[0-9]$")))|first) // "p9")) | sort_by(.milestone.title, .pri) | .[] | "#\(.number) [\(.milestone.title|split(" ")[0])] \(.pri) \(.title)"'
   ```
   Choose the **lowest milestone (M0 first), then lowest priority number (p0 first)**.
   Skip any issue labeled `blocked`, or whose body says `Depends on:` an issue that is still open. (Hint: M0 issues **#7 web build, #8 MOCK_BRIDGE, #9 testIDs, #10 Playwright, #11 CI** are prerequisites for most e2e work — finish them first, roughly in that order.)
3. **Claim:** comment `🔁 loop: starting` on the issue. Create an isolated branch:
   `git worktree add ../wt-<num> -b feat/<area>-<slug> origin/main` (or a normal branch if not parallelizing).
4. **Implement** strictly to the issue's Acceptance Criteria. Reuse existing code (see `docs/AUTONOMOUS_LOOP.md` "reuse map"). Add/extend mock Playwright e2e + unit tests.
5. **Gate locally** (all must pass):
   ```bash
   cd server && bun run lint && bun run typecheck && bun test
   cd ../client && bun run lint && bun run typecheck && bun test && MOCK_BRIDGE=true bunx playwright test
   ```
   If red: fix in-loop, **max 2 retries**. Still red → label the issue `blocked`, comment the failure, remove `ready`, go to the next ticket.
6. **PR:** commit, push, then:
   ```bash
   gh pr create --base main --title "<type>: <summary> (#<num>)" \
     --body "Closes #<num>\n\nRisk: <auto-merge|human-gate>\nVerified: <how e2e/unit confirmed it>"
   ```
7. **Merge decision:**
   - Issue labeled `risk/auto-merge` → `gh pr merge --squash --auto` (merges when CI is green).
   - Issue labeled `risk/human-gate` → leave PR open, add `needs-review` to the issue, post one line to the user. **Never auto-merge human-gate.**
8. **Record:** check the milestone box in the "Road to v1 — tracking" issue if the milestone is complete; append a line to `.context/loop-state.md`:
   `<iso-time> | #<num> <title> | PR #<pr> | <merged|needs-review|blocked>`.
   (Get the timestamp with `date -u +%FT%TZ`.)
9. **Clean up** the worktree (`git worktree remove`) and repeat from step 1.

## Stop conditions
- `$ARGUMENTS` bound reached (count or milestone exhausted).
- No `ready`, unblocked, auto-mergeable tickets remain.
- Definition of done met: core-loop e2e green for WhatsApp + Telegram + Instagram.
- Same ticket hard-fails twice → mark `blocked`, continue with others; if everything left is blocked/human-gate, stop and summarize.

## Guardrails
- Tickets touching shared files (`ci.yml`, `playwright.config`, `server/src/index.ts` handler, `supabase/migrations/*`) run **serially** — do not parallelize them.
- Independent `risk/auto-merge` UI/test tickets MAY run in parallel via the `Task`/`Workflow` fan-out **only if** the subagent backend is healthy; otherwise stay single-threaded (Tier 1). If a subagent errors, fall back to Tier 1.
- Always rebase on `main` before opening a PR.

## End of run
Summarize: tickets completed, PRs merged, PRs parked for review (`needs-review`), anything `blocked` and why, and the next recommended action.
