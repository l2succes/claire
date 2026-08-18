#!/usr/bin/env bash
# Guard against the promises -> loops rename regressing.
#
# "Loops" is the product name in the UI, the API, and the database. The only
# legitimate remaining uses of "promise" are the JavaScript Promise type and
# the deliberately-retained backward-compatibility shims listed below.
#
# Usage: scripts/check-no-promises.sh
set -uo pipefail

cd "$(dirname "$0")/.."

# Deliberate exceptions, each with a reason:
#   Promise<, Promise., .then/await sites  -> the JS built-in
#   'promise' in desktop_sync_events        -> historical rows still validate
#   LEGACY_LOOP_DETECTION_KEY               -> one-time AsyncStorage migration
#   destinationForDesktopCommand shim       -> pre-rename native binaries
#   "i promise" in the COMMISSIVE regex      -> ordinary English, not the feature
#   "product promise" / "not a promise that"  -> ordinary English in prose
ALLOW='Promise<|Promise\.|: Promise\b|new Promise|await Promise|Promise>|PromiseLike'

# Local accumulators fed to Promise.all. Naming an array of pending work
# "promises" is the ordinary JS idiom and has nothing to do with the feature.
ALLOW_IDIOM='(const|let) promises\b|promises\.push\(|promises\.length|, promises\b|\(promises\)'

# The revamp plan documents the rename itself, so it has to be able to write the
# old name. Excluded by path rather than by pattern: any OTHER doc saying
# "promise" is still a real finding.
PLAN_DOCS='apps/website/src/content/docs/plans/loops-revamp\.tsx'

MATCHES=$(grep -rn --binary-files=without-match \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude-dir=Pods \
  --exclude='*.lock' \
  --exclude='*.lockb' \
  --exclude='yarn.lock' \
  -iE '\bpromises?\b' \
  apps/server/src apps/client/app apps/client/features apps/client/components \
  apps/client/services apps/client/hooks apps/client/stores apps/client/e2e \
  apps/desktop/src apps/website/src/content/docs 2>/dev/null \
  | grep -vE "$ALLOW" \
  | grep -vE "$ALLOW_IDIOM" \
  | grep -vE "$PLAN_DOCS" \
  | grep -vE 'LEGACY_LOOP_DETECTION_KEY|claire\.settings\.promiseDetection' \
  | grep -vE "i promise|I promise|product promise|not a promise that|a broken promise" \
  | grep -vE "=== 'promises'|pre-rename|before the rename|before the loops rename" \
  || true)

if [ -n "$MATCHES" ]; then
  echo "Found 'promise' references that should say 'loop':" >&2
  echo "$MATCHES" >&2
  echo >&2
  echo "If a reference is deliberate, add it to the ALLOW list in $0 with a reason." >&2
  exit 1
fi

echo "OK: no stray 'promise' references."
