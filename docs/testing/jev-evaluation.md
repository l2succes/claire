**Jev evaluation — prepared 21 September 2026**

The runner is implemented and its local checks pass. Live Jev inference and evaluation of the owner's saved conversations have **not run**: no `TYPESAFE_API_KEY` was available in the checked environment/server env files, 1Password CLI was not signed in, and local Docker was unavailable. Dataset location/account scope still needs to be established.

The initial dry-run covered 33 synthetic cases: 23 existing hand-authored/adversarial scenarios and 10 new semantic probes. One scenario was policy-excluded. Existing scenarios remain unlabeled for Jev because their expected result describes personal relevance, which is a different question from whether a conversation contains any loop candidate. The new probes have provisional author-supplied semantic labels; they are deliberately targeted regression examples, not a representative estimate of production quality.

The existing deterministic relevance suite passed its release gates for seed 42 / six variants per combination. This does not evaluate a model. The Jev harness's 12 unit tests passed, covering policy exclusions, response validation, errors, label leakage, routing, input validation and metric calculations. Test responses are mocked and provide no evidence about Jev accuracy.

**Run locally**

From the repository root:

```sh
# No network; load the synthetic set and compute the actual regex baseline.
bun run eval:jev --out out/jev-eval/baseline

# Live synthetic smoke test, with TYPESAFE_API_KEY supplied through the environment.
bun run eval:jev --run --limit 50 --out out/jev-eval/synthetic-live

# Replay a normalized private conversation export. Dry-run first.
bun run eval:jev --dataset /private/path/cases.jsonl --out out/jev-eval/data-preview
bun run eval:jev --dataset /private/path/cases.jsonl --run --limit 100 --split development --out out/jev-eval/development

# Freeze the rubric and threshold before opening the held-out results.
bun run eval:jev --dataset /private/path/cases.jsonl --run --limit 100 --split holdout --out out/jev-eval/holdout
```

Use a different output directory for each run. Supply credentials via an existing secure environment or `op run` with an ignored reference file; do not paste keys into commands or committed files. The runner needs no database credentials and does not import production database modules. It sends inference only to `https://api.typesafe.ai/v1/systemone`, with redirects rejected.

`--run` enables API calls; the default is offline. The limit defaults to 100 and cannot exceed 500 selected cases per invocation. Requests are sequential, with a 250ms pause, 10-second timeout, 24,000-byte payload cap, and no automatic retries. Authentication and rate-limit errors stop the run after saving progress. Any inference failure produces a nonzero exit status. Re-running issues fresh calls: checkpoints are reports, not a response cache.

**Dataset format**

Use one JSON object per line. For example (formatted here for reading; store each object on one line):

```json
{
  "id": "conversation-a-window-1",
  "conversationId": "conversation-a",
  "source": "conversation-export",
  "language": "es",
  "platform": "whatsapp",
  "isGroup": false,
  "aiEnabled": true,
  "detectionEnabled": true,
  "sensitivity": "normal",
  "messages": [
    {
      "ref": "m1",
      "sender": "Peer 1",
      "content": "¿Me puedes enviar la factura?",
      "isSelf": false,
      "at": "2026-09-21T12:00:00Z"
    }
  ],
  "openLoops": [],
  "labels": { "loopCandidate": true, "replyUseful": true }
}
```

Take a bounded, read-only snapshot scoped to the owner's account. The schema requires explicit `isGroup`, `aiEnabled`, `detectionEnabled`, and `sensitivity` values. Populate `aiEnabled` from effective account/chat scope rather than assuming every chat is enabled. Preserve chronological speaker turns and enough context to resolve short replies; do not export just individual incoming texts. Use pseudonyms where feasible and retain a private mapping locally if needed. Remove credentials and unnecessary identifying metadata. Keep the original dataset outside Git (the root `out/` directory is ignored).

Optional fields include `groupName`, `watchTerms`, `consecutiveEmpty`, and `labels.groupCategory`. Supply the actual open-loop state at the window time if available. Do not attach today's loops to old windows: that leaks future information. Without historical state, mark the evaluation as candidate classification rather than a faithful replay of completion handling. The runner currently treats all supplied messages as the gate delta, not production cursor overlap; construct samples accordingly.

The runner does not extract data from a live database. A live export must first resolve which account and data source the user means. It should include a representative random sample and separate challenge slices, not only messages that the current model already processed. The runner preserves input order before applying `--limit`, so create a seeded, stratified sample upstream rather than passing a large chronologically sorted export and interpreting its first 100 rows as representative.

Assign languages explicitly; `unknown` remains unknown rather than being guessed by the evaluator. Multiple windows from one conversation always hash to the same development/holdout partition. Keep exact duplicate windows in the same partition or remove them before use. The default `--split all` is for smoke testing, not tuning and final evaluation together.

**Labels and interpretation**

- `loopCandidate`: any unresolved request, commitment, tentative plan, deadline, question or decision in the supplied window, or evidence changing a supplied open loop. This is independent of who owns it. Personal relevance remains a later deterministic decision.
- `replyUseful`: whether the owner would benefit from a prepared reply at the end of the exchange. Include already answered messages, terminal acknowledgments, and broadcasts as negative examples. Borderline conversational cases need adjudication before treating them as ground truth.
- `groupCategory`: one of work, planning, family, friends, community, announcement, unknown. Group labels are scored only when supplied for a group case.

Missing labels stay missing. Existing model decisions and heuristic agreement are not accuracy labels. For the real dataset, manually review a stratified labeled subset and model disagreements, including unanimous negatives; otherwise shared misses will be invisible. Report human label provenance and disagreement separately. The script currently compares Jev with the free loop gate, not a second paid extraction model, and does not claim to validate generated replies or the full extraction pipeline.

The candidate cascade uses an experimental 0.05 Noul threshold: probabilities at or above it proceed to extraction. Supplied open loops, recognized owner commitments and watch terms bypass suppression. A failed call falls back to the actual regex baseline; failed semantic-recovery cases therefore still require review. The reported raw binary model metrics use 0.5, while cascade metrics use the configured routing threshold. Do not choose thresholds by examining the final holdout.

The reply question is measured but does not control a production reply gate. Group category accuracy is measured only for labeled cases; the runner does not simulate group-label confidence thresholds. No resulting decision creates/updates loops, sends messages, or changes AI settings.

**Reports**

Each output directory contains `report.json` and `decisions.jsonl`, written with mode 0600. Reports contain hashed case/conversation identifiers, labels, model probabilities, errors, usage and timing; no message text, group names, prompts or credentials. The supplied dataset remains the private source for looking up disagreement hashes. Output directories are created with mode 0700.

The summary includes precision/recall and confusion counts for available labels, Brier score, a 95% Wilson lower bound on recall, latency p50/p95 for successful requests, known token cost, and counts of avoided/additional extraction calls. It also breaks down results by language and conversation split. An API error marks cost incomplete because a timed-out or invalid response may still have been billed. Cost uses the published $0.042/M input rate for pinned `jev-1.13.0`; recheck pricing before a later run.

Acceptance requires sufficient positive examples in each meaningful language/use case and review of false negatives. Ten passing probes cannot establish 99% recall. The final assessment should also account for downstream extraction costs, fallback frequency, and the added latency before enabling any live routing. Native UI and end-to-end reply/extraction verification remain separate work after a candidate integration is selected.

Initial artifacts: [offline baseline report](/Users/luc/Projects/claire/out/jev-eval/baseline/report.json). Entry point: [eval-jev.ts](/Users/luc/Projects/claire/apps/server/scripts/eval-jev.ts). Design context: [Jev assessment](/Users/luc/Projects/claire/docs/architecture/JEV_ASSESSMENT.md).
