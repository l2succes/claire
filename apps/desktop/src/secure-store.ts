import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * OS-backed credential storage — Keychain on macOS, DPAPI on Windows,
 * libsecret on Linux.
 *
 * This is the Electron counterpart to the Keychain the React Native macOS host
 * used for the companion identity and device credential. The important
 * property is preserved: values live in the main process and are never handed
 * to the renderer. The renderer can ask for a value by key, but the ciphertext
 * and the OS key never cross the IPC boundary.
 *
 * Ciphertext is written to userData rather than kept in memory so a signed-in
 * session survives a relaunch, matching the macOS host's behaviour.
 */

type SecureFile = Record<string, string>;

let cache: SecureFile | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'secure-store.json');
}

function load(): SecureFile {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    cache =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as SecureFile)
        : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(store: SecureFile): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 0o600: even encrypted, the file should not be world-readable.
  fs.writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function secureGet(key: string): string | null {
  const encoded = load()[key];
  if (!encoded) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    // A value encrypted under a different OS key (restored backup, new user)
    // is unreadable, not corrupt. Treat it as absent so the app re-authenticates.
    return null;
  }
}

export function secureSet(key: string, value: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const store = load();
  store[key] = safeStorage.encryptString(value).toString('base64');
  persist(store);
  return true;
}

export function secureDelete(key: string): void {
  const store = load();
  if (!(key in store)) return;
  delete store[key];
  persist(store);
}
