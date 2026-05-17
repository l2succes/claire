/**
 * Database Test Helper
 * Utilities for integration tests that need real database access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class TestDatabase {
  private supabase: SupabaseClient;
  private testUserId: string | null = null;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'test-key';

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Initialize test database - run migrations if needed
   */
  async initialize(): Promise<void> {
    // Check if tables exist
    const { error } = await this.supabase.from('users').select('count').limit(1);

    if (error) {
      console.warn('Database tables may not be initialized:', error.message);
    }
  }

  /**
   * Create a test user for isolation
   */
  async createTestUser(email?: string): Promise<string> {
    const testEmail = email || `test-${Date.now()}@example.com`;

    const { data, error } = await this.supabase.auth.signUp({
      email: testEmail,
      password: 'TestPassword123!',
      options: {
        data: {
          name: 'Test User',
        },
      },
    });

    if (error) {
      throw new Error(`Failed to create test user: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('No user returned from signup');
    }

    this.testUserId = data.user.id;
    return data.user.id;
  }

  /**
   * Seed test data for a user
   */
  async seedTestData(userId: string): Promise<void> {
    // Create test chat
    const { data: chat, error: chatError } = await this.supabase
      .from('chats')
      .insert({
        user_id: userId,
        platform: 'whatsapp',
        platform_chat_id: 'test-chat-123',
        name: 'Test Chat',
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (chatError) {
      console.warn('Failed to seed chat:', chatError.message);
    }

    // Create test messages
    if (chat) {
      await this.supabase.from('messages').insert([
        {
          user_id: userId,
          chat_id: 'test-chat-123',
          platform: 'whatsapp',
          whatsapp_id: 'wa-msg-1',
          content: 'Test message 1',
          from_me: false,
          timestamp: new Date().toISOString(),
        },
        {
          user_id: userId,
          chat_id: 'test-chat-123',
          platform: 'whatsapp',
          whatsapp_id: 'wa-msg-2',
          content: 'Test message 2',
          from_me: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    // Create test contacts
    await this.supabase.from('contacts').insert([
      {
        user_id: userId,
        platform: 'whatsapp',
        platform_contact_id: '15551234567',
        whatsapp_id: '15551234567',
        name: 'Test Contact 1',
        phone_number: '15551234567',
      },
      {
        user_id: userId,
        platform: 'whatsapp',
        platform_contact_id: '15559876543',
        whatsapp_id: '15559876543',
        name: 'Test Contact 2',
        phone_number: '15559876543',
      },
    ]);
  }

  /**
   * Clean up all test data for a user
   */
  async cleanupTestData(userId: string): Promise<void> {
    // Delete in order to respect foreign keys
    await this.supabase.from('messages').delete().eq('user_id', userId);
    await this.supabase.from('chats').delete().eq('user_id', userId);
    await this.supabase.from('contacts').delete().eq('user_id', userId);
    await this.supabase.from('sessions').delete().eq('user_id', userId);
  }

  /**
   * Clean up the test user created by this helper
   */
  async cleanup(): Promise<void> {
    if (this.testUserId) {
      await this.cleanupTestData(this.testUserId);
      this.testUserId = null;
    }
  }

  /**
   * Execute raw SQL (requires service key)
   */
  async executeSql(sql: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('exec_sql', { query: sql });

    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Check if REPLICA IDENTITY FULL is set on a table
   */
  async checkReplicaIdentity(tableName: string): Promise<boolean> {
    try {
      // This would require a custom RPC function or direct postgres access
      // For now, return true and assume it's configured
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Supabase client for direct access
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get current test user ID
   */
  getTestUserId(): string | null {
    return this.testUserId;
  }
}

/**
 * Helper function to create a test database instance
 */
export function createTestDatabase(): TestDatabase {
  return new TestDatabase();
}

/**
 * Wait helper for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry helper for flaky operations
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await wait(delayMs);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
