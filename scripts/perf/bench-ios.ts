#!/usr/bin/env bun
/**
 * Screen-load benchmark for the iOS Simulator.
 *
 * The app writes timing marks to its own container (see
 * apps/client/services/perf-marks.ts). This script kills it, launches it,
 * waits for the marks it is looking for, and reports medians across runs.
 *
 * Wall-clock, not a JS-relative counter: the launch timestamp is taken here on
 * the host, and the simulator shares the host clock, so "process launch to
 * first paint" is a subtraction rather than a guess.
 *
 * Usage:
 *   bun scripts/perf/bench-ios.ts --label baseline --runs 5
 *   bun scripts/perf/bench-ios.ts --label after --runs 5 --bundle com.claire.app
 */
import { $ } from 'bun';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

type Mark = {
  screen: string;
  event: string;
  t: number;
  sinceMount?: number;
  source?: string;
  detail?: Record<string, unknown>;
};

type Run = { launchedAt: number; marks: Mark[] };

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BUNDLE = arg('bundle', 'com.claire.app')!;
const RUNS = Number(arg('runs', '5'));
const LABEL = arg('label', 'run')!;
const DEVICE = arg('device', 'booted')!;
const SETTLE_TIMEOUT_MS = Number(arg('timeout', '20000'));
const OUT_DIR = path.join(import.meta.dir, '../../docs/testing/perf');

async function deviceId(): Promise<string> {
  if (DEVICE !== 'booted') return DEVICE;
  const listed = await $`xcrun simctl list devices booted -j`.text();
  const parsed = JSON.parse(listed) as { devices: Record<string, Array<{ udid: string; state: string }>> };
  for (const devices of Object.values(parsed.devices)) {
    const booted = devices.find((device) => device.state === 'Booted');
    if (booted) return booted.udid;
  }
  throw new Error('No booted simulator. Boot one in Simulator.app first.');
}

async function marksFile(udid: string): Promise<string> {
  const container = (await $`xcrun simctl get_app_container ${udid} ${BUNDLE} data`.text()).trim();
  return path.join(container, 'Documents', 'perf-marks.json');
}

async function readMarks(file: string): Promise<Mark[]> {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { marks?: Mark[] };
    return parsed.marks ?? [];
  } catch {
    // A read that lands mid-write sees a partial document; the next poll is fine.
    return [];
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function coldRun(udid: string, file: string): Promise<Run> {
  await $`xcrun simctl terminate ${udid} ${BUNDLE}`.quiet().nothrow();
  await $`rm -f ${file}`.quiet().nothrow();
  await sleep(1_500);

  const launchedAt = Date.now();
  await $`xcrun simctl launch ${udid} ${BUNDLE}`.quiet();

  const deadline = launchedAt + SETTLE_TIMEOUT_MS;
  let marks: Mark[] = [];
  while (Date.now() < deadline) {
    marks = await readMarks(file);
    // The inbox settling is the end of the interesting window; everything
    // before it is what this benchmark is about.
    if (marks.some((mark) => mark.screen === 'inbox' && mark.event === 'settled')) break;
    await sleep(150);
  }
  // The flush is debounced by a second, so give the last marks time to land.
  await sleep(1_500);
  return { launchedAt, marks: await readMarks(file) };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function summarise(runs: Run[]) {
  const buckets = new Map<string, number[]>();
  for (const run of runs) {
    for (const mark of run.marks) {
      const name = mark.screen === 'app'
        ? `app:${String(mark.detail?.phase ?? 'phase')}`
        : `${mark.screen}:${mark.event}`;
      const value = mark.t - run.launchedAt;
      const bucket = buckets.get(name) ?? [];
      bucket.push(value);
      buckets.set(name, bucket);
    }
  }
  const rows = [...buckets.entries()]
    .map(([name, values]) => ({
      name,
      median: median(values),
      min: Math.min(...values),
      max: Math.max(...values),
      samples: values.length,
    }))
    .sort((left, right) => (left.median ?? 0) - (right.median ?? 0));
  return rows;
}

const udid = await deviceId();
const file = await marksFile(udid);
console.log(`device ${udid}\nbundle ${BUNDLE}\nmarks  ${file}\n`);

const runs: Run[] = [];
for (let index = 0; index < RUNS; index += 1) {
  process.stdout.write(`run ${index + 1}/${RUNS} ... `);
  const run = await coldRun(udid, file);
  console.log(`${run.marks.length} marks`);
  if (!run.marks.length) {
    console.log('  no marks: is the build instrumented (EXPO_PUBLIC_PERF_MARKS=1) and signed in?');
  }
  runs.push(run);
}

const rows = summarise(runs);
console.log(`\nms from process launch (median of ${RUNS} cold starts)\n`);
console.log('| mark | median | min | max | n |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const row of rows) {
  console.log(`| ${row.name} | ${row.median} | ${row.min} | ${row.max} | ${row.samples} |`);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, `${LABEL}.json`), JSON.stringify({ label: LABEL, bundle: BUNDLE, udid, runs, rows }, null, 2));
console.log(`\nwrote ${path.join(OUT_DIR, `${LABEL}.json`)}`);
