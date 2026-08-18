/**
 * Runs the loop evaluation corpus as part of the normal test suite.
 *
 * The relevance stage is deterministic, so the eval belongs in CI rather than
 * in a separate manual step: a metric regression should break the build the
 * same way a unit-test failure does. `scripts/eval-loops.ts` is the same corpus
 * with a human-readable report for when you want to see *why*.
 */

import { describe, it, expect } from 'bun:test';
import {
  ADVERSARIAL,
  fullCorpus,
  generateScenarios,
  HAND_AUTHORED,
} from '../../../src/services/loops/eval/generate';
import { meetsReleaseGates, runCorpus, runScenario } from '../../../src/services/loops/eval/runner';

describe('loop evaluation corpus', () => {
  const summary = runCorpus(fullCorpus());

  it('has no unexplained failures', () => {
    const unexplained = summary.results.filter((r) => !r.passed && !r.knownLimitationHit);
    const detail = unexplained
      .map((r) => `\n  ${r.scenario.id}: ${r.failures.join('; ')}`)
      .join('');
    expect(`${unexplained.length}${detail}`).toBe('0');
  });

  it('meets every release gate', () => {
    const gates = meetsReleaseGates(summary);
    expect(gates.failures.join('; ')).toBe('');
    expect(gates.ok).toBe(true);
  });

  it('surfaces nothing that should have been suppressed', () => {
    // False positives are the failure this revamp exists to fix, and they are
    // weighted harder than misses: a wrong loop erodes trust in every other one.
    const offenders = summary.results
      .filter((r) => !r.scenario.expect.surfaced && r.actual.surfaced && !r.knownLimitationHit)
      .map((r) => r.scenario.id);
    expect(offenders).toEqual([]);
  });

  it('reports any known limitation that has started passing', () => {
    // An unexpected pass means the corpus is stale, not that things are fine —
    // the case should be promoted to an enforced expectation.
    const stale = summary.results.filter((r) => r.unexpectedPass).map((r) => r.scenario.id);
    expect(stale).toEqual([]);
  });
});

describe('corpus integrity', () => {
  it('has unique scenario ids', () => {
    const ids = fullCorpus().map((s) => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('covers both DMs and groups', () => {
    const corpus = fullCorpus();
    expect(corpus.some((s) => s.isGroup)).toBe(true);
    expect(corpus.some((s) => !s.isGroup)).toBe(true);
  });

  it('covers both outcomes, so the metrics are meaningful', () => {
    // A corpus of only-surface or only-suppress cases produces a perfect score
    // that means nothing.
    const corpus = fullCorpus();
    expect(corpus.some((s) => s.expect.surfaced)).toBe(true);
    expect(corpus.some((s) => !s.expect.surfaced)).toBe(true);
  });

  it('exercises every platform in the catalog-backed generator', () => {
    const platforms = new Set(fullCorpus().map((s) => s.platform));
    for (const p of ['whatsapp', 'telegram', 'slack', 'instagram']) {
      expect(platforms.has(p)).toBe(true);
    }
  });

  it('documents a reason on every known limitation', () => {
    const undocumented = ADVERSARIAL.filter(
      (s) => s.knownLimitation !== undefined && s.knownLimitation.trim().length < 20,
    );
    expect(undocumented.map((s) => s.id)).toEqual([]);
  });

  it('rejects a scenario whose evidenceRefs point at nothing', () => {
    // A silent typo would widen the evidence to the whole window and quietly
    // change what the scenario tests.
    const broken = { ...HAND_AUTHORED[0], id: 'broken', evidenceRefs: ['does-not-exist'] };
    expect(() => runScenario(broken)).toThrow(/unknown message refs/);
  });
});

describe('generator determinism', () => {
  it('produces an identical corpus for the same seed', () => {
    const a = generateScenarios({ seed: 7, perCombination: 3 });
    const b = generateScenarios({ seed: 7, perCombination: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces a different corpus for a different seed', () => {
    const a = generateScenarios({ seed: 7, perCombination: 3 });
    const b = generateScenarios({ seed: 8, perCombination: 3 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('holds up across seeds rather than fitting one', () => {
    // A corpus that only passes on the committed seed is measuring nothing.
    for (const seed of [1, 7, 99, 1234, 31337]) {
      const s = runCorpus(fullCorpus({ seed, perCombination: 4 }));
      const unexplained = s.results.filter((r) => !r.passed && !r.knownLimitationHit);
      expect(`seed ${seed}: ${unexplained.map((r) => r.scenario.id).join(', ')}`).toBe(`seed ${seed}: `);
      expect(meetsReleaseGates(s).ok).toBe(true);
    }
  });

  it('renders mentions in each platform’s own style', () => {
    const corpus = generateScenarios({ seed: 3, perCombination: 1 });
    const whatsapp = corpus.find((s) => s.id.startsWith('gen-whatsapp-group_mentions_user'));
    const slack = corpus.find((s) => s.id.startsWith('gen-slack-group_mentions_user'));
    // WhatsApp writes the phone number; Slack writes the display name.
    expect(whatsapp!.messages[0].text).toContain('@15166100494');
    expect(slack!.messages[0].text).toContain('@Luc');
  });
});
