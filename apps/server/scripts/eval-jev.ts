/** Read-only JSONL/synthetic replay. Dry-run unless --run is supplied. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MODEL, RUBRIC_VERSION, baseline, caseSchema, digest, eligible, evaluateRemote,
  partition, requestFor, route, summarize, syntheticCases, type Measurement,
} from '../src/services/ai/eval/jev';

async function main() {
  const args = process.argv.slice(2);
  const get = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    if (i < 0) return fallback;
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`VALUE_REQUIRED_${name}`);
    return args[i + 1];
  };
  const allowed = new Set(['--run', '--dataset', '--out', '--limit', '--split', '--threshold', '--help']);
  for (const arg of args.filter(a => a.startsWith('--'))) if (!allowed.has(arg)) throw new Error('UNKNOWN_FLAG');
  if (args.includes('--help')) {
    console.log('bun scripts/eval-jev.ts [--dataset cases.jsonl] [--run] [--limit 100] [--split all|development|holdout] [--threshold 0.05] [--out /private/results]');
    return;
  }
  const limit = Number(get('--limit', '100'));
  const threshold = Number(get('--threshold', '0.05'));
  const split = get('--split', 'all');
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('LIMIT_MUST_BE_1_TO_500');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('INVALID_THRESHOLD');
  if (!['all', 'development', 'holdout'].includes(split)) throw new Error('INVALID_SPLIT');
  const dataset = get('--dataset', '');
  const cases = dataset ? readFileSync(dataset, 'utf8').split('\n').filter(l => l.trim()).map((line, i) => {
    try { return caseSchema.parse(JSON.parse(line)); } catch { throw new Error(`INVALID_DATASET_LINE_${i + 1}`); }
  }) : syntheticCases();
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('DUPLICATE_CASE_IDS');
  const selected = cases.filter(c => split === 'all' || partition(c.conversationId) === split).slice(0, limit);
  if (!selected.length) throw new Error('NO_CASES_SELECTED');
  const run = args.includes('--run');
  const apiKey = process.env.TYPESAFE_API_KEY || '';
  if (run && !apiKey) throw new Error('MISSING_TYPESAFE_API_KEY');
  const output = resolve(get('--out', `out/jev-eval/${new Date().toISOString().replace(/[:.]/g, '-')}`));
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const rows: Measurement[] = [];
  const save = () => {
    const summary = {
      mode: run ? 'live' : 'dry-run', model: MODEL, rubricVersion: RUBRIC_VERSION,
      datasetHash: digest(cases), selectedHash: digest(selected), threshold, split,
      createdAt: new Date().toISOString(), summary: summarize(rows),
      byLanguage: Object.fromEntries([...new Set(rows.map(r => r.language))].map(l => [l, summarize(rows.filter(r => r.language === l))])),
      bySplit: Object.fromEntries(['development', 'holdout'].map(s => [s, summarize(rows.filter(r => r.split === s))])),
    };
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
    writeFileSync(resolve(output, 'decisions.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
    return summary;
  };
  for (const item of selected) {
    const gate = baseline(item);
    const row: Measurement = {
      caseId: digest(item.id).slice(0, 16), conversationHash: digest(item.conversationId).slice(0, 16),
      split: partition(item.conversationId), source: item.source, language: item.language,
      labels: item.labels, baselineRun: gate.run, baselineSkipReason: gate.skipReason, eligible: eligible(item),
    };
    if (run && row.eligible) {
      const started = performance.now();
      try { row.response = await evaluateRemote(item, apiKey); }
      catch (error) {
        const message = error instanceof Error ? error.message : '';
        row.error = /^(TYPESAFE_HTTP_\d+|INVALID_TYPESAFE_RESPONSE|INPUT_TOO_LARGE)$/.test(message) ? message : 'REQUEST_FAILED';
      }
      row.latencyMs = Math.round(performance.now() - started);
      const decision = route(item, row.response ?? null, threshold);
      row.extract = decision.extract; row.routeReason = decision.reason;
    }
    rows.push(row);
    save(); // Checkpoint without conversation bodies, even if a later request fails.
    if (row.error === 'TYPESAFE_HTTP_401' || row.error === 'TYPESAFE_HTTP_403' || row.error === 'TYPESAFE_HTTP_429') break;
    if (run) await Bun.sleep(250);
  }
  const summary = save();
  const payloadBytes = selected.filter(eligible).reduce((n, c) => n + Buffer.byteLength(JSON.stringify(requestFor(c))), 0);
  console.log(JSON.stringify({ output, requestPayloadBytes: payloadBytes, ...summary }, null, 2));
  if (rows.some(r => r.error)) process.exitCode = 1;
}

main().catch(error => {
  // No stack trace or dataset/provider error payload in terminal output.
  const message = error instanceof Error ? error.message : '';
  console.error(/^[A-Z0-9_-]+$/.test(message) ? message : 'EVALUATION_FAILED');
  process.exitCode = 1;
});
