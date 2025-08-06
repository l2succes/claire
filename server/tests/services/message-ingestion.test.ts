import { MessageIngestionService } from '../../src/services/message-ingestion';
import { messageQueue } from '../../src/services/message-queue';
import { supabase } from '../../src/services/supabase';

// Mock dependencies
jest.mock('../../src/services/message-queue');
jest.mock('../../src/services/supabase');
jest.mock('../../src/auth/whatsapp-auth');
jest.mock('../../src/utils/logger');

describe('MessageIngestionService', () => {
  let service: MessageIngestionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MessageIngestionService();
  });

  describe('handleIncomingMessage', () => {
    const mockMessage = {
      id: { _serialized: 'msg-123' },
      body: 'Test message',
      from: '1234567890@c.us',
      fromMe: false,
      timestamp: 1234567890,
      hasMedia: false,
      type: 'chat',
      getChat: jest.fn(),
      getContact: jest.fn(),
    };

    const mockChat = {
      id: { _serialized: 'chat-123' },
      isGroup: false,
      name: 'Test Chat',
    };

    const mockContact = {
      id: { _serialized: 'contact-123' },
      number: '1234567890',
      pushname: 'Test User',
      name: 'Test User',
      isMyContact: true,
      getProfilePicUrl: jest.fn().mockResolvedValue('https://example.com/pic.jpg'),
    };

    it('should process incoming message successfully', async () => {
      mockMessage.getChat.mockResolvedValue(mockChat);
      mockMessage.getContact.mockResolvedValue(mockContact);
      
      (messageQueue.addMessage as jest.Mock).mockResolvedValue({ id: 'job-123' });
      (prisma.contact.upsert as jest.Mock).mockResolvedValue({ id: 'contact-db-123' });
      (prisma.message.create as jest.Mock).mockResolvedValue({ id: 'msg-db-123' });

      await service.handleIncomingMessage('session-123', mockMessage as any);

      expect(messageQueue.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          message: mockMessage,
          chat: mockChat,
          contact: mockContact,
        })
      );
    });

    it('should prevent duplicate message processing', async () => {
      mockMessage.getChat.mockResolvedValue(mockChat);
      mockMessage.getContact.mockResolvedValue(mockContact);

      // First call
      await service.handleIncomingMessage('session-123', mockMessage as any);
      
      // Second call with same message ID should be skipped
      await service.handleIncomingMessage('session-123', mockMessage as any);

      expect(messageQueue.addMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle group messages', async () => {
      const mockGroupChat = {
        ...mockChat,
        isGroup: true,
        participants: ['user1', 'user2', 'user3'],
        description: 'Test Group',
      };

      mockMessage.getChat.mockResolvedValue(mockGroupChat);
      mockMessage.getContact.mockResolvedValue(mockContact);
      
      (prisma.group.upsert as jest.Mock).mockResolvedValue({ id: 'group-db-123' });
      (prisma.message.create as jest.Mock).mockResolvedValue({ id: 'msg-db-123' });

      await service.handleIncomingMessage('session-123', mockMessage as any);

      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            whatsappId: mockGroupChat.id._serialized,
          },
        })
      );
    });

    it('should handle messages with media', async () => {
      const mockMediaMessage = {
        ...mockMessage,
        hasMedia: true,
        downloadMedia: jest.fn().mockResolvedValue({
          mimetype: 'image/jpeg',
          data: 'base64data',
        }),
      };

      mockMediaMessage.getChat.mockResolvedValue(mockChat);
      mockMediaMessage.getContact.mockResolvedValue(mockContact);
      
      (prisma.message.create as jest.Mock).mockResolvedValue({ id: 'msg-db-123' });
      (supabase.storage.from as jest.Mock).mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/media.jpg' },
        }),
      });

      await service.handleIncomingMessage('session-123', mockMediaMessage as any);

      // Media download should be triggered asynchronously
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mediaType: 'image',
          }),
        })
      );
    });
  });

  describe('getUserMessages', () => {
    it('should retrieve user messages with pagination', async () => {
      const mockMessages = [
        { id: '1', content: 'Message 1', timestamp: new Date() },
        { id: '2', content: 'Message 2', timestamp: new Date() },
      ];

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const result = await service.getUserMessages('user-123', 10, 0);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { timestamp: 'desc' },
        take: 10,
        skip: 0,
        include: {
          sender: true,
          receiver: true,
          group: true,
          promises: true,
        },
      });

      expect(result).toEqual(mockMessages);
    });
  });

  describe('getChatMessages', () => {
    it('should retrieve messages for a specific chat', async () => {
      const mockMessages = [
        { id: '1', content: 'Message 1', senderId: 'contact-123' },
        { id: '2', content: 'Message 2', receiverId: 'contact-123' },
      ];

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const result = await service.getChatMessages('user-123', 'contact-123', 20);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          OR: [
            { senderId: 'contact-123' },
            { receiverId: 'contact-123' },
            { groupId: 'contact-123' },
          ],
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        include: {
          sender: true,
          receiver: true,
          group: true,
        },
      });

      expect(result).toEqual(mockMessages);
    });
  });

  describe('searchMessages', () => {
    it('should search messages by content', async () => {
      const mockSearchResults = [
        { id: '1', content: 'Hello world', timestamp: new Date() },
      ];

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockSearchResults);

      const result = await service.searchMessages('user-123', 'hello', 10);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          content: {
            contains: 'hello',
            mode: 'insensitive',
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
          sender: true,
          receiver: true,
          group: true,
        },
      });

      expect(result).toEqual(mockSearchResults);
    });
  });

  describe('markAsReplied', () => {
    it('should mark message as replied', async () => {
      const mockUpdatedMessage = {
        id: 'msg-123',
        isReplied: true,
        actualReply: 'Reply content',
        replyStatus: 'SENT',
      };

      (prisma.message.update as jest.Mock).mockResolvedValue(mockUpdatedMessage);

      const result = await service.markAsReplied('msg-123', 'Reply content');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-123' },
        data: {
          isReplied: true,
          actualReply: 'Reply content',
          replyStatus: 'SENT',
        },
      });

      expect(result).toEqual(mockUpdatedMessage);
    });
  });
});