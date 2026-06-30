#!/usr/bin/env bash
# loop-runner.sh — unattended wrapper around /claire-loop.
#
# Runs ONE ticket per fresh `claude -p` session (keeps context small) and repeats
# until no pickable ticket remains (ready, not blocked, not needs-review) or the
# iteration cap is hit. Auto-merges low-risk PRs on green CI; parks human-gate PRs
# as needs-review for human review (see docs/AUTONOMOUS_LOOP.md).
#
# Prereqs (verified by the runbook): claude authenticated, gh authenticated,
# bun deps installed, repo on latest main. gh + claude must be on PATH.
#
# Usage:
#   scripts/loop-runner.sh [MAX_ITER]      # default 40
#   LOOP_PROMPT='/claire-loop 1' scripts/loop-runner.sh 25
#
# Observability:
#   LOOP_VERBOSE=1 (default) streams the agent's tool calls/messages live via
#   `--output-format stream-json`, formatted by scripts/loop-fmt.jq into the log
#   and saved raw to .context/loop-trace.jsonl. Set LOOP_VERBOSE=0 for terse
#   final-result-only output. Watch a run with: scripts/loop-watch.sh
#
# Launch detached on a dedicated machine:
#   nohup zsh -ic 'scripts/loop-runner.sh 40' >/tmp/claire-loop.out 2>&1 &
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.." || exit 1                       # repo root
mkdir -p .context
LOG=".context/loop-runner.log"
TRACE=".context/loop-trace.jsonl"
MAX_ITER="${1:-40}"
PROMPT="${LOOP_PROMPT:-/claire-loop 1}"
VERBOSE="${LOOP_VERBOSE:-1}"

log() { echo "$@" | tee -a "$LOG"; }

# Run one claude session. Verbose mode streams a readable tool-by-tool trace into
# the log (and raw JSONL to $TRACE) so `tail -f` shows live activity, not silence.
run_claude() {
  if [ "$VERBOSE" = "1" ] && command -v jq >/dev/null 2>&1; then
    claude -p "$PROMPT" --dangerously-skip-permissions --verbose --output-format stream-json 2>>"$LOG" \
      | tee -a "$TRACE" \
      | jq -Rrf "$HERE/loop-fmt.jq" 2>/dev/null \
      | tee -a "$LOG"
  else
    claude -p "$PROMPT" --dangerously-skip-permissions >>"$LOG" 2>&1
  fi
}

command -v claude >/dev/null 2>&1 || { log "FATAL: claude not on PATH"; exit 1; }
command -v gh     >/dev/null 2>&1 || { log "FATAL: gh not on PATH"; exit 1; }
gh auth status >/dev/null 2>&1     || { log "FATAL: gh not authenticated (run: gh auth login)"; exit 1; }

log "=== loop-runner start $(date -u +%FT%TZ) max=$MAX_ITER prompt='$PROMPT' ==="

pickable_count() {
  gh issue list --state open --label ready --json number,labels --jq \
    '[ .[] | select((.labels|map(.name)) as $l | ($l|index("blocked")|not) and ($l|index("needs-review")|not)) ] | length' \
    2>/dev/null || echo 0
}

for i in $(seq 1 "$MAX_ITER"); do
  git fetch origin --quiet 2>/dev/null || true
  git worktree prune 2>/dev/null || true
  n="$(pickable_count)"
  log "--- iter $i/$MAX_ITER $(date -u +%FT%TZ) pickable=$n ---"
  if [ "$n" = "0" ]; then
    log "no pickable tickets remain (all merged / parked needs-review / blocked); stopping"
    break
  fi
  # one ticket, fresh context, unattended
  run_claude || log "claude pipe exited non-zero on iter $i (continuing)"
done

log "=== loop-runner done $(date -u +%FT%TZ) ==="
log "Open PRs awaiting review:"; gh pr list --state open --label needs-review 2>/dev/null | tee -a "$LOG" || true
