/**
 * sync-matrix-messages.ts
 *
 * Standalone backfill script: reads all WhatsApp bridge rooms from Matrix,
 * paginates through their message history, and upserts everything into Supabase.
 *
 * Run with:
 *   cd server && bun run scripts/sync-matrix-messages.ts
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const MATRIX_URL = 'http://localhost:8008';
const MATRIX_TOKEN = 'syt_Y2xhaXJlX2JvdA_ccXdYKTFDgHGatrAhBDC_1yP5E0';
const SUPABASE_URL = 'http://localhost:8000';
// Service key bypasses RLS so we can write on behalf of the user
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const USER_ID = 'eaf43eb8-0b0e-4a8c-8a18-1b633be012f3';
const BOT_USER_ID = '@claire_bot:claire.local';
const BRIDGE_BOT_ID = '@whatsappbot:claire.local';
const PLATFORM = 'whatsapp';
const GHOST_PREFIX = 'whatsapp_';
const SERVER_NAME = 'claire.local';

// How many messages to paginate per room (increase for deeper history)
const MAX_MESSAGES_PER_ROOM = 500;

// ─── Matrix helpers ───────────────────────────────────────────────────────────

async function matrixGet(path: string): Promise<any> {
  const res = await fetch(`${MATRIX_URL}${path}`, {
    headers: { Authorization: `Bearer ${MATRIX_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Matrix GET ${path} failed ${res.status}: ${body}`);
  }
  return res.json();
}

async function getJoinedRooms(): Promise<string[]> {
  const data = await matrixGet('/_matrix/client/v3/joined_rooms');
  return data.joined_rooms as string[];
}

interface RoomMember {
  userId: string;
  displayName: string | null;
}

async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const data = await matrixGet(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`);
  return Object.entries(data.joined as Record<string, { display_name?: string }>).map(
    ([userId, info]) => ({ userId, displayName: info.display_name ?? null })
  );
}

async function getRoomName(roomId: string): Promise<string | null> {
  try {
    const data = await matrixGet(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name/`
    );
    return data.name ?? null;
  } catch {
    return null;
  }
}

interface MatrixMessage {
  eventId: string;
  sender: string;
  body: string;
  msgtype: string;
  timestamp: number;
  mediaUrl?: string;
}

async function getRoomMessages(roomId: string, maxCount: number): Promise<MatrixMessage[]> {
  const messages: MatrixMessage[] = [];
  let from: string | undefined;

  while (messages.length < maxCount) {
    const limit = Math.min(100, maxCount - messages.length);
    let url = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}&filter=%7B%22types%22%3A%5B%22m.room.message%22%5D%7D`;
    if (from) url += `&from=${encodeURIComponent(from)}`;

    const data = await matrixGet(url);
    const chunk = (data.chunk ?? []) as any[];

    for (const event of chunk) {
      const content = event.content ?? {};
      // Skip bridge notice/error messages (failed media, system notices)
      if (content.msgtype === 'm.notice') continue;
      messages.push({
        eventId: event.event_id,
        sender: event.sender,
        body: content.body ?? '',
        msgtype: content.msgtype ?? 'm.text',
        timestamp: event.origin_server_ts,
        mediaUrl: content.url ?? undefined,
      });
    }

    // No more pages
    if (!data.end || chunk.length === 0) break;
    from = data.end;
  }

  return messages;
}

// ─── Classification helpers ───────────────────────────────────────────────────

function isGhostUser(userId: string): boolean {
  return userId.startsWith(`@${GHOST_PREFIX}`) && userId.endsWith(`:${SERVER_NAME}`);
}

function isBridgeBot(userId: string): boolean {
  return userId === BRIDGE_BOT_ID;
}

function ghostUserToContactId(userId: string): string {
  // @whatsapp_lid-12345:claire.local -> lid-12345
  const inner = userId.slice(`@${GHOST_PREFIX}`.length, userId.lastIndexOf(':'));
  return inner;
}

function cleanDisplayName(name: string | null): string | null {
  if (!name) return null;
  return name.replace(/\s*\(WA\)\s*$/i, '').trim() || null;
}

function extractPhoneFromDisplayName(name: string | null): string | null {
  if (!name) return null;
  const clean = cleanDisplayName(name);
  // Display names from bridge are like "+15166100494 (WA)" or just "+15166100494"
  const match = clean?.match(/^\+?\d[\d\s\-()]{6,}$/);
  return match ? clean!.replace(/\s/g, '') : null;
}

function msgtypeToContentType(msgtype: string): string {
  switch (msgtype) {
    case 'm.image': return 'image';
    case 'm.video': return 'video';
    case 'm.audio': return 'audio';
    case 'm.file': return 'document';
    default: return 'text';
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function supabasePost(path: string, body: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase POST ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function upsertChat(params: {
  userId: string;
  platformChatId: string;
  name: string;
  isGroup: boolean;
  lastMessageAt: Date;
}): Promise<string> {
  const rows = await supabasePost(
    '/chats?on_conflict=user_id,platform,platform_chat_id',
    {
      user_id: params.userId,
      whatsapp_chat_id: params.platformChatId,
      platform_chat_id: params.platformChatId,
      platform: PLATFORM,
      name: params.name,
      is_group: params.isGroup,
      last_message_at: params.lastMessageAt.toISOString(),
    }
  );
  return rows[0].id as string;
}

async function upsertMessages(msgs: any[]): Promise<{ saved: number; errors: number }> {
  if (msgs.length === 0) return { saved: 0, errors: 0 };

  // Supabase upsert in batches of 50
  let saved = 0;
  let errors = 0;

  for (let i = 0; i < msgs.length; i += 50) {
    const batch = msgs.slice(i, i + 50);
    try {
      const rows = await supabasePost('/messages?on_conflict=whatsapp_id', batch);
      saved += rows?.length ?? batch.length;
    } catch (err: any) {
      console.error(`  Batch ${i / 50 + 1} error:`, err.message);
      errors += batch.length;
    }
  }

  return { saved, errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Matrix → Supabase message sync ===\n');

  const roomIds = await getJoinedRooms();
  console.log(`Bot is in ${roomIds.length} rooms\n`);

  let totalSaved = 0;
  let totalSkipped = 0;
  let roomsProcessed = 0;

  for (const roomId of roomIds) {
    const members = await getRoomMembers(roomId);

    // Skip control rooms: a DM that has only 2 members (our bot + bridge bot)
    const ghostMembers = members.filter((m) => isGhostUser(m.userId));

    // Skip control rooms: DM with bridge bot and no ghost users
    const hasBridgeBot = members.some((m) => isBridgeBot(m.userId));
    if (hasBridgeBot && ghostMembers.length === 0) {
      console.log(`  Skipping control room ${roomId}`);
      continue;
    }

    // Skip rooms with no ghost users (not a bridged chat)
    if (ghostMembers.length === 0) {
      console.log(`  Skipping non-bridge room ${roomId}`);
      continue;
    }

    const roomName = await getRoomName(roomId) ?? roomId;
    const isGroup = ghostMembers.length > 1;

    // Use first non-LID ghost user as chat ID, or first ghost user as fallback
    const primaryGhost =
      ghostMembers.find((m) => !ghostUserToContactId(m.userId).startsWith('lid-')) ??
      ghostMembers[0];
    const platformChatId = ghostUserToContactId(primaryGhost.userId);

    console.log(`\nRoom: ${roomName}`);
    console.log(`  ID: ${roomId}`);
    console.log(`  Platform chat ID: ${platformChatId}`);
    console.log(`  Is group: ${isGroup}, Ghost members: ${ghostMembers.length}`);

    // Fetch messages
    const messages = await getRoomMessages(roomId, MAX_MESSAGES_PER_ROOM);
    console.log(`  Fetched ${messages.length} messages from Matrix`);

    if (messages.length === 0) {
      totalSkipped++;
      continue;
    }

    // Determine last message time
    const latestTs = Math.max(...messages.map((m) => m.timestamp));

    // Upsert chat
    let chatId: string;
    try {
      chatId = await upsertChat({
        userId: USER_ID,
        platformChatId,
        name: roomName,
        isGroup,
        lastMessageAt: new Date(latestTs),
      });
      console.log(`  Chat upserted: ${chatId}`);
    } catch (err: any) {
      console.error(`  Failed to upsert chat: ${err.message}`);
      continue;
    }

    // Build message rows
    // Build a display-name lookup from members
    const memberNames = new Map<string, string | null>(
      members.map((m) => [m.userId, m.displayName])
    );

    const rows = messages.map((msg) => {
      const isFromMe = msg.sender === BOT_USER_ID;
      const senderDisplayName = memberNames.get(msg.sender) ?? null;
      const cleanedName = cleanDisplayName(senderDisplayName);
      const phone = isFromMe ? null : extractPhoneFromDisplayName(senderDisplayName);

      return {
        user_id: USER_ID,
        chat_id: chatId,
        whatsapp_id: msg.eventId,
        platform_message_id: msg.eventId,
        platform: PLATFORM,
        content: msg.body,
        content_type: msgtypeToContentType(msg.msgtype),
        type: msgtypeToContentType(msg.msgtype),
        from_me: isFromMe,
        timestamp: new Date(msg.timestamp).toISOString(),
        is_group: isGroup,
        contact_name: isFromMe ? null : cleanedName,
        contact_phone: phone,
        metadata: msg.mediaUrl ? { matrixRoomId: roomId, mediaUrl: msg.mediaUrl } : { matrixRoomId: roomId },
      };
    });

    const { saved, errors } = await upsertMessages(rows);
    console.log(`  Saved: ${saved}, Errors: ${errors}`);
    totalSaved += saved;
    roomsProcessed++;
  }

  console.log(`\n=== Done ===`);
  console.log(`Rooms processed: ${roomsProcessed}`);
  console.log(`Rooms skipped (no messages): ${totalSkipped}`);
  console.log(`Total messages saved: ${totalSaved}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
