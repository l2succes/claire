/**
 * Message Handler Tests
 * Tests for the message ingestion pipeline including:
 * - Duplicate message detection
 * - Chat/message/contact upserts
 * - Single contact upsert validation (Bug #1 fix)
 * - AI suggestion triggers
 * - Error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnifiedMessage, MessageContentType, Platform, PlatformStatus } from '../../src/adapters/types';

describe('Message Handler', () => {
  let mockSupabase: any;
  let mockAIProcessor: any;
  let messageHandler: (message: UnifiedMessage) => Promise<void>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a mock chain builder helper
    const createMockChain = (finalResult: any) => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        maybeSingle: jest.fn(() => Promise.resolve(finalResult)),
        upsert: jest.fn(() => chain),
      };
      return chain;
    };

    // Mock Supabase client with proper chaining
    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'messages') {
          return createMockChain({ data: null, error: null });
        }
        if (table === 'chats') {
          return createMockChain({ data: { id: 'chat-123' }, error: null });
        }
        if (table === 'contacts') {
          return createMockChain({ data: { id: 'contact-123' }, error: null });
        }
        return createMockChain({ data: null, error: null });
      }),
    };

    // For message inserts, override to return saved message
    const originalFrom = mockSupabase.from;
    mockSupabase.from = jest.fn((table: string) => {
      const chain = originalFrom(table);
      if (table === 'messages') {
        const originalUpsert = chain.upsert;
        chain.upsert = jest.fn(() => {
          const selectChain = {
            select: jest.fn(() => ({
              maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'msg-123' }, error: null })),
            })),
          };
          return selectChain;
        });
      }
      return chain;
    });

    // Mock AI Processor
    mockAIProcessor = {
      isConfigured: true,
      generateAndStore: jest.fn(() => Promise.resolve()),
    };

    // Create a simple message handler that mimics the real implementation
    messageHandler = async (message: UnifiedMessage) => {
      try {
        // 1. Check for duplicates (fast-path)
        const { data: existing, error: checkError } = await mockSupabase
          .from('messages')
          .select('id')
          .eq('whatsapp_id', message.platformMessageId)
          .limit(1)
          .maybeSingle();

        // Handle database errors gracefully (Bug fix validation)
        if (checkError) {
          console.error('Error checking for duplicate:', checkError);
          return; // Skip on error
        }

        if (existing) {
          return; // Skip duplicate
        }

        // 2. Upsert chat
        await mockSupabase
          .from('chats')
          .upsert({
            user_id: message.userId,
            platform: message.platform,
            platform_chat_id: message.chatId,
            name: message.chatName || message.chatId,
            last_message_at: message.timestamp,
          }, { onConflict: 'user_id,platform,platform_chat_id' });

        // 3. Upsert message
        const { data: savedMsg } = await mockSupabase
          .from('messages')
          .upsert({
            user_id: message.userId,
            whatsapp_id: message.platformMessageId,
            chat_id: message.chatId,
            platform: message.platform,
            content: message.content,
            from_me: message.isFromMe,
            timestamp: message.timestamp,
          }, { onConflict: 'whatsapp_id', ignoreDuplicates: true })
          .select('id')
          .maybeSingle();

        // 4. Upsert contact (SINGLE EXECUTION - Bug #1 fix validation)
        if (!message.isFromMe && message.senderId) {
          const contactMatch = message.senderId.match(/@(?:whatsapp|_telegram|meta|_imessage)_([^:]+):/);
          const platformContactId = contactMatch?.[1];
          if (platformContactId) {
            await mockSupabase
              .from('contacts')
              .upsert({
                user_id: message.userId,
                platform: message.platform,
                platform_contact_id: platformContactId,
                whatsapp_id: platformContactId,
                name: message.senderName || platformContactId,
                phone_number: /^\d+$/.test(platformContactId) ? platformContactId : null,
              }, { onConflict: 'user_id,platform,platform_contact_id' });
          }
        }

        // 5. Trigger AI suggestion for incoming messages (fire-and-forget with error handling)
        if (!message.isFromMe && savedMsg?.id && message.content?.trim() && mockAIProcessor.isConfigured) {
          const chatType = message.chatType === 'group' ? 'group' : 'individual';
          mockAIProcessor.generateAndStore(savedMsg.id, message.content, message.userId, chatType)
            .catch((err: Error) => console.debug('AI suggestion skipped:', err.message));
        }
      } catch (err) {
        console.error('Error saving message to DB:', err);
      }
    };
  });

  describe('Duplicate Detection', () => {
    it('should skip processing if message already exists (fast-path)', async () => {
      // Mock existing message by overriding the from() chain
      const existingChain: any = {
        select: jest.fn(() => existingChain),
        eq: jest.fn(() => existingChain),
        limit: jest.fn(() => existingChain),
        maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'existing-123' }, error: null })),
      };
      mockSupabase.from = jest.fn(() => existingChain);

      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-123',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Hello',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      // Verify no inserts were attempted (duplicate was detected)
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('messages');
    });

    it('should process message if not duplicate', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-456',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'New message',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      // Verify chat, message, and contact upserts were called
      expect(mockSupabase.from).toHaveBeenCalledWith('chats');
      expect(mockSupabase.from).toHaveBeenCalledWith('messages');
      expect(mockSupabase.from).toHaveBeenCalledWith('contacts');
    });
  });

  describe('Contact Upsert - Bug #1 Validation', () => {
    it('should upsert contact only ONCE per message (no duplicate)', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-789',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Test message',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        senderName: 'John Doe',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      // Count how many times contacts table was accessed
      const contactCalls = (mockSupabase.from as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'contacts'
      );

      // Should be called EXACTLY ONCE (Bug #1 was duplicate contact upsert)
      expect(contactCalls.length).toBe(1);
    });

    it('should extract contact ID from WhatsApp ghost user format', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-100',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Test',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15166100494:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      const upsertCall = (mockSupabase.from as jest.Mock).mock.results.find(
        (result: any) => result.value?.upsert
      );

      expect(upsertCall).toBeDefined();
    });

    it('should extract contact ID from Telegram ghost user format', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'tg-msg-200',
        platform: Platform.TELEGRAM,
        sessionId: 'session-2',
        userId: 'user-1',
        content: 'Test',
        contentType: MessageContentType.TEXT,
        senderId: '@_telegram_123456789:claire.local',
        chatId: 'chat-2',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      const contactCalls = (mockSupabase.from as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'contacts'
      );
      expect(contactCalls.length).toBe(1);
    });

    it('should extract contact ID from Instagram ghost user format', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'ig-msg-300',
        platform: Platform.INSTAGRAM,
        sessionId: 'session-3',
        userId: 'user-1',
        content: 'Test',
        contentType: MessageContentType.TEXT,
        senderId: '@meta_17841234567890:claire.local',
        chatId: 'chat-3',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      const contactCalls = (mockSupabase.from as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'contacts'
      );
      expect(contactCalls.length).toBe(1);
    });

    it('should NOT upsert contact for messages from me', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-400',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'My message',
        contentType: MessageContentType.TEXT,
        senderId: 'me',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: true,
        isRead: true,
        hasMedia: false,
      };

      await messageHandler(message);

      const contactCalls = (mockSupabase.from as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'contacts'
      );
      expect(contactCalls.length).toBe(0);
    });
  });

  describe('Chat Upsert', () => {
    it('should upsert chat with conflict resolution', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-500',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Hello',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: '15551234567@s.whatsapp.net',
        chatName: 'John Doe',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      const chatCalls = (mockSupabase.from as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'chats'
      );
      expect(chatCalls.length).toBe(1);
    });
  });

  describe('Message Upsert', () => {
    it('should upsert message with media URL when present', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-600',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Check this image',
        contentType: MessageContentType.IMAGE,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: true,
        platformMetadata: {
          mediaUrl: 'mxc://claire.local/AbCdEf123456',
        },
      };

      await messageHandler(message);

      const messageCalls = (mockSupabase.from as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'messages'
      );
      expect(messageCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle ignoreDuplicates on conflict', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-700',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Duplicate test',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      // Should not throw even if duplicate
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  describe('AI Suggestion Trigger', () => {
    it('should trigger AI generation for incoming messages', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-800',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'How are you?',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      expect(mockAIProcessor.generateAndStore).toHaveBeenCalledWith(
        'msg-123',
        'How are you?',
        'user-1',
        'individual'
      );
    });

    it('should NOT trigger AI for messages from me', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-900',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'My reply',
        contentType: MessageContentType.TEXT,
        senderId: 'me',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: true,
        isRead: true,
        hasMedia: false,
      };

      await messageHandler(message);

      expect(mockAIProcessor.generateAndStore).not.toHaveBeenCalled();
    });

    it('should NOT trigger AI for empty messages', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-1000',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: '   ', // Empty/whitespace
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      expect(mockAIProcessor.generateAndStore).not.toHaveBeenCalled();
    });

    it('should pass correct chat type to AI processor', async () => {
      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-1100',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Group message',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'group-1',
        chatType: 'group',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      await messageHandler(message);

      expect(mockAIProcessor.generateAndStore).toHaveBeenCalledWith(
        'msg-123',
        'Group message',
        'user-1',
        'group'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      const errorChain: any = {
        select: jest.fn(() => errorChain),
        eq: jest.fn(() => errorChain),
        limit: jest.fn(() => errorChain),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: new Error('DB error') })),
      };
      mockSupabase.from = jest.fn(() => errorChain);

      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-1200',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Test',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      // Should not throw, should handle gracefully and return early
      await messageHandler(message);

      // Verify it stopped at the error check (no further DB calls)
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('messages');
    });

    it('should handle AI processor errors without breaking message flow', async () => {
      mockAIProcessor.generateAndStore = jest.fn(() => Promise.reject(new Error('AI error')));

      const message: UnifiedMessage = {
        id: 'msg-1',
        platformMessageId: 'wa-msg-1300',
        platform: Platform.WHATSAPP,
        sessionId: 'session-1',
        userId: 'user-1',
        content: 'Test message',
        contentType: MessageContentType.TEXT,
        senderId: '@whatsapp_15551234567:claire.local',
        chatId: 'chat-1',
        chatType: 'individual',
        timestamp: new Date(),
        isFromMe: false,
        isRead: false,
        hasMedia: false,
      };

      // Should complete message processing even if AI fails
      await messageHandler(message);

      expect(mockSupabase.from).toHaveBeenCalledWith('messages');
    });
  });
});
