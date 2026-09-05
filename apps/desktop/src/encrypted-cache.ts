import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import type { EncryptedCacheInfo } from './shared/ipc';

/**
 * Renderer snapshots are sensitive even when they only contain previews. Keep
 * the whole payload behind Electron's OS-backed safeStorage and never offer a
 * plaintext fallback. Metadata is intentionally limited to file size/time.
 */
function cachePath(userId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex');
  return path.join(app.getPath('userData'), 'cache', `${hash}.bin`);
}

function validUserId(userId: unknown): userId is string {
  return typeof userId === 'string' && userId.length > 0 && userId.length < 256;
}

export function readEncryptedCache(userId: unknown): string | null {
  if (!validUserId(userId) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(cachePath(userId)));
  } catch {
    return null;
  }
}

export function writeEncryptedCache(userId: unknown, value: unknown): boolean {
  if (!validUserId(userId) || typeof value !== 'string' || !safeStorage.isEncryptionAvailable()) return false;
  // A snapshot is a cache, not a general disk channel. Keep accidental large
  // timeline dumps from turning the companion into an unbounded local store.
  if (Buffer.byteLength(value, 'utf8') > 20 * 1024 * 1024) return false;
  const file = cachePath(userId);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, safeStorage.encryptString(value), { mode: 0o600 });
    fs.renameSync(temporary, file);
    return true;
  } catch {
    try { fs.unlinkSync(temporary); } catch { /* no partial cache to retain */ }
    return false;
  }
}

export function clearEncryptedCache(userId: unknown): void {
  if (!validUserId(userId)) return;
  try { fs.unlinkSync(cachePath(userId)); } catch { /* already absent */ }
}

export function encryptedCacheInfo(userId: unknown): EncryptedCacheInfo {
  if (!validUserId(userId) || !safeStorage.isEncryptionAvailable()) {
    return { available: false, byteLength: 0, updatedAt: null };
  }
  try {
    const stat = fs.statSync(cachePath(userId));
    return { available: true, byteLength: stat.size, updatedAt: stat.mtime.toISOString() };
  } catch {
    return { available: true, byteLength: 0, updatedAt: null };
  }
}
