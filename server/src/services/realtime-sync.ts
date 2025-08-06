import { EventEmitter } from 'events';
import { supabase, realtime } from './supabase';
import { prisma } from './prisma';
import { logger } from '../utils/logger';

interface RealtimeMessage {
  id: string;
  userId: string;
  type: 'message' | 'status' | 'typing' | 'presence';
  payload: any;
  timestamp: Date;
}

export class RealtimeSyncService extends EventEmitter {
  private userChannels: Map<string, any> = new Map();
  private messageBuffers: Map<string, RealtimeMessage[]> = new Map();
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.setupDatabaseListeners();
  }

  /**
   * Setup database change listeners
   */
  private setupDatabaseListeners() {
    // Listen for new messages
    realtime.subscribeToTable('messages', undefined, (payload) => {
      this.handleDatabaseChange('messages', payload);
    });

    // Listen for message updates
    realtime.subscribeToTable('messages', undefined, (payload) => {
      if (payload.eventType === 'UPDATE') {
        this.handleMessageUpdate(payload);
      }
    });

    // Listen for contact changes
    realtime.subscribeToTable('contacts', undefined, (payload) => {
      this.handleDatabaseChange('contacts', payload);
    });

    // Listen for promise changes
    realtime.subscribeToTable('promises', undefined, (payload) => {
      this.handleDatabaseChange('promises', payload);
    });
  }

  /**
   * Subscribe user to real-time updates
   */
  async subscribeUser(userId: string, socketId?: string) {
    try {
      // Create user-specific channel
      const channelName = `user:${userId}`;
      
      if (this.userChannels.has(channelName)) {
        logger.info(`User ${userId} already subscribed to realtime`);
        return;
      }

      const channel = supabase
        .channel(channelName)
        .on('broadcast', { event: '*' }, (payload) => {
          this.handleUserBroadcast(userId, payload);
        })
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          this.handlePresenceSync(userId, state);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Track user presence
            await channel.track({
              user_id: userId,
              online_at: new Date().toISOString(),
              socket_id: socketId,
            });
            
            logger.info(`User ${userId} subscribed to realtime`);
            this.emit('user:subscribed', { userId, channelName });
          }
        });

      this.userChannels.set(channelName, channel);

      // Setup message batching for this user
      this.setupMessageBatching(userId);

      // Send initial sync data
      await this.sendInitialSync(userId);
    } catch (error) {
      logger.error(`Error subscribing user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from real-time updates
   */
  async unsubscribeUser(userId: string) {
    const channelName = `user:${userId}`;
    const channel = this.userChannels.get(channelName);
    
    if (channel) {
      await supabase.removeChannel(channel);
      this.userChannels.delete(channelName);
      
      // Clear message buffer and interval
      this.messageBuffers.delete(userId);
      const interval = this.syncIntervals.get(userId);
      if (interval) {
        clearInterval(interval);
        this.syncIntervals.delete(userId);
      }
      
      logger.info(`User ${userId} unsubscribed from realtime`);
      this.emit('user:unsubscribed', { userId });
    }
  }

  /**
   * Handle database change events
   */
  private handleDatabaseChange(table: string, payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    logger.debug(`Database change in ${table}:`, eventType);
    
    // Broadcast to relevant users
    switch (table) {
      case 'messages':
        this.broadcastMessageChange(eventType, newRecord, oldRecord);
        break;
      case 'contacts':
        this.broadcastContactChange(eventType, newRecord, oldRecord);
        break;
      case 'promises':
        this.broadcastPromiseChange(eventType, newRecord, oldRecord);
        break;
    }
  }

  /**
   * Handle message updates (read receipts, etc.)
   */
  private handleMessageUpdate(payload: any) {
    const { new: message } = payload;
    
    if (message.isRead) {
      this.broadcastToUser(message.userId, 'message:read', {
        messageId: message.id,
        readAt: message.updatedAt,
      });
    }
    
    if (message.isReplied) {
      this.broadcastToUser(message.userId, 'message:replied', {
        messageId: message.id,
        reply: message.actualReply,
        repliedAt: message.updatedAt,
      });
    }
  }

  /**
   * Broadcast message changes to relevant users
   */
  private async broadcastMessageChange(eventType: string, newRecord: any, oldRecord: any) {
    const message = newRecord || oldRecord;
    if (!message) return;

    const event = eventType === 'INSERT' ? 'message:new' : 
                  eventType === 'UPDATE' ? 'message:updated' : 
                  'message:deleted';

    // Get full message with relations
    const fullMessage = await prisma.message.findUnique({
      where: { id: message.id },
      include: {
        sender: true,
        receiver: true,
        group: true,
      },
    });

    if (fullMessage) {
      this.broadcastToUser(message.userId, event, fullMessage);
    }
  }

  /**
   * Broadcast contact changes
   */
  private broadcastContactChange(eventType: string, newRecord: any, oldRecord: any) {
    const contact = newRecord || oldRecord;
    if (!contact) return;

    const event = eventType === 'INSERT' ? 'contact:new' : 
                  eventType === 'UPDATE' ? 'contact:updated' : 
                  'contact:deleted';

    this.broadcastToUser(contact.userId, event, contact);
  }

  /**
   * Broadcast promise changes
   */
  private broadcastPromiseChange(eventType: string, newRecord: any, oldRecord: any) {
    const promise = newRecord || oldRecord;
    if (!promise) return;

    const event = eventType === 'INSERT' ? 'promise:new' : 
                  eventType === 'UPDATE' ? 'promise:updated' : 
                  'promise:deleted';

    this.broadcastToUser(promise.userId, event, promise);
  }

  /**
   * Handle user broadcast events
   */
  private handleUserBroadcast(userId: string, payload: any) {
    logger.debug(`Broadcast for user ${userId}:`, payload.event);
    
    // Buffer messages for batching
    if (payload.event.startsWith('message:')) {
      this.bufferMessage(userId, {
        id: `${Date.now()}-${Math.random()}`,
        userId,
        type: 'message',
        payload: payload.payload,
        timestamp: new Date(),
      });
    } else {
      // Emit immediately for non-message events
      this.emit(`user:${userId}:${payload.event}`, payload.payload);
    }
  }

  /**
   * Handle presence sync
   */
  private handlePresenceSync(userId: string, state: any) {
    const onlineUsers = Object.keys(state).map(key => state[key][0]);
    
    this.emit(`user:${userId}:presence`, {
      online: onlineUsers,
      count: onlineUsers.length,
    });
  }

  /**
   * Setup message batching for a user
   */
  private setupMessageBatching(userId: string) {
    // Initialize buffer
    this.messageBuffers.set(userId, []);
    
    // Setup flush interval (every 100ms)
    const interval = setInterval(() => {
      this.flushMessageBuffer(userId);
    }, 100);
    
    this.syncIntervals.set(userId, interval);
  }

  /**
   * Buffer message for batching
   */
  private bufferMessage(userId: string, message: RealtimeMessage) {
    const buffer = this.messageBuffers.get(userId) || [];
    buffer.push(message);
    this.messageBuffers.set(userId, buffer);
    
    // Flush immediately if buffer is large
    if (buffer.length >= 10) {
      this.flushMessageBuffer(userId);
    }
  }

  /**
   * Flush message buffer
   */
  private flushMessageBuffer(userId: string) {
    const buffer = this.messageBuffers.get(userId);
    if (!buffer || buffer.length === 0) return;
    
    // Clear buffer
    this.messageBuffers.set(userId, []);
    
    // Emit batched messages
    this.emit(`user:${userId}:messages:batch`, buffer);
    
    // Also broadcast via Supabase
    this.broadcastToUser(userId, 'messages:batch', buffer);
  }

  /**
   * Send initial sync data to user
   */
  private async sendInitialSync(userId: string) {
    try {
      // Get recent messages
      const messages = await prisma.message.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 50,
        include: {
          sender: true,
          receiver: true,
          group: true,
        },
      });

      // Get active promises
      const promises = await prisma.promise.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get contacts
      const contacts = await prisma.contact.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });

      // Send initial data
      this.broadcastToUser(userId, 'sync:initial', {
        messages: messages.reverse(),
        promises,
        contacts,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error(`Error sending initial sync to user ${userId}:`, error);
    }
  }

  /**
   * Broadcast to specific user
   */
  async broadcastToUser(userId: string, event: string, data: any) {
    const channelName = `user:${userId}`;
    const channel = this.userChannels.get(channelName);
    
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event,
        payload: data,
      });
    }
  }

  /**
   * Broadcast to multiple users
   */
  async broadcastToUsers(userIds: string[], event: string, data: any) {
    const promises = userIds.map(userId => 
      this.broadcastToUser(userId, event, data)
    );
    await Promise.all(promises);
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(userId: string, chatId: string, isTyping: boolean) {
    await this.broadcastToUser(userId, 'typing', {
      chatId,
      isTyping,
      timestamp: new Date(),
    });
  }

  /**
   * Get online users in a channel
   */
  async getOnlineUsers(channelName: string): Promise<string[]> {
    const channel = this.userChannels.get(channelName);
    if (!channel) return [];
    
    const state = channel.presenceState();
    return Object.keys(state).map(key => state[key][0].user_id);
  }

  /**
   * Sync message read status
   */
  async syncReadStatus(userId: string, messageIds: string[]) {
    try {
      // Update database
      await prisma.message.updateMany({
        where: {
          id: { in: messageIds },
          userId,
        },
        data: {
          isRead: true,
        },
      });

      // Broadcast update
      await this.broadcastToUser(userId, 'messages:read', {
        messageIds,
        readAt: new Date(),
      });
    } catch (error) {
      logger.error('Error syncing read status:', error);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Unsubscribe all users
    for (const [channelName, channel] of this.userChannels) {
      await supabase.removeChannel(channel);
    }
    this.userChannels.clear();
    
    // Clear all intervals
    for (const interval of this.syncIntervals.values()) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();
    
    // Clear buffers
    this.messageBuffers.clear();
    
    logger.info('Realtime sync service cleaned up');
  }
}

// Export singleton instance
export const realtimeSync = new RealtimeSyncService();