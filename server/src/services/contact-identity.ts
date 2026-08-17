import { Platform, type UnifiedMessage } from '../adapters/types';

/** Resolve a stable per-platform contact identifier for an incoming message. */
export function incomingContactId(message: Pick<UnifiedMessage, 'platform' | 'isFromMe' | 'senderId'>): string | null {
  if (message.isFromMe || !message.senderId || message.senderId === 'me') return null;

  // A Mac companion reads the Messages DB directly, where senders are plain
  // phone/email handles. Matrix bridge events use ghost MXIDs and take the
  // generic branch below.
  if (message.platform === Platform.IMESSAGE) return message.senderId;

  return message.senderId.match(GHOST_MXID_PATTERN)?.[1] || null;
}

/**
 * Ghost MXID → platform contact id. Kept in one place so adding a bridge does
 * not require finding every copy of this regex.
 */
const GHOST_MXID_PATTERN = /@(?:whatsapp|_telegram|meta|_imessage|slack)_([^:]+):/;

/**
 * Resolve a ghost MXID to its platform contact id.
 *
 * Same extraction as incomingContactId, minus the message context — used for
 * mention lists, where the MXIDs belong to people other than the sender.
 */
export function ghostToPlatformContactId(mxid: string): string | null {
  if (!mxid) return null;
  return mxid.match(GHOST_MXID_PATTERN)?.[1] || null;
}

/**
 * Resolve a list of mention MXIDs to platform contact ids, dropping any that
 * don't parse (bridge bots, the homeserver's own users) and de-duplicating.
 */
export function resolveMentions(mxids: string[] | undefined): string[] | null {
  if (!mxids?.length) return null;
  const resolved = [...new Set(mxids.map(ghostToPlatformContactId).filter((id): id is string => !!id))];
  return resolved.length ? resolved : null;
}
