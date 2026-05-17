/**
 * Integration Test: Supabase Realtime Sync
 * Tests real-time subscription behavior with actual Supabase test DB
 *
 * Prerequisites:
 * - Supabase test instance running (Docker or cloud)
 * - Database with REPLICA IDENTITY FULL on messages/chats/contacts tables
 * - .env.test with valid SUPABASE_URL and SUPABASE_ANON_KEY
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

describe('Realtime Sync Integration', () => {
  let supabase: SupabaseClient;
  let testUserId: string;
  let subscription: RealtimeChannel | null = null;

  beforeAll(async () => {
    // Create Supabase client for integration testing
    const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

    supabase = createClient(supabaseUrl, supabaseKey);

    // Create a test user for isolation
    testUserId = `test-user-${Date.now()}`;
  });

  afterAll(async () => {
    // Cleanup: Remove all test data
    if (supabase && testUserId) {
      await supabase.from('messages').delete().eq('user_id', testUserId);
      await supabase.from('chats').delete().eq('user_id', testUserId);
      await supabase.from('contacts').delete().eq('user_id', testUserId);
    }
  });

  beforeEach(async () => {
    // Unsubscribe from previous test
    if (subscription) {
      await supabase.removeChannel(subscription);
      subscription = null;
    }
  });

  describe('Message Subscriptions', () => {
    it('should receive INSERT events for new messages', async () => {
      const chatId = 'test-chat-1';
      const receivedMessages: any[] = [];

      // Subscribe to message inserts
      subscription = supabase
        .channel(`test-messages-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            receivedMessages.push(payload.new);
          }
        )
        .subscribe();

      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Insert a test message
      const testMessage = {
        user_id: testUserId,
        chat_id: chatId,
        platform: 'whatsapp',
        whatsapp_id: `wa-${Date.now()}`,
        content: 'Integration test message',
        from_me: false,
        timestamp: new Date().toISOString(),
      };

      const { error } = await supabase.from('messages').insert(testMessage);
      expect(error).toBeNull();

      // Wait for realtime event
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify we received the message
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].content).toBe('Integration test message');
      expect(receivedMessages[0].chat_id).toBe(chatId);
    }, 10000);

    it('should receive UPDATE events for message changes', async () => {
      const chatId = 'test-chat-2';
      let updateReceived = false;

      // Insert initial message
      const { data: insertedMsg, error: insertError } = await supabase
        .from('messages')
        .insert({
          user_id: testUserId,
          chat_id: chatId,
          platform: 'whatsapp',
          whatsapp_id: `wa-update-${Date.now()}`,
          content: 'Original content',
          from_me: false,
          timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      expect(insertError).toBeNull();
      expect(insertedMsg).toBeDefined();

      // Subscribe to updates
      subscription = supabase
        .channel(`test-updates-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `id=eq.${insertedMsg.id}`,
          },
          () => {
            updateReceived = true;
          }
        )
        .subscribe();

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the message
      const { error: updateError } = await supabase
        .from('messages')
        .update({ content: 'Updated content' })
        .eq('id', insertedMsg.id);

      expect(updateError).toBeNull();

      // Wait for realtime event
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(updateReceived).toBe(true);
    }, 10000);
  });

  describe('Optimistic Updates', () => {
    it('should handle optimistic message followed by server confirmation', async () => {
      const chatId = 'test-chat-3';
      const messages: any[] = [];

      // Subscribe to inserts
      subscription = supabase
        .channel(`test-optimistic-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            messages.push(payload.new);
          }
        )
        .subscribe();

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate optimistic message (not in DB yet)
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage = {
        id: optimisticId,
        content: 'Optimistic message',
        from_me: true,
        timestamp: new Date().toISOString(),
      };

      // Add to local state
      messages.push(optimisticMessage);
      expect(messages.length).toBe(1);

      // Server inserts actual message
      const { data: serverMsg, error } = await supabase
        .from('messages')
        .insert({
          user_id: testUserId,
          chat_id: chatId,
          platform: 'whatsapp',
          whatsapp_id: `wa-opt-${Date.now()}`,
          content: 'Optimistic message',
          from_me: true,
          timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();

      // Wait for realtime confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have optimistic + server message
      expect(messages.length).toBe(2);

      // Deduplication logic: remove optimistic if IDs match content
      const deduplicated = messages.filter((msg, index, self) =>
        index === self.findIndex(m => m.content === msg.content)
      );

      expect(deduplicated.length).toBe(1);
      expect(deduplicated[0].id).toBe(serverMsg.id);
    }, 10000);
  });

  describe('Subscription Error Handling', () => {
    it('should handle subscription errors gracefully', async () => {
      let errorReceived = false;

      // Subscribe with invalid filter (should not crash)
      subscription = supabase
        .channel(`test-error-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'nonexistent_table',
          },
          () => {}
        )
        .subscribe((status, err) => {
          if (err || status === 'CHANNEL_ERROR') {
            errorReceived = true;
          }
        });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Error should be handled (not crash test)
      expect(errorReceived).toBe(true);
    }, 10000);
  });

  describe('Multiple Subscribers', () => {
    it('should deliver same event to multiple subscribers', async () => {
      const chatId = 'test-chat-4';
      const subscriber1Messages: any[] = [];
      const subscriber2Messages: any[] = [];

      // Create two subscriptions to the same channel
      const sub1 = supabase
        .channel(`test-multi-1-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            subscriber1Messages.push(payload.new);
          }
        )
        .subscribe();

      const sub2 = supabase
        .channel(`test-multi-2-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            subscriber2Messages.push(payload.new);
          }
        )
        .subscribe();

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Insert message
      await supabase.from('messages').insert({
        user_id: testUserId,
        chat_id: chatId,
        platform: 'whatsapp',
        whatsapp_id: `wa-multi-${Date.now()}`,
        content: 'Multi-subscriber test',
        from_me: false,
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Both subscribers should receive the message
      expect(subscriber1Messages.length).toBe(1);
      expect(subscriber2Messages.length).toBe(1);
      expect(subscriber1Messages[0].content).toBe('Multi-subscriber test');
      expect(subscriber2Messages[0].content).toBe('Multi-subscriber test');

      // Cleanup
      await supabase.removeChannel(sub1);
      await supabase.removeChannel(sub2);
    }, 10000);
  });

  describe('REPLICA IDENTITY FULL Requirement', () => {
    it('should allow filtering by non-PK columns with REPLICA IDENTITY FULL', async () => {
      let messageReceived = false;

      // Subscribe filtering by user_id (non-PK column)
      // This requires REPLICA IDENTITY FULL on the messages table
      subscription = supabase
        .channel(`test-replica-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `user_id=eq.${testUserId}`,
          },
          () => {
            messageReceived = true;
          }
        )
        .subscribe();

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Insert message with specific user_id
      await supabase.from('messages').insert({
        user_id: testUserId,
        chat_id: 'test-chat-5',
        platform: 'whatsapp',
        whatsapp_id: `wa-replica-${Date.now()}`,
        content: 'REPLICA IDENTITY test',
        from_me: false,
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should receive message filtered by non-PK column
      expect(messageReceived).toBe(true);
    }, 10000);
  });
});
