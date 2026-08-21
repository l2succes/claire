import { BridgeContact, BridgeHttpClient } from '../adapters/matrix/bridge-http-client';
import { Platform } from '../adapters/types';
import {
  displayNameFromBridge,
  phoneNumberFromBridgeIdentifiers,
} from './contact-identity';
import { supabase, type DbRow } from './supabase';

const MAX_CONTACTS_PER_SYNC = 10_000;
const DATABASE_PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 250;
const inFlightSyncs = new Map<string, Promise<ContactIdentityBackfillResult>>();

export interface ContactIdentityBackfillResult {
  scanned: number;
  matched: number;
  updated: number;
  unresolved: number;
  skipped: number;
  hasMore: boolean;
}

function bridgeClient(): BridgeHttpClient | null {
  const secret = process.env.WHATSAPP_BRIDGE_SECRET;
  if (!secret) return null;
  return new BridgeHttpClient(
    process.env.WHATSAPP_BRIDGE_URL || 'http://mautrixwhatsapp.railway.internal:29318',
    secret,
    process.env.WHATSAPP_BRIDGE_USER_ID || '@claire_bot:claire.local'
  );
}

/**
 * mautrix and our Matrix mapper can represent the same WhatsApp contact as a
 * JID, a Matrix ghost ID, a bare phone number, or an opaque LID. Compare only
 * normalized bridge-owned identifiers; we never infer a phone number from a
 * LID.
 */
export function whatsappContactKeys(value: string | null | undefined): string[] {
  if (!value) return [];
  const source = value.trim().toLowerCase();
  if (!source) return [];

  const keys = new Set<string>([source]);
  const withoutMxid = source.replace(/^@/, '').split(':')[0] || source;
  keys.add(withoutMxid);
  const withoutPrefix = withoutMxid.replace(/^whatsapp_/, '');
  keys.add(withoutPrefix);
  const bareJid = withoutPrefix.split('@')[0] || withoutPrefix;
  keys.add(bareJid);

  if (/^\+?\d{7,15}$/.test(bareJid)) {
    keys.add(bareJid.replace(/^\+/, ''));
    keys.add(`+${bareJid.replace(/^\+/, '')}`);
  }
  if (/^lid[-:]?\d+$/.test(bareJid)) {
    keys.add(`lid-${bareJid.replace(/\D/g, '')}`);
  }
  // Older Claire imports persisted an LID as bare digits, before the mapper
  // consistently preserved its `lid-` prefix. A WhatsApp phone number is at
  // most 15 digits; nevertheless include the LID alias for an ambiguous
  // 15-digit legacy value as a final fallback. Direct phone/JID keys are
  // inserted first and therefore always win when both identities exist.
  if (/^\d{15,20}$/.test(bareJid)) {
    keys.add(`lid-${bareJid}`);
  }

  return [...keys];
}

function buildBridgeContactIndex(contacts: BridgeContact[]): Map<string, BridgeContact> {
  const index = new Map<string, BridgeContact>();
  for (const contact of contacts) {
    for (const identity of [contact.id, ...(contact.identifiers || []), contact.mxid]) {
      for (const key of whatsappContactKeys(identity)) {
        // Contact IDs themselves are authoritative. Only use an alias when no
        // direct key has already been seen.
        if (!index.has(key) || identity === contact.id) index.set(key, contact);
      }
    }
  }
  return index;
}

async function linkedWhatsAppLoginId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('platform_sessions')
    .select('platform_user_id, last_connected_at')
    .eq('user_id', userId)
    .eq('platform', Platform.WHATSAPP)
    .not('platform_user_id', 'is', null)
    .order('last_connected_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.platform_user_id === 'string' && data.platform_user_id.trim()
    ? data.platform_user_id
    : null;
}

async function loadExistingWhatsAppContacts(userId: string, maxContacts: number): Promise<DbRow[]> {
  const contacts: DbRow[] = [];
  for (let offset = 0; contacts.length < maxContacts; offset += DATABASE_PAGE_SIZE) {
    const remaining = maxContacts - contacts.length;
    const { data, error } = await supabase
      .from('contacts')
      .select('id, user_id, whatsapp_id, platform, platform_contact_id, name, phone_number, avatar_url')
      .eq('user_id', userId)
      .eq('platform', Platform.WHATSAPP)
      .order('id', { ascending: true })
      .range(offset, offset + Math.min(DATABASE_PAGE_SIZE, remaining) - 1);
    if (error) throw error;
    const page = (data || []) as DbRow[];
    contacts.push(...page);
    if (page.length < Math.min(DATABASE_PAGE_SIZE, remaining)) break;
  }
  return contacts;
}

function bridgeContactForStoredContact(
  contact: DbRow,
  bridgeContacts: Map<string, BridgeContact>
): BridgeContact | null {
  const candidates = [
    contact.platform_contact_id as string | null | undefined,
    contact.whatsapp_id as string | null | undefined,
  ];
  for (const candidate of candidates) {
    for (const key of whatsappContactKeys(candidate)) {
      const resolved = bridgeContacts.get(key);
      if (resolved) return resolved;
    }
  }
  return null;
}

function updatePayload(contact: DbRow, bridgeContact: BridgeContact): DbRow | null {
  const platformContactId = String(contact.platform_contact_id || contact.whatsapp_id || '');
  const name = displayNameFromBridge(bridgeContact.name, Platform.WHATSAPP, platformContactId);
  const phoneNumber = phoneNumberFromBridgeIdentifiers([
    bridgeContact.id,
    ...(bridgeContact.identifiers || []),
  ]);
  const avatarUrl = typeof bridgeContact.avatar_url === 'string' && bridgeContact.avatar_url.trim()
    ? bridgeContact.avatar_url
    : null;

  const nextName = name || contact.name || null;
  const nextPhone = phoneNumber || contact.phone_number || null;
  const nextAvatar = avatarUrl || contact.avatar_url || null;
  if (
    nextName === (contact.name || null)
    && nextPhone === (contact.phone_number || null)
    && nextAvatar === (contact.avatar_url || null)
  ) {
    return null;
  }

  return {
    id: contact.id,
    user_id: contact.user_id,
    platform: contact.platform,
    platform_contact_id: platformContactId,
    // The legacy column remains NOT NULL in deployed databases. Keep it in
    // sync until that historical constraint is removed in a dedicated schema
    // migration.
    whatsapp_id: String(contact.whatsapp_id || platformContactId),
    name: nextName,
    phone_number: nextPhone,
    avatar_url: nextAvatar,
  };
}

/**
 * Copy an authenticated WhatsApp account's contact identities into Claire's
 * existing, user-scoped contact records. The bridge request is explicitly
 * scoped by login_id; never use the bridge bot's whole contact directory as a
 * fallback, because that could mix identities between Claire users.
 *
 * A single run is capped at 10k existing contacts and uses paged reads plus
 * batch upserts so it can repair a large People list without touching message
 * content or operational telemetry.
 */
export async function backfillWhatsAppContactIdentities(
  userId: string,
  requestedLimit?: number
): Promise<ContactIdentityBackfillResult> {
  const bridge = bridgeClient();
  if (!bridge) throw new Error('WhatsApp identity resolver is not configured');

  const limit = Math.min(Math.max(requestedLimit || MAX_CONTACTS_PER_SYNC, 1), MAX_CONTACTS_PER_SYNC);
  const loginId = await linkedWhatsAppLoginId(userId);
  if (!loginId) throw new Error('WhatsApp needs to be reconnected before contact identities can sync');

  const [rows, bridgeDirectory] = await Promise.all([
    loadExistingWhatsAppContacts(userId, limit + 1),
    bridge.getContacts(loginId),
  ]);
  const targets = rows.slice(0, limit);
  const bridgeContacts = buildBridgeContactIndex(bridgeDirectory);
  const updates: DbRow[] = [];
  let matched = 0;
  let unresolved = 0;

  for (const contact of targets) {
    const bridgeContact = bridgeContactForStoredContact(contact, bridgeContacts);
    if (!bridgeContact) {
      unresolved++;
      continue;
    }
    matched++;
    const payload = updatePayload(contact, bridgeContact);
    if (payload) updates.push(payload);
  }

  for (let index = 0; index < updates.length; index += WRITE_BATCH_SIZE) {
    const batch = updates.slice(index, index + WRITE_BATCH_SIZE);
    const { error } = await supabase
      .from('contacts')
      .upsert(batch, { onConflict: 'user_id,platform,platform_contact_id' });
    if (error) throw error;
  }

  return {
    scanned: targets.length,
    matched,
    updated: updates.length,
    unresolved,
    skipped: matched - updates.length,
    hasMore: rows.length > limit,
  };
}

/**
 * De-duplicate a foreground refresh and an after-login sync for the same
 * Claire user. The caller deliberately receives the same promise so a second
 * tap never starts a competing 10k-row import.
 */
export function queueWhatsAppContactIdentitySync(
  userId: string,
  requestedLimit?: number
): Promise<ContactIdentityBackfillResult> {
  const existing = inFlightSyncs.get(userId);
  if (existing) return existing;

  const task = backfillWhatsAppContactIdentities(userId, requestedLimit)
    .finally(() => inFlightSyncs.delete(userId));
  inFlightSyncs.set(userId, task);
  return task;
}
