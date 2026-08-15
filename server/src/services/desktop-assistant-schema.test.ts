import { describe, expect, it } from 'bun:test';

const migration = await Bun.file(
  new URL('../../../supabase/migrations/20260814120000_add_desktop_assistant_threads_and_platform_interest.sql', import.meta.url)
).text();

describe('desktop conversation assistant schema', () => {
  it('retains a single user-owned thread for a conversation', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE');
    expect(migration).toContain('idx_assistant_threads_user_chat');
    expect(migration).toContain('WHERE chat_id IS NOT NULL');
  });

  it('keeps waitlist interest user-scoped and free of credentials', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.platform_interest_requests');
    expect(migration).toContain('UNIQUE (user_id, platform_id)');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toContain('password');
    expect(migration).not.toContain('cookie');
  });

  it('provides exact and semantic retrieval functions constrained to one chat', () => {
    expect(migration).toContain('search_conversation_messages_in_chat');
    expect(migration).toContain('match_conversation_messages_in_chat');
    expect(migration).toContain('AND m.chat_id = target_chat_id');
  });
});
