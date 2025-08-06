import { EventEmitter } from 'events';
import { Message, Chat, Contact, GroupChat } from 'whatsapp-web.js';
import { whatsappAuth } from '../auth/whatsapp-auth';
import { messageQueue } from './message-queue';
import { prisma } from './prisma';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

export interface IncomingMessage {
  sessionId: string;
  userId: string;
  message: Message;
  chat: Chat;
  contact?: Contact;
  timestamp: Date;
}

export class MessageIngestionService extends EventEmitter {
  private processingMessages: Set<string> = new Set();

  constructor() {
    super();
    this.setupListeners();
  }

  /**
   * Setup message listeners for all WhatsApp sessions
   */
  private setupListeners() {
    // Listen for new messages from WhatsApp auth service
    whatsappAuth.on('message', async ({ sessionId, message }) => {
      await this.handleIncomingMessage(sessionId, message);
    });

    // Listen for message acknowledgments
    whatsappAuth.on('message_ack', async ({ sessionId, message, ack }) => {
      await this.handleMessageAck(sessionId, message, ack);
    });

    // Listen for message revocation (deleted messages)
    whatsappAuth.on('message_revoke_everyone', async ({ sessionId, message }) => {
      await this.handleMessageRevoke(sessionId, message);
    });
  }

  /**
   * Handle incoming message from WhatsApp
   */
  async handleIncomingMessage(sessionId: string, message: Message) {
    try {
      // Prevent duplicate processing
      const messageKey = `${sessionId}-${message.id._serialized}`;
      if (this.processingMessages.has(messageKey)) {
        return;
      }
      this.processingMessages.add(messageKey);

      // Get session info
      const session = await whatsappAuth.getSession(sessionId);
      if (!session) {
        logger.error(`Session ${sessionId} not found for message ${message.id._serialized}`);
        return;
      }

      // Get chat and contact info
      const chat = await message.getChat();
      const contact = await message.getContact();

      // Create message record
      const messageData: IncomingMessage = {
        sessionId,
        userId: session.userId,
        message,
        chat,
        contact,
        timestamp: new Date(message.timestamp * 1000),
      };

      // Add to processing queue
      await messageQueue.addMessage(messageData);

      // Store in database
      await this.storeMessage(messageData);

      // Emit event for real-time updates
      this.emit('message:received', messageData);

      // Broadcast via Supabase Realtime
      await this.broadcastMessage(session.userId, 'new_message', {
        id: message.id._serialized,
        from: message.from,
        body: message.body,
        timestamp: messageData.timestamp,
        isFromMe: message.fromMe,
      });

      logger.info(`Message ingested: ${message.id._serialized}`);
    } catch (error) {
      logger.error('Error handling incoming message:', error);
    } finally {
      // Clean up processing flag after a delay
      setTimeout(() => {
        this.processingMessages.delete(`${sessionId}-${message.id._serialized}`);
      }, 5000);
    }
  }

  /**
   * Store message in database
   */
  private async storeMessage(data: IncomingMessage) {
    try {
      const { message, chat, contact, userId } = data;

      // First, ensure contact exists in database
      let dbContact = null;
      if (contact && !message.fromMe) {
        dbContact = await this.upsertContact(userId, contact, chat);
      }

      // Handle group chats
      let groupId = null;
      if (chat.isGroup) {
        const groupChat = chat as GroupChat;
        groupId = await this.upsertGroup(groupChat);
      }

      // Prepare message data
      const messageData = {
        userId,
        whatsappMessageId: message.id._serialized,
        senderId: message.fromMe ? null : dbContact?.id || null,
        receiverId: message.fromMe && dbContact ? dbContact.id : null,
        groupId,
        content: message.body || '',
        mediaUrl: message.hasMedia ? null : null, // Will be updated when media is downloaded
        mediaType: this.getMediaType(message),
        timestamp: data.timestamp,
        isFromMe: message.fromMe,
        isRead: false,
        isReplied: false,
        metadata: {
          hasQuotedMsg: message.hasQuotedMsg,
          isForwarded: message.isForwarded,
          isStatus: message.isStatus,
          isBroadcast: message.broadcast,
          type: message.type,
          deviceType: message.deviceType,
        },
      };

      // Store in database using Prisma
      const storedMessage = await prisma.message.create({
        data: messageData,
      });

      // Handle media if present
      if (message.hasMedia) {
        this.downloadAndStoreMedia(storedMessage.id, message);
      }

      return storedMessage;
    } catch (error) {
      logger.error('Error storing message:', error);
      throw error;
    }
  }

  /**
   * Upsert contact in database
   */
  private async upsertContact(userId: string, contact: Contact, chat: Chat) {
    try {
      const contactData = {
        userId,
        whatsappId: contact.id._serialized,
        phoneNumber: contact.number,
        name: contact.pushname || contact.name || null,
        avatarUrl: await contact.getProfilePicUrl() || null,
        isVerified: contact.isMyContact,
      };

      return await prisma.contact.upsert({
        where: {
          userId_whatsappId: {
            userId,
            whatsappId: contact.id._serialized,
          },
        },
        update: contactData,
        create: contactData,
      });
    } catch (error) {
      logger.error('Error upserting contact:', error);
      return null;
    }
  }

  /**
   * Upsert group in database
   */
  private async upsertGroup(groupChat: GroupChat) {
    try {
      const groupData = {
        whatsappId: groupChat.id._serialized,
        name: groupChat.name,
        description: groupChat.description || null,
        participantCount: groupChat.participants.length,
      };

      const group = await prisma.group.upsert({
        where: {
          whatsappId: groupChat.id._serialized,
        },
        update: groupData,
        create: groupData,
      });

      return group.id;
    } catch (error) {
      logger.error('Error upserting group:', error);
      return null;
    }
  }

  /**
   * Download and store media
   */
  private async downloadAndStoreMedia(messageId: string, message: Message) {
    try {
      const media = await message.downloadMedia();
      if (!media) return;

      // Upload to Supabase Storage
      const fileName = `${messageId}-${Date.now()}.${media.mimetype.split('/')[1]}`;
      const { data: uploadData, error } = await supabase.storage
        .from('message-media')
        .upload(fileName, Buffer.from(media.data, 'base64'), {
          contentType: media.mimetype,
        });

      if (error) {
        logger.error('Error uploading media:', error);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('message-media')
        .getPublicUrl(fileName);

      // Update message with media URL
      await prisma.message.update({
        where: { id: messageId },
        data: {
          mediaUrl: urlData.publicUrl,
          mediaType: this.getMediaTypeFromMime(media.mimetype),
        },
      });

      logger.info(`Media stored for message ${messageId}`);
    } catch (error) {
      logger.error('Error downloading/storing media:', error);
    }
  }

  /**
   * Handle message acknowledgment
   */
  private async handleMessageAck(sessionId: string, message: Message, ack: number) {
    try {
      // ACK states: 0 = pending, 1 = sent, 2 = received, 3 = read, 4 = played
      if (ack === 3) {
        // Message was read
        await prisma.message.update({
          where: {
            whatsappMessageId: message.id._serialized,
          },
          data: {
            isRead: true,
          },
        });

        this.emit('message:read', { sessionId, messageId: message.id._serialized });
      }
    } catch (error) {
      logger.error('Error handling message ack:', error);
    }
  }

  /**
   * Handle message revocation (deletion)
   */
  private async handleMessageRevoke(sessionId: string, message: Message) {
    try {
      await prisma.message.update({
        where: {
          whatsappMessageId: message.id._serialized,
        },
        data: {
          content: '[Message deleted]',
          metadata: {
            deleted: true,
            deletedAt: new Date(),
          },
        },
      });

      this.emit('message:deleted', { sessionId, messageId: message.id._serialized });
    } catch (error) {
      logger.error('Error handling message revoke:', error);
    }
  }

  /**
   * Get media type from message
   */
  private getMediaType(message: Message): string | null {
    if (!message.hasMedia) return null;
    
    switch (message.type) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
      case 'ptt': // Push to talk (voice note)
        return 'audio';
      case 'document':
        return 'document';
      default:
        return null;
    }
  }

  /**
   * Get media type from MIME type
   */
  private getMediaTypeFromMime(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Broadcast message via Supabase Realtime
   */
  private async broadcastMessage(userId: string, event: string, data: any) {
    try {
      const channel = supabase.channel(`user:${userId}`);
      await channel.send({
        type: 'broadcast',
        event,
        payload: data,
      });
    } catch (error) {
      logger.error('Error broadcasting message:', error);
    }
  }

  /**
   * Get messages for a user
   */
  async getUserMessages(userId: string, limit: number = 50, offset: number = 0) {
    return await prisma.message.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      include: {
        sender: true,
        receiver: true,
        group: true,
        promises: true,
      },
    });
  }

  /**
   * Get messages for a specific chat
   */
  async getChatMessages(userId: string, chatId: string, limit: number = 50) {
    return await prisma.message.findMany({
      where: {
        userId,
        OR: [
          { senderId: chatId },
          { receiverId: chatId },
          { groupId: chatId },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        sender: true,
        receiver: true,
        group: true,
      },
    });
  }

  /**
   * Search messages
   */
  async searchMessages(userId: string, query: string, limit: number = 50) {
    return await prisma.message.findMany({
      where: {
        userId,
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        sender: true,
        receiver: true,
        group: true,
      },
    });
  }

  /**
   * Mark message as replied
   */
  async markAsReplied(messageId: string, replyContent: string) {
    return await prisma.message.update({
      where: { id: messageId },
      data: {
        isReplied: true,
        actualReply: replyContent,
        replyStatus: 'SENT',
      },
    });
  }
}

// Export singleton instance
export const messageIngestion = new MessageIngestionService();