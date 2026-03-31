/**
 * Matrix Room Mapper
 *
 * Maps Matrix rooms to platform chats and maintains the bidirectional mapping.
 * Rooms are identified by the presence of ghost users from specific platforms.
 */

import type { MatrixClient, Room } from 'matrix-js-sdk';
import { Platform } from '../types';
import { MatrixRoomMapping } from './types';
import { MatrixUserMapper } from './user-mapper';

export class MatrixRoomMapper {
  // Cache: "platform:chatId" -> roomId
  private chatToRoom: Map<string, string> = new Map();
  // Cache: roomId -> { platform, chatId, sessionId }
  private roomToChat: Map<string, { platform: Platform; chatId: string; sessionId: string }> =
    new Map();

  constructor(private userMapper: MatrixUserMapper) {}

  /**
   * Find the Matrix room for a given platform chat
   */
  async findRoomForChat(
    client: MatrixClient,
    platform: Platform,
    platformChatId: string
  ): Promise<string | null> {
    const cacheKey = `${platform}:${platformChatId}`;

    // Check cache first
    if (this.chatToRoom.has(cacheKey)) {
      return this.chatToRoom.get(cacheKey)!;
    }

    // Search through rooms
    const rooms = client.getRooms();

    for (const room of rooms) {
      const matchedPlatform = this.detectRoomPlatform(room);
      if (matchedPlatform !== platform) continue;

      // Check if any member matches the chat ID
      const members = room.getJoinedMembers();
      for (const member of members) {
        const contactInfo = this.userMapper.ghostUserToPlatformContact(member.userId);
        if (contactInfo && contactInfo.platformContactId === platformChatId) {
          this.chatToRoom.set(cacheKey, room.roomId);
          return room.roomId;
        }
      }
    }

    return null;
  }

  /**
   * Get chat info for a Matrix room
   */
  getRoomChatInfo(
    roomId: string
  ): { platform: Platform; chatId: string; sessionId: string } | null {
    return this.roomToChat.get(roomId) || null;
  }

  /**
   * Register a room-to-chat mapping
   */
  registerRoom(
    roomId: string,
    platform: Platform,
    platformChatId: string,
    sessionId: string
  ): void {
    const cacheKey = `${platform}:${platformChatId}`;
    this.chatToRoom.set(cacheKey, roomId);
    this.roomToChat.set(roomId, { platform, chatId: platformChatId, sessionId });
  }

  /**
   * Remove a room mapping
   */
  unregisterRoom(roomId: string): void {
    const info = this.roomToChat.get(roomId);
    if (info) {
      const cacheKey = `${info.platform}:${info.chatId}`;
      this.chatToRoom.delete(cacheKey);
      this.roomToChat.delete(roomId);
    }
  }

  /**
   * Detect which platform a room belongs to based on ghost users
   */
  detectRoomPlatform(room: Room): Platform | null {
    const members = room.getJoinedMembers();

    for (const member of members) {
      // Skip bridge bots
      if (this.userMapper.isBridgeBot(member.userId)) {
        continue;
      }

      // Check if it's a ghost user
      const platform = this.userMapper.detectPlatformFromUser(member.userId);
      if (platform) {
        return platform;
      }
    }

    return null;
  }

  /**
   * Check if a room is a bridge control room (DM with bridge bot)
   */
  isControlRoom(room: Room): boolean {
    const members = room.getJoinedMembers();

    // Control rooms have exactly 2 members: user and bridge bot
    if (members.length !== 2) {
      return false;
    }

    // One member should be a bridge bot
    return members.some((m) => this.userMapper.isBridgeBot(m.userId));
  }

  /**
   * Get the primary chat participant from a room
   */
  getPrimaryChatParticipant(room: Room, selfGhostId?: string): string | null {
    const members = room.getJoinedMembers();

    for (const member of members) {
      if (this.userMapper.isBridgeBot(member.userId)) continue;
      if (!this.userMapper.isGhostUser(member.userId)) continue;
      if (selfGhostId && member.userId === selfGhostId) continue; // skip self

      const contactInfo = this.userMapper.ghostUserToPlatformContact(member.userId);
      if (contactInfo) {
        return contactInfo.platformContactId;
      }
    }

    return null;
  }

  /**
   * Get all registered room mappings
   */
  getAllMappings(): MatrixRoomMapping[] {
    const mappings: MatrixRoomMapping[] = [];

    for (const [roomId, info] of this.roomToChat) {
      mappings.push({
        matrixRoomId: roomId,
        platform: info.platform,
        platformChatId: info.chatId,
        sessionId: info.sessionId,
        isControlRoom: false,
        createdAt: new Date(),
      });
    }

    return mappings;
  }

  /**
   * Clear all cached mappings
   */
  clearCache(): void {
    this.chatToRoom.clear();
    this.roomToChat.clear();
  }

  /**
   * Get rooms for a specific session
   */
  getSessionRooms(sessionId: string): string[] {
    const rooms: string[] = [];

    for (const [roomId, info] of this.roomToChat) {
      if (info.sessionId === sessionId) {
        rooms.push(roomId);
      }
    }

    return rooms;
  }
}
