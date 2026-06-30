/**
 * Expo Push Notification service.
 *
 * Sends push notifications to mobile clients via the Expo Push API.
 * All HTTP is done with the standard `fetch` to avoid an extra dep.
 *
 * Usage:
 *   import { pushNotificationService } from './push-notification';
 *   await pushNotificationService.sendToUser(userId, { title, body, data });
 */

import { supabase } from './supabase';
import { logger } from '../utils/logger';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Sound to play. 'default' plays the device's default notification sound. */
  sound?: 'default' | null;
  /** iOS badge count */
  badge?: number;
  /** Android notification channel */
  channelId?: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data: ExpoPushTicket[];
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Checks whether a token is an Expo push token (real or test).
 */
export function isExpoPushToken(token: string): boolean {
  return (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[') ||
    // allow simulated test tokens in non-production
    (process.env.NODE_ENV !== 'production' && token.startsWith('TestExponentPushToken['))
  );
}

export class PushNotificationService {
  /**
   * Send a push notification to all registered tokens for a user.
   * Silently skips users with no tokens.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const tokens = await this.getTokensForUser(userId);
    if (tokens.length === 0) return;

    await this.sendToTokens(tokens, payload);
  }

  /**
   * Send a push notification to a list of Expo push tokens.
   */
  async sendToTokens(tokens: string[], payload: PushPayload): Promise<ExpoPushTicket[]> {
    const validTokens = tokens.filter(isExpoPushToken);
    if (validTokens.length === 0) {
      logger.debug('No valid Expo push tokens to send to');
      return [];
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      ...(payload.data !== undefined && { data: payload.data }),
      ...(payload.sound !== undefined && { sound: payload.sound }),
      ...(payload.badge !== undefined && { badge: payload.badge }),
      ...(payload.channelId !== undefined && { channelId: payload.channelId }),
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        logger.error(`Expo push API returned ${response.status}`);
        return [];
      }

      const result = (await response.json()) as ExpoPushResponse;
      const tickets = result.data ?? [];

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'error') {
          logger.warn(`Push ticket error for token ${validTokens[i]}: ${ticket.message}`, {
            details: ticket.details,
          });
          // Remove tokens that are no longer registered
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.removeToken(validTokens[i]);
          }
        }
      }

      return tickets;
    } catch (err) {
      logger.error('Failed to send push notifications:', err);
      return [];
    }
  }

  /**
   * Register a push token for a user.
   * Upserts on (user_id, token) to be idempotent.
   */
  async registerToken(userId: string, token: string, platform?: string): Promise<void> {
    if (!isExpoPushToken(token)) {
      throw new Error(`Invalid Expo push token: ${token}`);
    }

    const { error } = await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: platform ?? 'expo' },
      { onConflict: 'user_id,token' },
    );

    if (error) {
      logger.error('Failed to register push token:', error);
      throw new Error('Failed to register push token');
    }

    logger.info(`Push token registered for user ${userId}`);
  }

  /**
   * Deregister (remove) a push token.
   */
  async deregisterToken(userId: string, token: string): Promise<void> {
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error) {
      logger.error('Failed to deregister push token:', error);
      throw new Error('Failed to deregister push token');
    }
  }

  /**
   * Fetch all active tokens for a user.
   */
  private async getTokensForUser(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to fetch push tokens:', error);
      return [];
    }

    return (data ?? []).map((row: { token: string }) => row.token);
  }

  /**
   * Remove a stale (DeviceNotRegistered) token from the DB.
   */
  private async removeToken(token: string): Promise<void> {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token);
    if (error) {
      logger.warn('Failed to remove stale push token:', error);
    } else {
      logger.info(`Removed stale push token: ${token.slice(0, 30)}…`);
    }
  }
}

export const pushNotificationService = new PushNotificationService();
