import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { secureGet, secureSet } from './secure-store';
import { getPreference, setPreference } from './preferences';

const execFileAsync = promisify(execFile);
const DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const BATCH_SIZE = 200;

export type CompanionSetupRequest = { apiUrl: string; accessToken: string; userId: string };
export type CompanionSetupResult = { success: boolean; error?: string; deviceId?: string };

type CompanionCredential = { deviceId: string; token: string };
type IMessageRow = {
  rowId: number;
  platformMessageId: string;
  content: string;
  senderId: string;
  senderName: string;
  chatId: string;
  chatType: 'individual' | 'group';
  chatName: string;
  timestamp: string;
  isFromMe: boolean;
  isRead: boolean;
  hasMedia: boolean;
};

let runtime: CompanionSetupRequest | null = null;
let syncing = false;
let periodic: ReturnType<typeof setInterval> | null = null;
let watcher: fs.FSWatcher | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

export function iMessageDatabasePath(): string { return DB_PATH; }
export function canReadIMessageDatabase(): boolean {
  try { fs.accessSync(DB_PATH, fs.constants.R_OK); return true; } catch { return false; }
}

function key(prefix: string, userId: string): string { return `claire.companion.${prefix}.${userId}`; }
function cursorKey(userId: string): string { return `companion.imessage.cursor.${createHash('sha256').update(userId).digest('hex')}`; }

function validSetup(value: unknown): value is CompanionSetupRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CompanionSetupRequest;
  if (typeof candidate.apiUrl !== 'string' || typeof candidate.accessToken !== 'string' || typeof candidate.userId !== 'string') return false;
  if (candidate.accessToken.length < 20 || candidate.userId.length < 8) return false;
  try { return /^https?:$/.test(new URL(candidate.apiUrl).protocol); } catch { return false; }
}

async function credentialFor(setup: CompanionSetupRequest): Promise<CompanionCredential | null> {
  const deviceId = secureGet(key('device-id', setup.userId));
  const token = secureGet(key('device-token', setup.userId));
  return deviceId && token ? { deviceId, token } : null;
}

async function enrol(setup: CompanionSetupRequest): Promise<CompanionCredential> {
  let publicKey = secureGet(key('identity', setup.userId));
  if (!publicKey) {
    publicKey = randomBytes(48).toString('base64url');
    if (!secureSet(key('identity', setup.userId), publicKey)) throw new Error('macOS Keychain is unavailable.');
  }
  const response = await fetch(new URL('/devices', setup.apiUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setup.accessToken}` },
    body: JSON.stringify({ displayName: 'Claire Desktop on Mac', hostPlatform: 'macos', publicKey, capabilities: ['desktop_client', 'imessage_host', 'imessage_media', 'imessage_send', 'instagram_auth_host'] }),
  });
  const payload = await response.json().catch(() => ({})) as { device?: { id?: string }; credential?: string; error?: string };
  if (!response.ok || !payload.device?.id || !payload.credential) throw new Error(payload.error || 'Could not enrol this Mac companion.');
  if (!secureSet(key('device-id', setup.userId), payload.device.id) || !secureSet(key('device-token', setup.userId), payload.credential)) throw new Error('Could not save the Mac companion credential in Keychain.');
  return { deviceId: payload.device.id, token: payload.credential };
}

export async function configureIMessageSync(value: unknown): Promise<CompanionSetupResult> {
  if (process.platform !== 'darwin') return { success: false, error: 'iMessage sync is only available on macOS.' };
  if (!validSetup(value)) return { success: false, error: 'Your Claire session is invalid. Please sign in again.' };
  if (!canReadIMessageDatabase()) return { success: false, error: 'Grant Claire Full Disk Access, then try iMessage setup again.' };
  runtime = value;
  try {
    const credential = await credentialFor(value) || await enrol(value);
    startWorker();
    void syncNow();
    return { success: true, deviceId: credential.deviceId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not set up iMessage.' };
  }
}

function startWorker(): void {
  if (periodic) clearInterval(periodic);
  periodic = setInterval(() => { void syncNow(); }, 60_000);
  if (watcher) return;
  try {
    watcher = fs.watch(path.dirname(DB_PATH), (_event, file) => {
      if (file && !String(file).startsWith('chat.db')) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), 1_500);
    });
  } catch {
    // The periodic cursor sync remains a safe fallback when FSEvents is not
    // available (for example immediately after permission changes).
  }
}

async function queryJson<T>(sql: string): Promise<T[]> {
  const { stdout } = await execFileAsync('/usr/bin/sqlite3', ['-readonly', '-json', DB_PATH, sql], { maxBuffer: 8 * 1024 * 1024, timeout: 20_000 });
  return stdout.trim() ? JSON.parse(stdout) as T[] : [];
}

function quote(value: string): string { return `'${value.replace(/'/g, "''")}'`; }

async function readMessages(afterRowId: number): Promise<IMessageRow[]> {
  const sql = `SELECT m.ROWID AS rowId, m.guid AS platformMessageId, COALESCE(m.text, '') AS content, m.date AS appleDate, m.is_from_me AS isFromMe, m.is_read AS isRead, m.cache_has_attachments AS hasMedia, COALESCE(h.id, 'unknown') AS handle, c.chat_identifier AS chatId, COALESCE(c.display_name, c.chat_identifier) AS chatName, CASE WHEN c.group_id IS NULL THEN 'individual' ELSE 'group' END AS chatType FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id LEFT JOIN chat c ON cmj.chat_id = c.ROWID WHERE m.ROWID > ${Math.max(0, Math.floor(afterRowId))} AND c.chat_identifier IS NOT NULL ORDER BY m.ROWID ASC LIMIT ${BATCH_SIZE}`;
  const rows = await queryJson<Record<string, unknown>>(sql);
  return rows.map((row) => {
    const fromMe = Number(row.isFromMe) === 1;
    const appleDate = Number(row.appleDate) || 0;
    // Modern Messages stores nanoseconds from the Apple epoch; old stores use seconds.
    const milliseconds = appleDate > 10_000_000_000 ? 978307200000 + appleDate / 1_000_000 : 978307200000 + appleDate * 1_000;
    const sender = fromMe ? 'me' : String(row.handle || 'unknown');
    return { rowId: Number(row.rowId), platformMessageId: String(row.platformMessageId || `imessage-${row.rowId}`), content: String(row.content || ''), senderId: sender, senderName: fromMe ? 'You' : sender, chatId: String(row.chatId), chatType: row.chatType === 'group' ? 'group' : 'individual', chatName: String(row.chatName || row.chatId), timestamp: new Date(milliseconds).toISOString(), isFromMe: fromMe, isRead: Number(row.isRead) === 1, hasMedia: Number(row.hasMedia) === 1 };
  });
}

async function postEvents(setup: CompanionSetupRequest, credential: CompanionCredential, messages: IMessageRow[]): Promise<void> {
  const response = await fetch(new URL(`/devices/${encodeURIComponent(credential.deviceId)}/events`, setup.apiUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Claire-Device-Token': credential.token },
    body: JSON.stringify({ messages: messages.map(({ rowId, ...message }) => ({ ...message, contentType: 'text', hasMedia: message.hasMedia, platformMetadata: { rowId } })) }),
  });
  if (!response.ok) throw new Error(`iMessage ingestion failed (${response.status})`);
}

async function uploadMedia(setup: CompanionSetupRequest, credential: CompanionCredential, messages: IMessageRow[]): Promise<void> {
  for (const message of messages.filter((item) => item.hasMedia)) {
    const rows = await queryJson<{ filename?: string; mime_type?: string }>(`SELECT a.filename, a.mime_type FROM attachment a INNER JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID INNER JOIN message m ON maj.message_id = m.ROWID WHERE m.guid = ${quote(message.platformMessageId)} ORDER BY a.ROWID ASC LIMIT 1`);
    const attachment = rows[0];
    if (!attachment?.filename) continue;
    const filename = attachment.filename.startsWith('~/') ? path.join(os.homedir(), attachment.filename.slice(2)) : attachment.filename.startsWith('file://') ? fileURLToPath(attachment.filename) : attachment.filename;
    try {
      const stat = fs.statSync(filename);
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_MEDIA_BYTES) continue;
      const binary = fs.readFileSync(filename);
      await fetch(new URL(`/devices/${encodeURIComponent(credential.deviceId)}/media/${encodeURIComponent(message.platformMessageId)}`, setup.apiUrl), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Claire-Device-Token': credential.token, 'X-Claire-Media-Mime-Type': attachment.mime_type || 'application/octet-stream' }, body: binary });
    } catch { /* A deleted/protected attachment is not a sync failure. */ }
  }
}

export async function syncNow(): Promise<void> {
  if (!runtime || syncing || !canReadIMessageDatabase()) return;
  syncing = true;
  try {
    const credential = await credentialFor(runtime);
    if (!credential) return;
    let cursor = Number(getPreference(cursorKey(runtime.userId)) || '0') || 0;
    for (let page = 0; page < 100; page += 1) {
      const messages = await readMessages(cursor);
      if (!messages.length) break;
      await postEvents(runtime, credential, messages);
      await uploadMedia(runtime, credential, messages);
      cursor = messages.at(-1)!.rowId;
      setPreference(cursorKey(runtime.userId), String(cursor));
      if (messages.length < BATCH_SIZE) break;
    }
  } catch (error) {
    console.warn('[Claire iMessage] sync failed', error instanceof Error ? error.message : 'unknown error');
  } finally { syncing = false; }
}
