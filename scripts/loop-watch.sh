#!/usr/bin/env bash
# loop-watch.sh — live dashboard for the autonomous loop. Run in a SECOND terminal
# on the loop machine (where gh is authenticated). Works against any in-progress
# run; no restart needed. Ctrl-C to exit.
#
#   scripts/loop-watch.sh            # refresh every 8s
#   scripts/loop-watch.sh 4          # refresh every 4s
set -uo pipefail
cd "$(cd "$(dirname "$0")" && pwd)/.." || exit 1
INTERVAL="${1:-8}"

while true; do
  clear
  printf '==== Claire autonomous loop — %s ====\n' "$(date '+%Y-%m-%d %H:%M:%S')"

  printf '\n-- active ticket (git worktrees) --\n'
  if git worktree list 2>/dev/null | grep -v '\[main\]' | grep -q .; then
    git worktree list 2>/dev/null | grep -v '\[main\]'
  else
    echo '(none — between tickets / idle)'
  fi

  printf '\n-- runner heartbeat (.context/loop-runner.log) --\n'
  tail -n 14 .context/loop-runner.log 2>/dev/null || echo '(no runner log yet)'

  printf '\n-- open PRs --\n'
  gh pr list --state open -L 10 2>/dev/null || echo '(gh unavailable here)'

  printf '\n-- latest CI runs --\n'
  gh run list -L 3 2>/dev/null || true

  printf '\n-- queue --\n'
  printf 'ready+pickable: '
  gh issue list --state open --label ready --json labels --jq \
    '[ .[] | select((.labels|map(.name)) as $l | ($l|index("blocked")|not) and ($l|index("needs-review")|not)) ] | length' 2>/dev/null || echo '?'
  printf 'needs-review:   '; gh issue list --state open --label needs-review --json number --jq 'length' 2>/dev/null || echo '?'
  printf 'blocked:        '; gh issue list --state open --label blocked --json number --jq 'length' 2>/dev/null || echo '?'

  printf '\n-- ledger (.context/loop-state.md) --\n'
  tail -n 5 .context/loop-state.md 2>/dev/null || echo '(none yet)'

  printf '\n(Ctrl-C to exit · refresh %ss · live agent trace: tail -f .context/loop-trace.jsonl | jq -Rrf scripts/loop-fmt.jq)\n' "$INTERVAL"
  sleep "$INTERVAL"
done
