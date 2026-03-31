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
import { MatrixMessageContent, MatrixMessageType } from './types';
import { MatrixUserMapper } from './user-mapper';

export class MatrixEventConverter {
  constructor(private userMapper: MatrixUserMapper) {}

  /**
   * Convert a Matrix m.room.message event to UnifiedMessage
   */
  async toUnifiedMessage(
    event: MatrixEvent,
    room: Room,
    sessionId: string,
    sessionUserId: string,
    platform: Platform,
    selfGhostUserId?: string
  ): Promise<UnifiedMessage> {
    const content = event.getContent() as MatrixMessageContent;
    const sender = event.getSender() || '';
    const eventId = event.getId() || `unknown-${Date.now()}`;

    // Get sender info
    const senderMember = room.getMember(sender);
    const senderName = senderMember?.name
      ? this.userMapper.cleanDisplayName(senderMember.name)
      : undefined;

    // Determine if message is from us:
    // - sender matches our own ghost user (e.g. @whatsapp_15166100494:claire.local)
    // - sender is not a ghost user at all (i.e. the bot user @claire_bot:...)
    const isFromMe = sender === selfGhostUserId || !this.userMapper.isGhostUser(sender);

    // Get chat participant (the ghost user in the room, excluding self)
    const chatId = this.extractChatId(room, platform, selfGhostUserId);

    // Convert content type
    const contentType = this.matrixMsgTypeToContentType(content.msgtype);

    // Extract reply info
    const replyToMessageId = content['m.relates_to']?.['m.in_reply_to']?.event_id;

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
      chatId: chatId || room.roomId,
      chatType: this.isGroupRoom(room, platform, selfGhostUserId) ? 'group' : 'individual',
      chatName: this.userMapper.cleanDisplayName(room.name),
      timestamp: event.getDate() || new Date(),
      isFromMe,
      isRead: false,
      hasMedia,
      replyToMessageId,
      platformMetadata: {
        matrixRoomId: room.roomId,
        matrixEventId: eventId,
        msgtype: content.msgtype,
        format: content.format,
        mediaUrl: content.url,
        mediaInfo: content.info,
      },
    };
  }

  /**
   * Convert Matrix message type to UnifiedMessage content type
   */
  private matrixMsgTypeToContentType(msgtype: MatrixMessageType): MessageContentType {
    switch (msgtype) {
      case 'm.text':
      case 'm.notice':
      case 'm.emote':
        return MessageContentType.TEXT;
      case 'm.image':
        return MessageContentType.IMAGE;
      case 'm.video':
        return MessageContentType.VIDEO;
      case 'm.audio':
        return MessageContentType.AUDIO;
      case 'm.file':
        return MessageContentType.DOCUMENT;
      case 'm.location':
        return MessageContentType.LOCATION;
      default:
        return MessageContentType.TEXT;
    }
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
  private isGroupRoom(room: Room, platform: Platform, selfGhostUserId?: string): boolean {
    const phoneIds = new Set<string>();
    const lidIds = new Set<string>();
    for (const member of room.getJoinedMembers()) {
      if (this.userMapper.isBridgeBot(member.userId)) continue;
      if (selfGhostUserId && member.userId === selfGhostUserId) continue;
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
   * Extract the platform chat ID from room members.
   * Group rooms use room.roomId as a stable unique identifier to avoid
   * collisions with 1:1 DM rooms that share a member.
   */
  private extractChatId(room: Room, platform: Platform, selfGhostUserId?: string): string | null {
    if (this.isGroupRoom(room, platform, selfGhostUserId)) {
      return room.roomId;
    }

    const members = room.getJoinedMembers();

    for (const member of members) {
      if (this.userMapper.isBridgeBot(member.userId)) continue;
      if (selfGhostUserId && member.userId === selfGhostUserId) continue;

      const contactInfo = this.userMapper.ghostUserToPlatformContact(member.userId);
      if (contactInfo && contactInfo.platform === platform) {
        return contactInfo.platformContactId;
      }
    }

    return null;
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
