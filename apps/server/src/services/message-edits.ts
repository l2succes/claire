import type { SupabaseClient } from '@supabase/supabase-js';

import type { UnifiedMessage } from '../adapters/types';
import { resolveMentions } from './contact-identity';
import { supabase } from './supabase';

export interface AppliedMessageEdit {
  messageId: string;
  chatId: string;
  contactName: string | null;
  fromMe: boolean;
  timestamp: string;
  platform: string;
  applied: boolean;
  duplicateRemoved: boolean;
}

interface ApplyMessageEditRow {
  message_id: string;
  message_chat_id: string;
  message_contact_name: string | null;
  message_from_me: boolean;
  message_timestamp: string;
  message_platform: string;
  edit_applied: boolean;
  duplicate_removed: boolean;
}

/**
 * Apply a provider edit to the original message row. The database function
 * owns ordering and locking so two rapid edits cannot make an older revision
 * win. It also removes a duplicate edit row produced by pre-edit-aware builds.
 */
export async function applyIncomingMessageEdit(
  message: UnifiedMessage,
  client: Pick<SupabaseClient, 'rpc'> = supabase
): Promise<AppliedMessageEdit | null> {
  if (!message.editOfPlatformMessageId) return null;

  const editTimestamp =
    message.timestamp instanceof Date
      ? message.timestamp.toISOString()
      : new Date(message.timestamp).toISOString();
  const matrixRoomId =
    typeof message.platformMetadata?.matrixRoomId === 'string'
      ? message.platformMetadata.matrixRoomId
      : null;
  const matrixSenderId =
    typeof message.platformMetadata?.matrixSenderId === 'string'
      ? message.platformMetadata.matrixSenderId
      : null;

  const { data, error } = await client.rpc('apply_message_edit', {
    p_user_id: message.userId,
    p_platform: message.platform,
    p_platform_chat_id: message.chatId,
    p_target_platform_message_id: message.editOfPlatformMessageId,
    p_edit_platform_message_id: message.platformMessageId,
    p_edit_timestamp: editTimestamp,
    p_content: message.content,
    p_content_type: message.contentType,
    p_formatted_body: message.formattedBody ?? null,
    p_mentions: resolveMentions(message.mentions),
    p_mentions_room: message.mentionsRoom === true,
    p_from_me: message.isFromMe,
    p_matrix_room_id: matrixRoomId,
    p_matrix_sender_id: matrixSenderId,
  });

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ApplyMessageEditRow | undefined | null;
  if (!row?.message_id || !row.message_chat_id) return null;

  return {
    messageId: row.message_id,
    chatId: row.message_chat_id,
    contactName: row.message_contact_name,
    fromMe: row.message_from_me,
    timestamp: row.message_timestamp,
    platform: row.message_platform,
    applied: row.edit_applied,
    duplicateRemoved: row.duplicate_removed,
  };
}
