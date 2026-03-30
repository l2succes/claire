/**
 * Base Platform Adapter
 *
 * Abstract class providing common functionality for all platform adapters.
 * Handles Redis session management, event emission, and status tracking.
 */

import { EventEmitter } from 'events';
import {
  IPlatformAdapter,
  Platform,
  AuthMethod,
  PlatformCapabilities,
  PlatformSession,
  PlatformStatus,
  UnifiedMessage,
  UnifiedContact,
  UnifiedChat,
  OutgoingMessage,
  PlatformEvent,
  PlatformEventData,
} from './types';
import { redis } from '../services/redis';
import { logger } from '../utils/logger';

export abstract class BasePlatformAdapter extends EventEmitter implements IPlatformAdapter {
  abstract readonly platform: Platform;
  abstract readonly authMethod: AuthMethod;
  abstract readonly capabilities: PlatformCapabilities;

  protected sessions: Map<string, PlatformSession> = new Map();
  protected readonly sessionPrefix: string;

  constructor() {
    super();
    this.sessionPrefix = `platform:${this.constructor.name.toLowerCase().replace('adapter', '')}:session:`;
  }

  /**
   * Get the Redis key prefix for this platform's sessions
   */
  protected getSessionKey(sessionId: string): string {
    return `${this.sessionPrefix}${sessionId}`;
  }

  /**
   * Save session to Redis with 24-hour TTL
   */
  protected async saveSessionToRedis(session: PlatformSession): Promise<void> {
    const key = this.getSessionKey(session.id);
    await redis.setex(key, 86400, JSON.stringify(session));
    logger.debug(`Session saved to Redis: ${key}`);
  }

  /**
   * Load session from Redis
   */
  protected async loadSessionFromRedis(sessionId: string): Promise<PlatformSession | null> {
    const key = this.getSessionKey(sessionId);
    const data = await redis.get(key);
    if (data) {
      const session = JSON.parse(data) as PlatformSession;
      // Restore Date objects
      session.createdAt = new Date(session.createdAt);
      if (session.lastConnectedAt) {
        session.lastConnectedAt = new Date(session.lastConnectedAt);
      }
      if (session.lastMessageAt) {
        session.lastMessageAt = new Date(session.lastMessageAt);
      }
      return session;
    }
    return null;
  }

  /**
   * Delete session from Redis
   */
  protected async deleteSessionFromRedis(sessionId: string): Promise<void> {
    const key = this.getSessionKey(sessionId);
    await redis.del(key);
    logger.debug(`Session deleted from Redis: ${key}`);
  }

  /**
   * Update session status
   */
  protected async updateSessionStatus(
    sessionId: string,
    status: PlatformStatus,
    error?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.error = error;
      if (status === PlatformStatus.CONNECTED) {
        session.lastConnectedAt = new Date();
      }
      await this.saveSessionToRedis(session);
      logger.info(`Session ${sessionId} status updated to ${status}`);
    }
  }

  /**
   * Emit a platform event with structured data
   */
  protected emitPlatformEvent(
    event: PlatformEvent,
    sessionId: string,
    data: unknown
  ): void {
    const eventData: PlatformEventData = {
      sessionId,
      platform: this.platform,
      event,
      data,
      timestamp: new Date(),
    };
    this.emit(event, eventData);
    logger.debug(`Platform event emitted: ${this.platform}/${event}`, { sessionId });
  }

  /**
   * Get all session keys from Redis for this platform
   */
  protected async getAllSessionKeys(): Promise<string[]> {
    return await redis.keys(`${this.sessionPrefix}*`);
  }

  /**
   * Create a default session object
   */
  protected createDefaultSession(
    userId: string,
    sessionId: string
  ): PlatformSession {
    return {
      id: sessionId,
      platform: this.platform,
      userId,
      status: PlatformStatus.INITIALIZING,
      authMethod: this.authMethod,
      createdAt: new Date(),
      capabilities: this.capabilities,
    };
  }

  /**
   * Log adapter activity
   */
  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: object): void {
    const fullMessage = `[${this.platform}] ${message}`;
    logger[level](fullMessage, meta);
  }

  // Abstract methods that each adapter must implement

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;

  abstract createSession(
    userId: string,
    sessionId: string,
    config?: unknown
  ): Promise<PlatformSession>;

  abstract getSession(sessionId: string): Promise<PlatformSession | null>;
  abstract getUserSessions(userId: string): Promise<PlatformSession[]>;
  abstract disconnectSession(sessionId: string): Promise<void>;
  abstract reconnectSession(sessionId: string): Promise<void>;

  abstract getAuthData(sessionId: string): Promise<unknown>;

  abstract sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage>;

  abstract markAsRead(
    sessionId: string,
    chatId: string,
    messageId: string
  ): Promise<void>;

  abstract getContacts(sessionId: string): Promise<UnifiedContact[]>;
  abstract getChats(sessionId: string): Promise<UnifiedChat[]>;
  abstract getChatHistory(
    sessionId: string,
    chatId: string,
    limit?: number
  ): Promise<UnifiedMessage[]>;
}
