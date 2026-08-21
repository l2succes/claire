/**
 * Scores the loop pipeline against a scenario corpus.
 *
 * Deliberately dependency-free: no database, no network, no API key. The
 * relevance stage is deterministic, so this runs in CI on every commit and a
 * failure is always a real regression rather than model variance.
 */

import { decideRelevance, type WindowMessage } from '../relevance';
import type { EvalSummary, LoopScenario, ScenarioResult } from './types';

const CONVERSATION_START = Date.parse('2026-08-17T09:00:00Z');

/** Turn a scenario's readable message list into detection-window input. */
export function toWindow(scenario: LoopScenario): WindowMessage[] {
  const selfNames = new Set(['you', ...scenario.self.displayNames]);
  const refToId = new Map<string, string>();
  scenario.messages.forEach((m) => refToId.set(m.ref, `${scenario.id}:${m.ref}`));

  return scenario.messages.map((m, index) => ({
    id: `${scenario.id}:${m.ref}`,
    ref: m.ref,
    senderName: m.from,
    isSelf: selfNames.has(m.from.toLowerCase()),
    content: m.text,
    at: new Date(CONVERSATION_START + (m.atMinute ?? index) * 60_000).toISOString(),
    mentions: m.mentions,
    mentionsRoom: m.mentionsRoom,
    replyToId: m.replyTo ? refToId.get(m.replyTo) : undefined,
  }));
}

function evidenceFor(scenario: LoopScenario, window: WindowMessage[]): WindowMessage[] {
  if (!scenario.evidenceRefs?.length) return window;
  const wanted = new Set(scenario.evidenceRefs);
  const selected = window.filter((m) => wanted.has(m.ref));
  // An evidenceRefs typo would silently widen the evidence to the whole window
  // and quietly change what is being tested, so fail loudly instead.
  if (selected.length !== scenario.evidenceRefs.length) {
    throw new Error(
      `[${scenario.id}] evidenceRefs references unknown message refs: ` +
        scenario.evidenceRefs.filter((r) => !window.some((m) => m.ref === r)).join(', '),
    );
  }
  return selected;
}

export function runScenario(scenario: LoopScenario): ScenarioResult {
  const window = toWindow(scenario);
  const evidence = evidenceFor(scenario, window);

  const decision = decideRelevance(
    {
      platform: scenario.platform,
      isGroup: scenario.isGroup,
      memberCount: scenario.memberCount,
      self: scenario.self,
      window,
      evidence,
      roster: scenario.roster,
      watchTerms: scenario.watchTerms,
      llmOwner: scenario.llmOwner,
      llmOwnerName: scenario.llmOwnerName,
      llmAddressed: scenario.llmAddressed,
    },
    scenario.sensitivity,
  );

  const firedSignals = decision.signals.filter((s) => s.hit).map((s) => s.id);
  const failures: string[] = [];

  if (decision.surfaced !== scenario.expect.surfaced) {
    failures.push(
      scenario.expect.surfaced
        ? `expected to surface but was suppressed (${decision.suppressedReason}), ` +
          `score ${decision.score} < threshold ${decision.threshold}`
        : `expected suppression but surfaced, score ${decision.score} >= threshold ${decision.threshold}`,
    );
  }

  if (
    scenario.expect.suppressedReason &&
    decision.suppressedReason !== scenario.expect.suppressedReason
  ) {
    failures.push(
      `expected suppression reason "${scenario.expect.suppressedReason}", got "${decision.suppressedReason}"`,
    );
  }

  // Right answer for the wrong reason is still a bug — it means the score is
  // being carried by a signal that will not generalise.
  for (const id of scenario.expect.signalsFire ?? []) {
    if (!firedSignals.includes(id)) failures.push(`expected signal "${id}" to fire`);
  }
  for (const id of scenario.expect.signalsSilent ?? []) {
    if (firedSignals.includes(id)) failures.push(`expected signal "${id}" to stay silent`);
  }

  const failed = failures.length > 0;
  return {
    scenario,
    passed: !failed,
    knownLimitationHit: failed && Boolean(scenario.knownLimitation),
    unexpectedPass: !failed && Boolean(scenario.knownLimitation),
    failures,
    actual: {
      surfaced: decision.surfaced,
      score: decision.score,
      threshold: decision.threshold,
      suppressedReason: decision.suppressedReason,
      hardPass: decision.hardPass,
      firedSignals,
    },
  };
}

export function runCorpus(scenarios: LoopScenario[]): EvalSummary {
  const results = scenarios.map(runScenario);

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  const byPlatform: Record<string, { total: number; passed: number }> = {};

  for (const r of results) {
    // Known limitations are excluded from the metrics: they document where
    // deterministic scoring gives up, and folding them in would either hide a
    // real regression or permanently depress the numbers.
    if (r.knownLimitationHit) continue;
    const expected = r.scenario.expect.surfaced;
    const actual = r.actual.surfaced;
    if (expected && actual) truePositives += 1;
    else if (!expected && actual) falsePositives += 1;
    else if (expected && !actual) falseNegatives += 1;
    else trueNegatives += 1;

    const p = (byPlatform[r.scenario.platform] ??= { total: 0, passed: 0 });
    p.total += 1;
    if (r.passed) p.passed += 1;
  }

  const knownLimitations = results.filter((r) => r.knownLimitationHit).length;
  const unexpectedPasses = results.filter((r) => r.unexpectedPass).length;

  const precision = truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const groups = results.filter((r) => r.scenario.isGroup && !r.knownLimitationHit);
  const groupCorrect = groups.filter((r) => r.actual.surfaced === r.scenario.expect.surfaced).length;

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed && !r.knownLimitationHit).length,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    knownLimitations,
    unexpectedPasses,
    precision,
    recall,
    f1,
    groupSuppressionAccuracy: groups.length === 0 ? 1 : groupCorrect / groups.length,
    byPlatform,
    results,
  };
}

/**
 * Release gates from /docs/plans/loops-revamp §10.
 *
 * Group-suppression accuracy is the headline: it is where the current detector
 * fails. False positives are weighted harder than false negatives throughout —
 * a wrong loop erodes trust in every other loop, while a missed one is a gap
 * the user can still fill themselves.
 */
export const RELEASE_GATES = {
  groupSuppressionAccuracy: 0.9,
  precision: 0.85,
  recall: 0.7,
} as const;

export function meetsReleaseGates(summary: EvalSummary): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (summary.groupSuppressionAccuracy < RELEASE_GATES.groupSuppressionAccuracy) {
    failures.push(
      `group-suppression accuracy ${summary.groupSuppressionAccuracy.toFixed(3)} < ${RELEASE_GATES.groupSuppressionAccuracy}`,
    );
  }
  if (summary.precision < RELEASE_GATES.precision) {
    failures.push(`precision ${summary.precision.toFixed(3)} < ${RELEASE_GATES.precision}`);
  }
  if (summary.recall < RELEASE_GATES.recall) {
    failures.push(`recall ${summary.recall.toFixed(3)} < ${RELEASE_GATES.recall}`);
  }
  return { ok: failures.length === 0, failures };
}
