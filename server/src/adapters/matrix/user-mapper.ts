/**
 * Matrix User Mapper
 *
 * Maps Matrix ghost users to platform contacts and vice versa.
 * Ghost users are created by bridges for remote platform users.
 */

import { Platform, UnifiedContact } from '../types';
import { GHOST_USER_PREFIXES } from './types';

export class MatrixUserMapper {
  constructor(private serverName: string) {}

  /**
   * Convert a Matrix ghost user ID to platform contact info
   * @example "@_wa_12345678:claire.local" -> { platform: WHATSAPP, platformContactId: "12345678" }
   */
  ghostUserToPlatformContact(
    ghostUserId: string
  ): { platform: Platform; platformContactId: string } | null {
    for (const [platform, prefix] of Object.entries(GHOST_USER_PREFIXES)) {
      const pattern = new RegExp(`^@${prefix}([^:]+):${this.escapeRegex(this.serverName)}$`);
      const match = ghostUserId.match(pattern);

      if (match) {
        return {
          platform: platform as Platform,
          platformContactId: match[1],
        };
      }
    }

    return null;
  }

  /**
   * Convert platform contact to Matrix ghost user ID
   * @example { platform: WHATSAPP, id: "12345678" } -> "@_wa_12345678:claire.local"
   */
  platformContactToGhostUser(platformContactId: string, platform: Platform): string {
    const prefix = GHOST_USER_PREFIXES[platform];
    return `@${prefix}${platformContactId}:${this.serverName}`;
  }

  /**
   * Get the bridge bot user ID for a platform
   * @example WHATSAPP -> "@whatsappbot:claire.local"
   */
  getBridgeBotUserId(platform: Platform): string {
    const botNames: Record<Platform, string> = {
      [Platform.WHATSAPP]: 'whatsappbot',
      [Platform.TELEGRAM]: 'telegrambot',
      [Platform.INSTAGRAM]: 'instagrambot',
      [Platform.IMESSAGE]: 'imessagebot',
    };
    return `@${botNames[platform]}:${this.serverName}`;
  }

  /**
   * Check if a user ID is a bridge bot
   */
  isBridgeBot(userId: string): boolean {
    const botPattern = /^@(whatsappbot|telegrambot|instagrambot|imessagebot):/;
    return botPattern.test(userId);
  }

  /**
   * Check if a user ID is a ghost user (bridged from external platform)
   */
  isGhostUser(userId: string): boolean {
    for (const prefix of Object.values(GHOST_USER_PREFIXES)) {
      if (userId.includes(`@${prefix}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detect which platform a ghost user belongs to
   */
  detectPlatformFromUser(userId: string): Platform | null {
    for (const [platform, prefix] of Object.entries(GHOST_USER_PREFIXES)) {
      if (userId.includes(`@${prefix}`)) {
        return platform as Platform;
      }
    }
    return null;
  }

  /**
   * Convert Matrix room member to UnifiedContact
   */
  matrixMemberToContact(
    userId: string,
    displayName: string | undefined,
    avatarUrl: string | undefined,
    sessionUserId: string
  ): UnifiedContact | null {
    const platformInfo = this.ghostUserToPlatformContact(userId);
    if (!platformInfo) {
      return null;
    }

    return {
      id: `matrix-contact-${userId}`,
      platformContactId: platformInfo.platformContactId,
      platform: platformInfo.platform,
      userId: sessionUserId,
      displayName: displayName || platformInfo.platformContactId,
      avatarUrl,
      isBlocked: false,
      isVerified: false,
    };
  }

  /**
   * Extract display name from bridge-formatted names
   * Bridges often format names like "John Doe (WA)" or "Username (TG)"
   */
  cleanDisplayName(bridgeFormattedName: string): string {
    // Remove platform suffixes like (WA), (TG), (IG)
    return bridgeFormattedName
      .replace(/\s*\(WA\)\s*$/i, '')
      .replace(/\s*\(TG\)\s*$/i, '')
      .replace(/\s*\(IG\)\s*$/i, '')
      .replace(/\s*\(iMessage\)\s*$/i, '')
      .trim();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
