/**
 * Evaluation scenarios for the loop pipeline.
 *
 * A scenario is a synthetic conversation plus the ground truth for what Claire
 * should do with it. The same scenario feeds every stage of the pipeline, so a
 * failure can be attributed to the stage that caused it rather than to "the
 * detector" as a whole:
 *
 *   stage 1  relevance   — does this concern the user?          (deterministic)
 *   stage 2  extraction  — what is the loop, and who owns it?   (model, pending)
 *   stage 3  reconcile   — create, update, or close?            (pending)
 *
 * Only stage 1 exists today. Scenarios already carry `expectLoops` so the
 * corpus does not have to be rewritten when the detector lands.
 *
 * See /docs/plans/loops-revamp §10.
 */

import type { LoopSensitivity, ParticipantRef, SelfIdentity } from '../relevance';

export interface ScenarioMessage {
  /** Stable handle used in expectations and reports, e.g. "m3". */
  ref: string;
  /** Display name of the sender, or 'You'. */
  from: string;
  text: string;
  /** Minutes after the conversation start. Keeps fixtures readable. */
  atMinute?: number;
  /** Structured mentions as platform contact ids. */
  mentions?: string[];
  /** @channel / @here / @everyone. */
  mentionsRoom?: boolean;
  /** `ref` of the message this replies to. */
  replyTo?: string;
  /** `ref` of the thread root, on platforms with native threads. */
  threadRoot?: string;
}

/** Ground truth for a loop the pipeline should produce. Used from stage 2 on. */
export interface ExpectedLoop {
  /** Human label for reports. Matched loosely; not an exact-string assertion. */
  title: string;
  kind: 'commitment' | 'request' | 'plan' | 'deadline' | 'question' | 'decision';
  owner: 'me' | 'them' | 'shared' | 'unknown';
  /** Message refs that should be attached as evidence. */
  evidence: string[];
  /** Whether the conversation resolves it by the end of the window. */
  resolvedBy?: string[];
  deadlinePrecision?: 'exact' | 'day' | 'week' | 'month' | 'none';
}

export interface ScenarioExpectation {
  /** Should a loop be surfaced to the user at this sensitivity? */
  surfaced: boolean;
  /** When suppressed, the signal most responsible. Asserted when present. */
  suppressedReason?: string;
  /** Signals that must fire. Catches "right answer, wrong reason". */
  signalsFire?: string[];
  /** Signals that must NOT fire. */
  signalsSilent?: string[];
}

export interface LoopScenario {
  id: string;
  /** One line explaining what behavior this pins down, shown on failure. */
  description: string;
  /** Section of the plan this scenario comes from, for traceability. */
  source?: string;
  platform: string;
  isGroup: boolean;
  /** Real audience size where the bridge reports it. */
  memberCount?: number;
  sensitivity: LoopSensitivity;
  self: SelfIdentity;
  roster: ParticipantRef[];
  messages: ScenarioMessage[];
  /** Refs the extraction stage should cite. Defaults to all messages. */
  evidenceRefs?: string[];
  /** What the extraction stage would conclude. Stubbed until stage 2 exists. */
  llmOwner?: 'me' | 'them' | 'shared' | 'unknown';
  llmOwnerName?: string | null;
  llmAddressed?: boolean;
  watchTerms?: string[];
  expect: ScenarioExpectation;
  expectLoops?: ExpectedLoop[];
  /** Marks a scenario as a known gap rather than a regression. */
  pendingStage?: 'extraction' | 'reconcile';
  /**
   * A case the deterministic scorer is not expected to get right, with the
   * reason. Failures are reported but do not fail the build; an unexpected
   * *pass* is also reported, since that means the limitation is gone and the
   * corpus should be updated. This is how the boundary between what scoring
   * can do and what needs the model stays visible instead of being asserted.
   */
  knownLimitation?: string;
}

export interface ScenarioResult {
  scenario: LoopScenario;
  passed: boolean;
  /** Failed, but flagged as a known limitation rather than a regression. */
  knownLimitationHit: boolean;
  /** Passed despite being flagged as a known limitation — update the corpus. */
  unexpectedPass: boolean;
  /** One line per expectation that did not hold. */
  failures: string[];
  actual: {
    surfaced: boolean;
    score: number;
    threshold: number;
    suppressedReason: string | null;
    hardPass: string | null;
    firedSignals: string[];
  };
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  /** Surfaced when it should be. */
  truePositives: number;
  /** Surfaced when it should not have been — the noise this revamp exists to fix. */
  falsePositives: number;
  /** Suppressed when it should have surfaced — a missed loop. */
  falseNegatives: number;
  trueNegatives: number;
  /** Failures attributable to documented limitations of deterministic scoring. */
  knownLimitations: number;
  /** Known limitations that now pass and should be reclassified. */
  unexpectedPasses: number;
  precision: number;
  recall: number;
  f1: number;
  /**
   * Accuracy restricted to group conversations. The headline number: it is
   * where the current detector fails, and the release gate is set against it.
   */
  groupSuppressionAccuracy: number;
  byPlatform: Record<string, { total: number; passed: number }>;
  results: ScenarioResult[];
}
