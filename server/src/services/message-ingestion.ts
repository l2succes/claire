import { EventEmitter } from 'events';
import { Message, Chat, Contact } from 'whatsapp-web.js';
import { whatsappAuth } from '../auth/whatsapp-auth';
import { messageQueue } from './message-queue';
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

// Rows we read back after inserts/upserts only need their id.
interface IdRow {
  id: string;
}

// Columns selected for message reads (message + related contact/chat).
// Be explicit about the child-to-parent relation. chats also stores a soft
// read cursor, so relying on PostgREST's relationship inference is fragile.
const MESSAGE_SELECT = '*, contact:contacts(*), chat:chats!messages_chat_id_fkey(*)';

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
   * Store message in the Supabase `messages` table.
   */
  private async storeMessage(data: IncomingMessage): Promise<IdRow | null> {
    try {
      const { message, chat, contact, userId } = data;

      // Ensure the contact exists (incoming messages only).
      let dbContact: IdRow | null = null;
      if (contact && !message.fromMe) {
        dbContact = await this.upsertContact(userId, contact);
      }

      // messages.chat_id is NOT NULL, so the chat row must exist first.
      const chatId = await this.upsertChat(userId, chat, dbContact?.id ?? null);
      if (!chatId) {
        throw new Error(`Failed to resolve chat for message ${message.id._serialized}`);
      }

      const { data: storedMessage, error } = await supabase
        .from('messages')
        .upsert(
          {
            user_id: userId,
            chat_id: chatId,
            contact_id: dbContact?.id ?? null,
            whatsapp_id: message.id._serialized,
            content: message.body || '',
            from_me: message.fromMe,
            type: this.getMediaType(message) ?? 'text',
            timestamp: data.timestamp.toISOString(),
            is_group: chat.isGroup,
            metadata: {
              hasQuotedMsg: message.hasQuotedMsg,
              isForwarded: message.isForwarded,
              isStatus: message.isStatus,
              isBroadcast: message.broadcast,
              type: message.type,
              deviceType: message.deviceType,
            },
          },
          { onConflict: 'whatsapp_id' }
        )
        .select('id')
        .single();

      if (error) throw error;

      // Handle media if present
      if (message.hasMedia && storedMessage) {
        this.downloadAndStoreMedia(storedMessage.id, message);
      }

      return storedMessage;
    } catch (error) {
      logger.error('Error storing message:', error);
      throw error;
    }
  }

  /**
   * Upsert a contact into the Supabase `contacts` table.
   */
  private async upsertContact(userId: string, contact: Contact): Promise<IdRow | null> {
    try {
      const contactData = {
        user_id: userId,
        whatsapp_id: contact.id._serialized,
        phone_number: contact.number,
        name: contact.pushname || contact.name || null,
        avatar_url: (await contact.getProfilePicUrl()) || null,
      };

      const { data, error } = await supabase
        .from('contacts')
        .upsert(contactData, { onConflict: 'user_id,whatsapp_id' })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error upserting contact:', error);
      return null;
    }
  }

  /**
   * Upsert a chat (individual or group) into the Supabase `chats` table.
   * Returns the chat id, which is required to store messages.
   */
  private async upsertChat(userId: string, chat: Chat, contactId: string | null): Promise<string | null> {
    try {
      const chatData = {
        user_id: userId,
        whatsapp_chat_id: chat.id._serialized,
        contact_id: contactId,
        name: chat.name || null,
        is_group: chat.isGroup,
      };

      const { data, error } = await supabase
        .from('chats')
        .upsert(chatData, { onConflict: 'user_id,whatsapp_chat_id' })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id ?? null;
    } catch (error) {
      logger.error('Error upserting chat:', error);
      return null;
    }
  }

  /**
   * Download media and store it in Supabase Storage, then update the message.
   */
  private async downloadAndStoreMedia(messageId: string, message: Message) {
    try {
      const media = await message.downloadMedia();
      if (!media) return;

      // Upload to Supabase Storage
      const fileName = `${messageId}-${Date.now()}.${media.mimetype.split('/')[1]}`;
      const { error } = await supabase.storage
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
      await supabase
        .from('messages')
        .update({
          media_url: urlData.publicUrl,
          media_mime_type: media.mimetype,
          type: this.getMediaTypeFromMime(media.mimetype),
        })
        .eq('id', messageId);

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
        await supabase
          .from('messages')
          .update({ status: 'read' })
          .eq('whatsapp_id', message.id._serialized);

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
      await supabase
        .from('messages')
        .update({ content: '[Message deleted]', is_deleted: true })
        .eq('whatsapp_id', message.id._serialized);

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
   * Get messages for a user (most recent first).
   */
  async getUserMessages(userId: string, limit: number = 50, offset: number = 0) {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Get messages for a specific chat.
   */
  async getChatMessages(userId: string, chatId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Search messages by content (case-insensitive).
   */
  async searchMessages(userId: string, query: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('user_id', userId)
      .ilike('content', `%${query}%`)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Mark a message as replied. The schema has no dedicated reply columns, so
   * the reply is recorded via status + metadata.
   */
  async markAsReplied(messageId: string, replyContent: string) {
    const { data, error } = await supabase
      .from('messages')
      .update({
        status: 'replied',
        metadata: { replied: true, actualReply: replyContent },
      })
      .eq('id', messageId)
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }
}

// Export singleton instance
export const messageIngestion = new MessageIngestionService();
