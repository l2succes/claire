/**
 * Telegram Platform Adapter
 *
 * Implements the IPlatformAdapter interface for Telegram using telegraf.
 * Uses official Telegram Bot API with token-based authentication.
 */

import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
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

export interface TelegramConfig {
  botToken: string;
}

export class TelegramAdapter extends BasePlatformAdapter {
  readonly platform = Platform.TELEGRAM;
  readonly authMethod = AuthMethod.BOT_TOKEN;
  readonly capabilities: PlatformCapabilities = {
    canSendText: true,
    canSendMedia: true,
    canSendStickers: true,
    canSendVoice: true,
    canSendLocation: true,
    canCreateGroups: false,
    canReadReceipts: false,
    canEditMessages: true,
    canDeleteMessages: true,
    canReactToMessages: true,
    canReplyToMessages: true,
    maxMessageLength: 4096,
    supportedMediaTypes: [
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.AUDIO,
      MessageContentType.VOICE,
      MessageContentType.DOCUMENT,
      MessageContentType.STICKER,
      MessageContentType.LOCATION,
    ],
  };

  private bots: Map<string, Telegraf> = new Map();

  async initialize(): Promise<void> {
    this.log('info', 'Telegram adapter initializing...');
    await this.restoreExistingSessions();
    this.log('info', 'Telegram adapter initialized');
  }

  async shutdown(): Promise<void> {
    this.log('info', 'Telegram adapter shutting down...');

    for (const [sessionId, bot] of this.bots) {
      try {
        bot.stop('Shutdown');
        this.log('info', `Bot ${sessionId} stopped`);
      } catch (error) {
        this.log('error', `Error stopping bot ${sessionId}`, { error });
      }
    }

    this.bots.clear();
    this.sessions.clear();
    this.log('info', 'Telegram adapter shutdown complete');
  }

  async createSession(
    userId: string,
    sessionId: string,
    config?: unknown
  ): Promise<PlatformSession> {
    const telegramConfig = config as TelegramConfig;

    if (!telegramConfig?.botToken) {
      throw new Error('Bot token is required for Telegram');
    }

    const session = this.createDefaultSession(userId, sessionId);
    session.authData = { token: telegramConfig.botToken };
    this.sessions.set(sessionId, session);

    try {
      const bot = new Telegraf(telegramConfig.botToken);

      // Get bot info
      const botInfo = await bot.telegram.getMe();
      session.platformUserId = botInfo.id.toString();
      session.platformUsername = botInfo.username;

      // Setup message handlers
      this.setupBotHandlers(bot, sessionId, userId);

      // Start polling
      bot.launch();
      this.bots.set(sessionId, bot);

      session.status = PlatformStatus.CONNECTED;
      session.lastConnectedAt = new Date();
      await this.saveSessionToRedis(session);

      this.emitPlatformEvent('session_ready', sessionId, {
        botUsername: botInfo.username,
      });

      this.log('info', `Telegram bot connected: @${botInfo.username}`);

      return session;
    } catch (error) {
      session.status = PlatformStatus.FAILED;
      session.error = (error as Error).message;
      await this.saveSessionToRedis(session);
      throw error;
    }
  }

  private setupBotHandlers(bot: Telegraf, sessionId: string, userId: string): void {
    // Handle text messages
    bot.on(message('text'), async (ctx) => {
      const unifiedMessage = this.convertToUnifiedMessage(ctx, sessionId, userId);
      this.emitPlatformEvent('message', sessionId, unifiedMessage);
    });

    // Handle photos
    bot.on(message('photo'), async (ctx) => {
      const unifiedMessage = this.convertToUnifiedMessage(
        ctx,
        sessionId,
        userId,
        MessageContentType.IMAGE
      );
      this.emitPlatformEvent('message', sessionId, unifiedMessage);
    });

    // Handle documents
    bot.on(message('document'), async (ctx) => {
      const unifiedMessage = this.convertToUnifiedMessage(
        ctx,
        sessionId,
        userId,
        MessageContentType.DOCUMENT
      );
      this.emitPlatformEvent('message', sessionId, unifiedMessage);
    });

    // Handle voice messages
    bot.on(message('voice'), async (ctx) => {
      const unifiedMessage = this.convertToUnifiedMessage(
        ctx,
        sessionId,
        userId,
        MessageContentType.VOICE
      );
      this.emitPlatformEvent('message', sessionId, unifiedMessage);
    });

    // Handle stickers
    bot.on(message('sticker'), async (ctx) => {
      const unifiedMessage = this.convertToUnifiedMessage(
        ctx,
        sessionId,
        userId,
        MessageContentType.STICKER
      );
      this.emitPlatformEvent('message', sessionId, unifiedMessage);
    });

    // Handle errors
    bot.catch((err, _ctx) => {
      this.log('error', `Bot error for session ${sessionId}`, { error: err });
      this.emitPlatformEvent('session_error', sessionId, { error: (err as Error).message });
    });
  }

  private convertToUnifiedMessage(
    ctx: Context,
    sessionId: string,
    userId: string,
    contentType: MessageContentType = MessageContentType.TEXT
  ): UnifiedMessage {
    const msg = ctx.message!;
    const chat = ctx.chat!;
    const from = ctx.from!;

    let content = '';
    if ('text' in msg) {
      content = msg.text || '';
    } else if ('caption' in msg) {
      content = msg.caption || '[Media message]';
    } else {
      content = '[Media message]';
    }

    return {
      id: `tg-${msg.message_id}-${Date.now()}`,
      platformMessageId: msg.message_id.toString(),
      platform: Platform.TELEGRAM,
      sessionId,
      userId,
      content,
      contentType,
      senderId: from.id.toString(),
      senderName: from.first_name + (from.last_name ? ` ${from.last_name}` : ''),
      chatId: chat.id.toString(),
      chatType: chat.type === 'private' ? 'individual' : 'group',
      chatName: 'title' in chat ? chat.title : undefined,
      timestamp: new Date(msg.date * 1000),
      isFromMe: false,
      isRead: true,
      hasMedia: contentType !== MessageContentType.TEXT,
      replyToMessageId:
        'reply_to_message' in msg ? msg.reply_to_message?.message_id?.toString() : undefined,
      platformMetadata: {
        telegramUserId: from.id,
        username: from.username,
        isBot: from.is_bot,
        chatType: chat.type,
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
    const bot = this.bots.get(sessionId);
    if (bot) {
      bot.stop('Disconnect');
      this.bots.delete(sessionId);
    }

    await this.updateSessionStatus(sessionId, PlatformStatus.DISCONNECTED);
    this.emitPlatformEvent('session_disconnected', sessionId, {});
  }

  async reconnectSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || !session.authData?.token) {
      throw new Error('Cannot reconnect: session or token not found');
    }

    await this.disconnectSession(sessionId);
    await this.createSession(session.userId, sessionId, {
      botToken: session.authData.token,
    });
  }

  async getAuthData(sessionId: string): Promise<unknown> {
    const session = await this.getSession(sessionId);
    return {
      method: 'bot_token',
      instructions: 'Provide your Telegram Bot Token from @BotFather',
      status: session?.status,
    };
  }

  async sendMessage(
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    const bot = this.bots.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!bot || !session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const replyParams = message.replyToMessageId
      ? { reply_parameters: { message_id: parseInt(message.replyToMessageId) } }
      : {};

    let sentMsg;

    if (message.media && message.media.length > 0) {
      const media = message.media[0];
      switch (media.type) {
        case MessageContentType.IMAGE:
          sentMsg = await bot.telegram.sendPhoto(
            chatId,
            { source: media.data as Buffer },
            { caption: message.content, ...replyParams }
          );
          break;
        case MessageContentType.DOCUMENT:
          sentMsg = await bot.telegram.sendDocument(
            chatId,
            { source: media.data as Buffer, filename: media.fileName },
            { caption: message.content, ...replyParams }
          );
          break;
        case MessageContentType.VOICE:
          sentMsg = await bot.telegram.sendVoice(chatId, { source: media.data as Buffer }, replyParams);
          break;
        default:
          sentMsg = await bot.telegram.sendMessage(chatId, message.content, replyParams);
      }
    } else {
      sentMsg = await bot.telegram.sendMessage(chatId, message.content, replyParams);
    }

    return {
      id: `tg-${sentMsg.message_id}-${Date.now()}`,
      platformMessageId: sentMsg.message_id.toString(),
      platform: Platform.TELEGRAM,
      sessionId,
      userId: session.userId,
      content: message.content,
      contentType: message.contentType || MessageContentType.TEXT,
      senderId: session.platformUserId!,
      chatId,
      chatType: 'individual',
      timestamp: new Date(sentMsg.date * 1000),
      isFromMe: true,
      isRead: true,
      hasMedia: !!message.media?.length,
    };
  }

  async markAsRead(_sessionId: string, _chatId: string, _messageId: string): Promise<void> {
    // Telegram bots cannot mark messages as read
    this.log('debug', 'Telegram does not support read receipts for bots');
  }

  async getContacts(_sessionId: string): Promise<UnifiedContact[]> {
    // Telegram bots don't have access to user's contact list
    return [];
  }

  async getChats(_sessionId: string): Promise<UnifiedChat[]> {
    // Telegram bots can't fetch chat list, only know chats from received messages
    return [];
  }

  async getChatHistory(
    _sessionId: string,
    _chatId: string,
    _limit?: number
  ): Promise<UnifiedMessage[]> {
    // Telegram bots cannot retrieve chat history
    this.log('debug', 'Telegram bots cannot retrieve chat history');
    return [];
  }

  private async restoreExistingSessions(): Promise<void> {
    const keys = await this.getAllSessionKeys();

    for (const key of keys) {
      const sessionId = key.replace(this.sessionPrefix, '');
      const session = await this.loadSessionFromRedis(sessionId);

      if (session && session.status === PlatformStatus.CONNECTED && session.authData?.token) {
        try {
          await this.createSession(session.userId, session.id, {
            botToken: session.authData.token,
          });
          this.log('info', `Restored Telegram session: ${session.id}`);
        } catch (error) {
          this.log('error', `Failed to restore Telegram session ${session.id}`, { error });
        }
      }
    }
  }
}

// Export singleton instance
export const telegramAdapter = new TelegramAdapter();
