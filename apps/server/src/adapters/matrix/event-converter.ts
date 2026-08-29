/**
 * Matrix Event Converter
 *
 * Converts Matrix room events to UnifiedMessage format.
 */

import type { MatrixEvent, Room } from 'matrix-js-sdk';
import {
  Platform,
  UnifiedMessage,
  MessageContentType,
} from '../types';
import { MatrixMessageContent } from './types';
import { MatrixUserMapper } from './user-mapper';

export class MatrixEventConverter {
  constructor(private userMapper: MatrixUserMapper) {}

  /**
   * Convert a Matrix m.room.message event to UnifiedMessage
   *
   * @param selfGhostUserId - The session's own ghost user ID (used without double-puppeting).
   * @param matrixUserId    - The session's real Matrix user ID (used with double-puppeting).
   *                          When set, messages from this sender are treated as isFromMe.
   */
  async toUnifiedMessage(
    event: MatrixEvent,
    room: Room,
    sessionId: string,
    sessionUserId: string,
    platform: Platform,
    selfGhostUserId?: string | string[],
    matrixUserId?: string
  ): Promise<UnifiedMessage> {
    const content = event.getContent() as MatrixMessageContent;
    const sender = event.getSender() || '';
    const eventId = event.getId() || `unknown-${Date.now()}`;

    // Get sender info
    const senderMember = room.getMember(sender);
    const senderName = senderMember?.name
      ? this.userMapper.cleanDisplayName(senderMember.name)
      : undefined;

    // Determine if message is from us.
    // Without double puppeting:
    //   - sender matches our own ghost user (e.g. @whatsapp_15166100494:claire.local)
    //   - OR sender matches the local Matrix user (the bot, @claire_bot:...) when
    //     matrixUserId is passed through. Live Claire sends are persisted from
    //     sendMessage(); this path covers backfill and timeline echoes.
    // With double puppeting:
    //   - sender is the real Matrix user ID (e.g. @user123:claire.local)
    const selfGhostIds = Array.isArray(selfGhostUserId)
      ? selfGhostUserId
      : selfGhostUserId ? [selfGhostUserId] : [];
    const isFromMe = selfGhostIds.includes(sender)
      || this.userMapper.isDoublePuppetUser(sender, matrixUserId);

    // Get chat participant (the ghost user in the room, excluding self)
    const chatId = this.extractChatId(room, platform, selfGhostIds);

    // Convert content type
    const contentType = this.matrixMsgTypeToContentType(content);

    // Extract reply info
    const replyToMessageId = content['m.relates_to']?.['m.in_reply_to']?.event_id;

    // Native threads (Slack, Discord) arrive as an `m.thread` relation whose
    // event_id is the thread root. Reply-only platforms never set this.
    const relatesTo = content['m.relates_to'];
    const threadRootId = relatesTo?.rel_type === 'm.thread' ? relatesTo.event_id : undefined;

    // Structured mentions. `body` renders these differently on every platform —
    // WhatsApp writes the phone number, Telegram the handle, Slack the display
    // name — so text matching does not generalize and this is the real signal.
    const mentions = content['m.mentions']?.user_ids;
    const mentionsRoom = content['m.mentions']?.room === true;

    // Check for media
    const hasMedia = this.hasMediaContent(content);

    return {
      id: `matrix-${eventId}-${Date.now()}`,
      platformMessageId: eventId,
      platform,
      sessionId,
      userId: sessionUserId,
      content: content.body || '',
      contentType,
      senderId: sender,
      senderName,
      chatId: (() => {
        if (chatId) return chatId;

        // For groups, room ID is acceptable
        if (this.isGroupRoom(room, platform, selfGhostIds)) {
          return room.roomId;
        }

        // For 1:1 DMs, fallback to room ID (this shouldn't happen in normal operation)
        // The room ID will work for sending but may cause issues with chat identification
        return room.roomId;
      })(),
      chatType: this.isGroupRoom(room, platform, selfGhostIds) ? 'group' : 'individual',
      chatName: this.userMapper.cleanDisplayName(room.name),
      timestamp: event.getDate() || new Date(),
      isFromMe,
      isRead: false,
      hasMedia,
      replyToMessageId,
      threadRootId,
      mentions: mentions?.length ? mentions : undefined,
      mentionsRoom: mentionsRoom || undefined,
      formattedBody: content.formatted_body,
      memberCount: this.roomMemberCount(room),
      platformMetadata: {
        matrixRoomId: room.roomId,
        matrixEventId: eventId,
        matrixSenderId: sender,
        senderDetection: isFromMe
          ? (selfGhostIds.includes(sender) ? 'self-ghost' : 'double-puppet')
          : 'remote-sender',
        msgtype: content.msgtype,
        format: content.format,
        // Plain media uses `url`; encrypted media uses `file.url`.
        mediaUrl: content.url || content.file?.url,
        mediaInfo: content.info,
        ...(content.msgtype === 'm.audio'
          ? {
              audio: {
                durationMs:
                  content['org.matrix.msc1767.audio']?.duration || content.info?.duration || undefined,
                waveform: this.sanitizeWaveform(content['org.matrix.msc1767.audio']?.waveform),
                isVoice: content['org.matrix.msc3245.voice'] !== undefined,
              },
            }
          : {}),
      },
    };
  }

  /**
   * Convert Matrix message type to UnifiedMessage content type
   */
  private matrixMsgTypeToContentType(content: MatrixMessageContent): MessageContentType {
    switch (content.msgtype) {
      case 'm.text':
      case 'm.notice':
      case 'm.emote':
        return MessageContentType.TEXT;
      case 'm.image':
        return MessageContentType.IMAGE;
      case 'm.video':
        return MessageContentType.VIDEO;
      case 'm.audio':
        return content['org.matrix.msc3245.voice'] !== undefined
          ? MessageContentType.VOICE
          : MessageContentType.AUDIO;
      case 'm.file':
        return MessageContentType.DOCUMENT;
      case 'm.location':
        return MessageContentType.LOCATION;
      default:
        return MessageContentType.TEXT;
    }
  }

  private sanitizeWaveform(value?: number[]): number[] {
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, 128)
      .filter((sample) => Number.isFinite(sample))
      .map((sample) => Math.round(Math.min(255, Math.max(0, sample))));
  }

  /**
   * Check if message content has media
   */
  private hasMediaContent(content: MatrixMessageContent): boolean {
    return ['m.image', 'm.video', 'm.audio', 'm.file'].includes(content.msgtype);
  }

  /**
   * A room is a group if it has more than one distinct ghost contact for the platform.
   * Bridge bots and duplicate ghost users (LID vs phone) for the same contact don't count.
   */
  private isGroupRoom(room: Room, platform: Platform, selfGhostUserIds: string[] = []): boolean {
    const selfIds = new Set(selfGhostUserIds);
    const phoneIds = new Set<string>();
    const lidIds = new Set<string>();
    for (const member of room.getJoinedMembers()) {
      if (this.userMapper.isBridgeBot(member.userId)) continue;
      if (selfIds.has(member.userId)) continue;
      const contact = this.userMapper.ghostUserToPlatformContact(member.userId);
      if (contact && contact.platform === platform) {
        if (contact.platformContactId.startsWith('lid-')) {
          lidIds.add(contact.platformContactId);
        } else {
          phoneIds.add(contact.platformContactId);
        }
      }
    }
    // Prefer phone-based count (avoids counting phone+LID duplicates of the same person).
    // Fall back to LID count for all-LID groups (mautrix v2 fully migrated accounts).
    const countSet = phoneIds.size > 0 ? phoneIds : lidIds;
    return countSet.size > 1;
  }

  /**
   * Total real members in the room, excluding bridge bots.
   *
   * Deliberately not deduped the way isGroupRoom() is: this answers "how large
   * is the audience" rather than "how many distinct people", so a large channel
   * where only a handful of people ever post still reads as a broadcast surface.
   */
  private roomMemberCount(room: Room): number | undefined {
    const members = room.getJoinedMembers();
    if (!members?.length) return undefined;
    return members.filter((member) => !this.userMapper.isBridgeBot(member.userId)).length;
  }

  /**
   * Extract the platform chat ID from room members.
   * Group rooms use room.roomId as a stable unique identifier to avoid
   * collisions with 1:1 DM rooms that share a member.
   */
  private extractChatId(room: Room, platform: Platform, selfGhostUserIds: string[] = []): string | null {
    const selfIds = new Set(selfGhostUserIds);
    const isGroup = this.isGroupRoom(room, platform, selfGhostUserIds);

    if (isGroup) {
      return room.roomId;
    }

    const members = room.getJoinedMembers();

    for (const member of members) {
      if (this.userMapper.isBridgeBot(member.userId)) {
        continue;
      }

      if (selfIds.has(member.userId)) {
        continue;
      }

      const contactInfo = this.userMapper.ghostUserToPlatformContact(member.userId);
      if (contactInfo && contactInfo.platform === platform) {
        return contactInfo.platformContactId;
      }
    }

    return null;
  }

  /**
   * Check if an event contains a WhatsApp phone pairing code (XXXX-XXXX format)
   */
  isPairingCodeMessage(event: MatrixEvent): boolean {
    const content = event.getContent() as MatrixMessageContent;
    const body = content.body || '';
    return /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.test(body);
  }

  /**
   * Extract the pairing code from a bridge bot message
   */
  extractPairingCode(event: MatrixEvent): string | null {
    const content = event.getContent() as MatrixMessageContent;
    const body = content.body || '';
    const match = body.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
    return match ? match[1] : null;
  }

  /**
   * Check if an event is a QR code image from bridge bot
   */
  isQrCodeMessage(event: MatrixEvent): boolean {
    const content = event.getContent() as MatrixMessageContent;
    const body = content.body?.toLowerCase() || '';

    return (
      content.msgtype === 'm.image' ||
      body.includes('qr') ||
      body.includes('scan')
    );
  }

  /**
   * Check if an event indicates login success
   */
  isLoginSuccessMessage(event: MatrixEvent): boolean {
    const content = event.getContent() as MatrixMessageContent;
    const body = content.body?.toLowerCase() || '';

    return (
      body.includes('successfully logged in') ||
      body.includes('logged in as') ||
      body.includes('login successful')
    );
  }

  /**
   * Check if an event indicates login failure
   */
  isLoginFailureMessage(event: MatrixEvent): boolean {
    const content = event.getContent() as MatrixMessageContent;
    const body = content.body?.toLowerCase() || '';

    return (
      body.includes('login failed') ||
      body.includes('error') ||
      body.includes('failed to log in') ||
      body.includes('authentication failed')
    );
  }

  /**
   * Check if an event is asking for verification code
   */
  isVerificationCodeRequest(event: MatrixEvent): boolean {
    const content = event.getContent() as MatrixMessageContent;
    const body = content.body?.toLowerCase() || '';

    return (
      body.includes('verification code') ||
      body.includes('enter code') ||
      body.includes('code sent')
    );
  }

  /**
   * Extract media URL from event content
   */
  getMediaUrl(event: MatrixEvent, client: { mxcUrlToHttp: (url: string) => string | null }): string | null {
    const content = event.getContent() as MatrixMessageContent;
    if (content.url) {
      return client.mxcUrlToHttp(content.url);
    }
    return null;
  }
}
