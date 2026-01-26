/**
 * iMessage Platform Adapter
 *
 * Implements the IPlatformAdapter interface for iMessage using SQLite database access.
 * This adapter is READ-ONLY and only works on macOS with Full Disk Access permission.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { BasePlatformAdapter } from '../base-adapter';
import {
  Platform,
  AuthMethod,
  PlatformCapabilities,
  PlatformSession,
  PlatformStatus,
  UnifiedMessage,
  UnifiedContact,
  UnifiedChat,
  OutgoingMessage,
  MessageContentType,
} from '../types';

// Default iMessage database path on macOS
const IMESSAGE_DB_PATH = path.join(os.homedir(), 'Library/Messages/chat.db');

// Apple epoch: January 1, 2001
const APPLE_EPOCH = new Date('2001-01-01T00:00:00Z').getTime();

export interface IMessageConfig {
  dbPath?: string;
}

export class IMessageAdapter extends BasePlatformAdapter {
  readonly platform = Platform.IMESSAGE;
  readonly authMethod = AuthMethod.LOCAL_DATABASE;
  readonly capabilities: PlatformCapabilities = {
    canSendText: false, // Read-only for safety
    canSendMedia: false,
    canSendStickers: false,
    canSendVoice: false,
    canSendLocation: false,
    canCreateGroups: false,
    canReadReceipts: true,
    canEditMessages: false,
    canDeleteMessages: false,
    canReactToMessages: false,
    canReplyToMessages: false,
    maxMessageLength: 0,
    supportedMediaTypes: [
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.AUDIO,
    ],
  };

  private dbConnections: Map<string, unknown> = new Map();
  private watchers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lastRowId: Map<string, number> = new Map();

  async initialize(): Promise<void> {
    this.log('info', 'iMessage adapter initializing...');

    // Check if running on macOS
    if (process.platform !== 'darwin') {
      this.log('warn', 'iMessage adapter is only available on macOS');
      return;
    }

    // Check if database exists and is accessible
    if (!fs.existsSync(IMESSAGE_DB_PATH)) {
      this.log('warn', 'iMessage database not found. Ensure Full Disk Access is granted.');
      return;
    }

    await this.restoreExistingSessions();
    this.log('info', 'iMessage adapter initialized');
  }

  async shutdown(): Promise<void> {
    this.log('info', 'iMessage adapter shutting down...');

    for (const [sessionId, interval] of this.watchers) {
      clearInterval(interval);
      this.log('info', `Watcher stopped for session ${sessionId}`);
    }

    for (const [sessionId, db] of this.dbConnections) {
      try {
        // @ts-expect-error - SQLite close method
        if (db && typeof db.close === 'function') {
          // @ts-expect-error - SQLite close method
          db.close();
        }
      } catch (error) {
        this.log('error', `Error closing DB for session ${sessionId}`, { error });
      }
    }

    this.watchers.clear();
    this.dbConnections.clear();
    this.sessions.clear();
    this.log('info', 'iMessage adapter shutdown complete');
  }

  async createSession(
    userId: string,
    sessionId: string,
    config?: unknown
  ): Promise<PlatformSession> {
    if (process.platform !== 'darwin') {
      throw new Error('iMessage is only available on macOS');
    }

    const imessageConfig = config as IMessageConfig | undefined;
    const dbPath = imessageConfig?.dbPath || IMESSAGE_DB_PATH;

    if (!fs.existsSync(dbPath)) {
      throw new Error(
        'iMessage database not accessible. Grant Full Disk Access to this application.'
      );
    }

    const session = this.createDefaultSession(userId, sessionId);
    session.authData = { sessionPath: dbPath };
    this.sessions.set(sessionId, session);

    try {
      // Dynamic import of better-sqlite3 (will be installed later)
      let Database: typeof import('better-sqlite3');
      try {
        Database = (await import('better-sqlite3')).default;
      } catch {
        throw new Error('better-sqlite3 not installed. Run: bun add better-sqlite3');
      }

      // Open read-only connection to iMessage database
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      this.dbConnections.set(sessionId, db);

      // Get initial last row ID
      const lastRow = db.prepare('SELECT MAX(ROWID) as maxId FROM message').get() as {
        maxId: number;
      } | null;
      this.lastRowId.set(sessionId, lastRow?.maxId || 0);

      // Setup polling for new messages
      this.setupDatabaseWatcher(sessionId, userId, db);

      session.status = PlatformStatus.CONNECTED;
      session.lastConnectedAt = new Date();
      await this.saveSessionToRedis(session);

      this.emitPlatformEvent('session_ready', sessionId, { dbPath });
      this.log('info', `iMessage session connected: ${sessionId}`);

      return session;
    } catch (error) {
      session.status = PlatformStatus.FAILED;
      session.error = (error as Error).message;
      await this.saveSessionToRedis(session);
      throw error;
    }
  }

  private setupDatabaseWatcher(
    sessionId: string,
    userId: string,
    db: import('better-sqlite3').Database
  ): void {
    // Poll for new messages every 2 seconds
    const interval = setInterval(async () => {
      await this.checkForNewMessages(sessionId, userId, db);
    }, 2000);

    this.watchers.set(sessionId, interval);
  }

  private async checkForNewMessages(
    sessionId: string,
    userId: string,
    db: import('better-sqlite3').Database
  ): Promise<void> {
    const lastId = this.lastRowId.get(sessionId) || 0;

    try {
      const messages = db
        .prepare(
          `
        SELECT
          m.ROWID,
          m.guid,
          m.text,
          m.date,
          m.is_from_me,
          m.is_read,
          m.date_read,
          m.cache_has_attachments,
          h.id as handle_id,
          h.service,
          c.chat_identifier,
          c.display_name as chat_name,
          c.group_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE m.ROWID > ?
        ORDER BY m.ROWID ASC
        LIMIT 100
      `
        )
        .all(lastId) as Array<{
        ROWID: number;
        guid: string;
        text: string | null;
        date: number;
        is_from_me: number;
        is_read: number;
        date_read: number | null;
        cache_has_attachments: number;
        handle_id: string | null;
        service: string | null;
        chat_identifier: string | null;
        chat_name: string | null;
        group_id: string | null;
      }>;

      for (const msg of messages) {
        const unifiedMessage = this.convertToUnifiedMessage(msg, sessionId, userId);
        this.emitPlatformEvent('message', sessionId, unifiedMessage);
        this.lastRowId.set(sessionId, msg.ROWID);
      }
    } catch (error) {
      this.log('error', 'Error checking for new iMessages', { error });
    }
  }

  private convertToUnifiedMessage(
    msg: {
      ROWID: number;
      guid: string;
      text: string | null;
      date: number;
      is_from_me: number;
      is_read: number;
      cache_has_attachments: number;
      handle_id: string | null;
      service: string | null;
      chat_identifier: string | null;
      chat_name: string | null;
      group_id: string | null;
    },
    sessionId: string,
    userId: string
  ): UnifiedMessage {
    // iMessage stores dates as nanoseconds since Apple epoch (Jan 1, 2001)
    const timestamp = new Date(APPLE_EPOCH + msg.date / 1000000);

    return {
      id: `im-${msg.ROWID}-${Date.now()}`,
      platformMessageId: msg.guid,
      platform: Platform.IMESSAGE,
      sessionId,
      userId,
      content: msg.text || '',
      contentType: msg.cache_has_attachments ? MessageContentType.IMAGE : MessageContentType.TEXT,
      senderId: msg.is_from_me ? 'me' : msg.handle_id || 'unknown',
      chatId: msg.chat_identifier || msg.handle_id || 'unknown',
      chatType: msg.group_id ? 'group' : 'individual',
      chatName: msg.chat_name || undefined,
      timestamp,
      isFromMe: msg.is_from_me === 1,
      isRead: msg.is_read === 1,
      hasMedia: msg.cache_has_attachments === 1,
      platformMetadata: {
        service: msg.service, // 'iMessage' or 'SMS'
        rowId: msg.ROWID,
      },
    };
  }

  async getSession(sessionId: string): Promise<PlatformSession | null> {
    const cachedSession = this.sessions.get(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    const session = await this.loadSessionFromRedis(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    const sessions: PlatformSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      clearInterval(watcher);
      this.watchers.delete(sessionId);
    }

    const db = this.dbConnections.get(sessionId);
    if (db) {
      try {
        // @ts-expect-error - SQLite close method
        if (typeof db.close === 'function') {
          // @ts-expect-error - SQLite close method
          db.close();
        }
      } catch {
        // Ignore close errors
      }
      this.dbConnections.delete(sessionId);
    }

    await this.updateSessionStatus(sessionId, PlatformStatus.DISCONNECTED);
    this.emitPlatformEvent('session_disconnected', sessionId, {});
  }

  async reconnectSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.disconnectSession(sessionId);
    await this.createSession(session.userId, sessionId, {
      dbPath: session.authData?.sessionPath,
    });
  }

  async getAuthData(sessionId: string): Promise<unknown> {
    const session = await this.getSession(sessionId);
    return {
      method: 'local_database',
      instructions:
        'Grant Full Disk Access to this application in System Preferences > Security & Privacy > Privacy',
      status: session?.status,
      requirements: [
        'macOS operating system',
        'Full Disk Access permission',
        'iMessage configured on this Mac',
      ],
    };
  }

  async sendMessage(
    _sessionId: string,
    _chatId: string,
    _message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    throw new Error('iMessage adapter is read-only. Sending messages is not supported.');
  }

  async markAsRead(_sessionId: string, _chatId: string, _messageId: string): Promise<void> {
    this.log('debug', 'iMessage adapter is read-only');
  }

  async getContacts(sessionId: string): Promise<UnifiedContact[]> {
    const db = this.dbConnections.get(sessionId) as import('better-sqlite3').Database | undefined;
    const session = this.sessions.get(sessionId);

    if (!db || !session) return [];

    try {
      const handles = db
        .prepare(
          `
        SELECT DISTINCT h.id, h.service
        FROM handle h
        INNER JOIN message m ON m.handle_id = h.ROWID
      `
        )
        .all() as Array<{ id: string; service: string }>;

      return handles.map((h) => ({
        id: `im-contact-${h.id}`,
        platformContactId: h.id,
        platform: Platform.IMESSAGE,
        userId: session.userId,
        phoneNumber: h.id.includes('@') ? undefined : h.id,
        username: h.id.includes('@') ? h.id : undefined,
        isBlocked: false,
        isVerified: false,
      }));
    } catch (error) {
      this.log('error', 'Error getting iMessage contacts', { error });
      return [];
    }
  }

  async getChats(sessionId: string): Promise<UnifiedChat[]> {
    const db = this.dbConnections.get(sessionId) as import('better-sqlite3').Database | undefined;
    const session = this.sessions.get(sessionId);

    if (!db || !session) return [];

    try {
      const chats = db
        .prepare(
          `
        SELECT
          c.ROWID,
          c.chat_identifier,
          c.display_name,
          c.group_id,
          MAX(m.date) as last_message_date
        FROM chat c
        LEFT JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
        LEFT JOIN message m ON cmj.message_id = m.ROWID
        GROUP BY c.ROWID
        ORDER BY last_message_date DESC
      `
        )
        .all() as Array<{
        ROWID: number;
        chat_identifier: string;
        display_name: string | null;
        group_id: string | null;
        last_message_date: number | null;
      }>;

      return chats.map((c) => ({
        id: `im-chat-${c.ROWID}`,
        platformChatId: c.chat_identifier,
        platform: Platform.IMESSAGE,
        userId: session.userId,
        name: c.display_name || c.chat_identifier,
        isGroup: !!c.group_id,
        lastMessageAt: c.last_message_date
          ? new Date(APPLE_EPOCH + c.last_message_date / 1000000)
          : undefined,
      }));
    } catch (error) {
      this.log('error', 'Error getting iMessage chats', { error });
      return [];
    }
  }

  async getChatHistory(
    sessionId: string,
    chatId: string,
    limit: number = 50
  ): Promise<UnifiedMessage[]> {
    const db = this.dbConnections.get(sessionId) as import('better-sqlite3').Database | undefined;
    const session = this.sessions.get(sessionId);

    if (!db || !session) return [];

    try {
      const messages = db
        .prepare(
          `
        SELECT
          m.ROWID,
          m.guid,
          m.text,
          m.date,
          m.is_from_me,
          m.is_read,
          m.cache_has_attachments,
          h.id as handle_id,
          h.service,
          c.chat_identifier,
          c.display_name as chat_name,
          c.group_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE c.chat_identifier = ?
        ORDER BY m.date DESC
        LIMIT ?
      `
        )
        .all(chatId, limit) as Array<{
        ROWID: number;
        guid: string;
        text: string | null;
        date: number;
        is_from_me: number;
        is_read: number;
        cache_has_attachments: number;
        handle_id: string | null;
        service: string | null;
        chat_identifier: string | null;
        chat_name: string | null;
        group_id: string | null;
      }>;

      return messages
        .map((msg) => this.convertToUnifiedMessage(msg, sessionId, session.userId))
        .reverse();
    } catch (error) {
      this.log('error', 'Error getting iMessage chat history', { error });
      return [];
    }
  }

  private async restoreExistingSessions(): Promise<void> {
    // iMessage sessions are local, no need to auto-reconnect
    this.log('info', 'iMessage adapter ready for session creation');
  }
}

// Export singleton instance
export const imessageAdapter = new IMessageAdapter();
