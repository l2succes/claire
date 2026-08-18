#!/usr/bin/env bun
/**
 * Loop pipeline evaluation.
 *
 *   bun run scripts/eval-loops.ts                    # full corpus
 *   bun run scripts/eval-loops.ts --hand-authored    # worked examples only
 *   bun run scripts/eval-loops.ts --seed 7 --per 5   # more generated volume
 *   bun run scripts/eval-loops.ts --json report.json # machine-readable
 *   bun run scripts/eval-loops.ts --gates            # exit non-zero below release gates
 *   bun run scripts/eval-loops.ts --show-passing     # print every scenario
 *
 * No database, no network, no API key: the relevance stage is deterministic,
 * so this runs anywhere and a failure is always a real regression.
 */

import { writeFileSync } from 'node:fs';
import { fullCorpus, generateScenarios, HAND_AUTHORED } from '../src/services/loops/eval/generate';
import { meetsReleaseGates, runCorpus } from '../src/services/loops/eval/runner';
import type { EvalSummary, ScenarioResult } from '../src/services/loops/eval/types';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function value(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function bar(value: number, width = 24): string {
  const filled = Math.round(value * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function printResult(r: ScenarioResult, verbose: boolean): void {
  const mark = r.passed ? `${GREEN}pass${RESET}` : `${RED}FAIL${RESET}`;
  const shape = r.scenario.isGroup ? `group/${r.scenario.memberCount ?? '?'}` : 'dm';
  console.log(
    `  ${mark}  ${r.scenario.id}  ${DIM}${r.scenario.platform} · ${shape} · ${r.scenario.sensitivity}${RESET}`,
  );
  if (r.passed && !verbose) return;

  console.log(`        ${DIM}${r.scenario.description}${RESET}`);
  if (r.scenario.source) console.log(`        ${DIM}source: ${r.scenario.source}${RESET}`);
  for (const failure of r.failures) console.log(`        ${RED}·${RESET} ${failure}`);
  console.log(
    `        ${DIM}score ${r.actual.score} / threshold ${r.actual.threshold}` +
      `${r.actual.hardPass ? ` · hard pass: ${r.actual.hardPass}` : ''}` +
      `${r.actual.firedSignals.length ? ` · signals: ${r.actual.firedSignals.join(', ')}` : ' · no signals fired'}${RESET}`,
  );
}

function report(summary: EvalSummary, verbose: boolean): void {
  console.log(`\n${BOLD}Loop evaluation${RESET}\n`);

  const failures = summary.results.filter((r) => !r.passed && !r.knownLimitationHit);
  const shown = verbose ? summary.results : failures;
  if (shown.length) {
    console.log(`${BOLD}${verbose ? 'Scenarios' : 'Failures'}${RESET}`);
    for (const r of shown) printResult(r, verbose);
    console.log();
  }

  const limits = summary.results.filter((r) => r.knownLimitationHit);
  if (limits.length) {
    console.log(`${BOLD}Known limitations${RESET}  ${DIM}(documented; not regressions)${RESET}`);
    for (const r of limits) {
      console.log(`  ${YELLOW}known${RESET}  ${r.scenario.id}  ${DIM}${r.scenario.platform}${RESET}`);
      console.log(`        ${DIM}${r.scenario.knownLimitation}${RESET}`);
    }
    console.log();
  }

  const surprises = summary.results.filter((r) => r.unexpectedPass);
  if (surprises.length) {
    console.log(`${BOLD}${YELLOW}Now passing despite being marked a limitation${RESET}`);
    for (const r of surprises) {
      console.log(`  ${r.scenario.id} — remove its knownLimitation so it is enforced`);
    }
    console.log();
  }

  console.log(`${BOLD}Scenarios${RESET}`);
  console.log(`  ${summary.passed}/${summary.total} passed` + (summary.failed ? `  ${RED}${summary.failed} failed${RESET}` : ''));

  console.log(`\n${BOLD}Classification${RESET}`);
  console.log(`  ${DIM}surfaced correctly     ${RESET}${summary.truePositives}`);
  console.log(`  ${DIM}suppressed correctly   ${RESET}${summary.trueNegatives}`);
  console.log(
    `  ${DIM}false positives        ${RESET}${summary.falsePositives}` +
      (summary.falsePositives ? `  ${YELLOW}(noise — someone else's business surfaced)${RESET}` : ''),
  );
  console.log(
    `  ${DIM}false negatives        ${RESET}${summary.falseNegatives}` +
      (summary.falseNegatives ? `  ${YELLOW}(missed loops)${RESET}` : ''),
  );

  console.log(`\n${BOLD}Metrics${RESET}`);
  console.log(`  precision                 ${bar(summary.precision)} ${pct(summary.precision)}`);
  console.log(`  recall                    ${bar(summary.recall)} ${pct(summary.recall)}`);
  console.log(`  F1                        ${bar(summary.f1)} ${pct(summary.f1)}`);
  console.log(
    `  group-suppression         ${bar(summary.groupSuppressionAccuracy)} ${pct(summary.groupSuppressionAccuracy)}  ${DIM}(headline)${RESET}`,
  );

  console.log(`\n${BOLD}By platform${RESET}`);
  for (const [platform, s] of Object.entries(summary.byPlatform).sort()) {
    const ok = s.passed === s.total;
    console.log(`  ${ok ? GREEN : RED}${s.passed}/${s.total}${RESET}  ${platform}`);
  }

  const pending = summary.results.filter((r) => r.scenario.pendingStage);
  if (pending.length) {
    console.log(
      `\n${DIM}${pending.length} scenarios also carry ground truth for the extraction stage,` +
        ` which is not built yet. Their relevance expectations are enforced; their` +
        ` expectLoops are not.${RESET}`,
    );
  }

  const gates = meetsReleaseGates(summary);
  console.log(`\n${BOLD}Release gates${RESET}`);
  if (gates.ok) {
    console.log(`  ${GREEN}all gates met${RESET}`);
  } else {
    for (const f of gates.failures) console.log(`  ${RED}·${RESET} ${f}`);
  }
  console.log();
}

function main(): void {
  const seed = Number(value('seed', '42'));
  const per = Number(value('per', '2'));

  const scenarios = flag('hand-authored')
    ? HAND_AUTHORED
    : flag('generated-only')
      ? generateScenarios({ seed, perCombination: per })
      : fullCorpus({ seed, perCombination: per });

  const summary = runCorpus(scenarios);
  report(summary, flag('show-passing'));

  const jsonPath = value('json');
  if (jsonPath) {
    // Drop the scenario bodies: the report is for tracking metrics over time,
    // and the corpus is reproducible from the seed anyway.
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          seed,
          perCombination: per,
          generatedAt: new Date().toISOString(),
          ...summary,
          results: summary.results.map((r) => ({
            id: r.scenario.id,
            platform: r.scenario.platform,
            isGroup: r.scenario.isGroup,
            passed: r.passed,
            failures: r.failures,
            actual: r.actual,
          })),
        },
        null,
        2,
      ),
    );
    console.log(`Wrote ${jsonPath}\n`);
  }

  if (flag('gates')) {
    const gates = meetsReleaseGates(summary);
    if (!gates.ok || summary.failed > 0) process.exit(1);
  } else if (summary.failed > 0) {
    process.exit(1);
  }
}

main();
