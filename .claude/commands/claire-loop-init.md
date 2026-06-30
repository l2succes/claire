---
description: One-time idempotent bootstrap of the Claire backlog (labels, milestones, ~41 issues, tracking issue).
allowed-tools: Bash(bash scripts/loop-init.sh), Bash(gh *), Read
---

# /claire-loop-init

Bootstrap the GitHub backlog that the autonomous loop works through. **Idempotent** —
safe to re-run; existing objects are skipped. Run this once per repo (issues are
server-side and shared across machines).

## Steps

1. Verify `gh` is authenticated: `gh auth status` (needs `repo` scope; `gh auth login` if not).
2. Run the bootstrap script:
   ```bash
   bash scripts/loop-init.sh
   ```
3. Confirm results:
   ```bash
   gh label list --limit 100
   gh api repos/:owner/:repo/milestones --jq '.[].title'
   gh issue list --state open --label ready --limit 60
   ```
4. Report counts created vs already-present, and the tracking issue URL.

That's it. After this, run `/claire-loop` to start working tickets.
See `docs/AUTONOMOUS_LOOP.md` for the full spec.
