import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Non-sensitive UI preferences only: window bounds, pane widths, last
 * workspace. Credentials never come through here — those belong in
 * `safeStorage`, matching how the macOS host keeps them in Keychain.
 */
type PreferenceStore = Record<string, string>;

let cache: PreferenceStore | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function load(): PreferenceStore {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    cache =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as PreferenceStore)
        : {};
  } catch {
    // A missing or corrupt preferences file is not an error worth surfacing —
    // the app simply starts with defaults.
    cache = {};
  }
  return cache;
}

function persist(store: PreferenceStore): void {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2));
  } catch {
    // Losing a UI preference must never take the window down with it.
  }
}

export function getPreference(key: string): string | null {
  return load()[key] ?? null;
}

export function setPreference(key: string, value: string): void {
  const store = load();
  store[key] = value;
  persist(store);
}

export type WindowBounds = { width: number; height: number; x?: number; y?: number };

const WINDOW_BOUNDS_KEY = 'window.bounds';
const DEFAULT_BOUNDS: WindowBounds = { width: 1280, height: 860 };

export function getWindowBounds(): WindowBounds {
  const raw = getPreference(WINDOW_BOUNDS_KEY);
  if (!raw) return DEFAULT_BOUNDS;
  try {
    const parsed = JSON.parse(raw) as Partial<WindowBounds>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return DEFAULT_BOUNDS;
    }
    return {
      width: Math.max(parsed.width, 900),
      height: Math.max(parsed.height, 600),
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
    };
  } catch {
    return DEFAULT_BOUNDS;
  }
}

export function saveWindowBounds(bounds: WindowBounds): void {
  setPreference(WINDOW_BOUNDS_KEY, JSON.stringify(bounds));
}
