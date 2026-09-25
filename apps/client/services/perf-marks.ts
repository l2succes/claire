/**
 * Screen-load instrumentation.
 *
 * The app had no timing plumbing at all, so "this screen feels slow" could only
 * ever be argued from impressions. These marks exist to make the claim testable:
 * a benchmark harness kills the app, launches it, and reads the JSON this module
 * writes to the app container.
 *
 * Wall clock, not a monotonic counter, because the numbers have to be comparable
 * with a `simctl launch` timestamp taken on the host — the simulator shares the
 * host clock, a JS-relative counter would not.
 */
import { AppState, Platform } from 'react-native';

export type PerfEvent = 'mount' | 'first-paint' | 'settled' | 'interaction';
export type PerfSource = 'cache' | 'network' | 'memory';

export type PerfMark = {
  screen: string;
  event: PerfEvent;
  /** Epoch milliseconds, comparable with a timestamp taken on the host. */
  t: number;
  /** Milliseconds since this screen's `mount` mark, when there was one. */
  sinceMount?: number;
  source?: PerfSource;
  detail?: Record<string, string | number | boolean>;
};

/**
 * Off by default. The calls stay in the production bundle but return before
 * doing any work, so instrumenting a screen costs a function call and nothing
 * else. Set EXPO_PUBLIC_PERF_MARKS=1 in the environment the bundle is built
 * with to collect.
 */
export const PERF_MARKS_ENABLED = process.env.EXPO_PUBLIC_PERF_MARKS === '1';

export const PERF_MARKS_FILENAME = 'perf-marks.json';

const marks: PerfMark[] = [];
const mountedAt = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let appStateBound = false;

/** Process start, as close to it as a JS module can observe. */
export const jsStartedAt = Date.now();

function scheduleFlush() {
  if (flushTimer) return;
  // Debounced rather than immediate: a screen settling fires several marks in
  // the same frame, and writing the whole array once per frame would put file
  // I/O on exactly the path being measured.
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushPerfMarks();
  }, 1_000);
}

function bindAppState() {
  if (appStateBound || !PERF_MARKS_ENABLED) return;
  appStateBound = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') void flushPerfMarks();
  });
}

export function perfMark(
  screen: string,
  event: PerfEvent,
  extra?: { source?: PerfSource; detail?: Record<string, string | number | boolean> },
): void {
  if (!PERF_MARKS_ENABLED) return;
  bindAppState();
  const t = Date.now();
  if (event === 'mount' && !mountedAt.has(screen)) mountedAt.set(screen, t);
  const start = mountedAt.get(screen);
  const mark: PerfMark = {
    screen,
    event,
    t,
    ...(start !== undefined ? { sinceMount: t - start } : {}),
    ...(extra?.source ? { source: extra.source } : {}),
    ...(extra?.detail ? { detail: extra.detail } : {}),
  };
  marks.push(mark);
  if (__DEV__) {
    // Metro / the RN debugger is the only channel that shows these live during
    // a debug run; the file is what the release harness reads.
    console.info('[perf]', mark.screen, mark.event, mark.sinceMount ?? 0, mark.source ?? '');
  }
  scheduleFlush();
}

/** Marks that belong to app startup rather than to any one screen. */
export function appMark(event: string, detail?: Record<string, string | number | boolean>): void {
  perfMark('app', 'interaction', { detail: { phase: event, ...(detail ?? {}) } });
}

export function readPerfMarks(): PerfMark[] {
  return [...marks];
}

export function resetPerfMarks(): void {
  marks.length = 0;
  mountedAt.clear();
}

/**
 * Writes every mark collected so far to the app's document directory.
 *
 * Rewrites the whole array rather than appending, so a harness reading the file
 * mid-run always sees a valid JSON document instead of a truncated one.
 */
export async function flushPerfMarks(): Promise<void> {
  if (!PERF_MARKS_ENABLED || Platform.OS === 'web' || !marks.length) return;
  try {
    // Required lazily: on web this module resolves to a stub, and pulling the
    // native file system into the startup graph for a disabled feature would
    // undo part of what is being measured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const file = new File(Paths.document, PERF_MARKS_FILENAME);
    file.write(JSON.stringify({ jsStartedAt, marks }, null, 2));
  } catch (error) {
    if (__DEV__) console.warn('[perf] flush failed', error);
  }
}
