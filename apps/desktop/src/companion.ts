import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';
import { encryptedCacheInfo } from './encrypted-cache';
import type { CompanionStatus, IMessageSendRequest, IMessageSendResult } from './shared/ipc';
import { canReadIMessageDatabase } from './imessage-sync';

const execFileAsync = promisify(execFile);
function iMessageState(): CompanionStatus['imessage'] {
  if (process.platform !== 'darwin') return 'unavailable';
  return canReadIMessageDatabase() ? 'ready' : 'needs_permission';
}

export function companionStatus(): CompanionStatus {
  const hostPlatform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  return {
    hostPlatform,
    imessage: iMessageState(),
    encryptedCache: encryptedCacheInfo('__status__'),
    // The signed helper is optional during local development. Packaging turns
    // this into ready once its executable is present.
    pushHelper: process.platform === 'darwin' ? 'not_configured' : 'unsupported',
  };
}

const SEND_SCRIPT = `on run argv
  set recipientAddress to item 1 of argv
  set messageBody to item 2 of argv
  tell application "Messages"
    set targetService to first service whose service type is iMessage
    send messageBody to buddy recipientAddress of targetService
  end tell
end run`;

/** Explicit, text-only, user-triggered iMessage send. Values are argv, never
 * interpolated into AppleScript source. */
export async function sendIMessage(request: unknown): Promise<IMessageSendResult> {
  if (process.platform !== 'darwin') return { success: false, error: 'iMessage is only available on macOS.' };
  const value = request as Partial<IMessageSendRequest> | null;
  const recipient = value?.recipient?.trim();
  const text = value?.text?.trim();
  if (!recipient || !text) return { success: false, error: 'A recipient and message are required.' };
  if (recipient.length > 256 || text.length > 10_000) return { success: false, error: 'This message is too large to send.' };
  try {
    await execFileAsync('/usr/bin/osascript', ['-l', 'AppleScript', '-e', SEND_SCRIPT, recipient, text], { timeout: 20_000 });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Messages could not send this message.';
    return { success: false, error: /not authorized|not permitted|automation/i.test(message) ? 'Allow Claire to control Messages in System Settings, then try again.' : 'Messages could not send this message.' };
  }
}

export async function openCompanionSettings(section: unknown): Promise<void> {
  if (process.platform !== 'darwin') return;
  const target = section === 'automation'
    ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'
    : 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
  await shell.openExternal(target);
}
